import BetterSqlite3 from "better-sqlite3";
import { SQLite3 } from "../../lib/index.js";
import type { BusyHandler, EngineOpenV2, SyncEngineDatabase } from "../../lib/database.js";
import type { EngineStatement } from "../../lib/statement.js";
import type { SqliteBindValue } from "../../lib/driver.js";
import { statementTail } from "../../lib/engine/statement-tail.js";
import { bindParameterNames } from "../../lib/engine/bind-parameter-index.js";

export function engineDatabase(file = ":memory:"): SyncEngineDatabase & {
  quirkModeDisabled: boolean;
  handler: BusyHandler | null;
  loadExtensionToggles: boolean[];
} {
  const raw = new BetterSqlite3(file);
  let changes = 0;
  const db = {
    quirkModeDisabled: false,
    loadExtensionToggles: [] as boolean[],
    handler: null as BusyHandler | null,
    errcode: () => null,
    errmsg: (e: unknown) => String(e),
    isClosed: () => !raw.open,
    isDiscarded: () => false,
    close: () => void raw.close(),
    changes: () => changes,
    disableQuirkMode: () => {
      db.quirkModeDisabled = true;
    },
    busyHandler: (handler: BusyHandler | null) => {
      db.handler = handler;
    },
    loadExtensionInternal: (file: string) => void raw.loadExtension(file),
    enableLoadExtension: (onoff: boolean) => {
      db.loadExtensionToggles.push(onoff);
    },
    execBatch(sql: string, resultsAsHash: boolean): unknown[] {
      const stmt = raw.prepare(sql);
      if (!stmt.reader) {
        changes = stmt.run().changes;
        return [];
      }
      return (stmt.all() as Record<string, unknown>[]).map((row) => {
        const vals = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, v == null ? null : String(v)]),
        );
        return resultsAsHash ? vals : Object.values(vals);
      });
    },
    prepare(sql: string): [EngineStatement, string] {
      const [tail] = statementTail(sql);
      const remainder = sql.slice(tail);
      sql = sql.slice(0, tail);
      const stmt = raw.prepare(sql);
      const reader = stmt.reader;
      if (reader) stmt.raw(true);
      const positional: SqliteBindValue[] = [];
      const named: Record<string, SqliteBindValue> = {};
      let rows: Iterator<unknown[]> | null = null;
      let done = false;
      let closed = false;
      const engine: EngineStatement = {
        close: () => {
          rows?.return?.();
          closed = true;
        },
        isClosed: () => closed,
        bindParam(key, value) {
          if (typeof key === "number") {
            positional[key - 1] = value;
            return;
          }
          const name = key.replace(/^[:@$]/, "");
          if (![":", "@", "$"].some((prefix) => sql.includes(prefix + name))) {
            throw new SQLite3.Exception("no such bind parameter");
          }
          named[name] = value;
        },
        resetBang() {
          rows?.return?.();
          rows = null;
          done = false;
        },
        step() {
          if (done) return null;
          if (!reader) {
            changes = stmt.run(...positional, named).changes;
            done = true;
            return null;
          }
          rows ??= stmt.iterate(...positional, named) as Iterator<unknown[]>;
          const r = rows.next();
          if (r.done) {
            done = true;
            return null;
          }
          return r.value;
        },
        isDone: () => done,
        columnCount: () => (reader ? stmt.columns().length : 0),
        columnName: (index) => (reader ? (stmt.columns()[index]?.name ?? null) : null),
        columnDecltype: (index) => (reader ? (stmt.columns()[index]?.type ?? null) : null),
        bindParameterCount: () => bindParameterNames(stmt.source).length,
        setReadBigInts: (toggle) => void stmt.safeIntegers(toggle),
      };
      return [engine, remainder];
    },
  };
  return db;
}

export const engine = (...[file]: Parameters<EngineOpenV2>): SyncEngineDatabase =>
  engineDatabase(file);
