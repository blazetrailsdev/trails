/**
 * SQLiteDatabaseTasks — SQLite-specific database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::SQLiteDatabaseTasks.
 *
 * Unlike Rails (which shells out to the `sqlite3` CLI for structureDump /
 * structureLoad), trails runs these operations through the SQLite3Adapter so
 * the same code works under sqlite-wasm + the activesupport vfs adapter — no
 * subprocess required.
 */

import { getFs, getPath } from "@blazetrails/activesupport";
import type { DatabaseAdapter } from "../adapter.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { DatabaseTasks } from "./database-tasks.js";
import { NoDatabaseError, DatabaseAlreadyExists } from "../errors.js";

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
    if (dbPath !== ":memory:" && fs.existsSync(dbPath)) {
      throw new DatabaseAlreadyExists(`Database '${dbPath}' already exists`);
    }
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, "");
    }
  }

  async drop(): Promise<void> {
    const fs = getFs();
    const dbPath = this.resolveDbPath();
    if (dbPath === ":memory:") return;
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
      const { Base } = await import("../base.js");
      const existing = (Base as unknown as { adapter?: { close?: () => Promise<void> } }).adapter;
      if (existing && typeof existing.close === "function") await existing.close();
    } catch {
      // best effort
    }
  }

  private async reconnect(): Promise<void> {
    try {
      const { Base } = await import("../base.js");
      await Base.establishConnection({ adapter: "sqlite3", database: this.resolveDbPath() });
    } catch {
      // best effort
    }
  }

  charset(): string {
    return "UTF-8";
  }

  async structureDump(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    void extraFlags;
    // Reuse the migration adapter when one is registered. Two reasons:
    //   1. ":memory:" sqlite DBs are not shared across connections — a
    //      fresh adapter sees an empty DB, dumps nothing, and any later
    //      _appendSchemaInformation call (which runs against the
    //      migration adapter) writes INSERTs into a structureless dump
    //      that fails to load.
    //   2. Even for file-backed sqlite, reusing the active connection
    //      keeps WAL + transaction state consistent with what the
    //      caller has already written, matching Rails where structure
    //      dumping uses the established pool's connection.
    const { adapter, owned } = await this.adapterForRead();
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

  /**
   * Use DatabaseTasks.migrationConnection() if it points to a SQLite
   * adapter, falling back to a fresh per-call adapter otherwise.
   * `owned` tells the caller whether to close the returned adapter:
   * borrowed connections must be left alone, freshly-opened ones must
   * be closed.
   */
  private async adapterForRead(): Promise<{ adapter: DatabaseAdapter; owned: boolean }> {
    const { DatabaseTasks } = await import("./database-tasks.js");
    const migration = DatabaseTasks.migrationConnection();
    if (
      migration &&
      (migration as { adapterName?: string }).adapterName?.toLowerCase().includes("sqlite")
    ) {
      return { adapter: migration, owned: false };
    }
    return { adapter: await this.connectAdapter(), owned: true };
  }

  async structureLoad(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    void extraFlags;
    const sql = getFs().readFileSync(filename, "utf8");
    const adapter = await this.connectAdapter();
    try {
      // SQLite's `db.exec` runs an entire script in one shot, so it's safe
      // for dumps containing trigger bodies (CREATE TRIGGER ... BEGIN ...;
      // ...; END) where naive semicolon splitting would break.
      const exec = (adapter as unknown as { exec?: (sql: string) => void }).exec;
      if (typeof exec === "function") {
        exec.call(adapter, sql);
      } else {
        for (const statement of splitSqlStatements(sql)) {
          await adapter.executeMutation(statement);
        }
      }
    } finally {
      await this.closeAdapter(adapter);
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
    const adapter = await this.connectAdapter();
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
      await this.closeAdapter(adapter);
    }
  }

  private resolveDbPath(): string {
    const path = getPath();
    // Align with DatabaseTasks._connectFor which defaults missing sqlite
    // database to ":memory:" — makes create/drop no-ops on in-memory
    // configs instead of throwing on otherwise-valid setups.
    const database = this.dbConfig.database ?? ":memory:";
    // Per PathAdapter contract, a missing isAbsolute means the adapter
    // doesn't model relative/absolute distinctions (e.g. a VFS) — treat
    // every path as already absolute.
    if (database === ":memory:") return database;
    if (!path.isAbsolute || path.isAbsolute(database)) return database;
    return path.join(this.root, database);
  }

  private async connectAdapter(): Promise<DatabaseAdapter> {
    const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
    return new SQLite3Adapter(this.resolveDbPath());
  }

  private async closeAdapter(adapter: DatabaseAdapter): Promise<void> {
    const close = (adapter as { close?: () => Promise<void> }).close;
    if (typeof close === "function") await close.call(adapter);
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
