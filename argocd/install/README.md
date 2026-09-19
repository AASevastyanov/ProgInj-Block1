# ArgoCD install

Install ArgoCD for the local stand:

```bash
kubectl apply -k argocd/install
kubectl -n argocd rollout status deployment/argocd-server --timeout=180s
```

Then apply `argocd/root-application.yaml`. If the GitHub repository is private, add repo credentials in ArgoCD before syncing.
