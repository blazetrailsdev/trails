import { isBlank, kernelArray, merge, Tempfile } from "@blazetrails/activesupport";
import {
  File,
  FileUtils,
  getChildProcessAsync,
  rbEqq,
  RuntimeError,
  stderr,
  stdout,
  type SpawnSyncResult,
} from "@blazetrails/ruby-compat";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import type { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import { DatabaseTasks } from "./database-tasks.js";
import { dumpSchemas } from "../active-record.js";

const DEFAULT_ENCODING_FALLBACK = "utf8";

function defaultEncoding(): string {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.CHARSET ?? DEFAULT_ENCODING_FALLBACK;
}
const ON_ERROR_STOP_1 = "ON_ERROR_STOP=1";
const SQL_COMMENT_BEGIN = "--";

type ConfigHash = Record<string, unknown>;

export class PostgreSQLDatabaseTasks {
  private readonly dbConfig: HashConfig;
  private readonly configurationHash: ConfigHash;

  static usingDatabaseConfigurations(): boolean {
    return true;
  }

  constructor(dbConfig: HashConfig) {
    this.dbConfig = dbConfig;
    this.configurationHash = { ...dbConfig.configurationHash };
  }

  async create(connectionAlreadyEstablished = false): Promise<ConnectionPool> {
    if (!connectionAlreadyEstablished) {
      await this.establishConnection(this.publicSchemaConfig());
    }
    const conn = await this.connection();
    await conn.createDatabase(
      this.dbConfig.database as string,
      merge(this.configurationHash, { encoding: this.encoding() }),
    );
    return await this.establishConnection();
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
    Base.connectionHandler.clearActiveConnectionsBang("all");
    await this.drop();
    await this.create(true);
  }

  async structureDump(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    let searchPath: string | undefined;
    if (dumpSchemas() === "schema_search_path") {
      searchPath = this.configurationHash.schemaSearchPath as string | undefined;
    } else if (dumpSchemas() === "all") {
      searchPath = undefined;
    } else if (typeof dumpSchemas() === "string") {
      searchPath = dumpSchemas();
    }

    let args = ["--schema-only", "--no-privileges", "--no-owner"];
    args.push("--file", filename);

    if (extraFlags != null) args.push(...kernelArray(extraFlags));

    if (!isBlank(searchPath)) {
      args = args.concat(
        (searchPath as string).split(",").map((part) => `--schema=${part.trim()}`),
      );
    }

    const { SchemaDumper } = await import("../schema-dumper.js");
    let ignoreTables: (string | RegExp)[] = SchemaDumper.ignoreTables;
    if (ignoreTables.length > 0) {
      const dataSources = await (await this.connection()).dataSources();
      ignoreTables = dataSources.filter((table) =>
        ignoreTables.some((pattern) => rbEqq(pattern, table)),
      );
      args = args.concat(ignoreTables.flatMap((table) => ["-T", table as string]));
    }

    args.push(this.dbConfig.database as string);
    await this.runCmd("pg_dump", args, "dumping");
    this.removeSqlHeaderComments(filename);
    const connectionSearchPath = await (await this.connection()).schemaSearchPath();
    File.open(filename, "a", (f) => f.write(`SET search_path TO ${connectionSearchPath};\n\n`));
  }

  async structureLoad(filename: string, extraFlags?: string | string[] | null): Promise<void> {
    const args = [
      "--set",
      ON_ERROR_STOP_1,
      "--quiet",
      "--no-psqlrc",
      "--output",
      File.NULL,
      "--file",
      filename,
    ];
    if (extraFlags != null) args.push(...kernelArray(extraFlags));
    args.push(this.dbConfig.database as string);
    await this.runCmd("psql", args, "loading");
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

  /** @inventedArm write — CONVERGEABLE tasks-run-cmd-through-kernel-system-inherited-stdio */
  private async runCmd(cmd: string, args: string[], action: string): Promise<void> {
    const childProcess = await getChildProcessAsync();
    const result: SpawnSyncResult = childProcess.spawnSync(cmd, args, {
      env: this.psqlEnv(),
      encoding: "utf8",
    });
    stdout.write(result.stdout ?? "");
    stderr.write(result.stderr ?? "");
    if (result.status !== 0) throw new RuntimeError(runCmdError(cmd, args, action));
  }

  private removeSqlHeaderComments(filename: string): void {
    let removingComments = true;
    const tempfile = Tempfile.open("uncommented_structure.sql");
    try {
      File.foreach(filename, (line) => {
        if (!(removingComments && (line.startsWith(SQL_COMMENT_BEGIN) || isBlank(line)))) {
          tempfile.write(line);
          removingComments = false;
        }
      });
    } finally {
      tempfile.close();
    }
    FileUtils.cp(tempfile.path()!, filename);
    tempfile.unlink();
  }

  /** @internal */
  private async establishConnection(config?: Record<string, unknown>): Promise<ConnectionPool> {
    return await Base.establishConnection(config ?? this.dbConfig);
  }

  /** @internal */
  private publicSchemaConfig(): ConfigHash {
    return merge(this.configurationHash, { database: "postgres", schemaSearchPath: "public" });
  }
}

/** @internal */
export function runCmdError(cmd: string, args: string[], _action: string): string {
  return (
    `failed to execute:\n${cmd} ${args.join(" ")}\n\n` +
    `Please check the output above for any errors and make sure that \`${cmd}\` is installed in your PATH and has proper permissions.\n\n`
  );
}

DatabaseTasks.registerTask(/postgres/, PostgreSQLDatabaseTasks);
