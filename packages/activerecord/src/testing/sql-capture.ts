import { Notifications } from "@blazetrails/activesupport";

/** @internal */
export interface StubbableAdapter {
  execute: (sql: string, name?: string | null) => Promise<unknown>;
  exec?: (sql: string) => Promise<void>;
}

function installExecuteStub(adapter: StubbableAdapter): () => void {
  const original = {
    execute: adapter.execute,
    exec: adapter.exec,
  };
  adapter.execute = (sql: string, name: string | null = "SQL") => {
    Notifications.instrument("sql.active_record", { sql, name });
    return Promise.resolve([]);
  };
  if (original.exec) {
    adapter.exec = (sql: string) => {
      Notifications.instrument("sql.active_record", { sql, name: "SQL" });
      return Promise.resolve();
    };
  }
  return () => {
    adapter.execute = original.execute;
    adapter.exec = original.exec;
  };
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE capture-sql-is-test-case-capture-sql-over-sql-counter-with-no-stub
 */
export async function captureSql(
  fn: () => unknown,
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
