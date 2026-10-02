output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "Public ALB DNS name."
}

output "app_url" {
  value       = local.web_origin
  description = "Configured HTTPS web origin."
}

output "api_url" {
  value       = local.api_origin
  description = "Configured HTTPS API origin."
}

output "ecs_cluster_name" {
  value       = aws_ecs_cluster.main.name
  description = "ECS cluster consumed by the deployment workflow."
}

output "ecs_service_names" {
  value = {
    web    = aws_ecs_service.web.name
    api    = aws_ecs_service.api.name
    worker = aws_ecs_service.worker.name
  }
}

output "task_definition_families" {
  value = {
    web     = aws_ecs_task_definition.web.family
    api     = aws_ecs_task_definition.api.family
    worker  = aws_ecs_task_definition.worker.family
    migrate = aws_ecs_task_definition.migrate.family
  }
}

output "deployment_network" {
  description = "Non-secret networking values required by the one-off migration task."
  value = {
    subnet_ids                  = values(aws_subnet.application)[*].id
    migration_security_group_id = aws_security_group.migrate.id
  }
}

output "github_deploy_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "OIDC-assumable role for immutable ECS deployment only."
}

output "documents_bucket_name" {
  value       = aws_s3_bucket.documents.id
  description = "Private TripForge documents bucket."
}

output "rds_endpoint" {
  value       = aws_db_instance.main.endpoint
  description = "RDS endpoint without credentials."
}

output "redis_primary_endpoint" {
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  description = "Redis endpoint without the auth token."
}
