import { merge, rbEqq, rbFSystem, rbModConstSet, RuntimeError } from "@blazetrails/ruby-compat";
import { kernelArray } from "@blazetrails/activesupport";
import type { Mysql2Adapter } from "../connection-adapters/mysql2-adapter.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import type { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import { DatabaseTasks } from "./database-tasks.js";
import { Tasks } from "../namespaces.js";

type ConfigHash = Record<string, unknown>;

export class MySQLDatabaseTasks {
  private readonly dbConfig: HashConfig;
  private readonly configurationHash: ConfigHash;

  static usingDatabaseConfigurations(): boolean {
    return true;
  }

  constructor(dbConfig: HashConfig) {
    this.dbConfig = dbConfig;
    this.configurationHash = { ...dbConfig.configurationHash };
  }

  async create(): Promise<ConnectionPool> {
    await this.establishConnection(this.configurationHashWithoutDatabase());
    await (
      await this.connection()
    ).createDatabase(this.dbConfig.database as string, this.creationOptions());
    return await this.establishConnection();
  }

  async drop(): Promise<void> {
    await this.establishConnection();
    await (await this.connection()).dropDatabase(this.dbConfig.database as string);
  }

  async purge(): Promise<void> {
    await this.establishConnection(this.configurationHashWithoutDatabase());
    await (
      await this.connection()
    ).recreateDatabase(this.dbConfig.database as string, this.creationOptions());
    await this.establishConnection();
  }

  async charset(): Promise<string | null> {
    return (await this.connection()).charset();
  }

  async collation(): Promise<string | null> {
    return (await this.connection()).collation();
  }

  async structureDump(filename: string, extraFlags: string | string[] | null): Promise<void> {
    let args = this.prepareCommandOptions();
    args.push("--result-file", `${filename}`);
    args.push("--no-data");
    args.push("--routines");
    args.push("--skip-comments");

    const { SchemaDumper } = await import("../schema-dumper.js");
    let ignoreTables = SchemaDumper.ignoreTables;
    if (ignoreTables.length > 0) {
      const dataSources = await (await this.connection()).dataSources();
      ignoreTables = dataSources.filter((table) =>
        ignoreTables.some((pattern) => rbEqq(pattern, table)),
      );
      args = args.concat(
        ignoreTables.map((table) => `--ignore-table=${this.dbConfig.database}.${table}`),
      );
    }

    args.push(String(this.dbConfig.database));
    if (extraFlags != null) args.unshift(...kernelArray(extraFlags));

    await this.runCmd("mysqldump", args, "dumping");
  }

  async structureLoad(filename: string, extraFlags: string | string[] | null): Promise<void> {
    const args = this.prepareCommandOptions();
    args.push(
      "--execute",
      `SET FOREIGN_KEY_CHECKS = 0; SOURCE ${filename}; SET FOREIGN_KEY_CHECKS = 1`,
    );
    args.push("--database", this.dbConfig.database as string);
    if (extraFlags != null) args.unshift(...kernelArray(extraFlags));

    await this.runCmd("mysql", args, "loading");
  }

  private creationOptions(): { charset?: string; collation?: string } {
    const options: { charset?: string; collation?: string } = {};
    if (Object.keys(this.configurationHash).includes("encoding")) {
      options.charset = this.configurationHash.encoding as string;
    }
    if (Object.keys(this.configurationHash).includes("collation")) {
      options.collation = this.configurationHash.collation as string;
    }
    return options;
  }

  private prepareCommandOptions(): string[] {
    const args = Object.entries({
      host: "--host",
      port: "--port",
      socket: "--socket",
      username: "--user",
      password: "--password",
      encoding: "--default-character-set",
      sslca: "--ssl-ca",
      sslcert: "--ssl-cert",
      sslcapath: "--ssl-capath",
      sslcipher: "--ssl-cipher",
      sslkey: "--ssl-key",
      sslMode: "--ssl-mode",
    }).flatMap(([opt, arg]) => {
      const value = this.configurationHash[opt];
      return value != null && value !== false ? [`${arg}=${String(value)}`] : [];
    });

    return args;
  }

  private async connection(): Promise<Mysql2Adapter> {
    return (await Base.connectionPool().leaseConnection()) as Mysql2Adapter;
  }

  private async runCmd(cmd: string, args: string[], action: string): Promise<void> {
    if (!(await rbFSystem(cmd, ...args)))
      throw new RuntimeError(this.runCmdError(cmd, args, action));
  }

  private runCmdError(cmd: string, _args: string[], _action: string): string {
    return (
      `failed to execute: \`${cmd}\`\n` +
      `Please check the output above for any errors and make sure that \`${cmd}\` is installed in your PATH and has proper permissions.\n\n`
    );
  }

  /** @internal */
  private async establishConnection(
    config: Record<string, unknown> = this.dbConfig.configurationHash,
  ): Promise<ConnectionPool> {
    return await Base.establishConnection({ ...config } as {
      adapter?: string;
      [key: string]: unknown;
    });
  }

  /** @internal */
  private configurationHashWithoutDatabase(): ConfigHash {
    return merge(this.configurationHash, { database: null });
  }
}

rbModConstSet(Tasks, "MySQLDatabaseTasks", MySQLDatabaseTasks);
DatabaseTasks.registerTask(/mysql/, MySQLDatabaseTasks);
DatabaseTasks.registerTask(/trilogy/, MySQLDatabaseTasks);
