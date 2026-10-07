import {
  Errno,
  RuntimeError,
  getChildProcessAsync,
  rbEqq,
  File,
  FileUtils,
} from "@blazetrails/ruby-compat";
import { kernelArray } from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { SQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { Base } from "../base.js";
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

  async create(): Promise<DatabaseAdapter> {
    if (File.isExist(this.dbConfig.database as string)) throw new DatabaseAlreadyExists();

    await this.establishConnection();
    return await this.connection();
  }

  async drop(): Promise<void> {
    try {
      const dbPath = this.dbConfig.database as string;
      const file = File.isAbsolutePath(dbPath) ? dbPath : File.join(this.root, dbPath);
      FileUtils.rm(file);
      FileUtils.rmF([`${file}-shm`, `${file}-wal`]);
    } catch (error: unknown) {
      if (error instanceof Errno.ENOENT) throw new NoDatabaseError(error.message);
      throw error;
    }
  }

  async purge(): Promise<void> {
    try {
      const connection = (await this.connection()) as SQLite3Adapter;
      await connection.disconnectBang();
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

  async structureDump(filename: string, extraFlags: string | string[] | null): Promise<void> {
    const args: string[] = [];
    if (extraFlags != null) args.push(...kernelArray(extraFlags));
    args.push(this.dbConfig.database as string);

    const { SchemaDumper } = await import("../schema-dumper.js");
    let ignoreTables = SchemaDumper.ignoreTables;
    if (ignoreTables.length > 0) {
      ignoreTables = (await (await this.connection()).dataSources()).filter((table) =>
        ignoreTables.some((pattern) => rbEqq(pattern, table)),
      );
      const condition = (
        await Promise.all(ignoreTables.map(async (table) => (await this.connection()).quote(table)))
      ).join(", ");
      args.push(
        `SELECT sql || ';' FROM sqlite_master WHERE tbl_name NOT IN (${condition}) ORDER BY tbl_name, type DESC, name`,
      );
    } else {
      args.push(".schema --nosys");
    }
    await this.runCmd("sqlite3", args, filename);
  }

  async structureLoad(filename: string, extraFlags: string[] | null): Promise<void> {
    let flags: string | undefined;
    if (extraFlags != null) flags = extraFlags.join(" ");
    const childProcess = await getChildProcessAsync();
    const words = (flags ?? "").split(/\s+/).filter((word) => word !== "");
    const args = [...words, this.dbConfig.database as string];
    childProcess.spawnSync("sqlite3", args, { encoding: "utf8", in: filename });
  }

  private async connection(): Promise<DatabaseAdapter> {
    return Base.connectionPool().leaseConnection();
  }

  private async establishConnection(
    config: DatabaseConfig = this.dbConfig,
  ): Promise<DatabaseAdapter> {
    await Base.establishConnection(config);
    return await (await this.connection()).connectBang();
  }

  private async runCmd(cmd: string, args: string[], out: string): Promise<void> {
    const childProcess = await getChildProcessAsync();
    if (childProcess.spawnSync(cmd, args, { encoding: "utf8", out }).status !== 0) {
      throw new RuntimeError(this.runCmdError(cmd, args));
    }
  }

  private runCmdError(cmd: string, args: string[]): string {
    let msg = "failed to execute:\n";
    msg += `${cmd} ${args.join(" ")}\n\n`;
    msg += `Please check the output above for any errors and make sure that \`${cmd}\` is installed in your PATH and has proper permissions.\n\n`;
    return msg;
  }
}

DatabaseTasks.registerTask(/sqlite/, SQLiteDatabaseTasks);
