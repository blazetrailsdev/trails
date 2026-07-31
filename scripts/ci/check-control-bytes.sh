#!/usr/bin/env bash
# Repo-wide raw-control-byte guard — the non-JS/TS half of
# `blazetrails/no-raw-control-bytes` (eslint/no-raw-control-bytes.mjs).
#
# The ESLint rule only reaches files ESLint parses. A raw control byte in any
# other tracked text source hides it from grep exactly the same way: `grep -rn`
# returns nothing and `rg -n` prints only "binary file matches", while tooling
# reading via `readFile(..., "utf8")` is unaffected — so an audit silently gets
# a wrong answer instead of an error. That is how the NUL in
# `scripts/api-compare/extract-ruby-api.rb` (and, before it, in
# canonical-table-rebuild.ts) survived unnoticed. Intended control characters
# must be written as escapes.
#
# Usage:
#   scripts/ci/check-control-bytes.sh            # scan every tracked file
#   scripts/ci/check-control-bytes.sh path...    # scan the given paths (lint-staged)
#   scripts/ci/check-control-bytes.sh --self-test
set -euo pipefail

# Same byte set as the ESLint rule: C0 except tab/LF/CR, plus DEL and C1. C1 is
# matched in its UTF-8 encoding (C2 80..C2 9F) rather than as bare 80..9F, which
# under LC_ALL=C would hit the continuation byte of every ordinary multibyte
# character.
CONTROL_RE='[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]|\xC2[\x80-\x9F]'

# Paths that are legitimately byte-exact. They are excluded rather than escaped
# — there is no plain-text form of a PNG. `packages/rack/test/multipart/` holds
# Rack's verbatim HTTP wire fixtures (raw ESC-encoded ISO-2022-JP bodies, an
# extensionless `binary` blob); rewriting a byte there would change what is
# being parsed.
BINARY_RE='\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp3|mp4|wasm|tsbuildinfo)$|(^|/)packages/rack/test/multipart/'

# Prints offending `file:line:text` (control bytes rendered via `cat -v`) and
# returns 1 when any NUL-separated path on stdin carries a control byte. The
# hits go through a temp file rather than `$(...)`, which would strip the NUL
# bytes this check exists to surface.
scanPaths() {
  local out status=0
  out=$(mktemp)
  # Emptiness of the output, not the exit status: with `-r` and no surviving
  # candidates xargs exits 0 without ever running grep, which would otherwise
  # read as "matches found".
  LC_ALL=C xargs -0 -r grep -anHP "$CONTROL_RE" >"$out" || true
  if [ -s "$out" ]; then
    cat -v "$out"
    status=1
  fi
  rm -f "$out"
  return "$status"
}

selfTestDir=""
selfTest() {
  local status=0
  selfTestDir=$(mktemp -d)
  trap 'rm -rf "$selfTestDir"' EXIT

  printf 'SENTINEL = "\0"\n' >"$selfTestDir/bad.rb"
  if printf '%s\0' "$selfTestDir/bad.rb" | scanPaths >/dev/null; then
    echo "self-test FAILED: a raw NUL fixture was not flagged" >&2
    status=1
  fi

  printf 'SENTINEL = "\\0"\n' >"$selfTestDir/good.rb"
  if ! printf '%s\0' "$selfTestDir/good.rb" | scanPaths; then
    echo "self-test FAILED: the escaped fixture was flagged" >&2
    status=1
  fi

  [ "$status" -eq 0 ] && echo "check-control-bytes: self-test passed."
  return "$status"
}

if [ "${1:-}" = "--self-test" ]; then
  selfTest
  exit
fi

if [ "$#" -gt 0 ]; then
  listPaths() { printf '%s\0' "$@" | grep -zvE "$BINARY_RE"; }
else
  listPaths() { git ls-files -z | grep -zvE "$BINARY_RE"; }
fi

# `|| true` because `grep -zv` exits 1 when every candidate was excluded, and
# under `pipefail` that would otherwise read as a scan failure.
if { listPaths "$@" || true; } | scanPaths; then
  echo "check-control-bytes: no raw control bytes in tracked sources."
else
  cat >&2 <<'MSG'

Raw control bytes above make grep/ripgrep treat those files as binary and skip
them. Write the byte as an escape (e.g. "\0"), or — if the file is genuinely
binary — add it to BINARY_RE in scripts/ci/check-control-bytes.sh.
MSG
  exit 1
fi
