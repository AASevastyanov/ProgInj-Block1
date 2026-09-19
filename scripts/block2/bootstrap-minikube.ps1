param(
  [string]$Profile = "qoms-block2",
  [string]$KubernetesVersion = "v1.34.0",
  [string]$CiliumVersion = "1.19.3",
  [ValidateSet("default", "auto", "minikube", "cilium-cli", "helm")]
  [string]$CniInstallMode = "default",
  [int]$Nodes = 2,
  [int]$Cpus = 4,
  [string]$Memory = "6144",
  [int]$RegistryPort = 5000
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not in PATH."
  }
}

function Invoke-Checked {
  if ($args.Count -lt 1) {
    throw "Invoke-Checked requires at least one argument."
  }

  $FilePath = [string]$args[0]
  $Arguments = @()
  if ($args.Count -gt 1) {
    $Arguments = @($args[1..($args.Count - 1)])
  }
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

Require-Command minikube
Require-Command kubectl
Require-Command docker

Invoke-Checked docker info

$registryName = "qoms-local-registry"
$existingRegistry = & docker ps -a --filter "name=$registryName" --format "{{.Names}}"
if ($LASTEXITCODE -ne 0) {
  throw "Unable to inspect Docker containers for local registry."
}
if (-not $existingRegistry) {
  Invoke-Checked docker pull registry:2
  Invoke-Checked docker run -d --restart=always -p "${RegistryPort}:5000" --name $registryName registry:2
} else {
  Invoke-Checked docker start $registryName
}

$hasCiliumCli = [bool](Get-Command cilium -ErrorAction SilentlyContinue)
$hasHelm = [bool](Get-Command helm -ErrorAction SilentlyContinue)

if ($CniInstallMode -eq "auto") {
  if ($hasCiliumCli) {
    $resolvedCniMode = "cilium-cli"
  } elseif ($hasHelm) {
    $resolvedCniMode = "helm"
  } else {
    $resolvedCniMode = "minikube"
  }
} else {
  $resolvedCniMode = $CniInstallMode
}

$minikubeStartArgs = @(
  "start",
  "--profile", $Profile,
  "--driver", "docker",
  "--kubernetes-version", $KubernetesVersion,
  "--nodes", $Nodes,
  "--cpus", $Cpus,
  "--memory", $Memory,
  "--insecure-registry", "host.minikube.internal:${RegistryPort}"
)

if ($resolvedCniMode -ne "default") {
  $startCni = if ($resolvedCniMode -eq "minikube") { "cilium" } else { "false" }
  $minikubeStartArgs += @("--network-plugin=cni", "--cni=$startCni")
}

Invoke-Checked minikube @minikubeStartArgs

Invoke-Checked minikube profile $Profile

if ($resolvedCniMode -eq "default") {
  Write-Host "Using Minikube default CNI. This is the validated Windows/WSL2 runtime workaround when Cilium blocks metrics/API reachability."
} elseif ($resolvedCniMode -eq "minikube") {
  Write-Host "Using Minikube built-in Cilium CNI integration. Requested standalone Cilium version $CiliumVersion is not pinned in this mode."
  Invoke-Checked kubectl -n kube-system rollout status daemonset/cilium --timeout=300s
} elseif ($resolvedCniMode -eq "cilium-cli") {
  if (-not $hasCiliumCli) {
    throw "Cilium CLI is required for -CniInstallMode cilium-cli."
  }
  Invoke-Checked cilium install `
    --version $CiliumVersion `
    --set operator.replicas=1 `
    --set l7Proxy=false `
    --set dnsProxy.enableTransparentMode=false `
    --set envoy.useOriginalSourceAddress=false
  Invoke-Checked cilium status --wait
} elseif ($resolvedCniMode -eq "helm") {
  if (-not $hasHelm) {
    throw "Helm is required for -CniInstallMode helm."
  }
  Invoke-Checked helm repo add cilium https://helm.cilium.io/
  Invoke-Checked helm repo update
  Invoke-Checked helm upgrade --install cilium cilium/cilium `
    --version $CiliumVersion `
    --namespace kube-system `
    --set operator.replicas=1 `
    --set l7Proxy=false `
    --set dnsProxy.enableTransparentMode=false `
    --set envoy.useOriginalSourceAddress=false
  Invoke-Checked kubectl -n kube-system rollout status deployment/cilium-operator --timeout=180s
} else {
  throw "Unknown CNI install mode: $resolvedCniMode"
}

Invoke-Checked minikube addons enable metrics-server -p $Profile

$metricsServerPatch = Join-Path ([System.IO.Path]::GetTempPath()) "qoms-metrics-server-hostnetwork-patch.json"
@'
{"spec":{"template":{"spec":{"hostNetwork":true,"dnsPolicy":"ClusterFirstWithHostNet"}}}}
'@ | Set-Content -Path $metricsServerPatch -Encoding ascii -NoNewline
Invoke-Checked kubectl -n kube-system patch deployment metrics-server --type merge --patch-file $metricsServerPatch
Invoke-Checked kubectl wait --for=condition=Available deployment/metrics-server -n kube-system --timeout=180s

Write-Host "Minikube Block 2 cluster is ready. Local registry: host.minikube.internal:${RegistryPort}"
