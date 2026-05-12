param(
  [string]$HostUrl = "http://localhost:8080/api",
  [int]$Users = 20,
  [int]$SpawnRate = 2,
  [string]$RunTime = "5m",
  [switch]$WebUi
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "python is not installed or not in PATH."
}

if ($WebUi) {
  python -m locust -f tests/locust/locustfile.py --host $HostUrl
} else {
  python -m locust -f tests/locust/locustfile.py --host $HostUrl --headless --users $Users --spawn-rate $SpawnRate --run-time $RunTime
}
