import { bindValue } from "./bind-value.js";
import Database from "libsql";
import { File, RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineDatabase, EngineErrors, EngineOpenV2 } from "../database.js";
import type { EngineStatement } from "../statement.js";
import type { SqliteBindValue } from "../driver.js";
import { closedStatement, statementTail } from "./statement-tail.js";
import { drive, withBusyHandler } from "./busy-handler.js";
import { bindParameterIndex, bindParameterNames } from "./bind-parameter-index.js";
import { columnText } from "./column-text.js";
import { databaseListFilename, libversionNumber } from "./aggregator.js";

const CONNECTION_FAILED = /^ConnectionFailed\(".*: (\d+)"\)$/;

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling
 */
export const errors: EngineErrors = {
  errcode(error) {
    const { rawCode, message } = (error ?? {}) as Record<string, unknown>;
    if (typeof rawCode === "number") return rawCode & 0xff;
    const failed = typeof message === "string" ? CONNECTION_FAILED.exec(message) : null;
    return failed ? Number(failed[1]) & 0xff : null;
  },
  errmsg(error) {
    const { message } = error as { message: string };
    return CONNECTION_FAILED.test(message) ? "unable to open database file" : message;
  },
};

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling
 */
export interface LibsqlReplicaOptions extends Database.Options {
  authToken?: string;
  syncPeriod?: number;
}

/** @internal */
function open(file: string, mode: number, options: LibsqlReplicaOptions): Database.Database {
  const { Open, ErrorCode } = SQLite3.Constants;
  if (((1 << (mode & 7)) & 0x46) === 0) {
    throw Object.assign(new Error("bad parameter or other API misuse"), {
      rawCode: ErrorCode.MISUSE,
    });
  }
  if (
    (mode & Open.CREATE) === 0 &&
    file !== "" &&
    file !== ":memory:" &&
    !file.startsWith("file:") &&
    !File.isExist(file)
  ) {
    throw Object.assign(new Error("unable to open database file"), {
      rawCode: ErrorCode.CANTOPEN,
    });
  }
  const raw = new Database(file, { ...options, timeout: 0 });
  if ((mode & Open.READONLY) !== 0) raw.pragma("query_only = ON");
  return raw;
}

/** @internal */
function openRemote(file: string, mode: number, options: LibsqlReplicaOptions): Database.Database {
  if ((mode & SQLite3.Constants.Open.SHAREDCACHE) !== 0) {
    throw new RuntimeError("SQLITE_OPEN_SHAREDCACHE is not supported by the libsql-remote driver");
  }
  return new Database(file, options);
}

/** @internal */
function prepareStatement(
  raw: Database.Database,
  sql: string,
  finalize: () => void,
): EngineStatement {
  const stmt = raw.prepare(sql);
  const reader = stmt.reader;
  if (reader) stmt.raw(true);
  const positional: SqliteBindValue[] = [];
  const named: Record<string, SqliteBindValue> = {};
  let rows: Iterator<unknown[]> | null = null;
  let done = false;
  let closed = false;
  const names = bindParameterNames(sql);
  const args = (): unknown[] => {
    const values: unknown[] = Array.from(
      { length: Math.max(names.length, positional.length) },
      (_, i) => positional[i] ?? null,
    );
    for (const [name, v] of Object.entries(named)) {
      values[names.findIndex((n) => n !== null && n.slice(1) === name)] = v ?? null;
    }
    return values;
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
        stmt.run(...args());
        done = true;
        return null;
      }
      const r =
        rows !== null
          ? rows.next()
          : (() => {
              const started = stmt.iterate(...args()) as Iterator<unknown[]>;
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

/** @internal */
function openEngine(
  options: LibsqlReplicaOptions,
  replica: boolean,
  opener: typeof open = open,
): EngineOpenV2 {
  return Object.assign((file: string, mode: number) => {
    const raw = opener(file, mode, options);
    let handler: BusyHandler | null = null;
    let zombie = false;
    let liveStatements = 0;
    const finalize = () => {
      liveStatements -= 1;
      if (zombie && liveStatements === 0) raw.close();
    };
    let changesStmt: ReturnType<typeof raw.prepare> | null = null;
    const db: EngineDatabase = {
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
              )) as Database.Statement;
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
    if (!replica) return db;
    return Object.assign(db, { sync: async () => void (await raw.sync()) });
  }, errors);
}

export const engine: EngineOpenV2 = openEngine({}, false);

/** @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling */
export function replicaEngine(
  options: LibsqlReplicaOptions,
): (...args: Parameters<EngineOpenV2>) => EngineDatabase & { sync(): Promise<void> } {
  return openEngine(options, true) as ReturnType<typeof replicaEngine>;
}

/** @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling */
export function remoteEngine(options: Pick<LibsqlReplicaOptions, "authToken">): EngineOpenV2 {
  return openEngine(options, false, openRemote);
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-engine-module-surface-ruling
 */
export function buildReplicaOptions(
  options: Record<string, unknown> | undefined,
): LibsqlReplicaOptions {
  const opts = { ...options } as LibsqlReplicaOptions;
  if (typeof opts.syncUrl !== "string" || opts.syncUrl.length === 0) {
    throw new RuntimeError(
      "libsql embedded-replica mode requires a non-empty `syncUrl` in " +
        "driverOptions (alongside the local replica path); none was provided.",
    );
  }
  if (opts.syncPeriod !== undefined) {
    if (
      typeof opts.syncPeriod !== "number" ||
      !Number.isFinite(opts.syncPeriod) ||
      opts.syncPeriod <= 0
    ) {
      throw new RuntimeError(
        "libsql embedded-replica `syncPeriod` must be a positive number of " +
          `seconds (got ${String(opts.syncPeriod)}); omit it for caller-driven sync.`,
      );
    }
  }
  return opts;
}
