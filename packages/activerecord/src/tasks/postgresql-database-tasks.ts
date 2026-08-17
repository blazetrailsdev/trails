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
  isBlank,
  type SpawnSyncResult,
} from "@blazetrails/activesupport";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { Base } from "../base.js";
import { DatabaseTasks } from "./database-tasks.js";

const DEFAULT_ENCODING_FALLBACK = "utf8";

function defaultEncoding(): string {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.CHARSET ?? DEFAULT_ENCODING_FALLBACK;
}
const ON_ERROR_STOP_1 = "ON_ERROR_STOP=1";
const SQL_COMMENT_BEGIN = "--";

type ConfigHash = Record<string, unknown>;

export class PostgreSQLDatabaseTasks {
  private readonly dbConfig: DatabaseConfig;
  private readonly configurationHash: ConfigHash;

  static usingDatabaseConfigurations(): boolean {
    return true;
  }

  constructor(dbConfig: DatabaseConfig) {
    this.dbConfig = dbConfig;
    this.configurationHash = { ...dbConfig.configuration };
  }

  async create(connectionAlreadyEstablished = false): Promise<void> {
    if (!connectionAlreadyEstablished) {
      await this.establishConnection(this.publicSchemaConfig());
    }
    const conn = await this.connection();
    await conn.createDatabase(this.dbConfig.database as string, {
      ...this.configurationHash,
      encoding: this.encoding(),
    });
    await this.establishConnection();
  }

  async drop(): Promise<void> {
    await this.establishConnection(this.publicSchemaConfig());
    const conn = await this.connection();
    await conn.dropDatabase(this.dbConfig.database as string);
  }

  async charset(): Promise<string> {
    return (await this.connection()).encoding();
  }

  async collation(): Promise<string> {
    return (await this.connection()).collation();
  }

  async purge(): Promise<void> {
    // `postgresql_database_tasks.rb:41` — the leased connection must go before
    // the DROP/CREATE pair, or it survives pointing at a database that no
    // longer exists. The handler spells Rails' `:all` role as "all"
    // (`connection-handler.ts:113`).
    Base.connectionHandler.clearActiveConnectionsBang("all");
    await this.drop();
    await this.create(true);
  }

  async structureDump(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    // `ActiveRecord.dump_schemas` is `DatabaseTasks.dumpSchemas` here; Ruby's
    // `:schema_search_path` / `:all` Symbols are the same strings.
    const dumpSchemas = DatabaseTasks.dumpSchemas;
    let searchPath: string | undefined;
    if (dumpSchemas === "schema_search_path") {
      const raw = this.configurationHash.schemaSearchPath;
      searchPath = typeof raw === "string" ? raw : undefined;
    } else if (dumpSchemas === "all") {
      searchPath = undefined;
    } else if (typeof dumpSchemas === "string") {
      searchPath = dumpSchemas;
    }

    const args = ["--schema-only", "--no-privileges", "--no-owner"];
    args.push("--file", filename);

    if (extraFlags) {
      args.push(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));
    }

    if (!isBlank(searchPath)) {
      for (const part of normalizeSchemaSearchPath(searchPath as string)) {
        args.push(`--schema=${part}`);
      }
    }

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
      for (const table of ignoreTables) args.push("-T", table as string);
    }

    args.push(this.dbConfig.database as string);
    await this.runCmd("pg_dump", args, "dumping");
    await this.removeSqlHeaderComments(filename);
    getFs().appendFileSync(
      filename,
      `SET search_path TO ${await (await this.connection()).schemaSearchPath()};\n\n`,
    );
  }

  async structureLoad(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    const os = await getOsAsync();
    // Ruby's `File::NULL`.
    const nullDevice = os.platform() === "win32" ? "NUL" : "/dev/null";
    const args = [
      "--set",
      ON_ERROR_STOP_1,
      "--quiet",
      "--no-psqlrc",
      "--output",
      nullDevice,
      "--file",
      filename,
    ];
    if (extraFlags) {
      args.push(...(Array.isArray(extraFlags) ? extraFlags : [extraFlags]));
    }
    args.push(this.dbConfig.database as string);
    await this.runCmd("psql", args, "loading");
  }

  static register(): void {
    DatabaseTasks.registerTask(/postgres/, PostgreSQLDatabaseTasks);
  }

  private encoding(): string {
    return String(this.configurationHash.encoding ?? defaultEncoding());
  }

  private async connection(): Promise<PostgreSQLAdapter> {
    return (await Base.connectionPool().leaseConnection()) as PostgreSQLAdapter;
  }

  private psqlEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...((globalThis as { process?: { env?: NodeJS.ProcessEnv } }).process?.env ?? {}),
    };
    const c = this.configurationHash;
    if (this.dbConfig.host) env.PGHOST = String(this.dbConfig.host);
    if (c.port != null) env.PGPORT = String(c.port);
    if (c.password != null) env.PGPASSWORD = String(c.password);
    if (c.username != null) env.PGUSER = String(c.username);
    if (c.sslmode != null) env.PGSSLMODE = String(c.sslmode);
    if (c.sslcert != null) env.PGSSLCERT = String(c.sslcert);
    if (c.sslkey != null) env.PGSSLKEY = String(c.sslkey);
    if (c.sslrootcert != null) env.PGSSLROOTCERT = String(c.sslrootcert);
    return env;
  }

  private async runCmd(cmd: string, args: string[], action: string): Promise<void> {
    const childProcess = await getChildProcessAsync();
    const result: SpawnSyncResult = childProcess.spawnSync(cmd, args, {
      env: this.psqlEnv(),
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
      // Rails leaves the child's own output on the terminal because
      // `Kernel.system` does; `spawnSync` captures it, so the captured streams
      // follow the ported message rather than replacing it.
      throw new Error(
        runCmdError(cmd, args, action) + (details.length ? `${details.join("\n\n")}\n` : ""),
      );
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

  /** @internal */
  private async establishConnection(config?: Record<string, unknown>): Promise<void> {
    // `establish_connection(config = db_config)`
    // (`postgresql_database_tasks.rb:85-87`) — the default is the db_config
    // object itself, which `Base.establish_connection` accepts.
    await Base.establishConnection(config ?? this.dbConfig);
  }

  /** @internal */
  private publicSchemaConfig(): ConfigHash {
    return { ...this.configurationHash, database: "postgres", schemaSearchPath: "public" };
  }
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

/** @internal */
export function runCmdError(cmd: string, args: string[], _action: string): string {
  return (
    `failed to execute:\n${cmd} ${args.join(" ")}\n\n` +
    `Please check the output above for any errors and make sure that \`${cmd}\` is installed in your PATH and has proper permissions.\n\n`
  );
}
