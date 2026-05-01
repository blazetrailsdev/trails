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

# Candidate DB-free files: those that do NOT reference DB setup utilities
# (grep -rL = files that do NOT match the pattern)
UNIT_CANDIDATES=$(grep -rL \
  "createTestAdapter\|test-adapter\|createTestTable\|withDatabase\|PG_TEST_URL\|MYSQL_TEST_URL" \
  "$AR_SRC" --include="*.test.ts" | sort)

# Among the candidates, exclude any that open a real adapter connection directly.
# Guard against empty input (grep reads stdin when given no files) and treat
# no-match as an empty list rather than a script failure.
if [ -n "$UNIT_CANDIDATES" ]; then
  DIRECT_ADAPTER=$(echo "$UNIT_CANDIDATES" | xargs grep -rl \
    "SQLite3Adapter\|PostgreSQLAdapter\|Mysql2Adapter\|new.*Adapter\b\|\.execute\b\|\.exec\b" \
    2>/dev/null | sort -u || true)
else
  DIRECT_ADAPTER=""
fi

# Also exclude encryption tests that use DB via test-helpers.ts intermediary.
# || true so a no-match doesn't abort the script.
ENCRYPTION_DB=$(grep -rl \
  "freshAdapter\|makeEncrypted\|makeFreshModel\|makeKeyProvider" \
  "$AR_SRC/encryption/" 2>/dev/null | sort -u || true)

comm -23 \
  <(echo "$UNIT_CANDIDATES") \
  <(printf '%s\n' $DIRECT_ADAPTER $ENCRYPTION_DB | sort -u)
