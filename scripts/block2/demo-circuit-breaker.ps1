param(
  [string]$Namespace = "qoms-apps",
  [string]$BaseUrl = "http://localhost:8080/api",
  [string]$Email = "student@example.com",
  [string]$Password = "Password123!"
)

$ErrorActionPreference = "Stop"

kubectl -n $Namespace get virtualservice notification-service-retry
kubectl -n $Namespace get destinationrule notification-service-circuit-breaker

$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -Body $loginBody -ContentType "application/json"
$headers = @{ Authorization = "Bearer $($login.token)" }

$before = Invoke-WebRequest -Method Get -Uri "$BaseUrl/notifications/me" -Headers $headers -SkipHttpErrorCheck
Write-Host "Before failure -> HTTP $($before.StatusCode)"

try {
  Write-Host "Scaling notification-service down to demonstrate mesh retry/failure behavior."
  kubectl -n $Namespace scale deployment/notification-service --replicas=0
  kubectl -n $Namespace rollout status deployment/notification-service --timeout=120s
  Start-Sleep -Seconds 5

  $during = Invoke-WebRequest -Method Get -Uri "$BaseUrl/notifications/me" -Headers $headers -SkipHttpErrorCheck
  Write-Host "During failure -> HTTP $($during.StatusCode)"
} finally {
  Write-Host "Restoring notification-service."
  kubectl -n $Namespace scale deployment/notification-service --replicas=2
  kubectl -n $Namespace rollout status deployment/notification-service --timeout=240s
}

$afterLogin = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -Body $loginBody -ContentType "application/json"
$afterHeaders = @{ Authorization = "Bearer $($afterLogin.token)" }
$after = Invoke-WebRequest -Method Get -Uri "$BaseUrl/notifications/me" -Headers $afterHeaders -SkipHttpErrorCheck
Write-Host "After restore -> HTTP $($after.StatusCode)"
