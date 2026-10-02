variable "aws_region" {
  description = "AWS region for every Stage 29 regional resource."
  type        = string
}

variable "project_name" {
  description = "Project identifier used in names and tags."
  type        = string
  default     = "tripforge"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.project_name))
    error_message = "project_name must be a lowercase AWS-safe identifier."
  }
}

variable "environment" {
  description = "Single environment provisioned by this root module."
  type        = string
  default     = "production"
}

variable "owner" {
  description = "Optional owner tag."
  type        = string
  default     = null
}

variable "vpc_cidr" {
  description = "Dedicated TripForge VPC CIDR."
  type        = string
  default     = "10.42.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid IPv4 CIDR."
  }
}

variable "availability_zone_count" {
  description = "Number of AZs used by public, application, and data subnet tiers."
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2 && var.availability_zone_count <= 3
    error_message = "availability_zone_count must be two or three."
  }
}

variable "single_nat_gateway" {
  description = "Use one NAT gateway for a lower-cost, non-AZ-resilient profile."
  type        = bool
  default     = false
}

variable "app_domain" {
  description = "Public hostname for the web application."
  type        = string
}

variable "api_domain" {
  description = "Public hostname for the API and Socket.IO endpoint."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID. Null leaves DNS validation records and aliases unmanaged."
  type        = string
  default     = null
}

variable "web_image" {
  description = "Immutable GHCR web image reference."
  type        = string

  validation {
    condition     = can(regex("^.+@sha256:[0-9a-f]{64}$", var.web_image))
    error_message = "web_image must be an immutable image@sha256:<64 hex> reference."
  }
}

variable "api_image" {
  description = "Immutable GHCR API image reference, also used by the worker."
  type        = string

  validation {
    condition     = can(regex("^.+@sha256:[0-9a-f]{64}$", var.api_image))
    error_message = "api_image must be an immutable image@sha256:<64 hex> reference."
  }
}

variable "migrate_image" {
  description = "Immutable GHCR migration image reference."
  type        = string

  validation {
    condition     = can(regex("^.+@sha256:[0-9a-f]{64}$", var.migrate_image))
    error_message = "migrate_image must be an immutable image@sha256:<64 hex> reference."
  }
}

variable "ghcr_credentials_secret_arn" {
  description = "Optional externally managed Secrets Manager ARN containing read-only GHCR username/password JSON."
  type        = string
  default     = null
}

variable "secret_kms_key_arns" {
  description = "Optional customer-managed KMS keys used by externally owned runtime or GHCR secrets."
  type        = set(string)
  default     = []
}

variable "openrouteservice_api_key_secret_arn" {
  description = "Optional externally managed Secrets Manager ARN containing the ORS API key as a plain secret string."
  type        = string
  default     = null
}

variable "redis_auth_token" {
  description = "Strong ElastiCache AUTH token supplied through TF_VAR_redis_auth_token, never committed tfvars."
  type        = string
  sensitive   = true

  validation {
    condition = (
      can(regex("^[!-~]{32,128}$", var.redis_auth_token)) &&
      length(regexall("[\"/@]", var.redis_auth_token)) == 0
    )
    error_message = "redis_auth_token must contain 32-128 printable ASCII characters excluding double quote, slash, and at-sign."
  }
}

variable "database_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "tripforge"
}

variable "database_master_username" {
  description = "RDS-managed master username; a dedicated app role remains Stage 31 debt."
  type        = string
  default     = "tripforge_admin"
}

variable "database_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "database_allocated_storage" {
  description = "Initial RDS gp3 storage in GiB."
  type        = number
  default     = 20
}

variable "database_max_allocated_storage" {
  description = "RDS autoscaling ceiling in GiB."
  type        = number
  default     = 100
}

variable "database_multi_az" {
  description = "Enable the HA Multi-AZ database profile."
  type        = bool
  default     = true
}

variable "database_backup_retention_days" {
  description = "RDS automated backup retention."
  type        = number
  default     = 7
}

variable "database_deletion_protection" {
  description = "Protect production RDS from deletion."
  type        = bool
  default     = true
}

variable "database_skip_final_snapshot" {
  description = "Opt out of the final RDS snapshot only for disposable environments."
  type        = bool
  default     = false
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_replica_count" {
  description = "Number of Redis replicas; one is recommended for HA."
  type        = number
  default     = 1

  validation {
    condition     = var.redis_replica_count >= 0 && var.redis_replica_count <= 5
    error_message = "redis_replica_count must be between zero and five."
  }
}

variable "web_cpu" {
  type        = number
  description = "Web Fargate CPU units."
  default     = 512
}

variable "web_memory" {
  type        = number
  description = "Web Fargate memory in MiB."
  default     = 1024
}

variable "api_cpu" {
  type        = number
  description = "API Fargate CPU units."
  default     = 512
}

variable "api_memory" {
  type        = number
  description = "API Fargate memory in MiB."
  default     = 1024
}

variable "worker_cpu" {
  type        = number
  description = "Worker Fargate CPU units."
  default     = 512
}

variable "worker_memory" {
  type        = number
  description = "Worker Fargate memory in MiB."
  default     = 1024
}

variable "migrate_cpu" {
  type        = number
  description = "Migration task Fargate CPU units."
  default     = 256
}

variable "migrate_memory" {
  type        = number
  description = "Migration task Fargate memory in MiB."
  default     = 512
}

variable "web_desired_count" {
  type        = number
  description = "Steady-state web task count."
  default     = 2
}

variable "api_desired_count" {
  type        = number
  description = "Steady-state API task count."
  default     = 2
}

variable "worker_desired_count" {
  type        = number
  description = "Steady-state worker task count."
  default     = 1
}

variable "enable_service_autoscaling" {
  description = "Enable bounded CPU target tracking for web and API."
  type        = bool
  default     = true
}

variable "web_max_count" {
  type        = number
  description = "Maximum autoscaled web task count."
  default     = 4
}

variable "api_max_count" {
  type        = number
  description = "Maximum autoscaled API task count."
  default     = 4
}

variable "enable_container_insights" {
  description = "Enable enhanced ECS Container Insights; incurs CloudWatch cost."
  type        = bool
  default     = true
}

variable "enable_ecs_exec" {
  description = "Enable audited ECS Exec access; no inbound shell port is created."
  type        = bool
  default     = false
}

variable "enable_otel" {
  description = "Attach an ADOT collector sidecar and export to AWS-native telemetry."
  type        = bool
  default     = false
}

variable "otel_collector_image" {
  description = "Immutable ADOT collector image reference required when enable_otel is true."
  type        = string
  default     = null

  validation {
    condition = (
      !var.enable_otel ||
      (var.otel_collector_image != null && can(regex("^.+@sha256:[0-9a-f]{64}$", var.otel_collector_image)))
    )
    error_message = "enable_otel requires an immutable otel_collector_image digest."
  }
}

variable "log_retention_days" {
  description = "CloudWatch application log retention."
  type        = number
  default     = 30
}

variable "alarm_email" {
  description = "Optional email subscriber for infrastructure alarms."
  type        = string
  default     = null
}

variable "monthly_budget_usd" {
  description = "Optional explicit monthly AWS budget. Null creates no budget."
  type        = number
  default     = null
}

variable "budget_email" {
  description = "Email used only when monthly_budget_usd is configured."
  type        = string
  default     = null

  validation {
    condition     = var.monthly_budget_usd == null || var.budget_email != null
    error_message = "budget_email is required when monthly_budget_usd is set."
  }
}

variable "github_organization" {
  description = "GitHub organization or user owning the trusted repository."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name trusted for deployment."
  type        = string
}

variable "github_environment" {
  description = "GitHub Environment included in the OIDC subject."
  type        = string
  default     = "production"
}

variable "github_oidc_subject" {
  description = "Optional exact GitHub OIDC sub claim. Set this for repositories using GitHub immutable subject claims."
  type        = string
  default     = null
}

variable "create_github_oidc_provider" {
  description = "Create the account-level GitHub OIDC provider; disable when reusing/importing one."
  type        = bool
  default     = true
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN when creation is disabled."
  type        = string
  default     = null

  validation {
    condition     = var.create_github_oidc_provider || var.github_oidc_provider_arn != null
    error_message = "github_oidc_provider_arn is required when create_github_oidc_provider is false."
  }
}
