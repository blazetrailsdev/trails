import BetterSqlite3 from "better-sqlite3";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineDatabase, EngineErrors, EngineOpenV2 } from "../database.js";
import type { EngineStatement } from "../statement.js";
import type { SqliteBindValue } from "../driver.js";
import { statementTail } from "./statement-tail.js";

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
  try {
    if (opts.readonly && file === ":memory:") {
      return new BetterSqlite3(new BetterSqlite3(":memory:").serialize(), opts);
    }
    return new BetterSqlite3(file, opts);
  } catch (e) {
    const errcode = errors.errcode(e);
    if (errcode == null) throw e;
    throw Object.assign(new Error(errors.errmsg(e)), { errcode, cause: e });
  }
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
function withBusyHandler<T>(handler: () => BusyHandler | null, attempt: () => T): T {
  let count = 0;
  for (;;) {
    try {
      return attempt();
    } catch (e) {
      const busy = handler();
      if (busy == null || errors.errcode(e) !== SQLite3.Constants.ErrorCode.BUSY) throw e;
      if (busy(count++) === false) throw e;
    }
  }
}

/** @internal */
function prepareStatement(
  raw: BetterSqlite3.Database,
  sql: string,
  handler: () => BusyHandler | null,
  setChanges: (n: number) => void,
): EngineStatement {
  const stmt = withBusyHandler(handler, () => raw.prepare(sql));
  const reader = stmt.reader;
  if (reader) stmt.raw(true);
  const positional: SqliteBindValue[] = [];
  const named: Record<string, SqliteBindValue> = {};
  const placeholders = stmt.source.split("?").length - 1;
  let rows: Iterator<unknown[]> | null = null;
  let done = false;
  let closed = false;
  const args = (): unknown[] =>
    Object.keys(named).length !== 0
      ? [...positional, named]
      : Array.from({ length: Math.max(placeholders, positional.length) }, (_, i) =>
          positional[i] === undefined ? null : positional[i],
        );
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
        setChanges(withBusyHandler(handler, () => stmt.run(...args()).changes));
        done = true;
        return null;
      }
      const r = withBusyHandler(handler, () => {
        try {
          rows ??= stmt.iterate(...args()) as Iterator<unknown[]>;
          return rows.next();
        } catch (e) {
          rows = null;
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

export const engine: EngineOpenV2 = (file, mode) => {
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
        const [tail] = statementTail(rest);
        const head = rest.slice(0, tail);
        rest = rest.slice(tail).trim();
        const stmt = withBusyHandler(
          () => handler,
          () => raw.prepare(head),
        );
        if (!stmt.reader) {
          changes = withBusyHandler(
            () => handler,
            () => stmt.run().changes,
          );
        } else {
          for (const row of withBusyHandler(
            () => handler,
            () => stmt.all() as Record<string, unknown>[],
          )) {
            const vals = Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k, v == null ? null : String(v)]),
            );
            results.push(resultsAsHash ? vals : Object.values(vals));
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
};
