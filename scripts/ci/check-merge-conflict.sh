#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'MSG'
Usage:
  check-merge-conflict.sh <repo> <pr>   fail if that PR conflicts with its base
  check-merge-conflict.sh --self-test   run the classifier's own fixture cases

GitHub maintains refs/pull/N/merge only while the branch merges cleanly, so
once a PR conflicts every `pull_request` job checks out the LAST mergeable
merge commit — a tree describing neither the branch nor the base. Results from
such a run do not describe the PR, and the run has to be re-fired after the
rebase regardless, so Preflight fails early and cancels the rest.

Only mergeable_state "dirty" is a textual conflict. "behind", "blocked",
"draft" and "unstable" are normal states for an open PR here and none of them
invalidates the merge ref.

Mergeability is computed asynchronously: GitHub answers null / "unknown" until
a background job finishes, and the first read of a PR is what enqueues it.
Hence the poll, and hence an answer that never resolves counting as mergeable —
this check saves runner minutes and must not become a new way for a mergeable
branch to go red on API timing.

MERGE_CONFLICT_FETCH overrides the API read (used by --self-test); it is run
with the repo and PR as arguments and must print "<mergeable> <state>".
MERGE_CONFLICT_SLEEP overrides the inter-poll delay in seconds.
MSG
}

readonly MAX_ATTEMPTS=6

classify() {
  local mergeable="$1" state="$2"
  if [ "$mergeable" = "false" ] && [ "$state" = "dirty" ]; then
    echo conflict
  elif [ "$mergeable" = "null" ] || [ "$state" = "unknown" ]; then
    echo unresolved
  else
    echo clean
  fi
}

fetch() {
  local repo="$1" pr="$2"
  if [ -n "${MERGE_CONFLICT_FETCH:-}" ]; then
    "$MERGE_CONFLICT_FETCH" "$repo" "$pr"
  else
    # Retried for the same reason the attribution guards are: an unretried 5xx
    # would read in the checks UI as a conflict that does not exist.
    "$(dirname "$0")/gh-api-retry.sh" "repos/$repo/pulls/$pr" \
      --jq '"\(.mergeable) \(.mergeable_state)"'
  fi
}

check() {
  local repo="$1" pr="$2" answer mergeable state verdict attempt
  for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
    answer=$(fetch "$repo" "$pr")
    mergeable=${answer%% *}
    state=${answer##* }
    verdict=$(classify "$mergeable" "$state")
    [ "$verdict" = unresolved ] || break
    if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      echo "Attempt $attempt: mergeability not computed yet (mergeable=$mergeable, state=$state); waiting."
      sleep "${MERGE_CONFLICT_SLEEP:-5}"
    fi
  done

  case "$verdict" in
    conflict)
      echo "::error::This PR conflicts with its base branch. Every job in this run checked out a stale merge commit, so none of their results describe this branch. Rebase onto the base branch, resolve the conflicts and push — CI re-fires on the push."
      return 1
      ;;
    unresolved)
      echo "GitHub did not compute mergeability within $MAX_ATTEMPTS attempts (mergeable=$mergeable, state=$state); treating as mergeable."
      ;;
    *)
      echo "No merge conflict (mergeable=$mergeable, mergeable_state=$state)."
      ;;
  esac
}

selfTestDir=""
selfTestStatus=0

classifyCase() {
  local label="$1" expected="$2" mergeable="$3" state="$4" actual
  actual=$(classify "$mergeable" "$state")
  if [ "$actual" != "$expected" ]; then
    echo "self-test FAILED: $label classified $actual, expected $expected" >&2
    selfTestStatus=1
  fi
}

checkCase() {
  local label="$1" expected="$2" script="$3" status=0 out
  out=$(MERGE_CONFLICT_FETCH="$script" MERGE_CONFLICT_SLEEP=0 check owner/repo 1 2>&1) || status=$?
  if [ "$status" != "$expected" ]; then
    echo "self-test FAILED: $label exited $status, expected $expected" >&2
    printf '%s\n' "$out" >&2
    selfTestStatus=1
  fi
}

fakeFetch() {
  local dir="$1" tag="$2"
  shift 2
  printf '%s\n' "$@" >"$dir/answers-$tag"
  local path="$dir/fetch-$tag.sh"
  {
    echo '#!/usr/bin/env bash'
    echo "n=\$(cat '$dir/count-$tag' 2>/dev/null || echo 0)"
    echo "n=\$((n + 1))"
    echo "echo \$n >'$dir/count-$tag'"
    echo "sed -n \"\${n}p\" '$dir/answers-$tag'"
  } >"$path"
  chmod +x "$path"
  printf '%s' "$path"
}

selfTest() {
  selfTestDir=$(mktemp -d)
  trap 'rm -rf "$selfTestDir"' EXIT
  local dir="$selfTestDir"

  classifyCase 'a textual conflict' conflict false dirty
  classifyCase 'a clean merge' clean true clean
  classifyCase 'a branch behind its base' clean true behind
  classifyCase 'a PR blocked by branch protection' clean false blocked
  classifyCase 'a draft PR' clean true draft
  classifyCase 'a PR with failing checks' clean false unstable
  classifyCase 'mergeability not yet computed' unresolved null unknown

  checkCase 'a conflicting PR' 1 "$(fakeFetch "$dir" conflict 'false dirty')"
  checkCase 'a clean PR' 0 "$(fakeFetch "$dir" clean 'true clean')"
  checkCase 'a conflict seen only after polling' 1 \
    "$(fakeFetch "$dir" late 'null unknown' 'null unknown' 'false dirty')"
  checkCase 'a clean merge seen only after polling' 0 \
    "$(fakeFetch "$dir" slow 'null unknown' 'true clean')"
  checkCase 'mergeability that never resolves' 0 \
    "$(fakeFetch "$dir" never 'null unknown' 'null unknown' 'null unknown' 'null unknown' 'null unknown' 'null unknown')"

  [ "$selfTestStatus" -eq 0 ] && echo "check-merge-conflict: self-test passed."
  return "$selfTestStatus"
}

case "${1:-}" in
  --self-test)
    selfTest
    exit
    ;;
  -h | --help)
    usage
    exit
    ;;
esac

if [ $# -ne 2 ]; then
  usage >&2
  exit 2
fi

check "$1" "$2"
