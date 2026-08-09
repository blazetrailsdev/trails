#!/usr/bin/env bash
set -euo pipefail

# RFC 0087 (awaitable association writers only), Verification. The campaign
# deleted the synchronous association-writer machinery; this holds it at zero so
# a later PR can't re-add a property setter "just for convenience".
#
# Deliberately NOT gated: `syncWrite`, `syncIdsWrite`,
# `HasOnePersistedAssignmentError` and `CollectionIdsAssignmentError`. Those are
# the campaign's residue, kept alive by a permanently synchronous
# `assignAttributes` (RFC 0087 README §2) — gating them would red main forever.
SYMBOL_RE='_pendingDisplacedRemovals|_displacedRemovalFailure|prepareDetachDisplacedForSyncBuild|findThenDetachDisplaced'

usage() {
  cat <<'MSG'
Usage:
  check-sync-association-writers.sh              scan every tracked file
  check-sync-association-writers.sh PATH...      scan the given paths
  check-sync-association-writers.sh --self-test  run the scanner's own cases

Fails when synchronous association-writer machinery RFC 0087 deleted is
reintroduced. An association writer is awaitable: build the record, then await
the write. If you need one of these names back, converge the caller instead —
see rfcs/0087-awaitable-association-writers-only in the tasks repo.
MSG
}

scanPaths() {
  local out status=0
  out=$(mktemp)
  LC_ALL=C xargs -0 -r grep -anHE "$SYMBOL_RE" >"$out" || true
  if [ -s "$out" ]; then
    cat "$out"
    status=1
  fi
  rm -f "$out"
  return "$status"
}

selfTestDir=""
selfTestStatus=0

selfTestCase() {
  local label=$1 expectation=$2 body=$3 actual=flagged file="$selfTestDir/fixture.ts"
  printf '%s\n' "$body" >"$file"
  if printf '%s\0' "$file" | scanPaths >/dev/null; then actual=clean; fi
  if [ "$actual" != "$expectation" ]; then
    echo "self-test FAILED: $label was reported $actual, expected $expectation" >&2
    selfTestStatus=1
  fi
}

selfTest() {
  selfTestDir=$(mktemp -d)
  trap 'rm -rf "$selfTestDir"' EXIT

  selfTestCase 'a _pendingDisplacedRemovals field' flagged 'private _pendingDisplacedRemovals = [];'
  selfTestCase 'a _displacedRemovalFailure read' flagged 'if (this._displacedRemovalFailure) throw;'
  selfTestCase 'a prepareDetachDisplacedForSyncBuild call' flagged 'this.prepareDetachDisplacedForSyncBuild(r);'
  selfTestCase 'a findThenDetachDisplaced call' flagged 'await this.findThenDetachDisplaced(o);'
  selfTestCase 'the retained syncWrite residue' clean 'reflection.syncWrite(owner, record);'
  selfTestCase 'an ordinary awaitable writer' clean 'await owner.setAccount(account);'

  [ "$selfTestStatus" -eq 0 ] && echo "check-sync-association-writers: self-test passed."
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
  --)
    shift
    ;;
  -*)
    echo "check-sync-association-writers: unknown option $1" >&2
    usage >&2
    exit 2
    ;;
esac

candidates=$(mktemp)
trap 'rm -f "$candidates"' EXIT

if [ "$#" -gt 0 ]; then
  printf '%s\0' "$@" >"$candidates"
else
  # The gate's own text names every symbol, so it excludes itself.
  git ls-files -z ':!scripts/ci/check-sync-association-writers.sh' >"$candidates"
  if [ ! -s "$candidates" ]; then
    echo "check-sync-association-writers: git ls-files listed nothing; refusing to pass." >&2
    exit 1
  fi
fi

if scanPaths <"$candidates"; then
  echo "check-sync-association-writers: no synchronous association writers found."
else
  echo >&2
  usage >&2
  exit 1
fi
