terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
    neon       = { source = "kislerdm/neon", version = "~> 0.9" }
  }
}

provider "cloudflare" {}

# Reads NEON_API_KEY. Unused when `database_url` is set.
provider "neon" {}
