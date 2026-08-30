import { getChildProcessAsync, type SpawnSyncResult } from "@blazetrails/activesupport";
import type { Mysql2Adapter } from "../connection-adapters/mysql2-adapter.js";
import type { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import { DatabaseTasks } from "./database-tasks.js";

type ConfigHash = Record<string, unknown>;

export class MySQLDatabaseTasks {
  private readonly dbConfig: HashConfig;
  private readonly configurationHash: ConfigHash;

  static usingDatabaseConfigurations(): boolean {
    return true;
  }

  constructor(dbConfig: HashConfig) {
    this.dbConfig = dbConfig;
    this.configurationHash = { ...dbConfig.configuration };
  }

  async create(): Promise<void> {
    await this.establishConnection(this.configurationHashWithoutDatabase());
    await (
      await this.connection()
    ).createDatabase(this.dbConfig.database as string, this.creationOptions());
    await this.establishConnection();
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

  async charset(): Promise<string> {
    return (await this.connection()).charset();
  }

  async collation(): Promise<string> {
    return (await this.connection()).collation();
  }

  async structureDump(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    const args = this.prepareCommandOptions();
    args.push("--result-file", filename, "--no-data", "--routines", "--skip-comments");

    const { SchemaDumper } = await import("../schema-dumper.js");
    let ignoreTables: (string | RegExp)[] = SchemaDumper.ignoreTables;
    if (ignoreTables.length > 0) {
      const dataSources = await (await this.connection()).dataSources();
      ignoreTables = dataSources.filter((table) =>
        ignoreTables.some((pattern) => {
          if (!(pattern instanceof RegExp)) return pattern === table;
          pattern.lastIndex = 0;
          return pattern.test(table);
        }),
      );
      for (const table of ignoreTables) {
        args.push(`--ignore-table=${this.dbConfig.database as string}.${table as string}`);
      }
    }

    args.push(this.dbConfig.database as string);
    if (extraFlags) {
      args.unshift(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));
    }
    await this.runCmd("mysqldump", args, "dumping");
  }

  async structureLoad(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    const args = this.prepareCommandOptions();
    args.push(
      "--execute",
      `SET FOREIGN_KEY_CHECKS = 0; SOURCE ${filename}; SET FOREIGN_KEY_CHECKS = 1`,
    );
    args.push("--database", this.dbConfig.database as string);
    if (extraFlags) {
      args.unshift(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));
    }
    await this.runCmd("mysql", args, "loading");
  }

  static register(): void {
    DatabaseTasks.registerTask(/mysql/, MySQLDatabaseTasks);
  }

  /** @missingRailsCall new — PERMANENT */
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
      ssl_mode: "--ssl-mode",
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
    const childProcess = await getChildProcessAsync();
    const result: SpawnSyncResult = childProcess.spawnSync(cmd, args, {
      encoding: "utf8",
    });
    if (result.error || result.status !== 0 || result.signal) {
      const details: string[] = [];
      if (result.error) details.push(`Error: ${result.error.message}`);
      if (result.status !== null && result.status !== 0) {
        details.push(`Exit status: ${result.status}`);
      }
      if (result.signal) details.push(`Signal: ${result.signal}`);
      if (result.stderr) details.push(`stderr:\n${String(result.stderr).trimEnd()}`);
      if (result.stdout) details.push(`stdout:\n${String(result.stdout).trimEnd()}`);
      throw new Error(
        runCmdError(cmd, args, action) +
          `${cmd} ${args.join(" ")}\n\n` +
          (details.length ? `${details.join("\n\n")}\n` : ""),
      );
    }
  }

  /** @internal */
  private async establishConnection(
    config: Record<string, unknown> = this.dbConfig.configuration,
  ): Promise<void> {
    await Base.establishConnection({ ...config } as { adapter?: string; [key: string]: unknown });
  }

  /**
   * @internal
   * @missingRailsCall merge — PERMANENT
   */
  private configurationHashWithoutDatabase(): ConfigHash {
    return { ...this.configurationHash, database: null };
  }
}

/** @internal */
export function runCmdError(cmd: string, _args: string[], _action: string): string {
  return (
    `failed to execute: \`${cmd}\`\n` +
    `Please check the output above for any errors and make sure that \`${cmd}\` is installed in your PATH and has proper permissions.\n\n`
  );
}
