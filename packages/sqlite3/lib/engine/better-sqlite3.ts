import { bindValue } from "./bind-value.js";
import BetterSqlite3 from "better-sqlite3";
import { RuntimeError } from "@blazetrails/ruby-compat";
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

const MISSING_DIRECTORY = "Cannot open database because the directory does not exist";

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export const errors: EngineErrors = {
  errcode(error) {
    const { code, message } = (error ?? {}) as Record<string, unknown>;
    if (typeof code === "string" && code.startsWith("SQLITE_")) {
      const { ErrorCode } = SQLite3.Constants;
      return ErrorCode[code.split("_")[1] as keyof typeof ErrorCode] ?? null;
    }
    if (error instanceof TypeError && message === MISSING_DIRECTORY) {
      return SQLite3.Constants.ErrorCode.CANTOPEN;
    }
    return null;
  },
  errmsg(error) {
    const { message } = error as { message: string };
    if (error instanceof TypeError && message === MISSING_DIRECTORY) {
      return "unable to open database file";
    }
    return message;
  },
};

/** @internal */
function open(file: string, mode: number): BetterSqlite3.Database {
  const { Open } = SQLite3.Constants;
  if ((mode & Open.SHAREDCACHE) !== 0) {
    throw new RuntimeError("SQLITE_OPEN_SHAREDCACHE is not supported by the better-sqlite3 driver");
  }
  if (((1 << (mode & 7)) & 0x46) === 0) {
    throw Object.assign(new Error("bad parameter or other API misuse"), {
      code: "SQLITE_MISUSE",
    });
  }
  const opts: BetterSqlite3.Options = {
    readonly: (mode & Open.READONLY) !== 0,
    fileMustExist: (mode & Open.CREATE) === 0,
    timeout: 0,
  };
  if (opts.readonly && file === ":memory:") {
    const seed = new BetterSqlite3(":memory:");
    try {
      return new BetterSqlite3(seed.serialize(), opts);
    } finally {
      seed.close();
    }
  }
  return new BetterSqlite3(file, opts);
}

/** @internal */
function prepareStatement(
  raw: BetterSqlite3.Database,
  sql: string,
  finalize: () => void,
): EngineStatement {
  const stmt = raw.prepare(sql);
  const reader = stmt.reader;
  if (reader) stmt.raw(true);
  const names = bindParameterNames(sql);
  const positional: SqliteBindValue[] = [];
  const named: Record<string, SqliteBindValue> = {};
  let rows: Iterator<unknown[]> | null = null;
  let done = false;
  let closed = false;
  const bound = <T>(call: (args: unknown[]) => T): T => {
    const args: unknown[] = [];
    const params: Record<string, unknown> = {};
    for (const name of names) if (name !== null) params[name.slice(1)] = null;
    Object.assign(params, named);
    Array.from(positional, (v, i) => {
      if (names[i] != null) params[names[i].slice(1)] = v ?? null;
      else if (bindParameterIndex(sql, `?${i + 1}`) !== 0) params[i + 1] = v ?? null;
      else args.push(v ?? null);
    });
    for (;;) {
      try {
        return call(Object.keys(params).length !== 0 ? [...args, params] : args);
      } catch (e) {
        const missing =
          e instanceof RangeError && /^Missing named parameter "(\d+)"/.exec(e.message);
        if (missing) params[missing[1]] = null;
        else if (e instanceof RangeError && e.message.startsWith("Too few parameter values")) {
          args.push(null);
        } else throw e;
      }
    }
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
        bound((args) => stmt.run(...args));
        done = true;
        return null;
      }
      const r =
        rows !== null
          ? rows.next()
          : (() => {
              const started = bound((args) => stmt.iterate(...args)) as Iterator<unknown[]>;
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
      return r.value;
    },
    isDone: () => done,
    bindParameterCount: () => bindParameterNames(sql).length,
    columnCount: () => (reader ? stmt.columns().length : 0),
    columnName: (index) => (reader ? (stmt.columns()[index]?.name ?? null) : null),
    columnDecltype: (index) => (reader ? (stmt.columns()[index]?.type ?? null) : null),
    setReadBigInts: (toggle) => void stmt.safeIntegers(toggle),
  };
}

export const engine: SyncEngineOpenV2 = Object.assign((file: string, mode: number) => {
  const raw = open(file, mode);
  let handler: BusyHandler | null = null;
  let zombie = false;
  let liveStatements = 0;
  const finalize = () => {
    liveStatements -= 1;
    if (zombie && liveStatements === 0) raw.close();
  };
  let changesStmt: ReturnType<typeof raw.prepare> | null = null;
  const db: SyncEngineDatabase = {
    ...errors,
    isClosed: () => zombie || !raw.open,
    isDiscarded: () => false,
    close: () => {
      if (liveStatements === 0) raw.close();
      else zombie = true;
    },
    changes: () =>
      ((changesStmt ??= raw.prepare("SELECT changes() AS v")).get() as { v: number }).v,
    disableQuirkMode: () => {},
    loadExtensionInternal: (file) => void raw.loadExtension(file),
    enableLoadExtension: () => {},
    libversion: () =>
      libversionNumber((raw.prepare("select sqlite_version() v").get() as { v: string }).v),
    dbFilename: (dbName) =>
      databaseListFilename(
        raw.prepare("PRAGMA database_list").all() as { name: string; file: string }[],
        dbName,
      ),
    defineFunctionWithFlags: (name, flags, block) =>
      void raw.function(
        name,
        { varargs: true, deterministic: (flags & SQLite3.Constants.TextRep.DETERMINISTIC) !== 0 },
        (...args: unknown[]) => block(...args) ?? null,
      ),
    defineAggregator2: (aggregator, name) => void raw.aggregate(name, aggregateOptions(aggregator)),

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
            )) as BetterSqlite3.Statement;
            if (!stmt.reader) {
              yield withBusyHandler(
                errors,
                () => handler,
                () => stmt.run(),
              );
            } else {
              stmt.safeIntegers(true).raw(true);
              const names = stmt.columns().map((c) => c.name);
              for (const row of (yield withBusyHandler(
                errors,
                () => handler,
                () => stmt.all() as unknown[][],
              )) as unknown[][]) {
                const vals = row.map(columnText);
                results.push(
                  resultsAsHash
                    ? Object.fromEntries(names.map((name, i) => [name, vals[i]]))
                    : vals,
                );
              }
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
