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
 * `describeIfMysqlAdapter`.
 */
export const describeIfSqlite = isSqliteRun() ? describe : (describe.skip as typeof describe);
