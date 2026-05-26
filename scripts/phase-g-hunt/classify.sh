#!/usr/bin/env bash
# Phase G candidate classifier
# Identifies which D-1-bypass test files could benefit from combined
# Phase G (useFixtures adoption) + D-1 (bypass removal) conversion.
#
# Usage: ./scripts/phase-g-hunt/classify.sh
#
# Outputs a TSV with: file, LOC, sites, total_classes, canonical_pct, has_creates, non_canonical
set -euo pipefail

AR_SRC="packages/activerecord/src"

# Build canonical class name list from model filenames (kebab → PascalCase)
canonical_classes=$(
  ls "$AR_SRC/test-helpers/models/"*.ts 2>/dev/null \
    | xargs -I{} basename {} .ts \
    | perl -pe 's/(^|-)(\w)/uc($2)/ge' \
    | sort -u
)

echo -e "file\tLOC\tsites\ttotal_classes\tcanonical_pct\thas_creates\tnon_canonical"

grep -rl "this\.adapter = adapter" "$AR_SRC" --include="*.test.ts" 2>/dev/null \
  | sed "s|^$AR_SRC/||" \
  | sort \
  | while IFS= read -r file; do
    full="$AR_SRC/$file"
    loc=$(wc -l < "$full")
    sites=$(grep -c "this\.adapter = adapter" "$full" || true)
    classes=$(perl -ne 'print "$1\n" if /class\s+(\w+)\s+extends\s+(?:Base|ApplicationRecord|Model)\b/' "$full" | sort -u || true)
    if [ -n "$classes" ]; then
      total=$(echo "$classes" | wc -l | tr -d ' ')
    else
      total=0
    fi

    canonical=0
    non_canonical=""
    for cls in $classes; do
      if echo "$canonical_classes" | grep -qx "$cls"; then
        canonical=$((canonical + 1))
      else
        non_canonical="${non_canonical:+$non_canonical|}$cls"
      fi
    done

    pct=0
    if [ "$total" -gt 0 ]; then
      pct=$((canonical * 100 / total))
    fi

    creates=$(grep -cE '\.(create|save|insert)\b' "$full" 2>/dev/null || echo 0)
    creates=${creates##*$'\n'}
    has_creates="no"
    if [ "$creates" -gt 0 ]; then
      has_creates="yes($creates)"
    fi

    echo -e "$file\t$loc\t$sites\t$total\t${pct}%\t$has_creates\t${non_canonical:--}"
  done
