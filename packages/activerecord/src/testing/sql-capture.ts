import { Notifications } from "@blazetrails/activesupport";

/** @internal */
export interface StubbableAdapter {
  execute: (sql: string, binds?: unknown[], name?: string) => Promise<unknown>;
  executeMutation: (sql: string, binds?: unknown[], name?: string) => Promise<number>;
  exec?: (sql: string) => Promise<void>;
}

function installExecuteStub(adapter: StubbableAdapter): () => void {
  const original = {
    execute: adapter.execute,
    executeMutation: adapter.executeMutation,
    exec: adapter.exec,
  };
  adapter.execute = (sql: string, _binds?: unknown[], name: string = "SQL") => {
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
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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
