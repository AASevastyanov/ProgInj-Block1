param(
  [string]$Profile = "qoms-block2",
  [int]$Nodes = 1
)

$ErrorActionPreference = "Stop"
minikube node add --profile $Profile --worker --nodes $Nodes
kubectl get nodes -o wide
