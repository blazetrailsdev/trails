resource "cloudflare_hyperdrive_config" "db" {
  account_id = var.account_id
  name       = var.name
  origin = {
    scheme   = "postgres"
    host     = local.origin.host
    port     = local.origin.port
    database = local.origin.database
    user     = local.origin.user
    password = local.origin.password
  }
  caching = {
    disabled = true
  }
}
