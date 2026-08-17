/**
 * MySQLDatabaseTasks — MySQL/MariaDB-specific database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::MySQLDatabaseTasks
 */

import { getChildProcessAsync, type SpawnSyncResult } from "@blazetrails/activesupport";
import type { Mysql2Adapter } from "../connection-adapters/mysql2-adapter.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { Base } from "../base.js";
import { DatabaseTasks, metadataTableNames } from "./database-tasks.js";

type ConfigHash = Record<string, unknown>;

export class MySQLDatabaseTasks {
  private readonly dbConfig: DatabaseConfig;
  private readonly configurationHash: ConfigHash;

  static usingDatabaseConfigurations(): boolean {
    return true;
  }

  constructor(dbConfig: DatabaseConfig) {
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
    // Deviation, tracked as RFC 0051's `mysql-purge-does-not-call-recreate-database`:
    // Rails is `establish_connection(configuration_hash_without_database)` /
    // `recreate_database(db_config.database, creation_options)` /
    // `establish_connection` (mysql_database_tasks.rb:26-30). trails drops and
    // creates by hand so it can carry the existing database's charset/collation
    // across: the test slot databases are made `CHARACTER SET utf8mb4 COLLATE
    // utf8mb4_bin` (support/template-global-setup.ts), which is neither the
    // server default nor present in the config hash `creation_options` reads,
    // so recreating on `creation_options` alone silently changes collation and
    // breaks the case-sensitivity tests. The preservation lives here rather
    // than on `create`, whose signature is Rails' (mysql_database_tasks.rb:15-19).
    const saved = await this.savedCharset();
    await this.drop();
    await this.establishConnection(this.configurationHashWithoutDatabase());
    await (
      await this.connection()
    ).createDatabase(this.dbConfig.database as string, { ...this.creationOptions(), ...saved });
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
          // Ruby's Regexp#=== carries no state; a JS `g`/`y` regex advances
          // `lastIndex` on every `.test()`, so without this reset the second
          // table tested against the same pattern can silently miss.
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

  /**
   * Truncate every user table in the current database, skipping
   * schema_migrations and ar_internal_metadata. Disables FK checks for
   * the duration so TRUNCATE order doesn't matter (matching Rails'
   * Mysql2Adapter#truncate_tables behavior).
   */
  async truncateAll(): Promise<void> {
    const dbName = this.dbConfig.database as string;
    await this.establishConnection();
    const adapter = await this.connection();
    const bookkeeping = metadataTableNames();
    const rows = (await adapter.execute(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = ? " +
        "AND table_type = 'BASE TABLE'",
      [dbName],
    )) as Array<{ table_name?: string; TABLE_NAME?: string }>;
    const names = rows
      .map((r) => r.table_name ?? r.TABLE_NAME)
      .filter((n): n is string => typeof n === "string" && !bookkeeping.has(n));
    if (names.length === 0) return;
    await adapter.execute("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const name of names) {
        await adapter.execute(`TRUNCATE TABLE \`${name.replace(/`/g, "``")}\``);
      }
    } finally {
      await adapter.execute("SET FOREIGN_KEY_CHECKS = 1");
    }
  }

  static register(): void {
    DatabaseTasks.registerTask(/mysql/, MySQLDatabaseTasks);
  }

  private creationOptions(): { charset?: string; collation?: string } {
    // `Hash#include?` is key presence, not a defined value
    // (`mysql_database_tasks.rb:85-86`), so a key stored with an explicit nil
    // still emits its option — go through `Object.keys(...).includes(...)`
    // rather than an `!== undefined` value test.
    const options: { charset?: string; collation?: string } = {};
    if (Object.keys(this.configurationHash).includes("encoding")) {
      options.charset = this.configurationHash.encoding as string;
    }
    if (Object.keys(this.configurationHash).includes("collation")) {
      options.collation = this.configurationHash.collation as string;
    }
    return options;
  }

  private async savedCharset(): Promise<{ charset?: string; collation?: string }> {
    const dbName = this.dbConfig.database as string;
    // Connect without selecting a database: information_schema.SCHEMATA is
    // server-global, and connecting to the target DB would fail with error 1049
    // if it doesn't exist yet (e.g. purge() called before create() on a clean env).
    await this.establishConnection(this.configurationHashWithoutDatabase());
    const rows = (await (
      await this.connection()
    ).execute(
      "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME " +
        "FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [dbName],
    )) as Array<{ DEFAULT_CHARACTER_SET_NAME?: string; DEFAULT_COLLATION_NAME?: string }>;
    const row = rows[0];
    if (!row) return {};
    return { charset: row.DEFAULT_CHARACTER_SET_NAME, collation: row.DEFAULT_COLLATION_NAME };
  }

  /**
   * `prepare_command_options` (`mysql_database_tasks.rb:76-93`). Reads
   * `configuration_hash` only: `UrlConfig` has already merged the resolved URL
   * hash into it (`database_configurations/url_config.rb:41-43`), so there is
   * nothing left to re-parse here.
   *
   * Ruby's `filter_map` guard is `if configuration_hash[opt]`, so only nil/false
   * are dropped — an empty string still emits its flag.
   */
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
      // `fail run_cmd_error(cmd, args, action)` (`mysql_database_tasks.rb:105`).
      // Rails' first line is the whole message because `Kernel.system` lets the
      // child write straight to the terminal; `spawnSync` captures it instead,
      // so the captured streams follow the ported message rather than replacing
      // it.
      throw new Error(
        runCmdError(cmd, args, action) +
          `${cmd} ${args.join(" ")}\n\n` +
          (details.length ? `${details.join("\n\n")}\n` : ""),
      );
    }
  }

  /** @internal */
  private async establishConnection(configHash?: Record<string, unknown>): Promise<void> {
    const config: Record<string, unknown> = { ...(configHash ?? this.dbConfig.configuration) };
    await Base.establishConnection(config as { adapter?: string; [key: string]: unknown });
  }

  /** @internal */
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
