#!/usr/bin/env bash
# Builds the Worker, creates the posts table, and uploads the script bound to the Hyperdrive config
# `terraform apply` created in infra/.
set -euo pipefail
cd "$(dirname "$0")/.."
hyperdrive_id=$(terraform -chdir=infra output -raw hyperdrive_id)
psql "$(terraform -chdir=infra output -raw database_url)" -q -f db/schema.sql
bash scripts/build.sh
sed "s/00000000000000000000000000000000/$hyperdrive_id/" wrangler.jsonc > wrangler.deploy.jsonc
pnpm exec wrangler deploy --config wrangler.deploy.jsonc
