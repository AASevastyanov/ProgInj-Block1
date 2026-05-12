param(
  [string]$Registry = "localhost:5000",
  [string]$Tag = "dev",
  [string[]]$Services = @("api-gateway", "user-service", "queue-service", "zone-management-service", "notification-service")
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker is not installed or not in PATH."
}

$baseImage = "${Registry}/qoms/base:${Tag}"
docker build -t $baseImage .

foreach ($service in $Services) {
  $image = "${Registry}/qoms/${service}:${Tag}"
  docker tag $baseImage $image
  docker push $image
  Write-Host "Pushed $image"
}
