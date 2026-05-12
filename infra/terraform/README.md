# Terraform baseline

This directory creates only the local Kubernetes baseline needed by Block 2:

- namespaces for ArgoCD, platform, data, apps, observability, Kafka, Istio, and Kong
- service accounts for application workloads
- development secrets and runtime config maps
- minimal RBAC for reading runtime config

It deliberately does not create cloud resources. Run it after Minikube is up:

```bash
cd infra/terraform
terraform init
terraform apply -var-file terraform.tfvars.example
```

For a real environment, pass secrets through a secure variable source instead of using the example file.
