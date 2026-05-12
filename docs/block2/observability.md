# Block 2 Observability

The observability stack is intentionally compact:

- Prometheus and Alertmanager for metrics and alerts
- Grafana for dashboards
- Loki for logs
- Tempo for traces
- OpenTelemetry Collector for telemetry intake

This avoids a scattered demo with too many overlapping products.

## Metrics

Service metrics are exposed through `/metrics`, added in shared backend infrastructure code. The service Helm charts create `ServiceMonitor` resources.

Important metric families:

- `qoms_http_requests_total`
- `qoms_http_request_duration_seconds`
- default Node.js/process metrics with `qoms_` prefix
- Istio `istio_requests_total`
- Kubernetes workload metrics

## Logs

Application logs go to stdout. Loki receives cluster logs through the configured collector path. For a local demo, it is enough to show logs from `qoms-apps` namespace and correlate them with a failed request.

## Traces

Tempo is deployed as the trace backend. Istio tracing and OTel Collector are prepared so the demo can show at least one request trace once runtime components are installed and traffic flows.

## Dashboards

Provisioned dashboards:

- `QOMS Gateway and Services`
- `QOMS Kafka Event Flow`
- `QOMS Logs and Traces`

## Alerts

Prepared alerts:

- API Gateway high 5xx rate
- repeated pod restarts
- Kafka not ready
- high request latency
