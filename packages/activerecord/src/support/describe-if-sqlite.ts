import { describe } from "vitest";
import { isSqliteRun } from "./sqlite-template.js";

/**
 * Scope a suite to the SQLite backend, mirroring Rails'
 * `ActiveRecord::SQLite3TestCase`. The handler connection is swapped to
 * PG/MySQL in the cross-backend CI matrix, so suites whose assertions are
 * SQLite-specific — `EXPLAIN QUERY PLAN` plan shape, `"`-quoted identifiers —
 * must skip there rather than run against a backend Rails never points them at.
 * Reuses the canonical {@link isSqliteRun} predicate so the "what counts as a
 * SQLite run" rule has one source of truth. Counterpart to `describeIfPg` /
 * `describeIfMysql`.
 *
 * Lives here rather than in `adapters/sqlite3/test-helper.ts` because both the
 * `adapters/sqlite3/` and the pre-RFC-0026 `connection-adapters/` test trees
 * need the same gate, and neither tree should import test glue from the other.
 */
export const describeIfSqlite = isSqliteRun() ? describe : (describe.skip as typeof describe);
