import { createRequire } from "node:module";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { LoadError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineDatabase, EngineErrors, EngineOpenV2 } from "../database.js";
import type { EngineStatement } from "../statement.js";
import type { SqliteBindValue } from "../driver.js";
import { statementTail } from "./statement-tail.js";
import { withBusyHandler } from "./busy-handler.js";
import { bindParameterIndex } from "./bind-parameter-index.js";
import { columnText } from "./column-text.js";

/** @internal */
type NodeSqliteModule = typeof import("node:sqlite");

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export let nodeSqlite: NodeSqliteModule | undefined;
try {
  nodeSqlite = createRequire(import.meta.url)("node:sqlite") as NodeSqliteModule;
} catch {}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export function loadNodeSqlite(): NodeSqliteModule {
  if (!nodeSqlite) {
    throw new LoadError(
      "node:sqlite is not available. Node 22.5+ is required. " +
        "On Node 22.5–22.9 you may also need --experimental-sqlite.",
    );
  }
  return nodeSqlite;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export const errors: EngineErrors = {
  errcode(error) {
    const { errcode } = (error ?? {}) as Record<string, unknown>;
    return typeof errcode === "number" ? errcode & 0xff : null;
  },
  errmsg(error) {
    return (error as { message: string }).message;
  },
};

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export function sharedCacheDatabase(database: string, flags: number): string {
  if ((flags & SQLite3.Constants.Open.SHAREDCACHE) === 0) return database;
  if (database.startsWith("file:")) {
    const hash = database.indexOf("#");
    const body = hash === -1 ? database : database.slice(0, hash);
    const fragment = hash === -1 ? "" : database.slice(hash);
    return `${body}${body.includes("?") ? "&" : "?"}cache=shared${fragment}`;
  }
  return `file:${database}?cache=shared`;
}

/** @internal */
function open(file: string, mode: number, quirks = true): DatabaseSync {
  const { DatabaseSync } = loadNodeSqlite();
  const { Open } = SQLite3.Constants;
  let database = sharedCacheDatabase(file, mode);
  if ((mode & (Open.READWRITE | Open.CREATE)) === Open.READWRITE) {
    if (!database.startsWith("file:")) {
      database = `file:${database.replace(/[%?#]/g, (c) => encodeURIComponent(c))}`;
    }
    const hash = database.indexOf("#");
    const body = hash === -1 ? database : database.slice(0, hash);
    database = `${body}${body.includes("?") ? "&" : "?"}mode=rw${hash === -1 ? "" : database.slice(hash)}`;
  }
  return new DatabaseSync(database, {
    readOnly: (mode & Open.READONLY) !== 0,
    enableForeignKeyConstraints: false,
    enableDoubleQuotedStringLiterals: quirks,
    timeout: 0,
  });
}

/** @internal */
function bindValue(value: SqliteBindValue): SqliteBindValue {
  if ((value as unknown) instanceof Number) return (value as unknown as number).valueOf();
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  return value === undefined ? null : value;
}

/** @internal */
function prepareStatement(
  raw: DatabaseSync,
  sql: string,
  handler: () => BusyHandler | null,
): EngineStatement {
  const stmt: StatementSync = withBusyHandler(errors, handler, () => raw.prepare(sql));
  stmt.setAllowBareNamedParameters(true);
  const columns = stmt.columns();
  const reader = columns.length > 0;
  if (reader) stmt.setReturnArrays(true);
  const positional: SqliteBindValue[] = [];
  const named: Record<string, SqliteBindValue> = {};
  let rows: Iterator<unknown> | null = null;
  let done = false;
  let closed = false;
  const args = (): unknown[] => {
    const values: unknown[] = Array.from(positional, (v) => (v === undefined ? null : v));
    return Object.keys(named).length !== 0 ? [named, ...values] : values;
  };
  return {
    close: () => {
      rows?.return?.();
      closed = true;
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
      rows?.return?.();
      rows = null;
      done = false;
    },
    step() {
      if (done) return null;
      if (!reader) {
        withBusyHandler(errors, handler, () =>
          stmt.run(...(args() as import("node:sqlite").SQLInputValue[])),
        );
        done = true;
        return null;
      }
      const r =
        rows !== null
          ? rows.next()
          : withBusyHandler(errors, handler, () => {
              const started = stmt.iterate(
                ...(args() as import("node:sqlite").SQLInputValue[]),
              ) as Iterator<unknown>;
              try {
                const first = started.next();
                rows = started;
                return first;
              } catch (e) {
                started.return?.();
                throw e;
              }
            });
      if (r.done) {
        done = true;
        return null;
      }
      return r.value as unknown[];
    },
    isDone: () => done,
    columnCount: () => columns.length,
    columnName: (index) => columns[index]?.name ?? null,
    setReadBigInts: (toggle) => stmt.setReadBigInts(toggle),
  };
}

export const engine: EngineOpenV2 = Object.assign((file: string, mode: number) => {
  let raw = open(file, mode);
  let handler: BusyHandler | null = null;
  let changesStmt: StatementSync | null = null;
  const db: EngineDatabase = {
    ...errors,
    isClosed: () => !raw.isOpen,
    isDiscarded: () => false,
    close: () => raw.close(),
    changes: () => {
      if (changesStmt === null) {
        changesStmt = raw.prepare("SELECT changes()");
        changesStmt.setReturnArrays(true);
      }
      return Number((changesStmt.get() as unknown as [number])[0]);
    },
    disableQuirkMode: () => {
      raw.close();
      raw = open(file, mode, false);
      changesStmt = null;
    },
    busyHandler: (block) => {
      handler = block;
    },
    execBatch(sql, resultsAsHash) {
      const results: unknown[] = [];
      let rest = sql.trim();
      while (rest !== "") {
        const [tail, empty] = statementTail(rest);
        const head = rest.slice(0, tail);
        rest = rest.slice(tail).trim();
        if (empty) continue;
        const stmt = withBusyHandler(
          errors,
          () => handler,
          () => raw.prepare(head),
        );
        const names = stmt.columns().map((c) => c.name);
        if (names.length === 0) {
          withBusyHandler(
            errors,
            () => handler,
            () => stmt.run(),
          );
          continue;
        }
        stmt.setReadBigInts(true);
        stmt.setReturnArrays(true);
        for (const row of withBusyHandler(
          errors,
          () => handler,
          () => stmt.all() as unknown as unknown[][],
        )) {
          const vals = row.map(columnText);
          results.push(
            resultsAsHash ? Object.fromEntries(names.map((name, i) => [name, vals[i]])) : vals,
          );
        }
      }
      return results;
    },
    prepare(sql) {
      const [tail] = statementTail(sql);
      return [prepareStatement(raw, sql.slice(0, tail), () => handler), sql.slice(tail)];
    },
  };
  return db;
}, errors);
