resource "neon_project" "db" {
  count     = var.postgres && var.database == null ? 1 : 0
  name      = var.name
  region_id = var.neon_region
  org_id    = var.neon_org_id

  history_retention_seconds = 21600
}

locals {
  origin = var.database != null ? var.database : {
    host     = neon_project.db[0].database_host
    port     = 5432
    database = neon_project.db[0].database_name
    user     = neon_project.db[0].database_user
    password = neon_project.db[0].database_password
  }
  database_url = format(
    "postgres://%s:%s@%s:%d/%s?sslmode=require",
    urlencode(local.origin.user),
    urlencode(local.origin.password),
    local.origin.host,
    local.origin.port,
    urlencode(local.origin.database),
  )
}
