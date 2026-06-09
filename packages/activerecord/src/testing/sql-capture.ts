/**
 * captureSql — subscribe to sql.active_record during a callback and return
 * the SQL strings emitted.
 *
 * Mirrors the setup/teardown stub pattern in Rails'
 * activerecord/test/cases/adapters/abstract_mysql_adapter/active_schema_test.rb:
 * the test monkey-patches `connection.execute` to instrument the SQL and
 * return it instead of running it.  We subscribe to the notification instead.
 * SQL strings are collected from the payload before any error propagates
 * (Notifications.instrumentAsync fires _notify in its finally block), so
 * errors from fn() are swallowed — matching Rails' stub-mode where execute
 * never throws.  Tables referenced in tests need not exist.
 *
 * Usage:
 *   const sqls = await captureSql(() => adapter.addIndex("t", "c"));
 *   expect(sqls[0]).toBe("CREATE INDEX ...");
 */

import { Notifications } from "@blazetrails/activesupport";

/**
 * Runs `fn` and returns every SQL string emitted via `sql.active_record`
 * during its execution.  Subscription is cleaned up afterward.
 *
 * Cached statements are always dropped (Rails SQLCounter parity). Pass
 * `{ includeSchema: false }` to also drop `name: "SCHEMA"` introspection
 * queries, mirroring Rails' `capture_sql(include_schema: false)`.
 * @internal
 */
export async function captureSql(
  fn: () => void | Promise<void>,
  options: { includeSchema?: boolean } = {},
): Promise<string[]> {
  const { includeSchema = true } = options;
  const sqls: string[] = [];
  const sub = Notifications.subscribe("sql.active_record", (event: any) => {
    const payload = event.payload;
    const sql: unknown = payload?.sql;
    if (typeof sql !== "string") return;
    if (payload?.cached) return;
    if (!includeSchema && payload?.name === "SCHEMA") return;
    sqls.push(sql);
  });
  try {
    await fn();
  } catch {
    // intentional: mirrors Rails stub-mode where execute never throws
  } finally {
    Notifications.unsubscribe(sub);
  }
  return sqls;
}
