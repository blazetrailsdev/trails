#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'MSG'
Usage:
  check-merge-conflict.sh <repo> <pr>   fail if that PR conflicts with its base
  check-merge-conflict.sh --self-test   run the classifier's own fixture cases

What this does NOT catch: a push to an already-conflicting branch. GitHub does
not dispatch `pull_request` activity at all when the PR has a merge conflict
("Workflows will not run on pull_request activity if the pull request has a
merge conflict"), so there is no run to stop on that path.

What it does catch is the case this repo actually produces, with many agents
landing PRs in parallel: a run that was dispatched while the branch still
merged cleanly, whose base then moved under it and now conflicts. That run
checked out a merge of the branch with a base that no longer exists, so its
gates are reporting on a tree that is neither side, and it has to be re-fired
after the rebase regardless. The other reachable path is a manual re-run of
such a run.

Mergeability is therefore read as of NOW, not as of the run's trigger: a re-run
after the base moved is judged on the current state, which is the intended
reading — the question is whether this run's result can still be trusted.

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

# Prints "<mergeable> <state>" on success; returns non-zero, having printed
# nothing usable, when the API cannot be read. A failure here must never red
# this step: an unreadable API is not a conflict, and this check exists to save
# runner minutes, not to invent a new way for a mergeable branch to go red.
# GH_API_RETRY_SOFT keeps the retry script from leaving an `::error::`
# annotation on a run this check then deliberately passes.
fetch() {
  local repo="$1" pr="$2"
  if [ -n "${MERGE_CONFLICT_FETCH:-}" ]; then
    "$MERGE_CONFLICT_FETCH" "$repo" "$pr"
  else
    GH_API_RETRY_SOFT=1 "$(dirname "$0")/gh-api-retry.sh" "repos/$repo/pulls/$pr" \
      --jq '"\(.mergeable) \(.mergeable_state)"'
  fi
}

check() {
  local repo="$1" pr="$2" answer mergeable state verdict attempt
  local status
  for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
    status=0
    answer=$(fetch "$repo" "$pr") || status=$?
    if [ "$status" -ne 0 ]; then
      mergeable=unreadable
      state=unreadable
      verdict=unresolved
    else
      mergeable=${answer%% *}
      state=${answer##* }
      verdict=$(classify "$mergeable" "$state")
    fi
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
      echo "::warning::Could not establish mergeability within $MAX_ATTEMPTS attempts (mergeable=$mergeable, state=$state); treating this PR as mergeable and letting the run continue. An unreadable or uncomputed answer is not a conflict."
      ;;
    *)
      echo "No merge conflict (mergeable=$mergeable, mergeable_state=$state)."
      ;;
  esac
}

selfTestDir=""
selfTestStatus=0
selfTestTarget=""

classifyCase() {
  local label="$1" expected="$2" mergeable="$3" state="$4" actual
  actual=$(classify "$mergeable" "$state")
  if [ "$actual" != "$expected" ]; then
    echo "self-test FAILED: $label classified $actual, expected $expected" >&2
    selfTestStatus=1
  fi
}

# Runs the check as a CHILD PROCESS, not by calling check() in this shell. A
# command substitution in a `||` list suppresses `set -e` inside it, so an
# in-shell call cannot see an abort that CI would see — which is the whole
# failure mode the fail-open guard in fetch()/check() exists to prevent.
checkCase() {
  local label="$1" expected="$2" script="$3" status=0 out
  out=$(MERGE_CONFLICT_FETCH="$script" MERGE_CONFLICT_SLEEP=0 \
    "$selfTestTarget" owner/repo 1 2>&1) || status=$?
  if [ "$status" != "$expected" ]; then
    echo "self-test FAILED: $label exited $status, expected $expected" >&2
    printf '%s\n' "$out" >&2
    selfTestStatus=1
  fi
}

# Writes a fetcher that answers the given lines in order, one per call, so a
# case can exercise the poll loop. The answer "unreadable" makes that call fail
# the way gh-api-retry.sh does when the API cannot be read.
fakeFetch() {
  local dir="$1" tag="$2"
  shift 2
  printf '%s\n' "$@" >"$dir/answers-$tag"
  local path="$dir/fetch-$tag.sh"
  sed -e "s#@ANSWERS@#$dir/answers-$tag#" -e "s#@COUNT@#$dir/count-$tag#" \
    >"$path" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
n=$(cat '@COUNT@' 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" >'@COUNT@'
answer=$(sed -n "${n}p" '@ANSWERS@')
if [ "$answer" = unreadable ]; then
  echo 'gh: HTTP 503 (fixture)' >&2
  exit 1
fi
printf '%s\n' "$answer"
FAKE
  chmod +x "$path"
  printf '%s' "$path"
}

selfTest() {
  selfTestTarget="$1"
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
  checkCase 'an API that cannot be read at all' 0 \
    "$(fakeFetch "$dir" unreadable unreadable unreadable unreadable unreadable unreadable unreadable)"
  checkCase 'an API failure that clears on a later poll' 0 \
    "$(fakeFetch "$dir" recovers unreadable 'true clean')"
  checkCase 'an API failure clearing to reveal a conflict' 1 \
    "$(fakeFetch "$dir" revealed unreadable 'false dirty')"
  checkCase 'mergeability that never resolves' 0 \
    "$(fakeFetch "$dir" never 'null unknown' 'null unknown' 'null unknown' 'null unknown' 'null unknown' 'null unknown')"

  [ "$selfTestStatus" -eq 0 ] && echo "check-merge-conflict: self-test passed."
  return "$selfTestStatus"
}

case "${1:-}" in
  --self-test)
    selfTest "$0"
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
