output "state_bucket_name" {
  description = "S3 bucket used by the production partial backend configuration."
  value       = aws_s3_bucket.terraform_state.id
}

output "state_kms_key_arn" {
  description = "KMS key used to encrypt Terraform state and lock objects."
  value       = aws_kms_key.terraform_state.arn
}

output "backend_config" {
  description = "Non-secret values to pass to terraform init -backend-config."
  value = {
    bucket     = aws_s3_bucket.terraform_state.id
    key        = "${var.project_name}/${var.environment}/terraform.tfstate"
    region     = var.aws_region
    kms_key_id = aws_kms_key.terraform_state.arn
    encrypt    = true
  }
}
