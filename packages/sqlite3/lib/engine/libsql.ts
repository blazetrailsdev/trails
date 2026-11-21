import Libsql from "libsql";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineDatabase, EngineErrors, EngineOpenV2 } from "../database.js";
import type { EngineStatement } from "../statement.js";
import type { SqliteBindValue } from "../driver.js";
import { statementTail } from "./statement-tail.js";
import { columnText } from "./column-text.js";

const CONNECTION_FAILED = /^ConnectionFailed\(".*: (\d+)"\)$/;

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export const errors: EngineErrors = {
  errcode(error) {
    const { rawCode, message } = (error ?? {}) as Record<string, unknown>;
    if (typeof rawCode === "number") return rawCode & 0xff;
    const failed = typeof message === "string" ? CONNECTION_FAILED.exec(message) : null;
    if (failed) return Number(failed[1]) & 0xff;
    return null;
  },
  errmsg(error) {
    const { message } = error as { message: string };
    if (CONNECTION_FAILED.test(message)) return "unable to open database file";
    return message;
  },
};

/** @noRailsEquivalent PERMANENT */
export interface ReplicaOptions extends Libsql.Options {
  authToken?: string;
  syncUrl?: string;
  syncPeriod?: number;
}

/** @noRailsEquivalent PERMANENT */
export interface ReplicaEngineDatabase extends EngineDatabase {
  /** @noRailsEquivalent PERMANENT */
  sync(): Promise<void>;
}

/** @internal */
function sharedCacheFile(file: string, mode: number): string {
  if ((mode & SQLite3.Constants.Open.SHAREDCACHE) === 0) return file;
  if (file.startsWith("file:")) {
    const hash = file.indexOf("#");
    const body = hash === -1 ? file : file.slice(0, hash);
    const fragment = hash === -1 ? "" : file.slice(hash);
    return `${body}${body.includes("?") ? "&" : "?"}cache=shared${fragment}`;
  }
  return `file:${file}?cache=shared`;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function checkReplicaOptions(options: ReplicaOptions): void {
  if (typeof options.syncUrl !== "string" || options.syncUrl.length === 0) {
    throw new RuntimeError(
      "libsql embedded-replica mode requires a non-empty `syncUrl` in " +
        "driverOptions (alongside the local replica path); none was provided.",
    );
  }
  const { syncPeriod } = options;
  if (syncPeriod !== undefined) {
    if (typeof syncPeriod !== "number" || !Number.isFinite(syncPeriod) || syncPeriod <= 0) {
      throw new RuntimeError(
        "libsql embedded-replica `syncPeriod` must be a positive number of " +
          `seconds (got ${String(syncPeriod)}); omit it for caller-driven sync.`,
      );
    }
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
  raw: Libsql.Database,
  sql: string,
  handler: () => BusyHandler | null,
  setChanges: (n: number) => void,
): EngineStatement {
  const stmt = withBusyHandler(handler, () => raw.prepare(sql));
  const reader = stmt.reader;
  if (reader) stmt.raw(true);
  const positional: SqliteBindValue[] = [];
  const named: Record<string, SqliteBindValue> = {};
  let rows: Iterator<unknown[]> | null = null;
  let done = false;
  let closed = false;
  const args = (): unknown[] => {
    const list: unknown[] = Array.from(positional, (v) => (v === undefined ? null : v));
    return Object.keys(named).length !== 0 ? [...list, named] : list;
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
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`[:@$]${escaped}(?![\\w$])`).test(sql)) {
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
      const r =
        rows !== null
          ? rows.next()
          : withBusyHandler(handler, () => {
              const started = stmt.iterate(...args()) as Iterator<unknown[]>;
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

/** @internal */
function database(raw: Libsql.Database): EngineDatabase {
  let changes = 0;
  let handler: BusyHandler | null = null;
  const busy = () => handler;
  const setChanges = (n: number) => {
    changes = n;
  };
  return {
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
        const stmt = withBusyHandler(busy, () => raw.prepare(head));
        if (!stmt.reader) {
          changes = withBusyHandler(busy, () => stmt.run().changes);
        } else {
          stmt.safeIntegers(true).raw(true);
          const names = stmt.columns().map((c) => c.name);
          for (const row of withBusyHandler(busy, () => stmt.all() as unknown[][])) {
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
      return [prepareStatement(raw, sql.slice(0, tail), busy, setChanges), sql.slice(tail)];
    },
  };
}

export const engine: EngineOpenV2 = Object.assign(
  (file: string, mode: number) =>
    database(
      new Libsql(sharedCacheFile(file, mode), {
        readonly: (mode & SQLite3.Constants.Open.READONLY) !== 0,
      }),
    ),
  errors,
);

/** @noRailsEquivalent PERMANENT */
export function remoteEngine(options: Libsql.Options & { authToken?: string } = {}): EngineOpenV2 {
  return Object.assign((url: string, mode: number) => {
    if ((mode & SQLite3.Constants.Open.SHAREDCACHE) !== 0) {
      throw new RuntimeError(
        "SQLITE_OPEN_SHAREDCACHE is not supported by the libsql-remote driver",
      );
    }
    return database(new Libsql(url, options));
  }, errors);
}

/** @noRailsEquivalent PERMANENT */
export function replicaEngine(options: ReplicaOptions): EngineOpenV2 {
  checkReplicaOptions(options);
  return Object.assign((file: string) => {
    const raw = new Libsql(file, options);
    const db: ReplicaEngineDatabase = {
      ...database(raw),
      sync: async () => {
        await raw.sync();
      },
    };
    return db;
  }, errors);
}
