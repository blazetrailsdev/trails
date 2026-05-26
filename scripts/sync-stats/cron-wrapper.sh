#!/bin/bash
# Wrapper for cron-triggered stats sync.
# Runs --latest, retries once on rate-limit failure, emails on failure.
#
# Configuration via environment variables (override in the crontab line):
#   PROJ_DIR — repo root (default: this script's grandparent directory)
#   LOG_DIR  — directory for stats-sync.log + stats.db (default: $HOME)
#   EMAIL    — alert recipient (REQUIRED; no default — fail fast)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="${PROJ_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
LOG_DIR="${LOG_DIR:-$HOME}"
EMAIL="${EMAIL:-}"

if [ -z "$EMAIL" ]; then
  echo "[cron-wrapper] EMAIL env var must be set" >&2
  exit 2
fi

mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/stats-sync.log"

cd "$PROJ_DIR"

echo "=== $(date -u -Iseconds) ===" >> "$LOG"

send_alert() {
  local subject="$1"
  local body="$2"
  printf 'To: %s\nSubject: %s\n\n%s\n' "$EMAIL" "$subject" "$body" \
    | msmtp "$EMAIL"
}

run_sync() {
  # Use the repo's pinned toolchain via pnpm. Fall back to npx in minimal
  # cron environments without pnpm on PATH.
  if command -v pnpm >/dev/null 2>&1; then
    pnpm tsx scripts/sync-stats/sync.ts --latest
  else
    npx tsx scripts/sync-stats/sync.ts --latest
  fi
}

# First run — capture output and exit code separately so $? isn't lost.
set +e
output=$(run_sync 2>&1)
exit_code=$?
set -e
echo "$output" >> "$LOG"

# Retry policy: only retry when the first run actually FAILED AND the failure
# looks rate-limit-shaped. Internal retries on a successful run must not
# trigger an extra full sync.
if [ "$exit_code" -ne 0 ] && echo "$output" | grep -qi "rate limit\|secondary rate\|abuse detection"; then
  echo "[cron-wrapper] First run failed with rate-limit signals, waiting 120s and retrying..." >> "$LOG"
  sleep 120
  set +e
  retry_output=$(run_sync 2>&1)
  retry_exit=$?
  set -e
  echo "$retry_output" >> "$LOG"
  if [ "$retry_exit" -ne 0 ]; then
    send_alert "[stats-sync] failed after rate-limit retry (exit $retry_exit)" \
      "Retry exited $retry_exit after rate-limit cooldown.

Last 30 lines:
$(echo "$retry_output" | tail -30)"
  fi
elif [ "$exit_code" -ne 0 ]; then
  send_alert "[stats-sync] failed (exit $exit_code)" \
    "First run exited $exit_code; no rate-limit signals detected.

Last 30 lines:
$(echo "$output" | tail -30)"
fi

# Log final DB counts (best-effort).
db="$LOG_DIR/stats.db"
if [ -f "$db" ] && command -v sqlite3 >/dev/null 2>&1; then
  db_summary=$(sqlite3 "$db" "
    SELECT 'PRs: ' || COUNT(*) FROM pull_requests;
    SELECT 'Runs: ' || COUNT(*) FROM workflow_runs;
    SELECT 'Logs: ' || COUNT(*) FROM raw_job_logs;
    SELECT 'Compare: ' || COUNT(DISTINCT merge_commit_sha) FROM test_compare_stats;
  ")
  echo "$db_summary" >> "$LOG"
fi
echo "" >> "$LOG"
