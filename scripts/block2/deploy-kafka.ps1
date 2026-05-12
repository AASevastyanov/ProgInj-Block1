param(
  [string]$AnsibleDirectory = "infra/ansible",
  [switch]$UseDockerFallback = $true
)

$ErrorActionPreference = "Stop"

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

function New-DockerKubeconfig {
  $rawConfig = kubectl config view --raw --minify -o json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read current kubectl context."
  }

  $cluster = $rawConfig.clusters[0].cluster
  $cluster.server = $cluster.server -replace "https://127\.0\.0\.1:", "https://host.docker.internal:"
  $cluster.server = $cluster.server -replace "https://localhost:", "https://host.docker.internal:"
  $cluster | Add-Member -NotePropertyName "insecure-skip-tls-verify" -NotePropertyValue $true -Force
  $cluster.PSObject.Properties.Remove("certificate-authority") | Out-Null
  $cluster.PSObject.Properties.Remove("certificate-authority-data") | Out-Null

  $path = Join-Path ([System.IO.Path]::GetTempPath()) "qoms-docker-kubeconfig.json"
  $rawConfig | ConvertTo-Json -Depth 100 | Set-Content -Path $path -Encoding ascii
  return $path
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ansiblePath = if ([System.IO.Path]::IsPathRooted($AnsibleDirectory)) {
  (Resolve-Path $AnsibleDirectory).Path
} else {
  (Resolve-Path (Join-Path $repositoryRoot $AnsibleDirectory)).Path
}

$nativeAnsible = Get-Command ansible-playbook -ErrorAction SilentlyContinue

Push-Location $ansiblePath
try {
  if ($nativeAnsible) {
    try {
      Invoke-Checked ansible-playbook playbooks/strimzi-kafka.yml
    } catch {
      if (-not $UseDockerFallback) {
        throw
      }
      Write-Warning "Native ansible-playbook failed, falling back to Dockerized alpine/ansible. Error: $($_.Exception.Message)"
      $nativeAnsible = $null
    }
  }

  if (-not $nativeAnsible) {
    if (-not $UseDockerFallback) {
      throw "ansible-playbook is not installed or not in PATH."
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
      throw "Docker is required for the Ansible fallback."
    }

    $dockerKubeconfig = New-DockerKubeconfig
    Invoke-Checked docker run --rm `
      -e ANSIBLE_CONFIG=/work/infra/ansible/ansible.cfg `
      -e KUBECONFIG=/tmp/qoms-kubeconfig.json `
      -v "${repositoryRoot}:/work" `
      -v "${dockerKubeconfig}:/tmp/qoms-kubeconfig.json:ro" `
      -w /work/infra/ansible `
      alpine/ansible ansible-playbook playbooks/strimzi-kafka.yml
  }

  kubectl wait kafka/qoms-kafka -n kafka --for=condition=Ready --timeout=600s
  kubectl get kafkatopic queue-and-occupancy-events -n kafka
} finally {
  Pop-Location
}
