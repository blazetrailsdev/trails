resource "neon_project" "db" {
  count     = var.postgres && var.database_url == null ? 1 : 0
  name      = var.name
  region_id = var.neon_region
}

locals {
  neon = var.postgres && var.database_url == null
  origin = local.neon ? {
    host     = neon_project.db[0].database_host
    port     = 5432
    database = neon_project.db[0].database_name
    user     = neon_project.db[0].database_user
    password = neon_project.db[0].database_password
    } : {
    host     = regex("@([^:/]+)", var.database_url)[0]
    port     = tonumber(try(regex("@[^:/]+:([0-9]+)", var.database_url)[0], "5432"))
    database = regex("/([^/?]+)(\\?|$)", var.database_url)[0]
    user     = regex("^postgres(?:ql)?://([^:]+):", var.database_url)[0]
    password = regex("^postgres(?:ql)?://[^:]+:([^@]+)@", var.database_url)[0]
  }
  database_url = local.neon ? neon_project.db[0].connection_uri : var.database_url
}
