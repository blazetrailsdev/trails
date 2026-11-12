#!/usr/bin/env bash
set -euo pipefail
THOR_ONLY_RE='^(packages/thor/|vendor/thor/|scripts/parity/unported-files/thor\.ts$|scripts/api-compare/call-mismatches-(exclude|unreviewed)/thor/)'
ACTIONCABLE_ONLY_RE='^(packages/actioncable/|scripts/parity/unported-files/actioncable\.ts$)'
files="${1:-}"
scoped_only() {
  if [ -n "$files" ] && ! grep -qvE "$2" <<<"$files"; then
    echo "$1=true"
  else
    echo "$1=false"
  fi
}
scoped_only thor_only "$THOR_ONLY_RE"
scoped_only actioncable_only "$ACTIONCABLE_ONLY_RE"
infra="${2:-}"
ar_re="${3:-}"
AR_SCOPE_RE='^packages/(activestorage|solid-queue|solid-cable|solid-cache|activerecord-cli|trails-tsc)/'
AR_FOUNDATION_RE='^packages/(ruby-compat|i18n|msgpack|tzinfo|nokogiri)/'
UNIT_RE='^packages/(arel|activejob|activemodel|activesupport|bcrypt|builder|chronic|date|did-you-mean|et-orbi|fugit|globalid|html-sanitizer|i18n|mail|marcel|image-processing|mini-magick|mini-mime|msgpack|net-smtp|nokogiri|raabro|rake|ruby-compat|tzinfo|vitest-matchers|zeitwerk)$'
ar_scope=""
sqlite_only=false
unit_packages=""
if [ -z "$infra" ] && ! grep -qE '^(scripts/ci/(scoped-only\.sh|unit-packages\.mjs)$|eslint/|eslint\.config\.mjs$|vendor/)' <<<"$files"; then
  unit_packages=$(node "$(dirname "${BASH_SOURCE[0]}")/unit-packages.mjs" "$files" | { grep -E "$UNIT_RE" || true; } | tr '\n' ' ' | sed 's/ $//')
  [ -n "$unit_packages" ] || unit_packages=none
  if [ -n "$ar_re" ]; then
    ar_files=$(grep -E "$ar_re" <<<"$files" || true)
    if [ -n "$ar_files" ]; then
      if ! grep -qvE "$AR_SCOPE_RE" <<<"$ar_files"; then
        ar_scope=$(sed -E 's#^packages/([^/]+)/.*#\1#' <<<"$ar_files" | sort -u \
          | sed 's#^trails-tsc$#activerecord-cli\nsolid-cable\nsolid-queue#' \
          | sort -u | sed 's#^#packages/#' | tr '\n' ' ' | sed 's/ $//')
      elif ! grep -qvE "$AR_FOUNDATION_RE" <<<"$ar_files"; then
        sqlite_only=true
      fi
    fi
  fi
fi
echo "ar_scope=$ar_scope"
echo "sqlite_only=$sqlite_only"
echo "unit_packages=$unit_packages"
