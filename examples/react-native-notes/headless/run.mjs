import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

function checkBinds(params) {
  for (const v of Array.isArray(params) ? params : Object.values(params)) {
    const ok =
      v === null || ["number", "string", "boolean"].includes(typeof v) || v instanceof Uint8Array;
    if (!ok)
      throw new Error(`Cannot convert this JS value to a Java value: ${typeof v} ${String(v)}`);
  }
}

function result(stmt, params, raw) {
  checkBinds(params);
  let rows = [];
  let changes = 0;
  let lastInsertRowId = 0;
  if (stmt.columns().length > 0) {
    stmt.setReturnArrays(raw);
    rows = Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
  } else {
    const r = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
    changes = Number(r.changes);
    lastInsertRowId = Number(r.lastInsertRowid);
  }
  return {
    changes,
    lastInsertRowId,
    getFirstAsync: async () => rows[0] ?? null,
    getAllAsync: async () => rows,
    async *[Symbol.asyncIterator]() {
      yield* rows;
    },
  };
}

const expoSqlite = {
  async openDatabaseAsync() {
    const db = new DatabaseSync(":memory:");
    return {
      async prepareAsync(sql) {
        const stmt = db.prepare(sql);
        return {
          executeAsync: async (p = []) => result(stmt, p, false),
          executeForRawResultAsync: async (p = []) => result(stmt, p, true),
          getColumnNamesAsync: async () => stmt.columns().map((c) => c.name),
          finalizeAsync: async () => {},
        };
      },
      execAsync: async (sql) => void db.exec(sql),
      async runAsync(sql, p = []) {
        const r = db.prepare(sql).run(...p);
        return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
      },
      getAllAsync: async (sql, p = []) => db.prepare(sql).all(...p),
      getFirstAsync: async (sql, p = []) => db.prepare(sql).get(...p) ?? null,
      closeAsync: async () => db.close(),
    };
  },
};

const REACT_NATIVE_GLOBALS =
  "console setTimeout clearTimeout setInterval clearInterval setImmediate clearImmediate queueMicrotask performance atob btoa fetch AbortController TextEncoder TextDecoder URL URLSearchParams structuredClone";
const context = vm.createContext({
  ...Object.fromEntries(REACT_NATIVE_GLOBALS.split(" ").map((name) => [name, globalThis[name]])),
  crypto: { getRandomValues: (a) => globalThis.crypto.getRandomValues(a) },
  __fakeExpoSqlite: expoSqlite,
});
vm.runInContext("delete globalThis.Temporal", context);
vm.runInContext(readFileSync(process.argv[2], "utf8"), context);

const expected = [
  "notes: Standup,Retro",
  "pinned: 1",
  "blank save: false Name can't be blank",
  "serialized: 1,2",
  "unserialized: Overlapping async context scopes are not supported without AsyncLocalStorage or AsyncContext.",
  "after destroy: 0",
];
const actual = await context.__headlessRun();
for (const line of actual) console.log(line);
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error("headless run did not match:", expected);
  process.exit(1);
}
