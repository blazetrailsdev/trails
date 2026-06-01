/**
 * Shared helpers for `adapters/sqlite3/*.test.ts`. Keep this file tiny —
 * anything beyond cross-test glue belongs in the source tree, not here.
 */
import { describe, expect } from "vitest";
import { Notifications, squish } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";

/**
 * Scope a suite to the SQLite backend, mirroring Rails'
 * `ActiveRecord::SQLite3TestCase`. The handler connection is swapped to
 * PG/MySQL in the cross-backend CI matrix (via `PG_TEST_URL`/`MYSQL_TEST_URL`),
 * so suites whose assertions are SQLite-specific — `EXPLAIN QUERY PLAN` plan
 * shape, `"`-quoted identifiers — must skip there rather than run against a
 * backend Rails never points them at. Counterpart to `describeIfPg` /
 * `describeIfMysql`.
 */
const sqliteBackend = !process.env.PG_TEST_URL && !process.env.MYSQL_TEST_URL;
export const describeIfSqlite = sqliteBackend ? describe : (describe.skip as typeof describe);

/**
 * Subscribe to `sql.active_record` for the duration of `fn`, then assert the
 * logged `[sql, name, binds]` triples match `expected`. Mirrors the
 * `assert_logged` helper in Rails' sqlite3 adapter tests.
 */
export async function assertLogged(
  expected: Array<[string, string, unknown[]]>,
  fn: () => unknown | Promise<unknown>,
): Promise<void> {
  const logged: Array<[string, string, unknown[]]> = [];
  const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
    const p = event.payload as Record<string, unknown>;
    logged.push([squish(String(p.sql ?? "")), String(p.name ?? ""), (p.binds as unknown[]) ?? []]);
  });
  try {
    await fn();
  } finally {
    Notifications.unsubscribe(sub);
  }
  expect(logged).toEqual(expected);
}
