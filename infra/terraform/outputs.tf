output "namespaces" {
  description = "Namespaces created for Block 2."
  value       = { for key, ns in kubernetes_namespace_v1.namespaces : key => ns.metadata[0].name }
}

output "app_secret_name" {
  description = "Shared application secret consumed by Helm charts."
  value       = kubernetes_secret_v1.app_secrets.metadata[0].name
}

output "runtime_config_name" {
  description = "Shared runtime config map."
  value       = kubernetes_config_map_v1.runtime.metadata[0].name
}
