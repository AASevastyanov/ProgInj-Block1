param(
  [ValidateSet("gateway", "grafana", "argocd", "prometheus", "loki", "tempo")]
  [string]$Target = "gateway"
)

$ErrorActionPreference = "Stop"

switch ($Target) {
  "gateway" {
    kubectl -n kong port-forward svc/kong-gateway-proxy 8080:80
  }
  "grafana" {
    kubectl -n qoms-observability port-forward svc/kube-prometheus-stack-grafana 3000:80
  }
  "argocd" {
    kubectl -n argocd port-forward svc/argocd-server 8081:443
  }
  "prometheus" {
    kubectl -n qoms-observability port-forward svc/kube-prometheus-stack-prometheus 9090:9090
  }
  "loki" {
    kubectl -n qoms-observability port-forward svc/loki-gateway 3100:80
  }
  "tempo" {
    kubectl -n qoms-observability port-forward svc/tempo 3200:3100
  }
}
