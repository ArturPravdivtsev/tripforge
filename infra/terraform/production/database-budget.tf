locals {
  # ECS deployment_maximum_percent=200; workers are not autoscaled.
  maximum_api_tasks       = var.enable_service_autoscaling ? max(var.api_max_count, var.api_desired_count) : var.api_desired_count
  peak_api_connections    = local.maximum_api_tasks * 2 * (var.api_database_pool_max + 1)
  peak_worker_connections = var.worker_desired_count * 2 * var.worker_database_pool_max
  migration_connections   = 1
  operational_headroom    = 20
  peak_database_connections = (
    local.peak_api_connections + local.peak_worker_connections +
    local.migration_connections + local.operational_headroom
  )
}

output "database_connection_budget" {
  description = "Worst-case pool budget. Unknown RDS limit is not a release qualification."
  value = {
    peak_api       = local.peak_api_connections
    peak_worker    = local.peak_worker_connections
    migration      = local.migration_connections
    operations     = local.operational_headroom
    total          = local.peak_database_connections
    verified_limit = var.verified_database_max_connections
    qualification  = var.verified_database_max_connections == null ? "Pending external verification" : "Operator-recorded limit; verify headroom"
  }
}
