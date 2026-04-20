/**
 * MySQLDatabaseTasks — MySQL/MariaDB-specific database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::MySQLDatabaseTasks
 */

import { getFs, getChildProcessAsync, type SpawnSyncResult } from "@blazetrails/activesupport";
import type { DatabaseAdapter } from "../adapter.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { DatabaseAlreadyExists } from "../errors.js";
import { DatabaseTasks } from "./database-tasks.js";
import { coercePort } from "./task-utils.js";

const ER_DB_CREATE_EXISTS = 1007;

function isMySQLDatabaseExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; errno?: unknown; message?: unknown };
  if (e.code === "ER_DB_CREATE_EXISTS") return true;
  if (e.errno === ER_DB_CREATE_EXISTS) return true;
  return (
    typeof e.message === "string" &&
    e.message.includes("Can't create database") &&
    e.message.includes("database exists")
  );
}

type ConfigHash = Record<string, unknown>;

interface UrlParts {
  host?: string;
  port?: string;
  username?: string;
  password?: string;
  database?: string;
  socket?: string;
}

function parseDbUrl(url: string | undefined): UrlParts {
  if (!url) return {};
  try {
    const parsed = new URL(url);
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return {
      host: parsed.hostname || undefined,
      port: parsed.port || undefined,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      database: database || undefined,
      socket: parsed.searchParams.get("socket") ?? undefined,
    };
  } catch {
    return {};
  }
}

export class MySQLDatabaseTasks {
  private readonly dbConfig: DatabaseConfig;
  private readonly configurationHash: ConfigHash;
  private readonly urlParts: UrlParts;

  static usingDatabaseConfigurations(): boolean {
    return true;
  }

  constructor(dbConfig: DatabaseConfig) {
    this.dbConfig = dbConfig;
    this.configurationHash = { ...dbConfig.configuration };
    this.urlParts = parseDbUrl(this.configurationHash.url as string | undefined);
  }

  async create(): Promise<void> {
    const opts = this.creationOptions();
    const charset = opts.charset ? ` CHARACTER SET \`${this.escapeIdent(opts.charset)}\`` : "";
    const collation = opts.collation ? ` COLLATE \`${this.escapeIdent(opts.collation)}\`` : "";
    const dbName = this.requireDatabaseName();
    const sql = `CREATE DATABASE \`${this.escapeIdent(dbName)}\`${charset}${collation}`;
    try {
      await this.withAdmin((admin) => admin.executeMutation(sql));
    } catch (error) {
      if (isMySQLDatabaseExistsError(error)) {
        throw new DatabaseAlreadyExists(`Database '${dbName}' already exists`, {
          sql,
          cause: error,
        });
      }
      throw error;
    }
  }

  async drop(): Promise<void> {
    await this.withAdmin((admin) =>
      admin.executeMutation(
        `DROP DATABASE IF EXISTS \`${this.escapeIdent(this.requireDatabaseName())}\``,
      ),
    );
  }

  async purge(): Promise<void> {
    await this.drop();
    await this.create();
  }

  charset(): string {
    return String(this.configurationHash.encoding ?? "utf8mb4");
  }

  collation(): string | null {
    return (this.configurationHash.collation as string) ?? null;
  }

  async structureDump(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    const args = this.prepareCommandOptions();
    args.push("--result-file", filename, "--no-data", "--routines", "--skip-comments");
    args.push(this.requireDatabaseName());
    if (extraFlags) {
      args.unshift(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));
    }
    await this.runCmd("mysqldump", args, "dumping");
  }

  async structureLoad(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    const args = this.prepareCommandOptions();
    args.push("--database", this.requireDatabaseName());
    if (extraFlags) {
      args.unshift(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));
    }
    const sqlBody = getFs().readFileSync(filename, "utf8");
    const stdin = `SET FOREIGN_KEY_CHECKS = 0;\n${sqlBody}\nSET FOREIGN_KEY_CHECKS = 1;\n`;
    await this.runCmd("mysql", args, "loading", stdin);
  }

  /**
   * Truncate every user table in the current database, skipping
   * schema_migrations and ar_internal_metadata. Disables FK checks for
   * the duration so TRUNCATE order doesn't matter (matching Rails'
   * Mysql2Adapter#truncate_tables behavior).
   */
  async truncateAll(): Promise<void> {
    const { Mysql2Adapter } = await import("../connection-adapters/mysql2-adapter.js");
    const dbName = this.requireDatabaseName();
    // Build the adapter config the same way withAdmin does: prefer a
    // unix socket when the config provides one, coerce port safely so
    // invalid/NaN values don't leak into mysql2.
    const socket = this.resolvedField("socket");
    const adapterConfig: {
      host?: string;
      port?: number;
      database: string;
      user?: string;
      password?: string;
      socketPath?: string;
    } = {
      database: dbName,
      user: this.resolvedField("username"),
      password: this.resolvedField("password"),
    };
    if (socket) {
      adapterConfig.socketPath = socket;
    } else {
      adapterConfig.host = this.resolvedField("host") ?? "localhost";
      adapterConfig.port = coercePort(this.resolvedField("port"), 3306);
    }
    const adapter = new Mysql2Adapter(adapterConfig);
    try {
      const rows = (await adapter.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = ? " +
          "AND table_type = 'BASE TABLE' " +
          "AND table_name NOT IN ('schema_migrations', 'ar_internal_metadata')",
        [dbName],
      )) as Array<{ table_name?: string; TABLE_NAME?: string }>;
      const names = rows
        .map((r) => r.table_name ?? r.TABLE_NAME)
        .filter((n): n is string => typeof n === "string");
      if (names.length === 0) return;
      await adapter.executeMutation("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const name of names) {
          await adapter.executeMutation(`TRUNCATE TABLE \`${name.replace(/`/g, "``")}\``);
        }
      } finally {
        await adapter.executeMutation("SET FOREIGN_KEY_CHECKS = 1");
      }
    } finally {
      const close = (adapter as unknown as { close?: () => Promise<void> }).close;
      if (typeof close === "function") await close.call(adapter);
    }
  }

  static register(): void {
    const handler = {
      create: async (config: DatabaseConfig) => new MySQLDatabaseTasks(config).create(),
      drop: async (config: DatabaseConfig) => new MySQLDatabaseTasks(config).drop(),
      purge: async (config: DatabaseConfig) => new MySQLDatabaseTasks(config).purge(),
      charset: async (config: DatabaseConfig) => new MySQLDatabaseTasks(config).charset(),
      collation: async (config: DatabaseConfig) => new MySQLDatabaseTasks(config).collation(),
      truncateAll: async (config: DatabaseConfig) => new MySQLDatabaseTasks(config).truncateAll(),
      structureDump: async (
        config: DatabaseConfig,
        filename: string,
        flags?: string | string[] | null,
      ) => new MySQLDatabaseTasks(config).structureDump(filename, flags),
      structureLoad: async (
        config: DatabaseConfig,
        filename: string,
        flags?: string | string[] | null,
      ) => new MySQLDatabaseTasks(config).structureLoad(filename, flags),
    };
    DatabaseTasks.registerTask(/mysql/, handler);
    DatabaseTasks.registerTask(/trilogy/, handler);
  }

  private creationOptions(): { charset?: string; collation?: string } {
    const options: { charset?: string; collation?: string } = {};
    if (this.configurationHash.encoding !== undefined) {
      options.charset = String(this.configurationHash.encoding);
    }
    if (this.configurationHash.collation !== undefined) {
      options.collation = String(this.configurationHash.collation);
    }
    return options;
  }

  private resolvedField(name: keyof UrlParts): string | undefined {
    const c = this.configurationHash;
    const fromConfig = c[name as string];
    if (fromConfig !== undefined && fromConfig !== null && fromConfig !== "") {
      return String(fromConfig);
    }
    const fromUrl = this.urlParts[name];
    return fromUrl !== undefined ? String(fromUrl) : undefined;
  }

  /**
   * Build argv for mysql/mysqldump. The password is deliberately NOT placed
   * in argv (it would otherwise be visible in `ps` to other local users);
   * callers should read the password via env (MYSQL_PWD) — set in
   * {@link commandEnv}.
   */
  private prepareCommandOptions(): string[] {
    const args: string[] = [];
    const flagMap: Array<{ flag: string; key: string; fromUrl?: boolean }> = [
      { flag: "--host", key: "host", fromUrl: true },
      { flag: "--port", key: "port", fromUrl: true },
      { flag: "--socket", key: "socket", fromUrl: true },
      { flag: "--user", key: "username", fromUrl: true },
      { flag: "--default-character-set", key: "encoding" },
      { flag: "--ssl-ca", key: "sslca" },
      { flag: "--ssl-cert", key: "sslcert" },
      { flag: "--ssl-capath", key: "sslcapath" },
      { flag: "--ssl-cipher", key: "sslcipher" },
      { flag: "--ssl-key", key: "sslkey" },
      { flag: "--ssl-mode", key: "ssl_mode" },
    ];
    for (const { flag, key, fromUrl } of flagMap) {
      const value = fromUrl
        ? this.resolvedField(key as keyof UrlParts)
        : (this.configurationHash[key] as string | number | undefined);
      if (value !== undefined && value !== null && value !== "") {
        args.push(`${flag}=${String(value)}`);
      }
    }
    return args;
  }

  private commandEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...((globalThis as { process?: { env?: NodeJS.ProcessEnv } }).process?.env ?? {}),
    };
    const password = this.resolvedField("password");
    if (password !== undefined) env.MYSQL_PWD = password;
    return env;
  }

  private async withAdmin<T>(fn: (admin: DatabaseAdapter) => Promise<T>): Promise<T> {
    const { Mysql2Adapter } = await import("../connection-adapters/mysql2-adapter.js");
    const socket = this.resolvedField("socket");
    const adminConfig: {
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      socketPath?: string;
    } = {
      user: this.resolvedField("username"),
      password: this.resolvedField("password"),
    };
    if (socket) {
      adminConfig.socketPath = socket;
    } else {
      adminConfig.host = this.resolvedField("host") ?? "localhost";
      adminConfig.port = coercePort(this.resolvedField("port"), 3306);
    }
    const adapter = new Mysql2Adapter(adminConfig);
    try {
      return await fn(adapter);
    } finally {
      const close = (adapter as unknown as { close?: () => Promise<void> }).close;
      if (typeof close === "function") await close.call(adapter);
    }
  }

  private async runCmd(cmd: string, args: string[], action: string, stdin?: string): Promise<void> {
    const childProcess = await getChildProcessAsync();
    const result: SpawnSyncResult = childProcess.spawnSync(cmd, args, {
      encoding: "utf8",
      input: stdin,
      env: this.commandEnv(),
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
        `failed to execute:\n${cmd} ${args.join(" ")}\n\n` +
          (details.length ? `${details.join("\n\n")}\n\n` : "") +
          `Make sure \`${cmd}\` is installed in your PATH and has proper permissions.\n` +
          `(action: ${action})`,
      );
    }
  }

  private requireDatabaseName(): string {
    const name = this.dbConfig.database ?? this.urlParts.database;
    if (!name) throw new Error("MySQL configuration missing 'database'");
    return name;
  }

  private escapeIdent(value: string): string {
    return value.replace(/`/g, "``");
  }
}
