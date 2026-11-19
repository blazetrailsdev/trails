variable "account_id" {
  description = "The Cloudflare account that owns the Worker and the Hyperdrive config."
  type        = string
}

variable "name" {
  type    = string
  default = "trails-cloudflare-worker"
}

variable "postgres" {
  description = "Create a Neon Postgres project. Ignored when `database_url` is set."
  type        = bool
  default     = true
}

variable "database_url" {
  description = "An existing Postgres URL (postgres://user:password@host:5432/db) instead of a new Neon project."
  type        = string
  default     = null
  sensitive   = true
}

variable "neon_region" {
  type    = string
  default = "aws-us-east-2"
}
