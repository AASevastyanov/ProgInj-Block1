# Block 2 CI/CD

The CI/CD path is designed for a GitHub repository with a local self-hosted runner.

## Runner requirements

- Linux self-hosted runner
- labels: `self-hosted`, `qoms-local`, `linux`
- Docker available
- Helm available
- PowerShell available
- local registry reachable as `host.minikube.internal:5000`
- optional ArgoCD CLI

## Pipeline

Workflow: `.github/workflows/block2-local-cicd.yml`

Steps:

1. Render Helm charts.
2. Build service images with Kaniko using the monorepo Dockerfile.
3. Push images to the local registry.
4. Update `image.tag` in Helm values.
5. Commit and push tag updates.
6. Sync ArgoCD if the CLI is installed.

## Image strategy

The current Dockerfile builds the full monorepo. For the local educational stand, the same image is tagged per service and each chart provides the right command:

```text
pnpm --filter @qoms/<service> start
```

This avoids rewriting the existing backend just to demonstrate CI/CD.
