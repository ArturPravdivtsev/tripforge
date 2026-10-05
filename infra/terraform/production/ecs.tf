resource "aws_cloudwatch_log_group" "application" {
  for_each = toset(["web", "api", "worker", "migrate"])

  name              = "/${var.project_name}/${var.environment}/${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "otel" {
  name              = "/${var.project_name}/${var.environment}/otel"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enhanced" : "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

locals {
  web_container = merge(
    {
      name      = "web"
      image     = var.web_image
      essential = true
      portMappings = [{
        name          = "web-http"
        containerPort = 3000
        hostPort      = 3000
        protocol      = "tcp"
        appProtocol   = "http"
      }]
      environment = concat(local.runtime_environment, [
        { name = "PORT", value = "3000" },
        { name = "S3_UPLOAD_ORIGIN", value = local.s3_upload_origin },
      ])
      healthCheck = {
        command = [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
        ]
        interval    = 30
        retries     = 3
        startPeriod = 30
        timeout     = 5
      }
      stopTimeout = 60
      linuxParameters = {
        initProcessEnabled = true
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.application["web"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "web"
        }
      }
    },
    local.registry_credentials == null ? {} : {
      repositoryCredentials = local.registry_credentials
    },
  )

  api_secrets = concat(
    local.database_secrets,
    [{ name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis.arn }],
    var.openrouteservice_api_key_secret_arn == null ? [] : [{
      name      = "OPENROUTESERVICE_API_KEY"
      valueFrom = var.openrouteservice_api_key_secret_arn
    }],
    var.openai_api_key_secret_arn == null ? [] : [{
      name      = "OPENAI_API_KEY"
      valueFrom = var.openai_api_key_secret_arn
    }],
  )

  api_container = merge(
    {
      name      = "api"
      image     = var.api_image
      essential = true
      portMappings = [{
        name          = "api-http"
        containerPort = 4000
        hostPort      = 4000
        protocol      = "tcp"
        appProtocol   = "http"
      }]
      environment = concat(local.application_environment, [
        { name = "PORT", value = "4000" },
        { name = "WEB_ORIGIN", value = local.web_origin },
        { name = "SECURITY_RATE_LIMITING_ENABLED", value = "true" },
        { name = "DATABASE_POOL_MAX", value = tostring(var.api_database_pool_max) },
        { name = "AI_ASSISTANT_ENABLED", value = tostring(var.openai_api_key_secret_arn != null) },
        { name = "OPENAI_MODEL", value = "gpt-6-luna" },
        { name = "OPENAI_REASONING_EFFORT", value = "medium" },
      ])
      secrets = local.api_secrets
      healthCheck = {
        command = [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
        ]
        interval    = 30
        retries     = 3
        startPeriod = 30
        timeout     = 5
      }
      stopTimeout = 60
      linuxParameters = {
        initProcessEnabled = true
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.application["api"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    },
    local.registry_credentials == null ? {} : {
      repositoryCredentials = local.registry_credentials
    },
  )

  worker_container = merge(
    {
      name        = "worker"
      image       = var.api_image
      essential   = true
      command     = ["node", "dist/worker.js"]
      environment = concat(local.application_environment, [{ name = "DATABASE_POOL_MAX", value = tostring(var.worker_database_pool_max) }])
      secrets = concat(
        local.database_secrets,
        [{ name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis.arn }],
      )
      healthCheck = {
        command     = ["CMD", "node", "dist/worker-health.js"]
        interval    = 30
        retries     = 3
        startPeriod = 30
        timeout     = 10
      }
      stopTimeout = 120
      linuxParameters = {
        initProcessEnabled = true
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.application["worker"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "worker"
        }
      }
    },
    local.registry_credentials == null ? {} : {
      repositoryCredentials = local.registry_credentials
    },
  )

  migrate_container = merge(
    {
      name        = "migrate"
      image       = var.migrate_image
      essential   = true
      environment = concat(local.runtime_environment, local.database_environment, [{ name = "DATABASE_POOL_MAX", value = "1" }])
      secrets     = local.migrator_database_secrets
      stopTimeout = 120
      linuxParameters = {
        initProcessEnabled = true
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.application["migrate"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "migrate"
        }
      }
    },
    local.registry_credentials == null ? {} : {
      repositoryCredentials = local.registry_credentials
    },
  )
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.web.arn
  container_definitions = jsonencode(concat(
    [local.web_container],
    var.enable_otel ? [local.otel_container] : [],
  ))

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api.arn
  container_definitions = jsonencode(concat(
    [local.api_container],
    var.enable_otel ? [local.otel_container] : [],
  ))

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  lifecycle {
    precondition {
      condition = var.verified_database_max_connections == null ? true : (
        local.peak_database_connections <= var.verified_database_max_connections
      )
      error_message = "Rolling-deployment DB pool budget exceeds the operator-verified RDS max_connections."
    }
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.worker.arn
  container_definitions = jsonencode(concat(
    [local.worker_container],
    var.enable_otel ? [local.otel_container] : [],
  ))

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.migrate_cpu
  memory                   = var.migrate_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.migrate.arn
  container_definitions    = jsonencode([local.migrate_container])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

resource "aws_ecs_service" "web" {
  name                               = "${local.name}-web"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.web.arn
  desired_count                      = var.web_desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  enable_execute_command             = var.enable_ecs_exec
  wait_for_steady_state              = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = values(aws_subnet.application)[*].id
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener_rule.web]
}

resource "aws_ecs_service" "api" {
  name                               = "${local.name}-api"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.api.arn
  desired_count                      = var.api_desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  enable_execute_command             = var.enable_ecs_exec
  wait_for_steady_state              = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = values(aws_subnet.application)[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener_rule.api]
}

resource "aws_ecs_service" "worker" {
  name                               = "${local.name}-worker"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.worker.arn
  desired_count                      = var.worker_desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = var.enable_ecs_exec
  wait_for_steady_state              = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = values(aws_subnet.application)[*].id
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = false
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_appautoscaling_target" "web" {
  count = var.enable_service_autoscaling ? 1 : 0

  max_capacity       = var.web_max_count
  min_capacity       = var.web_desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.web.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "web_cpu" {
  count = var.enable_service_autoscaling ? 1 : 0

  name               = "${local.name}-web-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.web[0].resource_id
  scalable_dimension = aws_appautoscaling_target.web[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.web[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_target" "api" {
  count = var.enable_service_autoscaling ? 1 : 0

  max_capacity       = var.api_max_count
  min_capacity       = var.api_desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  count = var.enable_service_autoscaling ? 1 : 0

  name               = "${local.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api[0].resource_id
  scalable_dimension = aws_appautoscaling_target.api[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.api[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
