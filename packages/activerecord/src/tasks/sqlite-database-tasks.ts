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

  async create(): Promise<void> {
    const fs = getFs();
    if (fs.existsSync(this.dbConfig.database as string)) throw new DatabaseAlreadyExists();

    await this.establishConnection();
    await this.connection();
  }

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
      } catch {}
    }
  }

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
          pattern.lastIndex = 0;
          return pattern.test(table);
        }),
      );
      const condition = ignoreTables.map((table) => connection.quote(table)).join(", ");
      dumpSpec = `SELECT sql || ';' FROM sqlite_master WHERE tbl_name NOT IN (${condition}) ORDER BY tbl_name, type DESC, name`;
    } else {
      dumpSpec = ".schema --nosys";
    }

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
    const flags = extraFlags != null ? (Array.isArray(extraFlags) ? extraFlags : [extraFlags]) : [];
    const childProcess = await getChildProcessAsync();
    const args = [...flags, this.dbConfig.database as string];
    childProcess.spawnSync("sqlite3", args, { encoding: "utf8", in: filename });
  }

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
