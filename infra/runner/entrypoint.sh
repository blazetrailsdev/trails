#!/usr/bin/env bash
# Mint a fresh registration token, register as ephemeral, run one job, exit.
# Dokku restarts the container, which loops back here with a new token.
#
# Cleanup contract: the runner record must be removed from GitHub on every
# exit path that we can intercept — clean job completion, SIGTERM from
# `docker stop` during scale-down/restart, SIGINT. Only SIGKILL escapes us
# and leaks a record; that's the irreducible tail risk.
set -euo pipefail

: "${GH_REPO:?GH_REPO must be set, e.g. blazetrailsdev/trails}"
: "${GH_PAT:?GH_PAT must be set (PAT with repo scope or fine-grained Administration: write)}"

# Hostname inside Dokku replicas is e.g. "gh-runner.runner.1" — replace dots
# so the runner name is API-safe and unique per replica/restart. Nanosecond
# precision avoids same-second collisions if two containers spin up
# simultaneously (cleanup-by-name would otherwise risk deleting the wrong
# record).
SAFE_HOST="$(hostname | tr '.' '-')"
RUNNER_NAME="${RUNNER_NAME:-${SAFE_HOST}-$(date +%s%N)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,Linux,X64}"
API="https://api.github.com/repos/$GH_REPO"

echo "→ Requesting registration token for $GH_REPO"
TOKEN_JSON=$(curl -fsSL -X POST \
  -H "Authorization: token $GH_PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/actions/runners/registration-token")

TOKEN=$(echo "$TOKEN_JSON" | jq -er .token) || {
  echo "Failed to mint registration token. Response:" >&2
  echo "$TOKEN_JSON" >&2
  exit 1
}

# Resolve and DELETE the runner record by name. By the time `wait`
# returns, run.sh has exited — either:
#   - cleanly after a job, in which case `--ephemeral` already
#     deregistered and the lookup returns nothing (404-equivalent: empty);
#   - or after a forwarded signal during idle, in which case the record
#     is still present and we delete it here.
# Either way, no race with an in-flight job: run.sh is gone before this
# trap fires.
#
# `?per_page=100` is fine at our scale (a single repo with <100 runners);
# if the pool ever grows past that, paginate.
cleanup() {
  echo "→ Cleanup: looking up runner record for $RUNNER_NAME"
  local id
  id=$(curl -fsSL \
        -H "Authorization: token $GH_PAT" \
        -H "Accept: application/vnd.github+json" \
        "$API/actions/runners?per_page=100" \
       | jq -r --arg n "$RUNNER_NAME" '.runners[] | select(.name == $n) | .id' \
       || true)
  if [ -n "$id" ]; then
    echo "→ Deleting runner id=$id"
    curl -fsS -X DELETE \
      -H "Authorization: token $GH_PAT" \
      -H "Accept: application/vnd.github+json" \
      "$API/actions/runners/$id" || echo "  (DELETE failed; runner may still be running a job)"
  else
    echo "→ No record found (already deregistered)"
  fi
}
trap cleanup EXIT

echo "→ Registering runner: name=$RUNNER_NAME labels=$RUNNER_LABELS"
./config.sh \
  --url "https://github.com/$GH_REPO" \
  --token "$TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --ephemeral \
  --unattended

# Run as a backgrounded child so this shell stays PID 1 with its EXIT
# trap intact. Forward SIGTERM/SIGINT to run.sh; `wait` exits with run.sh's
# status and the EXIT trap fires the cleanup. `exec ./run.sh` (the prior
# implementation) replaced the shell and dropped the trap, so signals
# during idle bypassed cleanup.
echo "→ Listening for one job"
./run.sh &
RUN_PID=$!
trap 'echo "→ Forwarding signal to run.sh ($RUN_PID)"; kill -TERM "$RUN_PID" 2>/dev/null || true' INT TERM
wait "$RUN_PID"
