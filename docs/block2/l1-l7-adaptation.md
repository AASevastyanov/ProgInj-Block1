# L1-L7 Educational Adaptation

This is an educational mapping, not a claim that every OSI layer is fully implemented by the project.

| Layer | Block 2 interpretation |
| --- | --- |
| L1/L2 | Provided by the developer machine, Docker Desktop, and Minikube VM/container networking. |
| L3 | Kubernetes pod/service networking with Cilium as target CNI. |
| L4 | ClusterIP services, NodePort Kong proxy, TCP connectivity to PostgreSQL, Valkey, MongoDB, Kafka. |
| L5/L6 | Mostly handled by HTTP/TCP libraries and optional mesh mTLS policy; not a separate project concern. |
| L7 | Kong Gateway API routes, API Gateway REST routes, Istio HTTP retry/outlier policies, rate limiting. |

This document exists only to satisfy an educational architecture discussion. The main Block 2 architecture is described in `docs/block2/architecture.md`.
