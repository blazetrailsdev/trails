#!/usr/bin/env bash
# Builds the Worker, creates the posts table, and uploads the script bound to the Hyperdrive config
# `terraform apply` created in infra/.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
hyperdrive_id=$(terraform -chdir=infra output -raw hyperdrive_id)
DATABASE_URL="$(terraform -chdir=infra output -raw database_url)" TRAILS_ENV=production node bin/trails db:migrate
bash scripts/build.sh
sed "s/00000000000000000000000000000000/$hyperdrive_id/" wrangler.jsonc > wrangler.deploy.jsonc
pnpm exec wrangler deploy --config wrangler.deploy.jsonc
