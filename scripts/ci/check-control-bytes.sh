#!/usr/bin/env bash
set -euo pipefail

CONTROL_RE='[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]|\xC2[\x80-\x9F]'
BINARY_RE='\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp3|mp4|wasm|tsbuildinfo)$|(^|/)packages/rack/test/multipart/'

usage() {
  cat <<'MSG'
Usage:
  check-control-bytes.sh              scan every tracked file
  check-control-bytes.sh PATH...      scan the given paths
  check-control-bytes.sh --self-test  run the scanner's own fixture cases

Fails when a tracked text source carries a raw control byte (C0 except
tab/LF/CR, plus DEL and C1), which makes grep and ripgrep treat the file as
binary and skip it while utf8 reads stay unaffected. Write the byte as an
escape, e.g. "\0". This is the non-JS/TS half of the ESLint rule
blazetrails/no-raw-control-bytes; keep the two byte sets in step.
MSG
}

if ! printf 'x' | grep -qP 'x' 2>/dev/null; then
  echo "check-control-bytes: requires GNU grep with -P (PCRE) support." >&2
  exit 2
fi

scanPaths() {
  local out status=0
  out=$(mktemp)
  LC_ALL=C xargs -0 -r grep -anHP "$CONTROL_RE" >"$out" || true
  if [ -s "$out" ]; then
    cat -v "$out"
    status=1
  fi
  rm -f "$out"
  return "$status"
}

selfTestDir=""
selfTestStatus=0

selfTestCase() {
  local label=$1 expectation=$2 body=$3 actual=flagged file="$selfTestDir/fixture"
  printf '%b' "$body" >"$file"
  if printf '%s\0' "$file" | scanPaths >/dev/null; then
    actual=clean
  fi
  if [ "$actual" != "$expectation" ]; then
    echo "self-test FAILED: $label was reported $actual, expected $expectation" >&2
    selfTestStatus=1
  fi
}

selfTest() {
  selfTestDir=$(mktemp -d)
  trap 'rm -rf "$selfTestDir"' EXIT

  selfTestCase 'a raw NUL' flagged 'SENTINEL = "\x00"\n'
  selfTestCase 'the same NUL written as an escape' clean 'SENTINEL = "\\\\0"\n'
  selfTestCase 'a raw ESC' flagged 'colour = "\x1becho"\n'
  selfTestCase 'a raw DEL' flagged 'del = "\x7f"\n'
  selfTestCase 'a raw C1 NEL (U+0085)' flagged 'nel = "\xc2\x85"\n'
  selfTestCase 'tab, LF and CR' clean 'ok\t= 1\r\n'
  selfTestCase 'multibyte UTF-8 with C1-ranged continuation bytes' clean 'em = "\xe2\x80\x94 \xc3\xa9"\n'

  [ "$selfTestStatus" -eq 0 ] && echo "check-control-bytes: self-test passed."
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
    echo "check-control-bytes: unknown option $1" >&2
    usage >&2
    exit 2
    ;;
esac

candidates=$(mktemp)
trap 'rm -f "$candidates"' EXIT

if [ "$#" -gt 0 ]; then
  printf '%s\0' "$@" >"$candidates"
else
  git ls-files -z >"$candidates"
  if [ ! -s "$candidates" ]; then
    echo "check-control-bytes: git ls-files listed nothing; refusing to pass." >&2
    exit 1
  fi
fi

if { grep -zvE "$BINARY_RE" <"$candidates" || true; } | scanPaths; then
  echo "check-control-bytes: no raw control bytes found."
else
  echo >&2
  usage >&2
  exit 1
fi
