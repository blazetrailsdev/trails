#!/usr/bin/env bash
set -euo pipefail

LABELS='["self-hosted","debian","ARM64"]'
max_minutes=15

online_runners() {
  jq --argjson want "$LABELS" \
    '[.runners[] | select(.status == "online" and ([.labels[].name] as $l | all($want[]; IN($l[]))))] | length'
}

stuck_runs() {
  local now="$1"
  jq -r --argjson want "$LABELS" --arg now "$now" --argjson max "$max_minutes" '
    ($now | fromdateiso8601) as $t
    | .[]
    | select(any(.jobs[];
        .status == "queued"
        and (.labels | sort) == ($want | sort)
        and (($t - (.created_at | fromdateiso8601)) / 60) > $max))
    | .run_id'
}

select_runs() {
  local runners_json="$1" jobs_json="$2" now="$3"
  if [ "$(online_runners <<<"$runners_json")" -gt 0 ]; then
    return 0
  fi
  stuck_runs "$now" <<<"$jobs_json"
}

if [ "${1:-}" = --dry-run ]; then
  select_runs "$(cat "$2")" "$(cat "$3")" "$4"
  exit 0
fi
while [ "$#" -gt 0 ]; do
  case "$1" in
    --max-queued-minutes) max_minutes="${2:?}"; shift 2 ;;
    *) echo "self-hosted-watchdog: unknown argument $1" >&2; exit 2 ;;
  esac
done

: "${GITHUB_REPOSITORY:?}"
if [ -z "${GH_TOKEN:-}" ]; then
  echo "self-hosted-watchdog: no runner-status token; nothing to check"
  exit 0
fi
runners=$(gh api "repos/$GITHUB_REPOSITORY/actions/runners")
if [ "$(online_runners <<<"$runners")" -gt 0 ]; then
  echo "self-hosted-watchdog: a matching runner is online; nothing to do"
  exit 0
fi
export GH_TOKEN="${RERUN_TOKEN:-$GH_TOKEN}"
jobs="[]"
for status in queued in_progress; do
  for run in $(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs?status=$status&per_page=100" --jq '.workflow_runs[].id'); do
    run_jobs=$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs/$run/jobs?filter=latest" --jq '.jobs[]' | jq -s .)
    jobs=$(jq --argjson id "$run" --argjson j "$run_jobs" '. + [{run_id: $id, jobs: $j}]' <<<"$jobs")
  done
done
stuck=$(select_runs "$runners" "$jobs" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
for run in $stuck; do
  echo "self-hosted-watchdog: run $run is queued on offline self-hosted runners; cancelling"
  gh run cancel "$run" --repo "$GITHUB_REPOSITORY"
done
for run in $stuck; do
  for _ in $(seq 30); do
    [ "$(gh run view "$run" --repo "$GITHUB_REPOSITORY" --json status --jq .status)" = completed ] && break
    sleep 10
  done
  echo "self-hosted-watchdog: re-running $run"
  gh run rerun "$run" --repo "$GITHUB_REPOSITORY"
done
