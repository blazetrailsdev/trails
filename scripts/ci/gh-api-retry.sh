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

# 5xx, rate limiting, and transport-level faults. Anything else (4xx auth,
# not-found, malformed request) is a real error that will fail identically
# every time.
readonly TRANSIENT_RE='HTTP (429|5[0-9][0-9])|no server is currently available|connection reset|connection refused|timeout|timed out|TLS handshake|unexpected EOF|no such host|EOF$'

stderrFile=$(mktemp)
trap 'rm -f "$stderrFile"' EXIT

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if gh api "$@" 2>"$stderrFile"; then
    exit 0
  fi

  cat "$stderrFile" >&2

  if ! grep -qiE "$TRANSIENT_RE" "$stderrFile"; then
    echo "::error::\`gh api\` failed with a non-transient error (see above). This is an API/permissions failure, NOT a Claude attribution violation — the attribution scan never ran." >&2
    exit 1
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    delay=$((attempt * 5))
    echo "gh api: transient failure (attempt $attempt/$MAX_ATTEMPTS); retrying in ${delay}s..." >&2
    sleep "$delay"
  fi
done

echo "::error::GitHub API still unreachable after $MAX_ATTEMPTS attempts (see errors above). This is an infrastructure failure, NOT a Claude attribution violation — the attribution scan never ran. Re-run this job." >&2
exit 1
