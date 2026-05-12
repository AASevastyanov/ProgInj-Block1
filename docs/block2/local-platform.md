# Block 2 Local Platform

The local platform uses Minikube as the main cluster path because it is available in the target environment and is understandable for a university demo.

## Chosen path

- Minikube Docker driver
- Kubernetes `v1.34.x`
- Cilium `1.19.3` as target CNI
- metrics-server for HPA
- local Docker registry exposed as `host.minikube.internal:5000`

## Bootstrap flow

1. Start Docker Desktop.
2. Start the local registry.
3. Start Minikube with `--network-plugin=cni --cni=false`.
4. Install Cilium. The preferred path pins Cilium through Cilium CLI or Helm; the fallback path uses Minikube `--cni=cilium`.
5. Enable metrics-server.
6. Apply Terraform baseline.
7. Deploy Kafka through Ansible/Strimzi.
8. Install ArgoCD and sync the App of Apps.

The script entrypoint is:

```powershell
.\scripts\block2\bootstrap-minikube.ps1
```

## Cilium note

Cilium is the target CNI because it is a realistic modern Kubernetes CNI and works well with Gateway API and observability scenarios. If Cilium CLI or Helm is installed, the bootstrap script pins the requested Cilium version. If neither is installed, it uses Minikube's built-in `--cni=cilium` integration and records that the exact Cilium version is controlled by Minikube.

## HAProxy and Keepalived

HAProxy/Keepalived are not deployed into this single-host Minikube stand. For a production or multi-VM lab, they would sit in front of two or more Kubernetes ingress endpoints and provide a virtual IP. In this repository, Kong is the actual local ingress/gateway implementation.
