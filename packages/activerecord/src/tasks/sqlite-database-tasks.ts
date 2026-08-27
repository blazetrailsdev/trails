/**
 * SQLiteDatabaseTasks — SQLite-specific database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::SQLiteDatabaseTasks.
 *
 * `structureDump` shells out to the `sqlite3` CLI as Rails does
 * (`sqlite_database_tasks.rb:44-58`), materialising an in-memory database with
 * `VACUUM INTO` first so there is one dump path. `structureLoad` still routes
 * an in-memory database through the SQLite3Adapter: SQLite has no inverse of
 * `VACUUM INTO`, so nothing can pull a file's schema back into the live
 * connection that owns the database.
 */

import {
  getFs,
  getFsAsync,
  getPath,
  getChildProcessAsync,
  type SpawnSyncResult,
} from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { SQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { Base } from "../base.js";
import { DatabaseTasks, metadataTableNames } from "./database-tasks.js";
import { NoDatabaseError, DatabaseAlreadyExists } from "../errors.js";
import { isInMemoryDatabase } from "../sqlite/sqlite-uri.js";

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

  /**
   * `sqlite_database_tasks.rb:15-20`. The database file is created by SQLite on
   * connect, not by this method: Rails' trailing bare `connection` is what forces
   * the checkout that opens it. `File.exist?` reads the *raw* configured
   * database — only `drop` joins `root` (`:23-24`) — and the message the caller
   * prints comes from `DatabaseTasks.create`'s rescue
   * (`database_tasks.rb:119-120`), so the exception carries none of its own.
   *
   * `File.exist?(":memory:")` is false, so an in-memory database simply
   * connects; Rails has no in-memory lane and so no guard here. Both halves
   * read the same raw `db_config.database`: the guard and the connect have to
   * mean the same file, which is why the `root` join lives inline in `drop`
   * (`:23-24`) and nowhere else.
   */
  async create(): Promise<void> {
    const fs = getFs();
    if (fs.existsSync(this.dbConfig.database as string)) throw new DatabaseAlreadyExists();

    await this.establishConnection();
    await this.connection();
  }

  /**
   * `sqlite_database_tasks.rb:22-29`. This is the one place Rails joins
   * `root`, and it writes the join inline — `File.absolute_path?(db_path)`
   * short-circuits it for an already-absolute name.
   *
   * There is no in-memory arm: `FileUtils.rm(":memory:")` raises `Errno::ENOENT`,
   * which the rescue turns into `NoDatabaseError`, so that is what an in-memory
   * database answers here too. Per the PathAdapter contract a missing
   * `isAbsolute` means the adapter does not model the relative/absolute
   * distinction (e.g. a VFS), which takes the `File.absolute_path?` arm.
   */
  async drop(): Promise<void> {
    const fs = getFs();
    const path = getPath();
    const dbPath = this.dbConfig.database as string;
    const file =
      !path.isAbsolute || path.isAbsolute(dbPath) ? dbPath : path.join(this.root, dbPath);
    try {
      fs.unlinkSync(file);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NoDatabaseError((error as Error).message);
      }
      throw error;
    }
    for (const suffix of ["-shm", "-wal"]) {
      try {
        fs.unlinkSync(file + suffix);
      } catch {
        // ignore
      }
    }
  }

  /**
   * `sqlite_database_tasks.rb:31-38`. The `rescue` names `NoDatabaseError`
   * alone — every other failure propagates — and the `ensure` runs `create`
   * and `connection.reconnect!` whether or not it did.
   *
   * The `whenClosed()` drain is a TypeScript-async necessity, not an extra
   * step: MRI's sqlite3 gem closes the handle synchronously inside
   * `disconnect!` (`sqlite3_adapter.rb:221`), so `drop`'s `FileUtils.rm` always
   * runs against a closed file. An async-only JS driver instead leaves
   * `driver.close()` in flight and records it for a later drain
   * (`sqlite3-adapter.ts` `whenClosed`), so without this the unlink — and the
   * `create` that reopens the same path — can race the previous handle (#1269).
   */
  async purge(): Promise<void> {
    try {
      const connection = (await this.connection()) as SQLite3Adapter;
      connection.disconnectBang();
      await connection.whenClosed();
      await this.drop();
    } catch (error) {
      if (!(error instanceof NoDatabaseError)) throw error;
    } finally {
      await this.create();
      await (await this.connection()).reconnectBang();
    }
  }

  /**
   * `sqlite_database_tasks.rb:39-41`. `SQLite3Adapter#encoding` is
   * `any_raw_connection.encoding.to_s` (`sqlite3_adapter.rb:236-239`), i.e.
   * `PRAGMA encoding`; the literal this used to return could never satisfy
   * `SqliteDBCharsetTest#test_db_retrieves_charset`, which asserts `encoding`
   * is called on the connection. Ruby's send is duck-typed; `encoding` is
   * declared on `SQLite3Adapter`, not on `AbstractAdapter` (Rails puts it there
   * too), so TS needs the cast to reach it.
   */
  async charset(): Promise<string> {
    return ((await this.connection()) as SQLite3Adapter).encoding;
  }

  async structureDump(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    const args: string[] = [];
    if (extraFlags != null) args.push(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));

    const { SchemaDumper } = await import("../connection-adapters/abstract/schema-dumper.js");
    let ignoreTables = SchemaDumper.ignoreTables;
    let dumpSpec: string;
    if (ignoreTables.length > 0) {
      const connection = await this.connection();
      ignoreTables = (await connection.dataSources()).filter((table) =>
        ignoreTables.some((pattern) => {
          if (!(pattern instanceof RegExp)) return pattern === table;
          // Ruby's Regexp#=== carries no state; a JS `g`/`y` regex advances
          // `lastIndex` on every `.test()`, so without this reset the second
          // table tested against the same pattern can silently miss.
          pattern.lastIndex = 0;
          return pattern.test(table);
        }),
      );
      const condition = ignoreTables.map((table) => connection.quote(table)).join(", ");
      dumpSpec = `SELECT sql || ';' FROM sqlite_master WHERE tbl_name NOT IN (${condition}) ORDER BY tbl_name, type DESC, name`;
    } else {
      dumpSpec = ".schema --nosys";
    }

    // An in-memory database belongs to the connection that opened it, so the
    // child `sqlite3` Rails shells out to (sqlite_database_tasks.rb:44-58) has
    // no file to attach; it is copied out with `VACUUM INTO` (SQLite 3.27+).
    let database = this.dbConfig.database as string;
    let materialized: string | undefined;
    if (isInMemoryDatabase(database)) {
      const connection = await this.connection();
      materialized = `${filename}.dump.sqlite3`;
      const fs = await getFsAsync();
      if (await fs.exists(materialized)) await fs.unlink!(materialized);
      await connection.execute(`VACUUM INTO ${connection.quote(materialized)}`);
      database = materialized;
    }

    try {
      args.push(database, dumpSpec);
      await runCmd("sqlite3", args, filename);
    } finally {
      if (materialized !== undefined) {
        const fs = await getFsAsync();
        if (await fs.exists(materialized)) await fs.unlink!(materialized);
      }
    }
  }

  async structureLoad(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    if (isInMemoryDatabase(this.dbConfig.database as string))
      return this.inMemoryStructureLoad(filename);

    const flags = extraFlags != null ? (Array.isArray(extraFlags) ? extraFlags : [extraFlags]) : [];
    // Rails' backtick form redirects the dump file into sqlite3's stdin
    // (`sqlite3 #{flags} #{database} < "#{filename}"`) and does NOT check the
    // child's exit status. The child-process adapter has no shell, so the
    // redirect is expressed as the `in` option — the child reads the file
    // descriptor, so the dump's bytes reach it verbatim.
    const childProcess = await getChildProcessAsync();
    const args = [...flags, this.dbConfig.database as string];
    childProcess.spawnSync("sqlite3", args, { encoding: "utf8", in: filename });
  }

  /**
   * The in-memory counterpart to `structureLoad`'s CLI path.
   *
   * `exec` runs the whole script in one shot, so a dump carrying a trigger body
   * (`CREATE TRIGGER ... BEGIN ...; ...; END`) survives, where splitting on
   * semicolons would cut it in half. `register` matches `/sqlite/`, and every
   * SQLite-family adapter extends `SQLite3Adapter`, which defines `exec`
   * (`sqlite3-adapter.ts:1166`) — hence the cast rather than a feature-detect.
   */
  private async inMemoryStructureLoad(filename: string): Promise<void> {
    const sql = getFs().readFileSync(filename, "utf8");
    const adapter = await this.connection();
    await (adapter as unknown as { exec(sql: string): Promise<void> }).exec(sql);
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
    const adapter = await this.connection();
    const bookkeeping = metadataTableNames();
    const rows = (
      (await adapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )) as Array<{ name: string }>
    ).filter((r) => !bookkeeping.has(r.name));
    const withFks = adapter as DatabaseAdapter & {
      disableReferentialIntegrity?: (fn: () => Promise<void>) => Promise<void>;
    };
    const run = async () => {
      for (const row of rows) {
        await adapter.execute(`DELETE FROM "${row.name.replace(/"/g, '""')}"`);
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
        await adapter.execute(`DELETE FROM sqlite_sequence WHERE name IN (${list})`);
      }
    };
    if (typeof withFks.disableReferentialIntegrity === "function") {
      await withFks.disableReferentialIntegrity(run);
    } else {
      await run();
    }
  }

  private async connection(): Promise<DatabaseAdapter> {
    return Base.connectionPool().leaseConnection();
  }

  /**
   * `sqlite_database_tasks.rb:72-75`. Rails connects to `db_config` unchanged;
   * the `root` join belongs to `drop` alone, so nothing rewrites `database`
   * on the way through here.
   *
   * `establish_connection` alone opens nothing — it installs a pool lazily — so
   * the trailing `connection.connect!` is what forces the database file open.
   * `create` (`:15-20`) masks a missing one with its own bare `connection`, but
   * `reconnect`/`purge` (`:31-37`) does not.
   */
  private async establishConnection(config: DatabaseConfig = this.dbConfig): Promise<void> {
    await Base.establishConnection(config);
    await (await this.connection()).connectBang();
  }

  static register(): void {
    DatabaseTasks.registerTask(/sqlite/, SQLiteDatabaseTasks);
  }
}

/** @internal */
export async function runCmd(cmd: string, args: string[], out: string): Promise<void> {
  const childProcess = await getChildProcessAsync();
  const result: SpawnSyncResult = childProcess.spawnSync(cmd, args, { encoding: "utf8", out });
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
}

/** @internal */
export function runCmdError(cmd: string, args: string[]): string {
  return (
    `failed to execute:\n${cmd} ${args.join(" ")}\n\n` +
    `Please check the output for any errors and make sure that \`${cmd}\` is installed in your PATH and has proper permissions.\n\n`
  );
}
