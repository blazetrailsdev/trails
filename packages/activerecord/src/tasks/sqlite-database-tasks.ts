/**
 * SQLiteDatabaseTasks — SQLite-specific database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::SQLiteDatabaseTasks.
 *
 * Unlike Rails (which shells out to the `sqlite3` CLI for structureDump /
 * structureLoad), trails runs structureDump/structureLoad through the
 * SQLite3Adapter so the same code works under sqlite-wasm + the
 * activesupport vfs adapter. The exported `runCmd` helper shells out via
 * `sqlite3` only for Rails API parity and is not invoked by the public
 * task methods above.
 */

import {
  getFs,
  getPath,
  getChildProcessAsync,
  type SpawnSyncResult,
} from "@blazetrails/activesupport";
import type { DatabaseAdapter } from "../adapter.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { Base } from "../base.js";
import { DatabaseTasks } from "./database-tasks.js";
import { NoDatabaseError, DatabaseAlreadyExists } from "../errors.js";

/**
 * True for SQLite in-memory database names per the SQLite URI spec
 * (https://www.sqlite.org/inmemorydb.html): `:memory:`, `file::memory:?...`,
 * and named in-memory URIs whose query string contains a real `mode=memory`
 * parameter (e.g. `file:memdb1?mode=memory&cache=shared`).
 *
 * Uses `URLSearchParams` rather than substring matching so paths that happen
 * to contain the text `mode=memory` are not misclassified. `SQLite3Adapter`
 * currently uses a broader substring check — aligning it is a follow-up.
 */
function isInMemoryDatabase(name: string): boolean {
  if (name === ":memory:") return true;
  if (!name.startsWith("file:")) return false;
  if (name.startsWith("file::memory:")) return true;
  const q = name.indexOf("?");
  if (q === -1) return false;
  return new URLSearchParams(name.slice(q + 1)).get("mode") === "memory";
}

export class SQLiteDatabaseTasks {
  private readonly dbConfig: DatabaseConfig;
  private readonly root: string;

  static usingDatabaseConfigurations(): boolean {
    return true;
  }

  constructor(dbConfig: DatabaseConfig, root: string = DatabaseTasks.root) {
    this.dbConfig = dbConfig;
    this.root = root;
  }

  async create(): Promise<void> {
    const fs = getFs();
    const path = getPath();
    const dbPath = this.resolveDbPath();
    const inMemory = isInMemoryDatabase(dbPath);
    if (!inMemory && fs.existsSync(dbPath)) {
      throw new DatabaseAlreadyExists(`Database '${dbPath}' already exists`);
    }
    if (!inMemory) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, "");
    }
  }

  async drop(): Promise<void> {
    const fs = getFs();
    const dbPath = this.resolveDbPath();
    if (isInMemoryDatabase(dbPath)) return;
    try {
      fs.unlinkSync(dbPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NoDatabaseError((error as Error).message);
      }
      throw error;
    }
    for (const suffix of ["-shm", "-wal"]) {
      try {
        fs.unlinkSync(dbPath + suffix);
      } catch {
        // ignore
      }
    }
  }

  async purge(): Promise<void> {
    await this.disconnect();
    try {
      await this.drop();
    } catch (error) {
      if (!(error instanceof NoDatabaseError)) throw error;
    }
    await this.create();
    await this.reconnect();
  }

  private async disconnect(): Promise<void> {
    try {
      const pool = Base.connectionPool();
      // Iterate existing pool connections and await their async close() before
      // pool.disconnect() fires disconnectBang() synchronously. disconnectBang()
      // does not await driver.close() for async SQLite drivers (#1269).
      for (const conn of pool.connections) {
        try {
          const c = conn as { close?: () => Promise<void> };
          if (typeof c.close === "function") await c.close();
        } catch {
          // best effort per connection
        }
      }
      pool.disconnect();
    } catch {
      // best effort
    }
  }

  private async reconnect(): Promise<void> {
    try {
      await this.establishConnection();
    } catch {
      // best effort
    }
  }

  charset(): string {
    return "UTF-8";
  }

  async structureDump(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    void extraFlags;
    const { adapter, owned } = await this.adapterForOperation();
    try {
      const { SchemaDumper } = await import("../connection-adapters/abstract/schema-dumper.js");
      const ignoreTables = SchemaDumper.ignoreTables;

      // Order so that dependencies resolve during structure_load: create
      // tables + views first, then their indexes and triggers (which both
      // reference those tables). Rails' equivalent orders by `type DESC`
      // because its CLI path runs through sqlite3's shell which resolves
      // forward-referenced triggers lazily; when re-executing as a script
      // through better-sqlite3's `db.exec` the statements are applied
      // strictly in order, so triggers-before-tables would fail.
      const typeOrder =
        "CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 " +
        "WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END";
      // Skip SQLite internals (sqlite_sequence, sqlite_stat*, etc.)
      // — their names are reserved, so re-emitting their CREATE
      // statements during structureLoad would fail. Rails' .schema CLI
      // path filters these implicitly; we replicate that here.
      let where = "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'";
      let binds: unknown[] = [];

      if (ignoreTables.length > 0) {
        const tablesRows = (await adapter.execute(
          "SELECT tbl_name FROM sqlite_master WHERE type IN ('table','view','index','trigger')",
        )) as Array<Record<string, unknown>>;
        const allTables = Array.from(
          new Set(tablesRows.map((r) => String(r.tbl_name ?? "")).filter(Boolean)),
        );
        const excluded = allTables.filter((name) =>
          ignoreTables.some((pat) => {
            if (pat instanceof RegExp) {
              // Reset lastIndex so global/sticky regex patterns don't
              // produce false negatives across repeated .test() calls.
              pat.lastIndex = 0;
              return pat.test(name);
            }
            return pat === name;
          }),
        );
        if (excluded.length > 0) {
          const placeholders = excluded.map(() => "?").join(", ");
          where += ` AND tbl_name NOT IN (${placeholders})`;
          binds = excluded;
        }
      }

      const query = `SELECT sql || ';' AS sql FROM sqlite_master ${where} ORDER BY ${typeOrder}, tbl_name, name`;
      const rows = (await adapter.execute(query, binds)) as Array<Record<string, unknown>>;
      const output = rows.map((r) => String(r.sql ?? "")).join("\n");
      getFs().writeFileSync(filename, output);
    } finally {
      if (owned) await this.closeAdapter(adapter);
    }
  }

  async structureLoad(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    void extraFlags;
    const sql = getFs().readFileSync(filename, "utf8");
    const { adapter, owned } = await this.adapterForOperation();
    try {
      // SQLite's `db.exec` runs an entire script in one shot, so it's safe
      // for dumps containing trigger bodies (CREATE TRIGGER ... BEGIN ...;
      // ...; END) where naive semicolon splitting would break.
      const exec = (adapter as unknown as { exec?: (sql: string) => Promise<void> | void }).exec;
      if (typeof exec === "function") {
        await exec.call(adapter, sql);
      } else {
        for (const statement of splitSqlStatements(sql)) {
          await adapter.executeMutation(statement);
        }
      }
    } finally {
      if (owned) await this.closeAdapter(adapter);
    }
  }

  /**
   * Truncate every user table in the database — used by
   * `DatabaseTasks.truncate_all` / `trails db seed:replant`. SQLite
   * doesn't support TRUNCATE TABLE, so we DELETE FROM each user table
   * instead (the Rails parallel is Arel::Truncate which falls back to
   * DELETE for sqlite adapters).
   *
   * Skips schema_migrations and ar_internal_metadata so migration
   * state and environment stamping survive.
   *
   * Wraps the per-table deletes in disableReferentialIntegrity so
   * foreign-key constraints don't block deletion of a parent table
   * while its children are still populated — matches the FK-safety
   * the PG/MySQL truncateAll implementations provide.
   */
  async truncateAll(): Promise<void> {
    const { adapter, owned } = await this.adapterForOperation();
    try {
      const rows = (await adapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' " +
          "AND name <> 'schema_migrations' AND name <> 'ar_internal_metadata'",
      )) as Array<{ name: string }>;
      const withFks = adapter as DatabaseAdapter & {
        disableReferentialIntegrity?: (fn: () => Promise<void>) => Promise<void>;
      };
      const run = async () => {
        for (const row of rows) {
          await adapter.executeMutation(`DELETE FROM "${row.name.replace(/"/g, '""')}"`);
        }
        // Match TRUNCATE/RESTART IDENTITY semantics by clearing the
        // AUTOINCREMENT counters for the truncated tables. Rails'
        // SQLite3Adapter#truncate_tables does the same thing.
        // sqlite_sequence only exists once any AUTOINCREMENT column has
        // been created — silently skip when it's absent.
        const hasSequence = (await adapter.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
        )) as Array<{ name: string }>;
        if (hasSequence.length > 0 && rows.length > 0) {
          const list = rows.map((r) => `'${r.name.replace(/'/g, "''")}'`).join(", ");
          await adapter.executeMutation(`DELETE FROM sqlite_sequence WHERE name IN (${list})`);
        }
      };
      if (typeof withFks.disableReferentialIntegrity === "function") {
        await withFks.disableReferentialIntegrity(run);
      } else {
        await run();
      }
    } finally {
      if (owned) await this.closeAdapter(adapter);
    }
  }

  private resolveDbPath(): string {
    const path = getPath();
    const database = this.dbConfig.database ?? ":memory:";
    // Per PathAdapter contract, a missing isAbsolute means the adapter
    // doesn't model relative/absolute distinctions (e.g. a VFS) — treat
    // every path as already absolute.
    if (isInMemoryDatabase(database)) return database;
    if (!path.isAbsolute || path.isAbsolute(database)) return database;
    return path.join(this.root, database);
  }

  private async connection(): Promise<DatabaseAdapter> {
    return Base.connectionPool().leaseConnection();
  }

  private async connectAdapter(): Promise<DatabaseAdapter> {
    const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
    return new SQLite3Adapter(this.resolveDbPath());
  }

  /**
   * For in-memory databases opening a fresh adapter creates an unrelated empty
   * DB, so we must reuse the pool-leased connection. For file-backed databases
   * a fresh per-call adapter is correct.
   *
   * `owned` tells callers whether to close the adapter: borrowed pool
   * connections must not be closed by the caller.
   */
  private async adapterForOperation(): Promise<{ adapter: DatabaseAdapter; owned: boolean }> {
    if (isInMemoryDatabase(this.resolveDbPath())) {
      return { adapter: await this.connection(), owned: false };
    }
    return { adapter: await this.connectAdapter(), owned: true };
  }

  private async closeAdapter(adapter: DatabaseAdapter): Promise<void> {
    const close = (adapter as { close?: () => Promise<void> }).close;
    if (typeof close === "function") await close.call(adapter);
  }

  /** @internal */
  private async establishConnection(config?: DatabaseConfig): Promise<void> {
    // Always go through resolveDbPath so relative paths are joined against
    // DatabaseTasks.root and missing database values default to ':memory:'.
    const tasks = config != null ? new SQLiteDatabaseTasks(config, this.root) : this;
    await Base.establishConnection({
      ...tasks.dbConfig.configuration,
      database: tasks.resolveDbPath(),
    } as { adapter?: string; [key: string]: unknown });
  }

  static register(): void {
    DatabaseTasks.registerTask(/sqlite/, {
      create: async (config) => new SQLiteDatabaseTasks(config).create(),
      drop: async (config) => new SQLiteDatabaseTasks(config).drop(),
      purge: async (config) => new SQLiteDatabaseTasks(config).purge(),
      charset: async (config) => new SQLiteDatabaseTasks(config).charset(),
      truncateAll: async (config) => new SQLiteDatabaseTasks(config).truncateAll(),
      structureDump: async (config, filename, flags) =>
        new SQLiteDatabaseTasks(config).structureDump(filename, flags),
      structureLoad: async (config, filename, flags) =>
        new SQLiteDatabaseTasks(config).structureLoad(filename, flags),
    });
  }
}

/**
 * Split a SQL script into individual statements on semicolon boundaries,
 * respecting string literals ('...' and "..."), line comments (-- ...) and
 * block comments (slash-star ... star-slash). Simple enough for
 * structure-load files (which are DDL the adapter itself produced) but not a
 * full SQL parser.
 */
function splitSqlStatements(sql: string): string[] {
  const result: string[] = [];
  let buf = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n - 1 && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      buf += ch;
      i++;
      while (i < n) {
        buf += sql[i];
        if (sql[i] === quote && sql[i + 1] !== quote) {
          i++;
          break;
        }
        if (sql[i] === quote && sql[i + 1] === quote) {
          buf += sql[i + 1];
          i += 2;
          continue;
        }
        i++;
      }
      continue;
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) result.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) result.push(tail);
  return result;
}

/** @internal */
export async function runCmd(cmd: string, args: string[], out: string): Promise<void> {
  const childProcess = await getChildProcessAsync();
  const result: SpawnSyncResult = childProcess.spawnSync(cmd, args, { encoding: "utf8" });
  if (result.error || result.status !== 0 || result.signal) {
    const details: string[] = [];
    if (result.error) details.push(`Error: ${result.error.message}`);
    if (result.status !== null && result.status !== 0)
      details.push(`Exit status: ${result.status}`);
    if (result.signal) details.push(`Signal: ${result.signal}`);
    if (result.stderr) details.push(`stderr:\n${String(result.stderr).trimEnd()}`);
    if (result.stdout) details.push(`stdout:\n${String(result.stdout).trimEnd()}`);
    throw new Error(runCmdError(cmd, args) + (details.length ? details.join("\n") + "\n" : ""));
  }
  getFs().writeFileSync(out, result.stdout ?? "");
}

/** @internal */
export function runCmdError(cmd: string, args: string[]): string {
  return (
    `failed to execute:\n${cmd} ${args.join(" ")}\n\n` +
    `Please check the output for any errors and make sure that \`${cmd}\` is installed in your PATH and has proper permissions.\n\n`
  );
}
