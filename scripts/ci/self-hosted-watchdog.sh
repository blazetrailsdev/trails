#!/usr/bin/env bash
# Cancel and re-run CI runs whose jobs sit queued on the self-hosted
# `debian-arm64*` labels while no matching runner is online. The `changes`
# job's `self_hosted` step routes a lane there only after seeing an idle
# runner; if every runner drops offline before pickup the job waits up to 24h
# (`timeout-minutes` does not count queue time). A re-run re-checks the
# runners and routes to hosted.
#
# A job queued behind a busy but ONLINE runner is left alone: it will be
# picked up.
#
# Usage:
#   scripts/ci/self-hosted-watchdog.sh [--max-queued-minutes N]
#   scripts/ci/self-hosted-watchdog.sh --dry-run <runners.json> <jobs.json> <now-iso>
#
# `jobs.json` in dry-run mode is an array of `{run_id, jobs: [...]}`, the
# shape the live mode assembles from `/actions/runs/{id}/jobs`.
set -euo pipefail

LABELS='["self-hosted","debian","ARM64"]'
max_minutes=15

online_runners() {
  jq --argjson want "$LABELS" \
    '[.runners[] | select(.status == "online" and ([.labels[].name] as $l | all($want[]; IN($l[]))))] | length'
}

# Prints the run id of every run holding a job queued on the self-hosted
# labels for longer than max_minutes.
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
if [ "${1:-}" = --max-queued-minutes ]; then max_minutes="$2"; fi

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
# The runner-status token can only list runners; runs and jobs are read and
# cancelled / re-run with the workflow's own token.
export GH_TOKEN="${RERUN_TOKEN:-$GH_TOKEN}"
jobs="[]"
for status in queued in_progress; do
  for run in $(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs?status=$status&per_page=100" --jq '.workflow_runs[].id'); do
    run_jobs=$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs/$run/jobs?filter=latest" --jq '.jobs[]' | jq -s .)
    jobs=$(jq --argjson id "$run" --argjson j "$run_jobs" '. + [{run_id: $id, jobs: $j}]' <<<"$jobs")
  done
done
for run in $(select_runs "$runners" "$jobs" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"); do
  echo "self-hosted-watchdog: run $run is queued on offline self-hosted runners; cancelling and re-running"
  gh run cancel "$run" --repo "$GITHUB_REPOSITORY"
  for _ in $(seq 30); do
    [ "$(gh run view "$run" --repo "$GITHUB_REPOSITORY" --json status --jq .status)" = completed ] && break
    sleep 10
  done
  gh run rerun "$run" --repo "$GITHUB_REPOSITORY"
done
