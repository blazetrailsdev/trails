import { bindValue } from "./bind-value.js";
import { LoadError, RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type {
  BusyHandler,
  EngineErrors,
  SyncEngineDatabase,
  SyncEngineOpenV2,
} from "../database.js";
import type { EngineStatement } from "../statement.js";
import type { SqliteBindValue } from "../driver.js";
import { closedStatement, statementTail } from "./statement-tail.js";
import { drive, withBusyHandler } from "./busy-handler.js";
import { bindParameterIndex, bindParameterNames } from "./bind-parameter-index.js";
import { columnText } from "./column-text.js";
import { databaseListFilename, libversionNumber } from "./aggregator.js";

/** @internal */
interface BunStatement {
  readonly columnNames: string[];
  readonly declaredTypes: (string | null)[];
  values(...args: unknown[]): unknown[][];
  run(...args: unknown[]): unknown;
  safeIntegers(toggle: boolean): BunStatement;
  finalize(): void;
}

/** @internal */
interface BunDatabase {
  prepare(sql: string): BunStatement;
  close(): void;
  serialize(): Uint8Array;
  loadExtension(file: string): void;
}

/** @internal */
interface BunSqliteModule {
  Database: {
    new (
      file: string,
      options: { readonly?: boolean; readwrite?: boolean; create?: boolean },
    ): BunDatabase;
    deserialize(image: Uint8Array, readonly?: boolean): BunDatabase;
  };
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling
 */
export let bunSqlite: BunSqliteModule | undefined;
try {
  bunSqlite = (await import("bun" + ":sqlite")) as BunSqliteModule;
} catch {}

function loadBunSqlite(): BunSqliteModule {
  if (!bunSqlite) throw new LoadError("bun:sqlite is not available. Bun 1.3+ is required.");
  return bunSqlite;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling
 */
export const errors: EngineErrors = {
  errcode(error) {
    const { errno } = (error ?? {}) as Record<string, unknown>;
    return typeof errno === "number" ? errno & 0xff : null;
  },
  errmsg(error) {
    return (error as { message: string }).message;
  },
};

/** @internal */
function open(file: string, mode: number): BunDatabase {
  const { Database } = loadBunSqlite();
  const { Open, ErrorCode } = SQLite3.Constants;
  if ((mode & Open.SHAREDCACHE) !== 0) {
    throw new RuntimeError("SQLITE_OPEN_SHAREDCACHE is not supported by the bun:sqlite driver");
  }
  if (((1 << (mode & 7)) & 0x46) === 0) {
    throw Object.assign(new Error("bad parameter or other API misuse"), {
      errno: ErrorCode.MISUSE,
    });
  }
  const readonly = (mode & Open.READONLY) !== 0;
  if (readonly && file === ":memory:") {
    const seed = new Database(":memory:", {});
    try {
      return Database.deserialize(seed.serialize(), true);
    } finally {
      seed.close();
    }
  }
  return readonly
    ? new Database(file, { readonly: true })
    : new Database(file, { readwrite: true, create: (mode & Open.CREATE) !== 0 });
}

/** @internal */
function prepareStatement(raw: BunDatabase, sql: string, finalize: () => void): EngineStatement {
  const stmt = raw.prepare(sql);
  const columns = stmt.columnNames;
  const reader = columns.length > 0;
  const names = bindParameterNames(sql);
  const positional: SqliteBindValue[] = [];
  const named: Record<string, SqliteBindValue> = {};
  let rows: unknown[][] | null = null;
  let cursor = 0;
  let done = false;
  let closed = false;
  const args = (): unknown[] => {
    const values = Array.from(positional, (v) => (v === undefined ? null : v));
    if (Object.keys(named).length === 0) return values;
    const params: Record<string, unknown> = {};
    for (const name of names) if (name !== null) params[name] = null;
    values.forEach((v, i) => {
      params[names[i] ?? `?${i + 1}`] = v;
    });
    for (const [name, v] of Object.entries(named)) {
      params[names.find((n) => n?.slice(1) === name) ?? `:${name}`] = v;
    }
    return [params];
  };
  return {
    close: () => {
      if (closed) return;
      rows = null;
      closed = true;
      stmt.finalize();
      finalize();
    },
    isClosed: () => closed,
    bindParam(key, value) {
      if (typeof key === "number") {
        positional[key - 1] = bindValue(value);
        return;
      }
      const name = key.replace(/^[:@$]/, "");
      if (bindParameterIndex(sql, name) === 0) {
        throw new SQLite3.Exception("no such bind parameter");
      }
      named[name] = bindValue(value);
    },
    resetBang() {
      rows = null;
      cursor = 0;
      done = false;
    },
    step() {
      if (done) return null;
      if (!reader) {
        stmt.run(...args());
        done = true;
        return null;
      }
      rows ??= stmt.values(...args());
      if (cursor >= rows.length) {
        done = true;
        return null;
      }
      return rows[cursor++];
    },
    isDone: () => done,
    bindParameterCount: () => names.length,
    columnCount: () => columns.length,
    columnName: (index) => columns[index] ?? null,
    columnDecltype: (index) => stmt.declaredTypes[index] ?? null,
    setReadBigInts: (toggle) => void stmt.safeIntegers(toggle),
  };
}

export const engine: SyncEngineOpenV2 = Object.assign((file: string, mode: number) => {
  const raw = open(file, mode);
  let handler: BusyHandler | null = null;
  let changesStmt: BunStatement | null = null;
  let zombie = false;
  let closed = false;
  let liveStatements = 0;
  const closeRaw = () => {
    changesStmt?.finalize();
    raw.close();
    closed = true;
  };
  const finalize = () => {
    liveStatements -= 1;
    if (zombie && liveStatements === 0) closeRaw();
  };
  const db: SyncEngineDatabase = {
    ...errors,
    isClosed: () => zombie || closed,
    isDiscarded: () => false,
    close: () => {
      if (liveStatements === 0) closeRaw();
      else zombie = true;
    },
    changes: () => {
      changesStmt ??= raw.prepare("SELECT changes()");
      return Number(changesStmt.values()[0][0]);
    },
    disableQuirkMode: () => {},
    loadExtensionInternal: (file) => raw.loadExtension(file),
    enableLoadExtension: () => {},
    libversion: () =>
      libversionNumber(raw.prepare("select sqlite_version()").values()[0][0] as string),
    dbFilename: (dbName) =>
      databaseListFilename(
        raw
          .prepare("PRAGMA database_list")
          .values()
          .map(([, name, file]) => ({ name: name as string, file: file as string })),
        dbName,
      ),
    busyHandler: (block) => {
      handler = block;
    },
    execBatch(sql, resultsAsHash) {
      return drive(
        (function* () {
          const results: unknown[] = [];
          let rest = sql.trim();
          while (rest !== "") {
            const [tail, empty] = statementTail(rest);
            const head = rest.slice(0, tail);
            rest = rest.slice(tail).trim();
            if (empty) continue;
            const stmt = (yield withBusyHandler(
              errors,
              () => handler,
              () => raw.prepare(head),
            )) as BunStatement;
            const names = stmt.columnNames;
            if (names.length === 0) {
              yield withBusyHandler(
                errors,
                () => handler,
                () => stmt.run(),
              );
              continue;
            }
            stmt.safeIntegers(true);
            for (const row of (yield withBusyHandler(
              errors,
              () => handler,
              () => stmt.values(),
            )) as unknown[][]) {
              const vals = row.map(columnText);
              results.push(
                resultsAsHash ? Object.fromEntries(names.map((name, i) => [name, vals[i]])) : vals,
              );
            }
          }
          return results;
        })(),
      );
    },
    prepare(sql) {
      const [tail, empty] = statementTail(sql);
      if (empty) return [closedStatement, sql.slice(tail)];
      const stmt = prepareStatement(raw, sql.slice(0, tail), finalize);
      liveStatements += 1;
      return [stmt, sql.slice(tail)];
    },
  };
  return db;
}, errors);
