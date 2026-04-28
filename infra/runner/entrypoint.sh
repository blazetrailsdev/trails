#!/usr/bin/env bash
# Mint a fresh registration token, register as ephemeral, run one job, exit.
# Dokku restarts the container, which loops back here with a new token.
set -euo pipefail

: "${GH_REPO:?GH_REPO must be set, e.g. blazetrailsdev/trails}"
: "${GH_PAT:?GH_PAT must be set (PAT with repo scope or fine-grained Administration: write)}"

# Hostname inside Dokku replicas is e.g. "gh-runner.runner.1" — replace dots
# so the runner name is API-safe and unique per replica/restart.
SAFE_HOST="$(hostname | tr '.' '-')"
RUNNER_NAME="${RUNNER_NAME:-${SAFE_HOST}-$(date +%s)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,Linux,X64}"

echo "→ Requesting registration token for $GH_REPO"
TOKEN_JSON=$(curl -fsSL -X POST \
  -H "Authorization: token $GH_PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$GH_REPO/actions/runners/registration-token")

TOKEN=$(echo "$TOKEN_JSON" | jq -er .token) || {
  echo "Failed to mint registration token. Response:" >&2
  echo "$TOKEN_JSON" >&2
  exit 1
}

cleanup() {
  # --ephemeral auto-deregisters on clean exit. This belt-and-suspenders
  # call covers run.sh dying mid-job. `|| true` because token may already
  # be consumed.
  ./config.sh remove --token "$TOKEN" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ Registering runner: name=$RUNNER_NAME labels=$RUNNER_LABELS"
./config.sh \
  --url "https://github.com/$GH_REPO" \
  --token "$TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --ephemeral \
  --unattended

echo "→ Listening for one job"
exec ./run.sh
