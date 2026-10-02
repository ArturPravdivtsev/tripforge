mock_provider "aws" {}

override_data {
  target = data.aws_partition.current
  values = { partition = "aws" }
}

override_data {
  target = data.aws_caller_identity.current
  values = { account_id = "123456789012" }
}

override_data {
  target = data.aws_availability_zones.available
  values = {
    names = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
  }
}

override_data {
  target = data.aws_iam_policy_document.ecs_assume_role
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.execution_secrets
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.api_storage
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.worker_storage
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.ecs_exec
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.telemetry
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.github_deploy_assume_role
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

override_data {
  target = data.aws_iam_policy_document.github_deploy
  values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}

run "production_boundaries" {
  command = plan

  variables {
    aws_region                      = "eu-west-1"
    app_domain                      = "app.example.com"
    api_domain                      = "api.example.com"
    github_organization             = "example"
    github_repository               = "tripforge"
    redis_auth_token                = "test-only-token-32-characters-long"
    web_image                       = "ghcr.io/example/tripforge-web@sha256:0000000000000000000000000000000000000000000000000000000000000000"
    api_image                       = "ghcr.io/example/tripforge-api@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    migrate_image                   = "ghcr.io/example/tripforge-migrate@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    openai_api_key_secret_arn       = "arn:aws:secretsmanager:eu-west-1:123456789012:secret:tripforge-openai"
    application_database_secret_arn = "arn:aws:secretsmanager:eu-west-1:123456789012:secret:tripforge-app-db"
  }

  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.application) == 2 && length(aws_subnet.data) == 2
    error_message = "Each network tier must span two AZs by default."
  }

  assert {
    condition     = aws_db_instance.main.publicly_accessible == false
    error_message = "RDS must remain private."
  }

  assert {
    condition     = output.database_connection_budget.total == 117
    error_message = "Default rolling deployment must account for readiness, workers, migrator and operational headroom."
  }

  assert {
    condition     = aws_db_instance.main.deletion_protection
    error_message = "RDS deletion protection must be enabled by default."
  }

  assert {
    condition     = aws_s3_bucket.documents.force_destroy == false
    error_message = "Document storage must never be force-emptied."
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.documents.block_public_acls &&
      aws_s3_bucket_public_access_block.documents.block_public_policy &&
      aws_s3_bucket_public_access_block.documents.ignore_public_acls &&
      aws_s3_bucket_public_access_block.documents.restrict_public_buckets
    )
    error_message = "Every S3 public-access block must remain enabled."
  }

  assert {
    condition     = aws_db_instance.main.storage_encrypted
    error_message = "RDS storage encryption must remain enabled."
  }

  assert {
    condition = one([
      for parameter in aws_elasticache_parameter_group.main.parameter : parameter.value
      if parameter.name == "maxmemory-policy"
    ]) == "noeviction"
    error_message = "Redis must preserve the BullMQ noeviction policy."
  }

  assert {
    condition     = aws_ecs_service.api.network_configuration[0].assign_public_ip == false
    error_message = "Application tasks must not receive public IPs."
  }

  assert {
    condition = (
      aws_lb_target_group.api.health_check[0].path == "/ready" &&
      aws_lb_target_group.web.health_check[0].path == "/health" &&
      alltrue([for secret in local.database_secrets : startswith(secret.valueFrom, var.application_database_secret_arn)])
    )
    error_message = "API traffic must use DB readiness and dedicated application credentials."
  }

  assert {
    condition = (
      length([for secret in local.api_container.secrets : secret if secret.name == "OPENAI_API_KEY"]) == 1 &&
      length([for secret in local.worker_container.secrets : secret if secret.name == "OPENAI_API_KEY"]) == 0 &&
      length([for secret in local.migrate_container.secrets : secret if secret.name == "OPENAI_API_KEY"]) == 0
    )
    error_message = "OpenAI credentials must never be injected into worker or migration tasks."
  }
}

run "reject_insufficient_verified_connection_limit" {
  command = plan
  variables {
    aws_region                        = "eu-west-1"
    app_domain                        = "app.example.com"
    api_domain                        = "api.example.com"
    github_organization               = "example"
    github_repository                 = "tripforge"
    redis_auth_token                  = "test-only-token-32-characters-long"
    web_image                         = "ghcr.io/example/tripforge-web@sha256:0000000000000000000000000000000000000000000000000000000000000000"
    api_image                         = "ghcr.io/example/tripforge-api@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    migrate_image                     = "ghcr.io/example/tripforge-migrate@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    application_database_secret_arn   = "arn:aws:secretsmanager:eu-west-1:123456789012:secret:tripforge-app-db"
    verified_database_max_connections = 100
  }
  expect_failures = [aws_ecs_task_definition.api]
}
