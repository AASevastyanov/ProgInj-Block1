# Block 2 Runbook

## 1. Назначение runbook

Инструкция описывает базовый запуск и проверку второго блока проекта: локальный Kubernetes-стенд для существующих сервисов QOMS.

Проверяем основной контур:

- Kubernetes / Minikube
- Kafka через Strimzi
- обязательные backend-сервисы через Helm
- Kong Gateway и rate limiting
- observability
- Locust-нагрузка

## 2. Требования к окружению

Нужны:

- Docker Desktop
- Minikube
- kubectl
- Helm
- Terraform
- Python 3
- PowerShell

Проверка:

```powershell
docker info
minikube version
kubectl version --client
helm version
terraform version
python --version
```

## 3. Запуск локального Kubernetes-стенда

```powershell
.\scripts\block2\bootstrap-minikube.ps1
```

Проверяем:

```powershell
kubectl get nodes
kubectl get pods -A
kubectl top nodes
```

Ожидаемо:

- nodes в статусе `Ready`
- системные pod'ы работают
- `kubectl top nodes` показывает CPU и memory

## 4. Сборка и публикация Docker images

```powershell
.\scripts\block2\build-local-images.ps1
```

Проверяем локальный registry:

```powershell
Invoke-RestMethod http://localhost:5000/v2/_catalog
```

Ожидаемо есть образы:

- `qoms/api-gateway`
- `qoms/user-service`
- `qoms/queue-service`
- `qoms/zone-management-service`
- `qoms/notification-service`

## 5. Применение базовой инфраструктуры

```powershell
.\scripts\block2\apply-terraform.ps1
```

Проверяем namespaces:

```powershell
kubectl get ns argocd,qoms-platform,qoms-data,qoms-apps,qoms-observability,kafka,istio-system,kong
```

Разворачиваем data layer:

```powershell
kubectl apply -f k8s/data/postgres/postgres.yaml
kubectl apply -f k8s/data/valkey/valkey.yaml
kubectl apply -f k8s/data/mongodb/mongodb.yaml
kubectl get pods -n qoms-data
```

Запускаем bootstrap базы:

```powershell
kubectl apply -f k8s/apps/bootstrap/db-bootstrap-job.yaml
kubectl -n qoms-apps wait --for=condition=complete job/qoms-db-bootstrap --timeout=300s
kubectl -n qoms-apps logs job/qoms-db-bootstrap
```

## 6. Развертывание Kafka через Strimzi

```powershell
.\scripts\block2\deploy-kafka.ps1
```

Проверяем:

```powershell
kubectl get kafka,kafkatopic -n kafka
kubectl get pods -n kafka
```

Ожидаемо:

- `qoms-kafka` готов
- topic `queue-and-occupancy-events` готов
- Kafka pod работает

## 7. Развертывание сервисов через Helm

```powershell
$charts = @(
  "user-service",
  "zone-management-service",
  "queue-service",
  "notification-service",
  "api-gateway"
)

foreach ($chart in $charts) {
  helm upgrade --install $chart "helm/$chart" `
    -n qoms-apps `
    --set serviceAccount.create=false `
    --wait `
    --timeout 8m
}
```

Проверяем:

```powershell
kubectl get deploy,pods,hpa -n qoms-apps
kubectl top pods -n qoms-apps
```

Ожидаемо:

- обязательные сервисы доступны
- pod'ы в статусе `Running`
- HPA созданы

## 8. Проверка Kong и rate limiting

Устанавливаем Kong:

```powershell
helm repo add kong https://charts.konghq.com
helm repo update kong
helm upgrade --install kong kong/ingress -n kong -f k8s/platform/kong/kong-values.yaml --wait --timeout 10m
```

Применяем Gateway API и маршруты:

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml
kubectl apply -f k8s/apps/routing/gateway.yaml
kubectl apply -f k8s/apps/routing/kong-plugins.yaml
kubectl apply -f k8s/apps/routing/http-routes.yaml
```

Проверяем:

```powershell
kubectl get gatewayclass
kubectl get gateway -n qoms-platform
kubectl get httproute,kongplugin -n qoms-apps
```

Запускаем gateway port-forward:

```powershell
.\scripts\block2\port-forward.ps1 -Target gateway
```

В другом PowerShell:

```powershell
.\scripts\block2\demo-rate-limit.ps1
```

Ожидаемо: после нескольких login-запросов появляется `429 Too Many Requests`.

## 9. Проверка пользовательского сценария через API Gateway

Gateway должен быть доступен на `http://localhost:8080/api`.

```powershell
$login = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"student@example.com","password":"Password123!"}'

$token = $login.token
```

Получаем зоны:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:8080/api/zones" `
  -Headers @{ Authorization = "Bearer $token" }
```

Вступаем в очередь:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/api/queues/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/join" `
  -Headers @{ Authorization = "Bearer $token" }
```

Проверяем Kafka event:

```powershell
kubectl -n kafka exec qoms-kafka-dual-role-0 -- /opt/kafka/bin/kafka-console-consumer.sh `
  --bootstrap-server localhost:9092 `
  --topic queue-and-occupancy-events `
  --from-beginning `
  --max-messages 1 `
  --timeout-ms 10000
```

Ожидаемо: появляется событие `queue_joined`.

## 10. Проверка observability

Устанавливаем stack:

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n qoms-observability -f k8s/platform/observability/kube-prometheus-stack-values.yaml --wait --timeout 15m
helm upgrade --install loki grafana/loki -n qoms-observability -f k8s/platform/observability/loki-values.yaml --wait --timeout 10m
helm upgrade --install tempo grafana/tempo -n qoms-observability -f k8s/platform/observability/tempo-values.yaml --wait --timeout 10m
helm upgrade --install opentelemetry-collector open-telemetry/opentelemetry-collector -n qoms-observability -f k8s/platform/observability/otel-collector-values.yaml --wait --timeout 10m

kubectl apply -f k8s/platform/observability/dashboards
kubectl apply -f k8s/platform/observability/rules
```

Проверяем:

```powershell
kubectl get pods -n qoms-observability
kubectl get servicemonitor -A
kubectl get prometheusrule -n qoms-observability
```

Открываем Grafana:

```powershell
.\scripts\block2\port-forward.ps1 -Target grafana
```

Адрес: `http://localhost:3000`

Логин: `admin / admin`

Ожидаемые dashboards:

- `QOMS Gateway and Services`
- `QOMS Kafka Event Flow`
- `QOMS Logs and Traces`

## 11. Запуск Locust

```powershell
python -m pip install -r tests/locust/requirements.txt
.\scripts\block2\port-forward.ps1 -Target gateway
```

В другом PowerShell:

```powershell
.\scripts\block2\run-locust.ps1 `
  -HostUrl "http://localhost:8080/api" `
  -Users 3 `
  -SpawnRate 1 `
  -RunTime "30s"
```

Ожидаемо:

- login проходит
- get zones проходит
- join queue проходит
- Locust завершается без ошибок

## 12. Остановка стенда

Остановить Minikube:

```powershell
minikube stop -p qoms-block2
```

Удалить стенд:

```powershell
minikube delete -p qoms-block2
```

Остановить registry:

```powershell
docker stop qoms-local-registry
```

## 13. Ограничения локального стенда

- стенд запускается на одной машине
- Kafka работает в single-node режиме
- node autoscaling показывается вручную через Minikube nodes
- Karpenter не используется
- HAProxy/Keepalived не разворачиваются в Minikube
- полный observability stack требует заметно больше CPU и RAM
- если `kubectl top` временно не показывает метрики, проверяем `metrics-server`:

```powershell
kubectl get pods -n kube-system
kubectl logs -n kube-system deploy/metrics-server --tail=100
```
