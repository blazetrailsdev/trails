import BetterSqlite3 from "better-sqlite3";
import { SQLite3 } from "../../lib/index.js";
import type { EngineDatabase, EngineStatement } from "../../lib/statement.js";
import type { SqliteBindValue } from "../../lib/driver.js";

export function engineDatabase(): EngineDatabase & { close(): void } {
  const raw = new BetterSqlite3(":memory:");
  return {
    isClosed: () => !raw.open,
    close: () => raw.close(),
    prepare(sql: string): [EngineStatement, string] {
      const stmt = raw.prepare(sql);
      const reader = stmt.reader;
      if (reader) stmt.raw(true);
      let positional: SqliteBindValue[] = [];
      let named: Record<string, SqliteBindValue> = {};
      let rows: Iterator<unknown[]> | null = null;
      let done = false;
      const engine: EngineStatement = {
        close: () => void rows?.return?.(),
        bindParam(key, value) {
          if (typeof key === "number") {
            positional[key - 1] = value;
            return;
          }
          const name = key.replace(/^[:@$]/, "");
          if (!new RegExp(`[:@$]${name}\\b`).test(sql)) {
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
            stmt.run(...positional, named);
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
        setReadBigInts: (toggle) => void stmt.safeIntegers(toggle),
      };
      positional = [];
      named = {};
      return [engine, ""];
    },
  };
}
