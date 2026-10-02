data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

locals {
  execution_secret_arns = compact(concat(
    [
      aws_db_instance.main.master_user_secret[0].secret_arn,
      aws_secretsmanager_secret.redis.arn,
    ],
    var.ghcr_credentials_secret_arn == null ? [] : [var.ghcr_credentials_secret_arn],
    var.openrouteservice_api_key_secret_arn == null ? [] : [var.openrouteservice_api_key_secret_arn],
    var.openai_api_key_secret_arn == null ? [] : [var.openai_api_key_secret_arn],
  ))
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid       = "ReadInjectedSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.execution_secret_arns
  }

  dynamic "statement" {
    for_each = length(var.secret_kms_key_arns) == 0 ? [] : [1]

    content {
      sid       = "DecryptExternalSecrets"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = var.secret_kms_key_arns
    }
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "runtime-secret-injection"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

resource "aws_iam_role" "web" {
  name               = "${local.name}-web-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role" "api" {
  name               = "${local.name}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role" "worker" {
  name               = "${local.name}-worker-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role" "migrate" {
  name               = "${local.name}-migrate-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

data "aws_iam_policy_document" "api_storage" {
  statement {
    sid    = "PresignTripDocuments"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.documents.arn}/trips/*"]
  }
}

resource "aws_iam_role_policy" "api_storage" {
  name   = "trip-documents-presign"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_storage.json
}

data "aws_iam_policy_document" "worker_storage" {
  statement {
    sid       = "DeleteQueuedTripDocuments"
    effect    = "Allow"
    actions   = ["s3:DeleteObject"]
    resources = ["${aws_s3_bucket.documents.arn}/trips/*"]
  }
}

resource "aws_iam_role_policy" "worker_storage" {
  name   = "trip-documents-cleanup"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker_storage.json
}

locals {
  task_roles = {
    web     = aws_iam_role.web.id
    api     = aws_iam_role.api.id
    worker  = aws_iam_role.worker.id
    migrate = aws_iam_role.migrate.id
  }
}

data "aws_iam_policy_document" "ecs_exec" {
  statement {
    effect = "Allow"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ecs_exec" {
  for_each = var.enable_ecs_exec ? local.task_roles : {}

  name   = "ecs-exec-channels"
  role   = each.value
  policy = data.aws_iam_policy_document.ecs_exec.json
}

data "aws_iam_policy_document" "telemetry" {
  statement {
    sid    = "WriteXRay"
    effect = "Allow"
    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
      "xray:GetSamplingRules",
      "xray:GetSamplingTargets",
      "xray:GetSamplingStatisticSummaries",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "WriteCloudWatchMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricData",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "telemetry" {
  for_each = var.enable_otel ? {
    web    = aws_iam_role.web.id
    api    = aws_iam_role.api.id
    worker = aws_iam_role.worker.id
  } : {}

  name   = "aws-otel-export"
  role   = each.value
  policy = data.aws_iam_policy_document.telemetry.json
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = []
}

locals {
  github_oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : var.github_oidc_provider_arn
  github_oidc_subject = coalesce(
    var.github_oidc_subject,
    "repo:${var.github_organization}/${var.github_repository}:environment:${var.github_environment}",
  )
}

data "aws_iam_policy_document" "github_deploy_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_oidc_subject]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${local.name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_deploy_assume_role.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid    = "DeployEcsRevisions"
    effect = "Allow"
    actions = [
      "ecs:DescribeClusters",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:ListTasks",
      "ecs:RegisterTaskDefinition",
      "ecs:RunTask",
      "ecs:StopTask",
      "ecs:UpdateService",
    ]
    resources = ["*"]
  }

  statement {
    sid     = "PassOnlyTripForgeTaskRoles"
    effect  = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      aws_iam_role.execution.arn,
      aws_iam_role.web.arn,
      aws_iam_role.api.arn,
      aws_iam_role.worker.arn,
      aws_iam_role.migrate.arn,
    ]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid    = "InspectDeploymentNetworkAndLogs"
    effect = "Allow"
    actions = [
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSubnets",
      "logs:DescribeLogStreams",
      "logs:GetLogEvents",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "immutable-ecs-deployment"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
