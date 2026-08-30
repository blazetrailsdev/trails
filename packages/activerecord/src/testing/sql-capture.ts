import { Notifications } from "@blazetrails/activesupport";

/** @internal */
export interface StubbableAdapter {
  execute: (sql: string, name?: string | null) => Promise<unknown>;
  executeMutation: (sql: string, binds?: unknown[], name?: string) => Promise<number>;
  exec?: (sql: string) => Promise<void>;
}

function installExecuteStub(adapter: StubbableAdapter): () => void {
  const original = {
    execute: adapter.execute,
    executeMutation: adapter.executeMutation,
    exec: adapter.exec,
  };
  adapter.execute = (sql: string, name: string | null = "SQL") => {
    Notifications.instrument("sql.active_record", { sql, name });
    return Promise.resolve([]);
  };
  adapter.executeMutation = (sql: string, _binds?: unknown[], name: string = "SQL") => {
    Notifications.instrument("sql.active_record", { sql, name });
    return Promise.resolve(0);
  };
  if (original.exec) {
    adapter.exec = (sql: string) => {
      Notifications.instrument("sql.active_record", { sql, name: "SQL" });
      return Promise.resolve();
    };
  }
  return () => {
    adapter.execute = original.execute;
    adapter.executeMutation = original.executeMutation;
    adapter.exec = original.exec;
  };
}

/**
 * Runs `fn` and returns every SQL string emitted via `sql.active_record`
 * during its execution.  Subscription is cleaned up afterward.
 *
 * Cached statements are always dropped (Rails SQLCounter parity). `name: "SCHEMA"`
 * introspection queries are dropped too, mirroring Rails'
 * `capture_sql(include_schema: false)` (test_case.rb:89), which returns
 * `counter.log` unless the caller opts in. Pass `{ includeSchema: true }` for
 * Rails' `log_all` behaviour.
 *
 * Pass `{ stub: adapter }` to intercept the adapter's `execute`/
 * `executeMutation` so DDL is instrumented-and-returned without hitting the
 * DB — mirroring Rails' ActiveSchemaTest `setup` stub. This avoids issuing
 * real `CREATE TABLE` / `CREATE INDEX` round-trips for pure SQL-assertion
 * tests (and the mysql:8 DDL cost they carry).
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE ActiveRecord::TestCase#capture_sql (test/cases/test_case.rb:90), async because the block it wraps is.
 */
export async function captureSql(
  fn: () => void | Promise<void>,
  options: { includeSchema?: boolean; stub?: StubbableAdapter } = {},
): Promise<string[]> {
  const { includeSchema = false, stub } = options;
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
 * @noRailsEquivalent CONVERGEABLE the capture_log_output helper of the Rails insert-all test (test/cases/insert_all_test.rb:849).
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
