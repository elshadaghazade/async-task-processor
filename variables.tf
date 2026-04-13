variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-2"
}

variable "project_name" {
  description = "Used as a prefix in all resource names"
  type        = string
  default     = "async-task-processor"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "lambda_runtime" {
  description = "Nodejs runtime version for all Lambda functions"
  type        = string
  default     = "nodejs20.x"
}

variable "lambda_timeout" {
  description = "Default Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "sqs_visibility_timeout" {
  description = "Seconds a message is hidden after being received (must be >= lambda_timeout)"
  type        = number
  default     = 60
}

variable "sqs_max_receive_count" {
  description = "How many times a message is retried before going to the DLQ"
  type        = number
  default     = 3
}

locals {
  prefix = "${var.project_name}-${var.environment}"
}

variable "github_org" {
  description = "Github username"
  type        = string
  default     = "elshadaghazade"
}

variable "github_repo" {
  description = "GitHub repo name"
  type        = string
  default     = "async-task-processor"
}

variable "github_branches" {
  description = "Branches allowed to assume the CI deploy role via OIDC"
  type        = list(string)
  default     = ["main", "master"]
}
