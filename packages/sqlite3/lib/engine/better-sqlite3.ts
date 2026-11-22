import BetterSqlite3 from "better-sqlite3";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineDatabase, EngineErrors, EngineOpenV2 } from "../database.js";
import type { EngineStatement } from "../statement.js";
import type { SqliteBindValue } from "../driver.js";
import { statementTail } from "./statement-tail.js";
import { withBusyHandler } from "./busy-handler.js";
import { bindParameterIndex } from "./bind-parameter-index.js";
import { columnText } from "./column-text.js";

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
  handler: () => BusyHandler | null,
  setChanges: (n: number) => void,
): EngineStatement {
  const stmt = withBusyHandler(errors, handler, () => raw.prepare(sql));
  const reader = stmt.reader;
  if (reader) stmt.raw(true);
  const positional: SqliteBindValue[] = [];
  const named: Record<string, SqliteBindValue> = {};
  let rows: Iterator<unknown[]> | null = null;
  let done = false;
  let closed = false;
  const bound = <T>(call: (args: unknown[]) => T): T => {
    const args: unknown[] = [];
    const params: Record<string, unknown> = { ...named };
    Array.from(positional, (v, i) => {
      if (bindParameterIndex(sql, String(i + 1)) !== 0) params[i + 1] = v ?? null;
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
      if (bindParameterIndex(sql, name) === 0) {
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
        setChanges(
          withBusyHandler(errors, handler, () => bound((args) => stmt.run(...args)).changes),
        );
        done = true;
        return null;
      }
      const r =
        rows !== null
          ? rows.next()
          : withBusyHandler(errors, handler, () => {
              const started = bound((args) => stmt.iterate(...args)) as Iterator<unknown[]>;
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
      return r.value;
    },
    isDone: () => done,
    columnCount: () => (reader ? stmt.columns().length : 0),
    columnName: (index) => (reader ? (stmt.columns()[index]?.name ?? null) : null),
    setReadBigInts: (toggle) => void stmt.safeIntegers(toggle),
  };
}

export const engine: EngineOpenV2 = Object.assign((file: string, mode: number) => {
  const raw = open(file, mode);
  let changes = 0;
  let handler: BusyHandler | null = null;
  const setChanges = (n: number) => {
    changes = n;
  };
  const db: EngineDatabase = {
    ...errors,
    isClosed: () => !raw.open,
    isDiscarded: () => false,
    close: () => void raw.close(),
    changes: () => changes,
    disableQuirkMode: () => {},
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
        if (!stmt.reader) {
          changes = withBusyHandler(
            errors,
            () => handler,
            () => stmt.run().changes,
          );
        } else {
          stmt.safeIntegers(true).raw(true);
          const names = stmt.columns().map((c) => c.name);
          for (const row of withBusyHandler(
            errors,
            () => handler,
            () => stmt.all() as unknown[][],
          )) {
            const vals = row.map(columnText);
            results.push(
              resultsAsHash ? Object.fromEntries(names.map((name, i) => [name, vals[i]])) : vals,
            );
          }
        }
      }
      return results;
    },
    prepare(sql) {
      const [tail] = statementTail(sql);
      return [
        prepareStatement(raw, sql.slice(0, tail), () => handler, setChanges),
        sql.slice(tail),
      ];
    },
  };
  return db;
}, errors);
