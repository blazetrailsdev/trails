import { bindValue } from "./bind-value.js";
import { createRequire } from "node:module";
import type { AggregateOptions, DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";
import { LoadError } from "@blazetrails/ruby-compat";
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
import { aggregateOptions, databaseListFilename, libversionNumber } from "./aggregator.js";

/** @internal */
type NodeSqliteModule = typeof import("node:sqlite");

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling
 */
export let nodeSqlite: NodeSqliteModule | undefined;
try {
  nodeSqlite = createRequire(import.meta.url)("node:sqlite") as NodeSqliteModule;
} catch {}

function loadNodeSqlite(): NodeSqliteModule {
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
 * @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling
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

function sharedCacheDatabase(database: string, flags: number): string {
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
  const { Open, ErrorCode } = SQLite3.Constants;
  if (((1 << (mode & 7)) & 0x46) === 0) {
    throw Object.assign(new Error("bad parameter or other API misuse"), {
      errcode: ErrorCode.MISUSE,
    });
  }
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
    allowExtension: true,
  });
}

/** @internal */
interface SerializableDatabase {
  serialize(): Uint8Array;
  deserialize(image: Uint8Array): void;
}

/** @internal */
function prepareStatement(raw: DatabaseSync, sql: string, finalize: () => void): EngineStatement {
  const stmt: StatementSync = raw.prepare(sql);
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
      if (closed) return;
      rows?.return?.();
      closed = true;
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
      rows?.return?.();
      rows = null;
      done = false;
    },
    step() {
      if (done) return null;
      if (!reader) {
        stmt.run(...(args() as import("node:sqlite").SQLInputValue[]));
        done = true;
        return null;
      }
      const r =
        rows !== null
          ? rows.next()
          : (() => {
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
            })();
      if (r.done) {
        done = true;
        return null;
      }
      return r.value as unknown[];
    },
    isDone: () => done,
    bindParameterCount: () => bindParameterNames(sql).length,
    columnCount: () => columns.length,
    columnName: (index) => columns[index]?.name ?? null,
    columnDecltype: (index) => columns[index]?.type ?? null,
    setReadBigInts: (toggle) => stmt.setReadBigInts(toggle),
  };
}

export const engine: SyncEngineOpenV2 = Object.assign((file: string, mode: number) => {
  let raw = open(file, mode);
  let handler: BusyHandler | null = null;
  let changesStmt: StatementSync | null = null;
  let zombie = false;
  let liveStatements = 0;
  const finalize = () => {
    liveStatements -= 1;
    if (zombie && liveStatements === 0) raw.close();
  };
  const db: SyncEngineDatabase = {
    ...errors,
    isClosed: () => zombie || !raw.isOpen,
    isDiscarded: () => false,
    close: () => {
      if (liveStatements === 0) raw.close();
      else zombie = true;
    },
    changes: () => {
      if (changesStmt === null) {
        changesStmt = raw.prepare("SELECT changes()");
        changesStmt.setReturnArrays(true);
      }
      return Number((changesStmt.get() as unknown as [number])[0]);
    },
    disableQuirkMode: () => {
      const image =
        raw.location() === null ? (raw as unknown as SerializableDatabase).serialize() : null;
      raw.close();
      raw = open(file, mode, false);
      if (image !== null) (raw as unknown as SerializableDatabase).deserialize(image);
      changesStmt = null;
    },
    loadExtensionInternal: (file) => raw.loadExtension(file),
    enableLoadExtension: (onoff) => raw.enableLoadExtension(onoff),
    libversion: () =>
      libversionNumber(
        (raw.prepare("select sqlite_version() v").get() as unknown as { v: string }).v,
      ),
    dbFilename: (dbName) =>
      databaseListFilename(
        raw.prepare("PRAGMA database_list").all() as unknown as { name: string; file: string }[],
        dbName,
      ),
    defineFunctionWithFlags: (name, flags, block) =>
      raw.function(
        name,
        { varargs: true, deterministic: (flags & SQLite3.Constants.TextRep.DETERMINISTIC) !== 0 },
        (...args) => (block(...args) ?? null) as SQLInputValue,
      ),
    defineAggregator2: (aggregator, name) =>
      raw.aggregate(name, aggregateOptions(aggregator) as unknown as AggregateOptions),
    setAuthorizer: (callback) =>
      raw.setAuthorizer(callback === null ? null : (action, ...args) => callback(action, ...args)),

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
            )) as StatementSync;
            const names = stmt.columns().map((c) => c.name);
            if (names.length === 0) {
              yield withBusyHandler(
                errors,
                () => handler,
                () => stmt.run(),
              );
              continue;
            }
            stmt.setReadBigInts(true);
            stmt.setReturnArrays(true);
            for (const row of (yield withBusyHandler(
              errors,
              () => handler,
              () => stmt.all() as unknown as unknown[][],
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
