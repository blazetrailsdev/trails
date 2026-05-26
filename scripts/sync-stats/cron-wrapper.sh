#!/usr/bin/env bash
# Wrapper for cron-triggered stats sync.
# Runs --latest, retries once on rate-limit failure, emails on failure.
#
# Configuration via environment variables (override in the crontab line):
#   PROJ_DIR — repo root (default: this script's grandparent directory)
#   LOG      — path for the sync log file (default: ~/github/blazetrailsdev/stats-sync.log)
#   EMAIL    — alert recipient (REQUIRED; no default — fail fast)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="${PROJ_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
LOG="${LOG:-$HOME/github/blazetrailsdev/stats-sync.log}"
EMAIL="${EMAIL:-}"

if [ -z "$EMAIL" ]; then
  echo "[cron-wrapper] EMAIL env var must be set" >&2
  exit 2
fi

mkdir -p "$(dirname "$LOG")"

cd "$PROJ_DIR"

echo "=== $(date -u -Iseconds) ===" >> "$LOG"

send_alert() {
  local subject="$1"
  local body="$2"
  printf 'To: %s\nSubject: %s\n\n%s\n' "$EMAIL" "$subject" "$body" \
    | msmtp "$EMAIL"
}

run_sync() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm tsx scripts/sync-stats/sync.ts --latest
  else
    npx tsx scripts/sync-stats/sync.ts --latest
  fi
}

# Stream output to a temp file so we don't hold it all in memory.
tmplog=$(mktemp)
trap 'rm -f "$tmplog"' EXIT

set +e
run_sync > "$tmplog" 2>&1
exit_code=$?
set -e
cat "$tmplog" >> "$LOG"

if [ "$exit_code" -ne 0 ] && grep -qi "rate limit\|secondary rate\|abuse detection" "$tmplog"; then
  echo "[cron-wrapper] First run failed with rate-limit signals, waiting 120s and retrying..." >> "$LOG"
  sleep 120
  set +e
  run_sync > "$tmplog" 2>&1
  retry_exit=$?
  set -e
  cat "$tmplog" >> "$LOG"
  if [ "$retry_exit" -ne 0 ]; then
    send_alert "[stats-sync] failed after rate-limit retry (exit $retry_exit)" \
      "Retry exited $retry_exit after rate-limit cooldown.

Last 30 lines:
$(tail -30 "$tmplog")"
    exit_code=$retry_exit
  else
    exit_code=0
  fi
elif [ "$exit_code" -ne 0 ]; then
  send_alert "[stats-sync] failed (exit $exit_code)" \
    "First run exited $exit_code; no rate-limit signals detected.

Last 30 lines:
$(tail -30 "$tmplog")"
fi

# DB path matches sync.ts's DB_PATH: ~/github/blazetrailsdev/stats.db
db="$HOME/github/blazetrailsdev/stats.db"
if [ -f "$db" ] && command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$db" "
    SELECT 'PRs: ' || COUNT(*) FROM pull_requests;
    SELECT 'Runs: ' || COUNT(*) FROM workflow_runs;
    SELECT 'Logs: ' || COUNT(*) FROM raw_job_logs;
    SELECT 'Compare: ' || COUNT(DISTINCT merge_commit_sha) FROM test_compare_stats;
  " >> "$LOG"
fi
echo "" >> "$LOG"
exit "${exit_code}"
