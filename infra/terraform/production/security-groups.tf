resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public HTTPS entry point"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_ipv4" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https_ipv4" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_ipv6" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv6         = "::/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https_ipv6" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv6         = "::/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_security_group" "web" {
  name        = "${local.name}-web"
  description = "Web ECS tasks"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-web" }
}

resource "aws_security_group" "api" {
  name        = "${local.name}-api"
  description = "API ECS tasks"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-api" }
}

resource "aws_security_group" "worker" {
  name        = "${local.name}-worker"
  description = "Background worker with no inbound access"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-worker" }
}

resource "aws_security_group" "migrate" {
  name        = "${local.name}-migrate"
  description = "One-off database migration tasks"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-migrate" }
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "PostgreSQL access from API, worker, and migration tasks"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-rds" }
}

resource "aws_security_group" "redis" {
  name        = "${local.name}-redis"
  description = "Redis access from API and worker tasks"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-redis" }
}

resource "aws_vpc_security_group_ingress_rule" "web_from_alb" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 4000
  to_port                      = 4000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_web" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.web.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_api" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.api.id
  from_port                    = 4000
  to_port                      = 4000
  ip_protocol                  = "tcp"
}

locals {
  application_security_groups = {
    web     = aws_security_group.web.id
    api     = aws_security_group.api.id
    worker  = aws_security_group.worker.id
    migrate = aws_security_group.migrate.id
  }
}

resource "aws_vpc_security_group_egress_rule" "application_https" {
  for_each = local.application_security_groups

  security_group_id = each.value
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "GHCR, AWS APIs, and HTTPS providers through NAT"
}

resource "aws_vpc_security_group_egress_rule" "application_dns_udp" {
  for_each = local.application_security_groups

  security_group_id = each.value
  cidr_ipv4         = "${cidrhost(var.vpc_cidr, 2)}/32"
  from_port         = 53
  to_port           = 53
  ip_protocol       = "udp"
  description       = "VPC DNS resolver"
}

resource "aws_vpc_security_group_egress_rule" "application_dns_tcp" {
  for_each = local.application_security_groups

  security_group_id = each.value
  cidr_ipv4         = "${cidrhost(var.vpc_cidr, 2)}/32"
  from_port         = 53
  to_port           = 53
  ip_protocol       = "tcp"
  description       = "VPC DNS resolver fallback"
}

resource "aws_vpc_security_group_egress_rule" "application_to_rds" {
  for_each = {
    api     = aws_security_group.api.id
    worker  = aws_security_group.worker.id
    migrate = aws_security_group.migrate.id
  }

  security_group_id            = each.value
  referenced_security_group_id = aws_security_group.rds.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "TLS PostgreSQL"
}

resource "aws_vpc_security_group_egress_rule" "application_to_redis" {
  for_each = {
    api    = aws_security_group.api.id
    worker = aws_security_group.worker.id
  }

  security_group_id            = each.value
  referenced_security_group_id = aws_security_group.redis.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "TLS Redis"
}

resource "aws_vpc_security_group_ingress_rule" "rds" {
  for_each = {
    api     = aws_security_group.api.id
    worker  = aws_security_group.worker.id
    migrate = aws_security_group.migrate.id
  }

  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = each.value
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "redis" {
  for_each = {
    api    = aws_security_group.api.id
    worker = aws_security_group.worker.id
  }

  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = each.value
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
}
