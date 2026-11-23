import { LoadError, RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineDatabase, EngineErrors, EngineOpenV2 } from "../database.js";
import type { EngineStatement } from "../statement.js";
import type { SqliteBindValue } from "../driver.js";
import { closedStatement, statementTail } from "./statement-tail.js";
import { bindParameterNames } from "./bind-parameter-index.js";
import { columnText } from "./column-text.js";

/** @internal */
interface ExpoResult extends AsyncIterable<unknown[]> {
  changes: number;
}
/** @internal */
interface ExpoStatement {
  executeForRawResultAsync(params: unknown[] | Record<string, unknown>): Promise<ExpoResult>;
  getColumnNamesAsync(): Promise<string[]>;
  finalizeAsync(): Promise<void>;
}
/** @internal */
interface ExpoDatabase {
  prepareAsync(sql: string): Promise<ExpoStatement>;
  closeAsync(): Promise<void>;
}
/** @internal */
interface ExpoModule {
  openDatabaseAsync(name: string, options?: Record<string, unknown>): Promise<ExpoDatabase>;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export const errors: EngineErrors = {
  errcode(error) {
    const { code, message } = (error ?? {}) as Record<string, unknown>;
    if (code !== "ERR_INTERNAL_SQLITE_ERROR") return null;
    const errorCode = /Error code (\d+|[^]): /.exec(String(message))?.[1];
    if (errorCode == null) return null;
    return /^\d+$/.test(errorCode) ? Number(errorCode) : errorCode.charCodeAt(0);
  },
  errmsg(error) {
    const { code, message } = error as { code?: unknown; message: string };
    if (code === "ERR_INTERNAL_SQLITE_ERROR") {
      return message.replace(/^[^]*?Error code (?:\d+|[^]): /, "");
    }
    return message;
  },
};

/** @internal */
async function open(file: string): Promise<ExpoDatabase> {
  let expoSqlite: ExpoModule;
  try {
    const specifier = "expo-sqlite";
    expoSqlite = (await import(specifier)) as ExpoModule;
  } catch {
    throw new LoadError(
      "expo-sqlite is not available. This driver requires an Expo / React Native runtime.",
    );
  }
  return expoSqlite.openDatabaseAsync(file);
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
async function withBusyHandler<T>(
  handler: () => BusyHandler | null,
  attempt: () => Promise<T>,
): Promise<T> {
  let count = 0;
  for (;;) {
    try {
      return await attempt();
    } catch (e) {
      const busy = handler();
      if (busy == null || errors.errcode(e) !== SQLite3.Constants.ErrorCode.BUSY) throw e;
      if ((await busy(count++)) === false) throw e;
    }
  }
}

/** @internal */
function prepareStatement(
  opening: () => Promise<ExpoDatabase>,
  prepared: Promise<ExpoStatement> | null,
  sql: string,
  handler: () => BusyHandler | null,
  setChanges: (n: number) => void,
  finalize: () => Promise<void>,
): EngineStatement {
  const positional: SqliteBindValue[] = [];
  const named: Record<string, SqliteBindValue> = {};
  let names: string[] | null = null;
  let rows: AsyncIterator<unknown[]> | null = null;
  let done = false;
  let closed = false;
  let readBigInts = false;
  let typed: Promise<ExpoStatement | null> | null = null;
  let wide = false;

  const stmt = (): Promise<ExpoStatement> =>
    (prepared ??= opening().then((db) => db.prepareAsync(sql)));
  const metadata = async (): Promise<string[]> =>
    (names ??= await (await stmt()).getColumnNamesAsync());
  const intText = async (cols: string[]): Promise<ExpoStatement | null> => {
    try {
      return await (
        await opening()
      ).prepareAsync(
        `WITH t(${cols.join(", ")}) AS (${sql.replace(/;\s*$/, "")}\n) SELECT ${cols.join(", ")}, ` +
          cols
            .map((c) => `CASE typeof(${c}) WHEN 'integer' THEN CAST(${c} AS TEXT) END`)
            .join(", ") +
          " FROM t",
      );
    } catch {
      return null;
    }
  };
  const params = (): unknown[] | Record<string, unknown> =>
    Object.keys(named).length !== 0 ? named : positional.map((v) => (v === undefined ? null : v));

  return {
    async close() {
      if (closed) return;
      closed = true;
      await rows?.return?.();
      await (await typed)?.finalizeAsync();
      if (prepared) await (await prepared).finalizeAsync();
      await finalize();
    },
    isClosed: () => closed,
    bindParam(key, value) {
      if (typeof key === "number") positional[key - 1] = value;
      else named[/^[$:@]/.test(key) ? key : `$${key}`] = value;
    },
    async resetBang() {
      await rows?.return?.();
      rows = null;
      done = false;
    },
    async step() {
      if (done) return null;
      if (rows === null) {
        const cols = (await metadata()).map((_, i) => `c${i}`);
        const wider = readBigInts && cols.length !== 0 ? await (typed ??= intText(cols)) : null;
        wide = wider !== null;
        const st = wider ?? (await stmt());
        const result = await withBusyHandler(handler, () => st.executeForRawResultAsync(params()));
        setChanges(result.changes);
        if (cols.length === 0) {
          done = true;
          return null;
        }
        rows = result[Symbol.asyncIterator]();
      }
      const r = await rows.next();
      if (r.done) {
        done = true;
        return null;
      }
      const n = names!.length;
      if (!wide) return r.value;
      return r.value
        .slice(0, n)
        .map((v, i) => (r.value[n + i] != null ? BigInt(r.value[n + i] as string) : v));
    },
    isDone: () => done,
    bindParameterCount: () => bindParameterNames(sql).length,
    columnCount: () => (names !== null ? names.length : metadata().then((n) => n.length)),
    columnName: (index) =>
      names !== null ? (names[index] ?? null) : metadata().then((n) => n[index] ?? null),
    columnDecltype: () => null,
    setReadBigInts: (toggle) => {
      readBigInts = toggle;
    },
  };
}

export const engine: EngineOpenV2 = Object.assign((file: string, mode: number) => {
  if ((mode & SQLite3.Constants.Open.SHAREDCACHE) !== 0) {
    throw new RuntimeError("SQLITE_OPEN_SHAREDCACHE is not supported by the expo-sqlite driver");
  }
  let raw: Promise<ExpoDatabase> | null = null;
  let closed = false;
  let changes = 0;
  let handler: BusyHandler | null = null;
  const opening = () => (raw ??= open(file));
  const setChanges = (n: number) => {
    changes = n;
  };
  let liveStatements = 0;
  const finalize = async () => {
    liveStatements -= 1;
    if (closed && liveStatements === 0 && raw) await (await raw).closeAsync();
  };
  const db: EngineDatabase = {
    ...errors,
    isClosed: () => closed,
    isDiscarded: () => false,
    async close() {
      closed = true;
      if (liveStatements === 0 && raw) await (await raw).closeAsync();
    },
    changes: () => changes,
    disableQuirkMode: () => {},
    loadExtensionInternal: () => {
      throw new RuntimeError("load_extension is not supported by the expo-sqlite driver");
    },
    enableLoadExtension: () => {},
    busyHandler: (block) => {
      handler = block;
    },
    async execBatch(sql, resultsAsHash) {
      const results: unknown[] = [];
      let rest = sql.trim();
      while (rest !== "") {
        const [tail, empty] = statementTail(rest);
        const head = rest.slice(0, tail);
        rest = rest.slice(tail).trim();
        if (empty) continue;
        const raw = await opening();
        const st = await withBusyHandler(
          () => handler,
          () => raw.prepareAsync(head),
        );
        let typed: ExpoStatement | null = null;
        try {
          const names = await st.getColumnNamesAsync();
          if (names.length !== 0) {
            const cols = names.map((_, i) => `c${i}`);
            typed = await raw
              .prepareAsync(
                `WITH t(${cols.join(", ")}) AS (${head.replace(/;\s*$/, "")}\n) ` +
                  `SELECT ${cols.join(", ")}, ${cols.map((c) => `typeof(${c})`).join(", ")} FROM t`,
              )
              .catch(() => null);
          }
          const result = await withBusyHandler(
            () => handler,
            () => (typed ?? st).executeForRawResultAsync([]),
          );
          setChanges(result.changes);
          if (names.length === 0) continue;
          for await (const row of result) {
            const vals = names.map((_, i) => {
              const v = row[i];
              if (v == null) return null;
              return typeof v === "number" && row[names.length + i] === "real"
                ? columnText(v)
                : String(v);
            });
            results.push(
              resultsAsHash ? Object.fromEntries(names.map((name, i) => [name, vals[i]])) : vals,
            );
          }
        } finally {
          await typed?.finalizeAsync();
          await st.finalizeAsync();
        }
      }
      return results;
    },
    async prepare(sql) {
      const [tail, empty] = statementTail(sql);
      const head = sql.slice(0, tail);
      if (empty) return [closedStatement, sql.slice(tail)];
      const raw = await opening();
      const prepared = await withBusyHandler(
        () => handler,
        () => raw.prepareAsync(head),
      );
      liveStatements += 1;
      return [
        prepareStatement(
          opening,
          Promise.resolve(prepared),
          head,
          () => handler,
          setChanges,
          finalize,
        ),
        sql.slice(tail),
      ];
    },
  };
  return db;
}, errors);
