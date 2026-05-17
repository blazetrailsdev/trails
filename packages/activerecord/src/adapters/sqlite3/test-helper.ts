/**
 * Shared helpers for `adapters/sqlite3/*.test.ts`. Keep this file tiny —
 * anything beyond cross-test glue belongs in the source tree, not here.
 */
import { expect } from "vitest";
import { Notifications, squish } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";

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
