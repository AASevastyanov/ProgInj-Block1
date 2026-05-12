locals {
  common_labels = {
    "app.kubernetes.io/part-of" = "qoms"
    "qoms.io/block"             = "block2"
    "qoms.io/environment"       = var.environment
  }

  namespaces = {
    argocd = {
      name   = "argocd"
      labels = {}
    }
    platform = {
      name   = "qoms-platform"
      labels = {}
    }
    data = {
      name   = "qoms-data"
      labels = {}
    }
    apps = {
      name = "qoms-apps"
      labels = {
        "istio-injection" = "enabled"
      }
    }
    observability = {
      name   = "qoms-observability"
      labels = {}
    }
    kafka = {
      name   = "kafka"
      labels = {}
    }
    istio = {
      name   = "istio-system"
      labels = {}
    }
    kong = {
      name   = "kong"
      labels = {}
    }
  }

  app_service_accounts = [
    "api-gateway",
    "user-service",
    "queue-service",
    "zone-management-service",
    "notification-service",
    "reservation-service",
    "monitoring-event-ingestion-service"
  ]
}

resource "kubernetes_namespace_v1" "namespaces" {
  for_each = local.namespaces

  metadata {
    name   = each.value.name
    labels = merge(local.common_labels, each.value.labels)
  }
}

resource "kubernetes_service_account_v1" "apps" {
  for_each = toset(local.app_service_accounts)

  metadata {
    name      = each.value
    namespace = kubernetes_namespace_v1.namespaces["apps"].metadata[0].name
    labels = merge(local.common_labels, {
      "app.kubernetes.io/name" = each.value
    })
  }
}

resource "kubernetes_service_account_v1" "github_runner" {
  metadata {
    name      = "github-self-hosted-runner"
    namespace = kubernetes_namespace_v1.namespaces["platform"].metadata[0].name
    labels = merge(local.common_labels, {
      "app.kubernetes.io/name" = "github-self-hosted-runner"
    })
  }
}

resource "kubernetes_secret_v1" "app_secrets" {
  metadata {
    name      = "qoms-app-secrets"
    namespace = kubernetes_namespace_v1.namespaces["apps"].metadata[0].name
    labels    = local.common_labels
  }

  type = "Opaque"

  data = {
    jwtSecret            = var.jwt_secret
    internalServiceToken = var.internal_service_token
    postgresPassword     = var.postgres_password
  }
}

resource "kubernetes_secret_v1" "postgres" {
  metadata {
    name      = "qoms-postgres-secret"
    namespace = kubernetes_namespace_v1.namespaces["data"].metadata[0].name
    labels    = local.common_labels
  }

  type = "Opaque"

  data = {
    POSTGRES_DB       = "qoms"
    POSTGRES_USER     = "qoms"
    POSTGRES_PASSWORD = var.postgres_password
  }
}

resource "kubernetes_config_map_v1" "runtime" {
  metadata {
    name      = "qoms-runtime-config"
    namespace = kubernetes_namespace_v1.namespaces["apps"].metadata[0].name
    labels    = local.common_labels
  }

  data = {
    KAFKA_TOPIC                 = "queue-and-occupancy-events"
    KAFKA_BROKERS               = "qoms-kafka-kafka-bootstrap.kafka.svc.cluster.local:9092"
    POSTGRES_HOST               = "postgres.qoms-data.svc.cluster.local"
    POSTGRES_PORT               = "5432"
    POSTGRES_DB                 = "qoms"
    POSTGRES_USER               = "qoms"
    REDIS_HOST                  = "valkey.qoms-data.svc.cluster.local"
    REDIS_PORT                  = "6379"
    MONGO_URI                   = "mongodb://mongodb.qoms-data.svc.cluster.local:27017/qoms"
    USER_SERVICE_URL            = "http://user-service:3001"
    ZONE_MANAGEMENT_SERVICE_URL = "http://zone-management-service:3002"
    QUEUE_SERVICE_URL           = "http://queue-service:3003"
    RESERVATION_SERVICE_URL     = "http://reservation-service:3004"
    NOTIFICATION_SERVICE_URL    = "http://notification-service:3005"
    MONITORING_SERVICE_URL      = "http://monitoring-event-ingestion-service:3006"
  }
}

resource "kubernetes_role_v1" "read_runtime_config" {
  metadata {
    name      = "qoms-read-runtime-config"
    namespace = kubernetes_namespace_v1.namespaces["apps"].metadata[0].name
    labels    = local.common_labels
  }

  rule {
    api_groups     = [""]
    resources      = ["configmaps"]
    resource_names = [kubernetes_config_map_v1.runtime.metadata[0].name]
    verbs          = ["get"]
  }
}

resource "kubernetes_role_binding_v1" "app_runtime_config_readers" {
  metadata {
    name      = "qoms-app-runtime-config-readers"
    namespace = kubernetes_namespace_v1.namespaces["apps"].metadata[0].name
    labels    = local.common_labels
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.read_runtime_config.metadata[0].name
  }

  dynamic "subject" {
    for_each = kubernetes_service_account_v1.apps
    content {
      kind      = "ServiceAccount"
      name      = subject.value.metadata[0].name
      namespace = kubernetes_namespace_v1.namespaces["apps"].metadata[0].name
    }
  }
}
