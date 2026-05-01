#!/usr/bin/env bash
# Finds activerecord test files that have no database dependency.
# Output is the list that should populate AR_UNIT_FILES in vitest.config.ts.
#
# A file is DB-free if it does not:
#   - import from test-adapter (createTestAdapter / SchemaAdapter)
#   - import from encryption/test-helpers (freshAdapter / makeEncrypted*)
#   - instantiate SQLite3Adapter / PostgreSQLAdapter / Mysql2Adapter directly
#   - call .execute() or .exec() on an adapter

set -euo pipefail

AR_SRC="packages/activerecord/src"

# Candidate DB-free files: those that do NOT reference DB setup utilities.
# grep -rL lists files that do NOT match the pattern; || true so an empty
# result set (all files match) doesn't abort under set -e.
UNIT_CANDIDATES=$(grep -rL \
  "createTestAdapter\|test-adapter\|createTestTable\|withDatabase\|PG_TEST_URL\|MYSQL_TEST_URL" \
  "$AR_SRC" --include="*.test.ts" | sort || true)

# Among the candidates, exclude any that open a real adapter connection directly.
# Guard against empty input (grep reads stdin when given no files) and treat
# no-match as an empty list rather than a script failure.
if [ -n "$UNIT_CANDIDATES" ]; then
  # Note: \b is not a word boundary in POSIX grep (it matches backspace).
  # The patterns are intentionally broad — false positives here only make
  # the unit-test list more conservative (smaller), never incorrectly large.
  DIRECT_ADAPTER=$(echo "$UNIT_CANDIDATES" | xargs grep -rl \
    "SQLite3Adapter\|PostgreSQLAdapter\|Mysql2Adapter\|new.*Adapter\|\.execute\|\.exec" \
    2>/dev/null | sort -u || true)
else
  DIRECT_ADAPTER=""
fi

# Also exclude encryption tests that use DB via test-helpers.ts intermediary.
# || true so a no-match doesn't abort the script.
ENCRYPTION_DB=$(grep -rl \
  "freshAdapter\|makeEncrypted\|makeFreshModel\|makeKeyProvider" \
  "$AR_SRC/encryption/" 2>/dev/null | sort -u || true)

# Build the exclusion list safely without relying on word-splitting of
# multi-line variables (which breaks on paths with spaces).
EXCLUSIONS=$(
  { [ -n "$DIRECT_ADAPTER" ] && echo "$DIRECT_ADAPTER"; true; }
  { [ -n "$ENCRYPTION_DB" ] && echo "$ENCRYPTION_DB"; true; }
)

comm -23 \
  <(echo "$UNIT_CANDIDATES") \
  <(echo "$EXCLUSIONS" | sort -u)
