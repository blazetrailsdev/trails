variable "account_id" {
  description = "The Cloudflare account that owns the Worker and the Hyperdrive config."
  type        = string
}

variable "name" {
  type    = string
  default = "trails-cloudflare-worker"
}

variable "postgres" {
  description = "Create a Neon Postgres project. Ignored when `database` is set."
  type        = bool
  default     = true
}

variable "database" {
  description = "An existing Postgres database instead of a new Neon project."
  type = object({
    host     = string
    port     = optional(number, 5432)
    database = string
    user     = string
    password = string
  })
  default   = null
  sensitive = true

  validation {
    condition     = var.database != null || var.postgres
    error_message = "Set database, or postgres = true to create a Neon project."
  }
}

variable "neon_region" {
  type    = string
  default = "aws-us-east-2"
}

variable "neon_org_id" {
  description = "The Neon organization for the new project (Neon console: Organization settings)."
  type        = string
  default     = null
}
