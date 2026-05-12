# Queue and Occupancy Management System

This repository contains the university canteen and coworking queue/occupancy monitoring system from Block 1, plus the Block 2 local platform layer.

The application domain is unchanged: clients use an API Gateway, services exchange domain events through Kafka, PostgreSQL stores transactional data, Valkey/Redis stores hot data and rate-limit keys, and MongoDB stores occupancy telemetry history.

## Main components

- `apps/api-gateway`
- `services/user-service`
- `services/queue-service`
- `services/zone-management-service`
- `services/notification-service`
- optional: `services/reservation-service`, `services/monitoring-event-ingestion-service`
- `apps/user-web`, `apps/admin-web`

## Block 1 quick start

```bash
cp .env.example .env
docker compose up --build
```

Open:

- user UI: http://localhost:8080/
- admin UI: http://localhost:8080/admin/
- gateway health: http://localhost:8080/api/health

Seed users use password `Password123!`:

- `student@example.com`
- `employee@example.com`
- `dining_admin@example.com`
- `coworking_admin@example.com`
- `system_admin@example.com`

## Block 2 platform layer

Block 2 adds a local Kubernetes, GitOps, service mesh, autoscaling, observability, rate limiting, load testing, and CI/CD layer over the existing services.

Stack:

- Minikube with Cilium target CNI
- Terraform baseline for namespaces, service accounts, secrets, config maps, and minimal RBAC
- ArgoCD App of Apps
- Helm charts for `api-gateway`, `user-service`, `queue-service`, `zone-management-service`, `notification-service`
- Strimzi Kafka deployed through Ansible
- Kong Gateway API routing and Redis-backed rate limiting
- Istio retry and circuit breaker policy
- Prometheus, Grafana, Loki, Tempo, OpenTelemetry Collector, Alertmanager
- Locust load tests
- GitHub Actions self-hosted runner workflow with Kaniko and local registry

Short Block 2 path:

```powershell
.\scripts\block2\bootstrap-minikube.ps1
.\scripts\block2\apply-terraform.ps1
.\scripts\block2\deploy-kafka.ps1
.\scripts\block2\install-argocd.ps1
.\scripts\block2\port-forward.ps1 -Target gateway
.\scripts\block2\run-locust.ps1
```

Detailed instructions are in [BLOCK2_RUNBOOK.md](BLOCK2_RUNBOOK.md). Current verification status and local limitations are in [BLOCK2_STATUS.md](BLOCK2_STATUS.md).
