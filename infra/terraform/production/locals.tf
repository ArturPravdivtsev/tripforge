locals {
  name = "${var.project_name}-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)
  az_map = {
    for index, az in local.azs : az => index
  }

  web_origin = "https://${var.app_domain}"
  api_origin = "https://${var.api_domain}"

  runtime_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "LOG_LEVEL", value = "info" },
    { name = "OTEL_ENABLED", value = tostring(var.enable_otel) },
    { name = "OTEL_EXPORTER_OTLP_ENDPOINT", value = "http://127.0.0.1:4318" },
    { name = "TRIPFORGE_VERSION", value = substr(sha256("${var.web_image}:${var.api_image}"), 0, 16) },
  ]

  database_environment = [
    { name = "DATABASE_HOST", value = aws_db_instance.main.address },
    { name = "DATABASE_PORT", value = tostring(aws_db_instance.main.port) },
    { name = "DATABASE_NAME", value = var.database_name },
    { name = "DATABASE_SSL", value = "true" },
    { name = "DATABASE_POOL_IDLE_TIMEOUT_MS", value = "30000" },
    { name = "DATABASE_POOL_CONNECTION_TIMEOUT_MS", value = "2000" },
  ]

  application_environment = concat(local.runtime_environment, local.database_environment, [
    { name = "S3_REGION", value = var.aws_region },
    { name = "S3_BUCKET", value = aws_s3_bucket.documents.id },
    { name = "S3_FORCE_PATH_STYLE", value = "false" },
  ])

  database_secrets = [
    for key in ["username", "password"] : {
      name      = "DATABASE_${key == "username" ? "USER" : "PASSWORD"}"
      valueFrom = "${var.application_database_secret_arn}:${key}::"
    }
  ]
  migrator_database_secrets = [
    for key in ["username", "password"] : {
      name      = "DATABASE_${key == "username" ? "USER" : "PASSWORD"}"
      valueFrom = "${var.migrator_database_secret_arn == null ? aws_db_instance.main.master_user_secret[0].secret_arn : var.migrator_database_secret_arn}:${key}::"
    }
  ]

  registry_credentials = var.ghcr_credentials_secret_arn == null ? null : {
    credentialsParameter = var.ghcr_credentials_secret_arn
  }

  otel_container = {
    name      = "otel-collector"
    image     = var.otel_collector_image
    essential = false
    command   = ["--config=env:OTEL_CONFIG_CONTENT"]
    environment = [{
      name = "OTEL_CONFIG_CONTENT"
      value = yamlencode({
        receivers  = { otlp = { protocols = { http = { endpoint = "0.0.0.0:4318" } } } }
        processors = { batch = {} }
        exporters = {
          awsxray = {}
          awsemf  = { namespace = "TripForge/${var.environment}" }
        }
        service = {
          pipelines = {
            traces  = { receivers = ["otlp"], processors = ["batch"], exporters = ["awsxray"] }
            metrics = { receivers = ["otlp"], processors = ["batch"], exporters = ["awsemf"] }
          }
        }
      })
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.otel.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "otel"
      }
    }
  }
}
