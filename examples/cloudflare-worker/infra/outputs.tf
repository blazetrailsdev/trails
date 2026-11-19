output "hyperdrive_id" {
  value = cloudflare_hyperdrive_config.db.id
}

output "database_url" {
  value     = local.database_url
  sensitive = true
}
