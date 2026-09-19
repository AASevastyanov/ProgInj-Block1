variable "kubeconfig_path" {
  description = "Path to kubeconfig for the local Minikube cluster."
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "Kubeconfig context used by Terraform."
  type        = string
  default     = "minikube"
}

variable "environment" {
  description = "Environment label for local platform resources."
  type        = string
  default     = "local"
}

variable "jwt_secret" {
  description = "Development JWT secret for local Kubernetes."
  type        = string
  default     = "super-secret-jwt-key"
  sensitive   = true
}

variable "internal_service_token" {
  description = "Development internal service token."
  type        = string
  default     = "internal-service-token"
  sensitive   = true
}

variable "postgres_password" {
  description = "Development PostgreSQL password."
  type        = string
  default     = "qoms"
  sensitive   = true
}
