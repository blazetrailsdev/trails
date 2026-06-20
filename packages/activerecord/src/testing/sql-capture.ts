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
 *
 * Stub mode (closer to Rails' `setup`):
 *   const sqls = await captureSql(() => adapter.addIndex("t", "c"), { stub: adapter });
 * intercepts the adapter's `execute`/`executeMutation` so DDL only instruments
 * the SQL and returns — the statement never reaches the database.
 */

import { Notifications } from "@blazetrails/activesupport";

/**
 * Minimal surface captureSql's stub mode patches.  Both methods exist on every
 * concrete adapter (Mysql2Adapter, PostgresqlAdapter, Sqlite3Adapter).
 * @internal
 */
export interface StubbableAdapter {
  execute: (sql: string, binds?: unknown[], name?: string) => Promise<unknown>;
  executeMutation: (sql: string, binds?: unknown[], name?: string) => Promise<number>;
}

/**
 * Replaces `execute`/`executeMutation` on `adapter` with stubs that instrument
 * the SQL via `sql.active_record` and return without touching the database,
 * mirroring Rails' ActiveSchemaTest `setup` stub.  Returns a restore function.
 */
function installExecuteStub(adapter: StubbableAdapter): () => void {
  const original = {
    execute: adapter.execute,
    executeMutation: adapter.executeMutation,
  };
  adapter.execute = (sql: string, _binds?: unknown[], name: string = "SQL") => {
    Notifications.instrument("sql.active_record", { sql, name });
    return Promise.resolve([]);
  };
  adapter.executeMutation = (sql: string, _binds?: unknown[], name: string = "SQL") => {
    Notifications.instrument("sql.active_record", { sql, name });
    return Promise.resolve(0);
  };
  return () => {
    adapter.execute = original.execute;
    adapter.executeMutation = original.executeMutation;
  };
}

/**
 * Runs `fn` and returns every SQL string emitted via `sql.active_record`
 * during its execution.  Subscription is cleaned up afterward.
 *
 * Cached statements are always dropped (Rails SQLCounter parity). Pass
 * `{ includeSchema: false }` to also drop `name: "SCHEMA"` introspection
 * queries, mirroring Rails' `capture_sql(include_schema: false)`.
 *
 * Pass `{ stub: adapter }` to intercept the adapter's `execute`/
 * `executeMutation` so DDL is instrumented-and-returned without hitting the
 * DB — mirroring Rails' ActiveSchemaTest `setup` stub. This avoids issuing
 * real `CREATE TABLE` / `CREATE INDEX` round-trips for pure SQL-assertion
 * tests (and the mysql:8 DDL cost they carry).
 * @internal
 */
export async function captureSql(
  fn: () => void | Promise<void>,
  options: { includeSchema?: boolean; stub?: StubbableAdapter } = {},
): Promise<string[]> {
  const { includeSchema = true, stub } = options;
  const sqls: string[] = [];
  const sub = Notifications.subscribe("sql.active_record", (event: any) => {
    const payload = event.payload;
    const sql: unknown = payload?.sql;
    if (typeof sql !== "string") return;
    if (payload?.cached) return;
    if (!includeSchema && payload?.name === "SCHEMA") return;
    sqls.push(sql);
  });
  const restore = stub ? installExecuteStub(stub) : undefined;
  try {
    await fn();
  } catch {
    // intentional: mirrors Rails stub-mode where execute never throws
  } finally {
    restore?.();
    Notifications.unsubscribe(sub);
  }
  return sqls;
}

/**
 * captureLogOutput — mirror of Rails' `capture_log_output` test helper
 * (insert_all_test.rb). Rails swaps `ActiveRecord::Base.logger` for one backed
 * by a StringIO and yields the buffer; assertions then `assert_match` against
 * the accumulated log text. The Rails log line for a statement is the
 * `name` label ("Book Bulk Insert") followed by the SQL, so we reconstruct
 * the same `"<name> <sql>"` text from each `sql.active_record` event and
 * return the joined buffer.
 * @internal
 */
export async function captureLogOutput(fn: () => void | Promise<void>): Promise<string> {
  let output = "";
  const sub = Notifications.subscribe("sql.active_record", (event: any) => {
    const payload = event.payload;
    const name: unknown = payload?.name;
    const sql: unknown = payload?.sql;
    output += `${typeof name === "string" ? name : ""} ${typeof sql === "string" ? sql : ""}\n`;
  });
  try {
    await fn();
  } finally {
    Notifications.unsubscribe(sub);
  }
  return output;
}
