#!/usr/bin/env bash
# Wrapper for cron-triggered stats sync.
# Runs --latest, retries once on rate-limit failure, alerts on failure.
#
# A failed run used to be indistinguishable from a successful one in the log:
# the counts block below is appended either way, so both outages of August 2026
# (stats-sync-20260813, stats-sync-20260821) were noticed only because someone
# read the log days later, by which point stats.db had a multi-day hole. So
# every run now closes with an explicit verdict line, and a failing one is a
# `[cron-wrapper] ... failed ...` line naming the stage and the error — the shape
# btwhooks' stats watcher matches (`^\[cron-wrapper\] .*fail`) to notify a pane,
# which is the alerting path that does not require anyone to open the log.
# A successful run prints one `ok` line and raises nothing.
#
# Configuration via environment variables (override in the crontab line):
#   PROJ_DIR    — repo root (default: this script's grandparent directory)
#   LOG         — path for the sync log file (default: ~/github/blazetrailsdev/stats-sync.log)
#   EMAIL       — alert recipient (REQUIRED; no default — fail fast)
#   STALE_HOURS — flag a gap since the previous run wider than this (default 26)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="${PROJ_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
LOG="${LOG:-$HOME/github/blazetrailsdev/stats-sync.log}"
EMAIL="${EMAIL:-}"
STALE_HOURS="${STALE_HOURS:-26}"

if [ -z "$EMAIL" ]; then
  echo "[cron-wrapper] EMAIL env var must be set" >&2
  exit 2
fi

mkdir -p "$(dirname "$LOG")"

cd "$PROJ_DIR"

# A run that never happens produces no exit code to alert on, so the only
# evidence of a wrapper that stopped being invoked (crontab edited, host down,
# pnpm gone) is the gap between this header and the previous one. Report it
# without the word "failed": this run is fine, and it must not trip the failure
# matcher.
report_gap() {
  local previous
  previous=$(grep -oE '^=== [0-9]{4}-[0-9]{2}-[0-9]{2}T[^ ]+ ===$' "$LOG" 2>/dev/null | tail -1) || return 0
  [ -n "$previous" ] || return 0
  previous=${previous#=== }
  previous=${previous% ===}
  local since now hours
  since=$(date -d "$previous" +%s 2>/dev/null) || return 0
  now=$(date +%s)
  hours=$(( (now - since) / 3600 ))
  if [ "$hours" -ge "$STALE_HOURS" ]; then
    echo "[cron-wrapper] stale: previous run was ${hours}h ago (expected ~24h) — the sync did not run in between" >> "$LOG"
  fi
}

report_gap
echo "=== $(date -u -Iseconds) ===" >> "$LOG"

# An unreachable mailer must not take the wrapper down with it: under `set -e` a
# non-zero msmtp would abort the script before it wrote its verdict line or its
# exit code, turning a triagable failure back into a silent one.
send_alert() {
  local subject="$1"
  local body="$2"
  printf 'To: %s\nSubject: %s\n\n%s\n' "$EMAIL" "$subject" "$body" \
    | msmtp "$EMAIL" \
    || echo "[cron-wrapper] alert email to $EMAIL could not be sent" >> "$LOG"
}

# The stage the sync died in, from the `=== Syncing ... ===` banners sync.ts
# prints; before the first banner the failure is in the build or in startup.
failing_stage() {
  local stage
  stage=$(grep -oE '^=== .+ ===$' "$tmplog" | tail -1) || true
  if [ -z "$stage" ]; then
    echo "startup"
  else
    stage=${stage#=== }
    echo "${stage% ===}"
  fi
}

# The line worth putting in a notification. pnpm's own `[ELIFECYCLE] Command
# failed with exit code 1` is the LAST line and says nothing; in both outages the
# real error sat several lines above it.
error_line() {
  local line
  line=$(grep -m1 -E '^[A-Za-z]*(Error|Exception)\b|^Error:|^error:|^\s*at .*Error' "$tmplog") || true
  [ -n "$line" ] || line=$(grep -v -e '^\[ELIFECYCLE\]' -e '^$' "$tmplog" | tail -1) || true
  echo "${line:-no output}"
}

# One line per failed run, in the shape btwhooks' stats watcher matches, plus
# the mail. Both carry the stage and the error, not just the exit code.
report_failure() {
  local exit_code="$1"
  local note="$2"
  local stage error
  stage=$(failing_stage)
  error=$(error_line)
  echo "[cron-wrapper] stats sync failed at stage \"$stage\" (exit $exit_code): $error" >> "$LOG"
  send_alert "[stats-sync] failed at \"$stage\" (exit $exit_code)" \
    "$note

Stage: $stage
Error: $error

Last 30 lines:
$(tail -30 "$tmplog")"
}

run_sync() {
  # Go through the `stats:sync` npm script (not `tsx sync.ts` directly) so the
  # `prestats:sync` hook builds @blazetrails/activerecord's dist/ first — the
  # script imports adapters from that gitignored build artifact and crashes
  # with MODULE_NOT_FOUND when it's missing or stale.
  if command -v pnpm >/dev/null 2>&1; then
    pnpm stats:sync --latest
  else
    npx tsc --build packages/activerecord && npx tsx scripts/sync-stats/sync.ts --latest
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
    report_failure "$retry_exit" "Retry exited $retry_exit after rate-limit cooldown."
    exit_code=$retry_exit
  else
    exit_code=0
  fi
elif [ "$exit_code" -ne 0 ]; then
  report_failure "$exit_code" "First run exited $exit_code; no rate-limit signals detected."
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

# Close every run with a verdict, so a reader (or a parser) never has to infer
# one from whether the counts above happen to have moved.
if [ "$exit_code" -eq 0 ]; then
  echo "[cron-wrapper] ok" >> "$LOG"
fi
echo "" >> "$LOG"
exit "${exit_code}"
