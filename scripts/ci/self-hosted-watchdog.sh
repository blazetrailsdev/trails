#!/usr/bin/env bash
# Cancels and re-runs ci.yml runs whose jobs sit queued on the self-hosted
# debian-arm64 labels while no matching runner is online. The `changes` job's
# `self_hosted` step checks a runner is idle before routing; if every runner
# goes offline before pickup, the job waits up to 24h and `CI` never reports.
# A re-run repeats that check and falls back to hosted.
#
#   self-hosted-watchdog.sh [--dry-run]   live (GH_TOKEN lists runners,
#                                         ACTIONS_TOKEN cancels / re-runs)
#   self-hosted-watchdog.sh --self-test   selection logic on recorded responses
set -euo pipefail

STUCK_MINUTES=${STUCK_MINUTES:-15}
LABELS='["self-hosted","debian","ARM64"]'

online_runners() {
  jq --argjson want "$LABELS" \
    '[.runners[] | select(.status == "online" and ([.labels[].name] as $l | $want | all(IN($l[]))))] | length' "$1"
}

# $1: a JSON array of jobs (the `jobs` arrays of every candidate run, concatenated).
stuck_runs() {
  jq -r --argjson want "$LABELS" --argjson now "$2" --argjson mins "$STUCK_MINUTES" \
    '[.[] | select(.status == "queued"
        and (.labels as $l | $want | all(IN($l[])))
        and ($now - (.created_at | fromdateiso8601)) > ($mins * 60))
      | .run_id] | unique | .[]' "$1"
}

select_runs() {
  if [ "$(online_runners "$1")" -gt 0 ]; then
    return 0
  fi
  stuck_runs "$2" "$3"
}

if [ "${1:-}" = --self-test ]; then
  dir="$(dirname "$0")/fixtures/self-hosted-watchdog"
  now=$(jq -n '"2026-11-16T12:30:00Z" | fromdateiso8601')
  expect() {
    local got
    got=$(select_runs "$dir/$1" "$dir/jobs.json" "$now" | tr '\n' ' ')
    if [ "$got" != "$2" ]; then
      echo "self-hosted-watchdog self-test: runners=$1 got [$got] want [$2]" >&2
      exit 1
    fi
  }
  # 101: queued 30 min on the self-hosted labels. 102: queued 5 min.
  # 103: queued 30 min on a hosted label. 104: in progress on self-hosted.
  expect runners-offline.json "101 "
  # A busy online runner means the job is waiting its turn, not stranded.
  expect runners-online-busy.json ""
  # An online runner with other labels does not serve the job.
  expect runners-other-labels.json "101 "
  echo "self-hosted-watchdog self-test: ok"
  exit 0
fi

dry_run=false
[ "${1:-}" = --dry-run ] && dry_run=true

repo="$GITHUB_REPOSITORY"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

gh api "repos/$repo/actions/runners" >"$work/runners.json"
echo '[]' >"$work/jobs.json"
for status in queued in_progress; do
  GH_TOKEN=$ACTIONS_TOKEN gh api "repos/$repo/actions/workflows/ci.yml/runs?status=$status&per_page=100" --jq '.workflow_runs[].id'
done | sort -u | while read -r run; do
  GH_TOKEN=$ACTIONS_TOKEN gh api "repos/$repo/actions/runs/$run/jobs?filter=latest&per_page=100" --jq '.jobs' \
    | jq -s 'add' "$work/jobs.json" - >"$work/jobs.next" && mv "$work/jobs.next" "$work/jobs.json"
done

for run in $(select_runs "$work/runners.json" "$work/jobs.json" "$(date +%s)"); do
  echo "run $run: queued > ${STUCK_MINUTES}m on $LABELS with no runner online"
  $dry_run && continue
  GH_TOKEN=$ACTIONS_TOKEN gh run cancel "$run" -R "$repo"
  for _ in $(seq 30); do
    [ "$(GH_TOKEN=$ACTIONS_TOKEN gh run view "$run" -R "$repo" --json status --jq .status)" = completed ] && break
    sleep 10
  done
  GH_TOKEN=$ACTIONS_TOKEN gh run rerun "$run" -R "$repo"
done
