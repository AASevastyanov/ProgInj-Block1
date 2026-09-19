# Block 2 Architecture

Block 2 does not change the business system. It wraps the existing Block 1 services with a local platform layer.

## Layers

- Edge: Kong Gateway API routes external `/api/*` traffic to `api-gateway`.
- Application: existing NestJS services run as Kubernetes Deployments through Helm.
- Mesh: Istio sidecars provide internal telemetry, retries, and outlier detection.
- Data: PostgreSQL, Valkey, MongoDB, and Strimzi Kafka run as local demo workloads.
- GitOps: ArgoCD App of Apps separates `platform`, `data`, and `apps`.
- Observability: Prometheus, Grafana, Loki, Tempo, OTel Collector, Alertmanager.
- CI/CD: self-hosted GitHub Actions runner builds images with Kaniko and updates Helm tags.

## Mandatory runtime contour

The minimum contour is:

- `api-gateway`
- `user-service`
- `queue-service`
- `zone-management-service`
- `notification-service`
- PostgreSQL
- Valkey
- Kafka

`reservation-service` and `monitoring-event-ingestion-service` remain optional extensions. The gateway still has routes for them, but Block 2 does not block on them.

## Request path

```text
Client -> Kong Gateway -> API Gateway -> domain service -> data/Kafka
```

For queue join:

```text
Client -> Kong /api/queues route -> API Gateway -> Queue Service -> PostgreSQL + Valkey + Kafka
```

For notification resilience demo:

```text
API Gateway -> Notification Service through Istio sidecar -> retries/outlier detection -> logs/metrics
```
