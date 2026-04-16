/**
 * PostgreSQLDatabaseTasks — PostgreSQL-specific database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::PostgreSQLDatabaseTasks
 */

import {
  getFs,
  getOsAsync,
  getPath,
  getChildProcessAsync,
  type SpawnSyncResult,
} from "@blazetrails/activesupport";
import type { DatabaseAdapter } from "../adapter.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { DatabaseAlreadyExists } from "../errors.js";
import { DatabaseTasks } from "./database-tasks.js";
import { coercePort } from "./task-utils.js";

const DEFAULT_ENCODING_FALLBACK = "utf8";
const DUPLICATE_DATABASE = "42P04";

function defaultEncoding(): string {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.CHARSET ?? DEFAULT_ENCODING_FALLBACK;
}

function isPGDuplicateDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === DUPLICATE_DATABASE) return true;
  return typeof e.message === "string" && e.message.includes("already exists");
}
const ON_ERROR_STOP_1 = "ON_ERROR_STOP=1";
const SQL_COMMENT_BEGIN = "--";

type ConfigHash = Record<string, unknown>;

interface UrlParts {
  host?: string;
  port?: string;
  username?: string;
  password?: string;
  database?: string;
  sslmode?: string;
  sslcert?: string;
  sslkey?: string;
  sslrootcert?: string;
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
      sslmode: parsed.searchParams.get("sslmode") ?? undefined,
      sslcert: parsed.searchParams.get("sslcert") ?? undefined,
      sslkey: parsed.searchParams.get("sslkey") ?? undefined,
      sslrootcert: parsed.searchParams.get("sslrootcert") ?? undefined,
    };
  } catch {
    return {};
  }
}

export class PostgreSQLDatabaseTasks {
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

  async create(connectionAlreadyEstablished = false): Promise<void> {
    const dbName = this.requireDatabaseName();
    const encoding = this.encoding();
    const sql = `CREATE DATABASE "${this.escapeIdent(dbName)}" ENCODING '${this.escapeSingle(encoding)}'`;
    const admin = await this.connectAdmin();
    try {
      await admin.executeMutation(sql);
    } catch (error) {
      if (isPGDuplicateDatabaseError(error)) {
        throw new DatabaseAlreadyExists(`Database '${dbName}' already exists`, {
          sql,
          cause: error,
        });
      }
      throw error;
    } finally {
      await this.closeAdapter(admin);
    }
    void connectionAlreadyEstablished;
  }

  async drop(): Promise<void> {
    const dbName = this.requireDatabaseName();
    const admin = await this.connectAdmin();
    try {
      await admin.executeMutation(`DROP DATABASE IF EXISTS "${this.escapeIdent(dbName)}"`);
    } finally {
      await this.closeAdapter(admin);
    }
  }

  charset(): string {
    return this.encoding();
  }

  collation(): string | null {
    return (this.configurationHash.collation as string) ?? null;
  }

  async purge(): Promise<void> {
    await this.drop();
    await this.create(true);
  }

  async structureDump(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    // Use --dbname=NAME instead of a positional argument so database names
    // beginning with "-" aren't parsed as pg_dump options.
    const args = [
      "--schema-only",
      "--no-privileges",
      "--no-owner",
      "--file",
      filename,
      `--dbname=${this.requireDatabaseName()}`,
    ];
    if (extraFlags) {
      args.push(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));
    }

    // Rails: reads ActiveRecord.dump_schemas to decide which PG schemas
    // pg_dump includes. Trails equivalent: DatabaseTasks.dumpSchemas.
    //
    // The configured search_path (from config.schemaSearchPath) is
    // used for TWO purposes:
    // 1. --schema= filter args for pg_dump (when dumpSchemas isn't "all")
    // 2. SET search_path footer appended to the dump file
    // These are separated so dumpSchemas="all" still appends the footer.
    // Trails uses camelCase config keys throughout; no snake_case fallback.
    const rawSearchPath = this.configurationHash.schemaSearchPath;
    const configuredSearchPath = typeof rawSearchPath === "string" ? rawSearchPath : undefined;

    const dumpSchemas = DatabaseTasks.dumpSchemas;
    let schemaFilter: string | undefined;
    if (dumpSchemas === "schema_search_path") {
      schemaFilter = configuredSearchPath;
    } else if (dumpSchemas === "all") {
      schemaFilter = undefined;
    } else if (typeof dumpSchemas === "string") {
      schemaFilter = dumpSchemas;
    }

    if (schemaFilter && schemaFilter.trim().length > 0) {
      for (const schema of normalizeSchemaSearchPath(schemaFilter)) {
        args.push(`--schema=${schema}`);
      }
    }

    // Rails: applies SchemaDumper.ignore_tables as -T exclusions.
    const { SchemaDumper } = await import("../connection-adapters/abstract/schema-dumper.js");
    for (const pattern of SchemaDumper.ignoreTables) {
      if (typeof pattern === "string") args.push("-T", pattern);
      // Regex patterns can't be expressed as pg_dump -T flags.
    }

    await this.runCmd("pg_dump", args, "dumping");
    await this.removeSqlHeaderComments(filename);

    // Rails: appends `SET search_path TO <path>;` at the end of the
    // dump so loading it restores the session search_path. Uses the
    // configured search_path (not the filtered schema list) so
    // dumpSchemas="all" still appends when a search_path is set.
    if (configuredSearchPath && configuredSearchPath.trim().length > 0) {
      const sanitized = configuredSearchPath.trim().replace(/[;\n\r]/g, "");
      if (sanitized.length > 0) {
        getFs().appendFileSync(filename, `SET search_path TO ${sanitized};\n\n`);
      }
    }
  }

  async structureLoad(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    const os = await getOsAsync();
    const nullDevice = os.platform() === "win32" ? "NUL" : "/dev/null";
    // --dbname=NAME avoids psql treating a db name starting with "-" as a
    // flag.
    const args = [
      "--set",
      ON_ERROR_STOP_1,
      "--quiet",
      "--no-psqlrc",
      "--output",
      nullDevice,
      "--file",
      filename,
      `--dbname=${this.requireDatabaseName()}`,
    ];
    if (extraFlags) {
      args.push(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));
    }
    await this.runCmd("psql", args, "loading");
  }

  /**
   * Truncate every user table in `public`, skipping schema_migrations
   * and ar_internal_metadata. TRUNCATE ... RESTART IDENTITY CASCADE
   * matches Rails' default for PG (identity sequences reset; FK
   * dependencies cascaded).
   */
  async truncateAll(): Promise<void> {
    const { PostgreSQLAdapter } = await import("../connection-adapters/postgresql-adapter.js");
    const c = this.configurationHash;
    const adapter: DatabaseAdapter = c.url
      ? new PostgreSQLAdapter(String(c.url))
      : new PostgreSQLAdapter({
          host: (c.host as string) ?? "localhost",
          port: coercePort(c.port, 5432),
          database: this.requireDatabaseName(),
          user: c.username as string | undefined,
          password: c.password as string | undefined,
        });
    try {
      const rows = (await adapter.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' " +
          "AND tablename NOT IN ('schema_migrations', 'ar_internal_metadata')",
      )) as Array<{ tablename: string }>;
      if (rows.length === 0) return;
      const quoted = rows.map((r) => `"${r.tablename.replace(/"/g, '""')}"`).join(", ");
      await adapter.executeMutation(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
    } finally {
      await this.closeAdapter(adapter);
    }
  }

  static register(): void {
    DatabaseTasks.registerTask(/postgres/, {
      create: async (config) => new PostgreSQLDatabaseTasks(config).create(),
      drop: async (config) => new PostgreSQLDatabaseTasks(config).drop(),
      purge: async (config) => new PostgreSQLDatabaseTasks(config).purge(),
      charset: async (config) => new PostgreSQLDatabaseTasks(config).charset(),
      collation: async (config) => new PostgreSQLDatabaseTasks(config).collation(),
      truncateAll: async (config) => new PostgreSQLDatabaseTasks(config).truncateAll(),
      structureDump: async (config, filename, flags) =>
        new PostgreSQLDatabaseTasks(config).structureDump(filename, flags),
      structureLoad: async (config, filename, flags) =>
        new PostgreSQLDatabaseTasks(config).structureLoad(filename, flags),
    });
  }

  private encoding(): string {
    return String(this.configurationHash.encoding ?? defaultEncoding());
  }

  private async connectAdmin(): Promise<DatabaseAdapter> {
    const { PostgreSQLAdapter } = await import("../connection-adapters/postgresql-adapter.js");
    const c = this.configurationHash;
    if (c.url) {
      const parsed = new URL(String(c.url));
      parsed.pathname = "/postgres";
      return new PostgreSQLAdapter(parsed.toString());
    }
    return new PostgreSQLAdapter({
      host: (c.host as string) ?? "localhost",
      port: coercePort(c.port, 5432),
      database: "postgres",
      user: c.username as string | undefined,
      password: c.password as string | undefined,
    });
  }

  private async closeAdapter(adapter: DatabaseAdapter): Promise<void> {
    const maybeClose = (adapter as { close?: () => Promise<void> }).close;
    if (typeof maybeClose === "function") {
      await maybeClose.call(adapter);
    }
  }

  private psqlEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...((globalThis as { process?: { env?: NodeJS.ProcessEnv } }).process?.env ?? {}),
    };
    const c = this.configurationHash;
    const host = this.dbConfig.host ?? this.urlParts.host;
    const port = c.port ?? this.urlParts.port;
    const password = c.password ?? this.urlParts.password;
    const username = c.username ?? this.urlParts.username;
    if (host) env.PGHOST = String(host);
    if (port !== undefined) env.PGPORT = String(port);
    if (password !== undefined) env.PGPASSWORD = String(password);
    if (username !== undefined) env.PGUSER = String(username);
    const sslmode = c.sslmode ?? this.urlParts.sslmode;
    const sslcert = c.sslcert ?? this.urlParts.sslcert;
    const sslkey = c.sslkey ?? this.urlParts.sslkey;
    const sslrootcert = c.sslrootcert ?? this.urlParts.sslrootcert;
    if (sslmode !== undefined) env.PGSSLMODE = String(sslmode);
    if (sslcert !== undefined) env.PGSSLCERT = String(sslcert);
    if (sslkey !== undefined) env.PGSSLKEY = String(sslkey);
    if (sslrootcert !== undefined) env.PGSSLROOTCERT = String(sslrootcert);
    return env;
  }

  private async runCmd(cmd: string, args: string[], action: string): Promise<void> {
    const childProcess = await getChildProcessAsync();
    const result = childProcess.spawnSync(cmd, args, {
      env: this.psqlEnv(),
      encoding: "utf8",
    });
    if (result.error || result.status !== 0 || result.signal) {
      throw new Error(formatCmdError(cmd, args, result, action));
    }
  }

  private async removeSqlHeaderComments(filename: string): Promise<void> {
    const fs = getFs();
    const path = getPath();
    const os = await getOsAsync();
    const contents = fs.readFileSync(filename, "utf8");
    const lines = contents.split("\n");
    let i = 0;
    while (i < lines.length && (lines[i].startsWith(SQL_COMMENT_BEGIN) || lines[i].trim() === "")) {
      i++;
    }
    if (!fs.mkdtempSync) {
      throw new Error(
        "PostgreSQLDatabaseTasks.structureDump requires FsAdapter.mkdtempSync. " +
          "The configured FsAdapter does not provide it.",
      );
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uncommented_structure_"));
    const tmp = path.join(tmpDir, "structure.sql");
    try {
      fs.writeFileSync(tmp, lines.slice(i).join("\n"));
      fs.copyFileSync(tmp, filename);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private requireDatabaseName(): string {
    const name = this.dbConfig.database ?? this.urlParts.database;
    if (!name) throw new Error("PostgreSQL configuration missing 'database'");
    return name;
  }

  private escapeIdent(value: string): string {
    return value.replace(/"/g, '""');
  }

  private escapeSingle(value: string): string {
    return value.replace(/'/g, "''");
  }
}

function formatCmdError(
  cmd: string,
  args: string[],
  result: SpawnSyncResult,
  action: string,
): string {
  const details: string[] = [];
  if (result.error) details.push(`Error: ${result.error.message}`);
  if (result.status !== null && result.status !== 0) {
    details.push(`Exit status: ${result.status}`);
  }
  if (result.signal) details.push(`Signal: ${result.signal}`);
  if (result.stderr) details.push(`stderr:\n${String(result.stderr).trimEnd()}`);
  if (result.stdout) details.push(`stdout:\n${String(result.stdout).trimEnd()}`);
  return (
    `failed to execute:\n${cmd} ${args.join(" ")}\n\n` +
    (details.length ? `${details.join("\n\n")}\n\n` : "") +
    `Make sure \`${cmd}\` is installed in your PATH and has proper permissions.\n` +
    `(action: ${action})`
  );
}

/**
 * Normalize a PG schema_search_path string into an array of schema
 * names suitable for pg_dump `--schema=` args. Strips surrounding
 * quotes, drops `$user` (PG runtime variable, not a real schema),
 * and filters empties. Exported so the test can exercise the same
 * code path instead of reimplementing the logic.
 */
export function normalizeSchemaSearchPath(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((s) => {
      if (
        s.length >= 2 &&
        ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))
      ) {
        const quote = s[0];
        const inner = s.slice(1, -1).trim();
        // Unescape doubled quotes inside quoted identifiers:
        // "we""ird" → we"ird, 'it''s' → it's
        return quote === '"' ? inner.replace(/""/g, '"') : inner.replace(/''/g, "'");
      }
      return s;
    })
    .filter((s) => s.length > 0 && s !== "$user");
}
