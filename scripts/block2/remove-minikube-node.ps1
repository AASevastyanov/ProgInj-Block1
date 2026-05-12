param(
  [string]$Profile = "qoms-block2",
  [Parameter(Mandatory=$true)]
  [string]$NodeName
)

$ErrorActionPreference = "Stop"
kubectl drain $NodeName --ignore-daemonsets --delete-emptydir-data
minikube node delete $NodeName --profile $Profile
kubectl get nodes -o wide
