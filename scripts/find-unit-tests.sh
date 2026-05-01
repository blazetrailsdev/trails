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

# Files that directly reference DB setup utilities
DIRECT_DB=$(grep -rL \
  "createTestAdapter\|test-adapter\|createTestTable\|withDatabase\|PG_TEST_URL\|MYSQL_TEST_URL" \
  "$AR_SRC" --include="*.test.ts" | sort)

# Among those, exclude any that open a real adapter connection themselves
DIRECT_ADAPTER=$(grep -rl \
  "SQLite3Adapter\|PostgreSQLAdapter\|Mysql2Adapter\|new.*Adapter\b\|\.execute\b\|\.exec\b" \
  $DIRECT_DB 2>/dev/null | sort -u)

# Also exclude encryption tests that use DB via test-helpers.ts intermediary
ENCRYPTION_DB=$(grep -rl \
  "freshAdapter\|makeEncrypted\|makeFreshModel\|makeKeyProvider" \
  "$AR_SRC/encryption/" 2>/dev/null | sort -u)

comm -23 \
  <(echo "$DIRECT_DB") \
  <(printf '%s\n' $DIRECT_ADAPTER $ENCRYPTION_DB | sort -u)
