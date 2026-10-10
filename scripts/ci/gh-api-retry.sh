#!/usr/bin/env bash
# Run `gh api "$@"`, retrying only *transient* failures.
#
# The attribution guards in ci.yml run under `set -euo pipefail`, so a bare
# `gh api` turns a GitHub API blip into a red "Forbid Claude attribution"
# step — and the step name is the only thing a maintainer sees in the checks
# UI, so it reads as though attribution was actually found (see PR #4982,
# which died on an HTTP 503 with a single clean commit).
#
# Retrying indiscriminately would trade that for a different lie: a 404 or a
# 403 from a misconfigured token is permanent, and reporting it as "API
# unreachable" after 30s of pointless backoff misdirects just as badly. So
# classify first and only retry what can actually succeed on a retry.
#
# Payload goes to stdout; all diagnostics go to stderr, so callers can safely
# capture output in a command substitution without retry chatter polluting
# the text they are about to grep.

set -euo pipefail

readonly MAX_ATTEMPTS=4

# 5xx and transport-level faults. Anything not matched here or by
# RATE_LIMIT_RE (4xx auth, not-found, malformed request) is a real error that
# will fail identically every time, so retrying it just wastes runner minutes
# and delays a message the maintainer needs to see.
readonly TRANSIENT_RE='HTTP 5[0-9][0-9]|no server is currently available|connection reset|connection refused|timeout|timed out|TLS handshake|unexpected EOF|no such host|EOF$'

# Rate limiting is transient but must be matched on *wording*, not status:
# GitHub returns primary and secondary rate-limit errors as EITHER 403 or 429,
# and a bare 403 is otherwise permanent (a token missing a scope). Keying on
# the code alone would either retry real permission failures for minutes or —
# as originally written here — fail the guard instantly on a rate limit.
# See GitHub REST docs, "Troubleshooting the REST API > Rate limit errors".
readonly RATE_LIMIT_RE='rate limit|abuse detection|please wait a few minutes'

# GitHub asks callers to back off at least a minute on secondary limits, so
# rate-limit retries use their own (much longer) schedule than 5xx retries.
# They also get their own, smaller attempt cap: Preflight runs under
# `timeout-minutes: 10` and makes four of these calls that can hit a rate limit
# (one merge-conflict read plus the three attribution reads; the merge-conflict
# step may repeat its read, but only on answers that SUCCEEDED), so a 4-attempt
# schedule at 60s could exhaust the job budget and leave a bare "cancelled" —
# the same uninformative signal this script exists to prevent. Two waits per
# call bounds the worst case at ~8 min across all four, which still fits.
# That figure assumes ONE call per check. A caller that polls must not poll
# THROUGH this script: wrapping it in a 6-attempt loop multiplies the budget by
# six (~12 min against a persistent rate limit, past the job timeout, which
# surfaces as the bare "cancelled" this script exists to prevent). So
# check-merge-conflict.sh polls only while GitHub answers "not computed yet",
# and stops at the first unreadable answer — the retries that matter already
# happened in here.
readonly RATE_LIMIT_DELAY=60
readonly RATE_LIMIT_MAX_ATTEMPTS=3

# A caller that treats an API failure as "no verdict" and carries on (see
# GH_API_RETRY_SOFT in check-merge-conflict.sh) must not leave an `::error::`
# annotation behind: GitHub renders one on the run whatever the exit status, so
# the run would read as failed on a check that deliberately passed.
if [ -n "${GH_API_RETRY_SOFT:-}" ]; then
  readonly ANNOTATION="::warning"
else
  readonly ANNOTATION="::error"
fi

stderrFile=$(mktemp)
trap 'rm -f "$stderrFile"' EXIT

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if gh api "$@" 2>"$stderrFile"; then
    exit 0
  fi

  cat "$stderrFile" >&2

  if grep -qiE "$RATE_LIMIT_RE" "$stderrFile"; then
    kind="rate limit"
    delay=$RATE_LIMIT_DELAY
    maxAttempts=$RATE_LIMIT_MAX_ATTEMPTS
  elif grep -qiE "$TRANSIENT_RE" "$stderrFile"; then
    kind="transient failure"
    delay=$((attempt * 5))
    maxAttempts=$MAX_ATTEMPTS
  else
    echo "$ANNOTATION::\`gh api\` failed with a non-transient error (see above). This is an API/permissions failure, NOT a finding from the check that called this script — that check never ran." >&2
    exit 1
  fi

  if [ "$attempt" -ge "$maxAttempts" ]; then
    break
  fi
  echo "gh api: $kind (attempt $attempt/$maxAttempts); retrying in ${delay}s..." >&2
  sleep "$delay"
done

echo "$ANNOTATION::GitHub API still failing ($kind) after $maxAttempts attempts (see errors above). This is an infrastructure failure, NOT a finding from the check that called this script — that check never ran. Re-run this job." >&2
exit 1
