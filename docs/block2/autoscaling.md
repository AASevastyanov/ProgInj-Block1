# Block 2 Autoscaling

Autoscaling is implemented at the application level with Kubernetes HPA.

## What works locally

Each mandatory service chart includes an `autoscaling/v2` HPA:

- `api-gateway`
- `user-service`
- `queue-service`
- `zone-management-service`
- `notification-service`

The HPA uses CPU utilization and depends on metrics-server.

Check:

```powershell
kubectl get hpa -n qoms-apps
kubectl top pods -n qoms-apps
```

## Node autoscaling

Karpenter is not used locally. It needs a cloud provider integration and real node lifecycle control. Pretending that it provisions local Minikube nodes would be misleading.

For the local stand, node changes are manual:

```powershell
.\scripts\block2\add-minikube-node.ps1
.\scripts\block2\remove-minikube-node.ps1 -NodeName <node-name>
```

## Production mapping

In a cloud cluster:

- keep the same HPA policies for service replicas
- add Cluster Autoscaler or Karpenter for worker node provisioning
- replace local registry with a managed registry
- replace single-node data services with managed or replicated services

The local artifacts are intentionally focused on the HPA behavior that can be demonstrated without cloud access.
