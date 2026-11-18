variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name" {
  type    = string
  default = "trails-serverless-lambda"
}

variable "memory_size" {
  type    = number
  default = 1024
}

variable "role_arn" {
  description = "An existing execution role. Leave null to create one (needs iam:CreateRole)."
  type        = string
  default     = null
}

variable "postgres" {
  description = "Run on RDS PostgreSQL in the default VPC instead of the bundled SQLite file."
  type        = bool
  default     = false
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
