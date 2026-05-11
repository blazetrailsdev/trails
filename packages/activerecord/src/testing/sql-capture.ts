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
 * @internal
 */
export async function captureSql(fn: () => void | Promise<void>): Promise<string[]> {
  const sqls: string[] = [];
  const sub = Notifications.subscribe("sql.active_record", (event: any) => {
    const sql: unknown = event.payload?.sql;
    if (typeof sql === "string") sqls.push(sql);
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
