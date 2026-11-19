terraform {
  required_version = ">= 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
    neon       = { source = "kislerdm/neon", version = "~> 0.18" }
  }
}

provider "cloudflare" {}

# Reads NEON_API_KEY. Unused when `database` is set.
provider "neon" {}
