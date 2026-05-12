# Система управления очередями и загруженностью зон

Этот репозиторий содержит систему мониторинга очередей и загруженности университетской столовой и коворкинга из Блока 1, а также локальный платформенный слой из Блока 2.

Предметная область приложения не изменилась: клиенты используют API Gateway, сервисы обмениваются доменными событиями через Kafka, PostgreSQL хранит транзакционные данные, Valkey/Redis хранит горячие данные и ключи rate limiting, а MongoDB хранит историю телеметрии загруженности.

## Основные компоненты

- `apps/api-gateway`
- `services/user-service`
- `services/queue-service`
- `services/zone-management-service`
- `services/notification-service`
- опционально: `services/reservation-service`, `services/monitoring-event-ingestion-service`
- `apps/user-web`, `apps/admin-web`

## Быстрый запуск Блока 1

```bash
cp .env.example .env
docker compose up --build
```

Открыть:

- пользовательский UI: `http://localhost:8080/`
- админский UI: `http://localhost:8080/admin/`
- проверка состояния gateway: `http://localhost:8080/api/health`

Тестовые пользователи используют пароль `Password123!`:

- `student@example.com`
- `employee@example.com`
- `dining_admin@example.com`
- `coworking_admin@example.com`
- `system_admin@example.com`

## Платформенный слой Блока 2

Блок 2 добавляет поверх существующих сервисов локальный слой Kubernetes, GitOps, service mesh, autoscaling, observability, rate limiting, нагрузочное тестирование и CI/CD.

Стек:

- Minikube с целевым CNI Cilium
- базовая инфраструктура Terraform для namespaces, service accounts, secrets, config maps и минимального RBAC
- ArgoCD App of Apps
- Helm-чарты для `api-gateway`, `user-service`, `queue-service`, `zone-management-service`, `notification-service`
- Kafka через Strimzi, развернутая с помощью Ansible
- Kong Gateway API routing и rate limiting на базе Redis
- политики retry и circuit breaker в Istio
- Prometheus, Grafana, Loki, Tempo, OpenTelemetry Collector, Alertmanager
- нагрузочные тесты Locust
- workflow GitHub Actions self-hosted runner с Kaniko и локальным registry

Короткий путь запуска Блока 2:

```powershell
.\scripts\block2\bootstrap-minikube.ps1
.\scripts\block2\apply-terraform.ps1
.\scripts\block2\deploy-kafka.ps1
.\scripts\block2\install-argocd.ps1
.\scripts\block2\port-forward.ps1 -Target gateway
.\scripts\block2\run-locust.ps1
```

Подробные инструкции находятся в `BLOCK2_RUNBOOK.md`.
