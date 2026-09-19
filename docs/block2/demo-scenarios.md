# Block 2 Demo Scenarios

## 1. Load through Gateway

1. Port-forward Kong.
2. Run Locust.
3. Show request rate and latency in Grafana.
4. Show HPA objects in `qoms-apps`.

Commands:

```powershell
.\scripts\block2\port-forward.ps1 -Target gateway
.\scripts\block2\run-locust.ps1
kubectl get hpa -n qoms-apps
```

## 2. Rate limiting

1. Run repeated login attempts.
2. Show `429` responses.
3. Show KongPlugin objects.
4. Explain that Valkey is the Redis-compatible backend.

Commands:

```powershell
.\scripts\block2\demo-rate-limit.ps1
kubectl get kongplugin -n qoms-apps
```

## 3. Circuit breaker and observability

1. Show Istio policies.
2. Break `notification-service`.
3. Trigger notification endpoint through gateway.
4. Show logs, metrics, and alert rule.
5. Restore replicas.

Commands:

```powershell
kubectl get virtualservice,destinationrule -n qoms-apps
.\scripts\block2\demo-circuit-breaker.ps1
kubectl -n qoms-apps scale deployment/notification-service --replicas=2
```

## 4. Kafka events

1. Join queue through gateway.
2. Inspect Kafka resources.
3. Show Kafka dashboard.

Commands:

```powershell
kubectl get kafka,kafkatopic -n kafka
kubectl logs -n qoms-apps deploy/queue-service
```
