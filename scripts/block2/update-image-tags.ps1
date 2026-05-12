param(
  [Parameter(Mandatory=$true)]
  [string]$Tag,
  [string[]]$Services = @("api-gateway", "user-service", "queue-service", "zone-management-service", "notification-service")
)

$ErrorActionPreference = "Stop"

foreach ($service in $Services) {
  $valuesPath = "helm/$service/values.yaml"
  if (-not (Test-Path $valuesPath)) {
    throw "Missing Helm values file: $valuesPath"
  }
  $content = Get-Content -Raw $valuesPath
  $updated = $content -replace "(?m)^  tag: .+$", "  tag: $Tag"
  Set-Content -Path $valuesPath -Value $updated -NoNewline
  Write-Host "Updated $valuesPath -> image.tag=$Tag"
}
