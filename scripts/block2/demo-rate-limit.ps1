param(
  [string]$BaseUrl = "http://localhost:8080/api",
  [int]$Requests = 10
)

$ErrorActionPreference = "Stop"

$body = @{ email = "student@example.com"; password = "wrong-password" } | ConvertTo-Json

for ($i = 1; $i -le $Requests; $i++) {
  try {
    $response = Invoke-WebRequest -Method Post -Uri "$BaseUrl/auth/login" -Body $body -ContentType "application/json" -SkipHttpErrorCheck
    Write-Host "$i -> HTTP $($response.StatusCode)"
  } catch {
    Write-Host "$i -> $($_.Exception.Message)"
  }
}

Write-Host "Expected demo result: after the strict login budget is exhausted, Kong or the gateway returns 429."
