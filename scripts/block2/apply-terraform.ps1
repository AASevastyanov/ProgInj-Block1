param(
  [string]$WorkingDirectory = "infra/terraform",
  [string]$VarFile = "terraform.tfvars.example"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
  throw "Terraform is not installed or not in PATH."
}

Push-Location $WorkingDirectory
try {
  terraform init
  terraform fmt -recursive
  terraform validate
  terraform apply -auto-approve -var-file $VarFile
} finally {
  Pop-Location
}
