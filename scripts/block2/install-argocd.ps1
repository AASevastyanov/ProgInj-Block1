param(
  [string]$RootApplication = "argocd/root-application.yaml"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
  throw "kubectl is not installed or not in PATH."
}

kubectl apply --server-side --force-conflicts -k argocd/install
kubectl -n argocd rollout status deployment/argocd-server --timeout=180s
kubectl apply -f $RootApplication

Write-Host "ArgoCD installed. Use scripts/block2/port-forward.ps1 to open the UI."
