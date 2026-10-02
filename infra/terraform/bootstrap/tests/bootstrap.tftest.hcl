mock_provider "aws" {}

run "state_is_protected" {
  command = plan

  variables {
    aws_region        = "eu-west-1"
    state_bucket_name = "tripforge-test-state-example"
  }

  assert {
    condition     = aws_s3_bucket.terraform_state.force_destroy == false
    error_message = "Terraform state must never be force-destroyed."
  }

  assert {
    condition     = aws_s3_bucket_versioning.terraform_state.versioning_configuration[0].status == "Enabled"
    error_message = "Terraform state versioning must be enabled."
  }

  assert {
    condition     = aws_kms_key.terraform_state.enable_key_rotation
    error_message = "Terraform state KMS rotation must be enabled."
  }
}
