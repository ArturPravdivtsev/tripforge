variable "aws_region" {
  description = "AWS region that owns the Terraform state bucket and KMS key."
  type        = string
}

variable "project_name" {
  description = "Project identifier used in resource names and tags."
  type        = string
  default     = "tripforge"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.project_name))
    error_message = "project_name must be a lowercase AWS-safe identifier."
  }
}

variable "environment" {
  description = "Environment whose state is stored in the bucket."
  type        = string
  default     = "production"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for Terraform state."
  type        = string
}

variable "owner" {
  description = "Optional owner tag."
  type        = string
  default     = null
}
