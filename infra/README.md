# TripForge AWS infrastructure

Stage 29 defines one parameterized production environment with Terraform
`1.16.4` and `hashicorp/aws` `6.66.0`. It creates no resources until an operator
reviews a real plan and intentionally runs `apply`. Use an AWS IAM Identity
Center/federated operator role; never use root credentials or long-lived access
keys.

## Layout

```text
infra/terraform/bootstrap/   state S3 bucket, KMS key, bucket policy
infra/terraform/production/  network, edge, ECS, data, IAM, telemetry
```

Both roots commit `.terraform.lock.hcl`. Local `.terraform/`, state, plans,
`terraform.tfvars`, and `*.auto.tfvars` are ignored. Only placeholder
`terraform.tfvars.example` files belong in Git.

## 1. Bootstrap remote state

Copy the example outside Git or pass variables on the command line:

```bash
terraform -chdir=infra/terraform/bootstrap init
terraform -chdir=infra/terraform/bootstrap plan \
  -var='aws_region=<region>' \
  -var='state_bucket_name=<globally-unique-name>' \
  -out=/secure/path/bootstrap.tfplan
terraform -chdir=infra/terraform/bootstrap apply /secure/path/bootstrap.tfplan
terraform -chdir=infra/terraform/bootstrap output -json
```

The bucket has Block Public Access, bucket-owner-enforced ownership, versioning,
SSE-KMS, TLS-only access, and no force destroy. The dedicated KMS key rotates.
Both bucket and key use `prevent_destroy`. State can contain secrets and must be
treated as a production credential artifact.

Create a local, uncommitted backend file from `backend_config`:

```hcl
bucket       = "<state-bucket>"
key          = "tripforge/production/terraform.tfstate"
region       = "<region>"
encrypt      = true
kms_key_id   = "<state-kms-key-arn>"
use_lockfile = true
```

The production backend uses modern S3 lockfiles; no DynamoDB table exists.
State access requires S3 state/lock object permissions and KMS use. Application
and deployment task roles never receive state access.

## 2. Plan production

Prepare an uncommitted `terraform.tfvars` from the example. Account, region,
domains, Route53 zone, GitHub owner/repository, and image digests are operator
inputs, never invented defaults. Supply the Redis token through the process
environment so it is not written to tfvars:

```bash
export TF_VAR_redis_auth_token='<32-128-character-random-token>'
terraform -chdir=infra/terraform/production init \
  -backend-config=/secure/path/backend.hcl
terraform -chdir=infra/terraform/production plan \
  -var-file=/secure/path/production.tfvars \
  -out=/secure/path/production.tfplan
```

The token is necessarily present in Terraform state because ElastiCache AUTH
configuration requires it. The state backend therefore remains a restricted,
encrypted security boundary. ORS and private-GHCR secret values are created
outside Terraform; only their Secrets Manager ARNs are inputs.

Review every plan, especially replacement, deletion, IAM, NAT, RDS, Redis, and
DNS changes. Apply only from trusted `main`/approved release source:

```bash
terraform -chdir=infra/terraform/production apply /secure/path/production.tfplan
terraform -chdir=infra/terraform/production output -json
```

Never use `-lock=false`. Never upload a binary plan to a public or long-lived
artifact store. Run `terraform plan` after apply and investigate anything other
than `No changes`.

## Profiles and cost

HA defaults use two or more web/API tasks, NAT per AZ, Multi-AZ RDS, a Redis
replica with automatic failover, enhanced Container Insights, and two network
AZs. The documented lower-cost, non-HA profile uses `1/1/1` tasks, one NAT,
single-AZ RDS, primary-only Redis, and may disable Container Insights.

Always-on cost drivers are NAT Gateway, ALB, RDS, ElastiCache, Fargate, and
CloudWatch. Log retention, task counts, replicas, and telemetry alter cost.
Set `monthly_budget_usd` and `budget_email` only after the operator chooses a
limit. Obtain an actual estimate with AWS Pricing Calculator for the selected
region; this repository makes no fake monthly-price or SLA claim.

## GitHub and deployment handoff

Terraform outputs the exact deploy role, ECS cluster/services/task families,
and migration network values. Copy those non-secret values to the protected
GitHub `production` Environment as described in
[`docs/aws-deployment.md`](../docs/aws-deployment.md). Add required reviewers
when the GitHub plan supports them.

The GitHub OIDC trust is exact: audience `sts.amazonaws.com` and one repository
environment subject. Repositories using GitHub's newer immutable OIDC subject
format must supply the exact `github_oidc_subject`; do not broaden trust to
`repo:*/*`. If the account already has the GitHub OIDC provider, set
`create_github_oidc_provider=false` and pass its ARN or import it.

Infrastructure apply remains an intentional operator/SSO action. The OIDC
deploy role can register/run ECS tasks and update only the release runtime; it
does not read Terraform state or administer infrastructure.

## Validation and maintenance

```bash
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/bootstrap init -backend=false
terraform -chdir=infra/terraform/bootstrap validate
terraform -chdir=infra/terraform/bootstrap test
terraform -chdir=infra/terraform/production init -backend=false
terraform -chdir=infra/terraform/production validate
terraform -chdir=infra/terraform/production test
trivy config --severity HIGH,CRITICAL --exit-code 1 infra/terraform
```

Dependabot proposes provider/action updates; it never applies them. Review the
AWS provider changelog, update the exact constraint intentionally, regenerate
both lock files on supported platforms, rerun tests/Trivy, and review a live
plan before merging.

## Destruction and recovery caveats

RDS, document S3, state S3, KMS, and Redis use deliberate lifecycle protection.
The document bucket is never force-emptied. A normal destroy therefore stops
instead of discarding durable data. Before a risky migration, take and verify a
manual RDS snapshot when warranted. RDS automated backups, S3 versioning, and
state versioning are recovery primitives, not a tested multi-region DR plan.

To retire production, first document retention/export decisions, disable
protection through a reviewed change, create the required final database
snapshot, and then destroy. Application rollback never rolls back a database
migration.
