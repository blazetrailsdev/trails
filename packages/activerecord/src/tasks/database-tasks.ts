import type { DatabaseConfigOptions } from "../database-configurations/database-config.js";
import {
  DatabaseConfigurations,
  configurationsStore,
  setConfigurationsStore,
} from "../database-configurations.js";
import type { RawConfigurations } from "../database-configurations.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Migration, ProtectedEnvironmentError } from "../migration.js";
import { DEFAULT_ENV } from "../connection-handling.js";
import { _setRailsEnv } from "../connection-handling-slot.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { getEnv, isBlank, trailsRoot } from "@blazetrails/activesupport";
import {
  getCryptoAsync,
  getOs,
  stdout,
  stderr,
  abort,
  File,
  FileUtils,
  getPath,
} from "@blazetrails/ruby-compat";
import { NoMethodError } from "@blazetrails/activemodel";
import { ActiveRecordError, ConnectionNotDefined } from "../errors.js";
import type { Base } from "../base.js";

let _base: typeof Base | undefined;

function setModuleBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

export class DatabaseNotSupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseNotSupported";
  }
}

export type SchemaFormat = "ts" | "js" | "sql";

export class DatabaseTasks {
  static readonly LOCAL_HOSTS: readonly string[] = ["127.0.0.1", "localhost"];

  static get env(): string {
    return DEFAULT_ENV();
  }

  static set env(value: string | null) {
    _setRailsEnv(value);
  }

  static get name(): string {
    return "primary";
  }
  static get databaseConfiguration(): DatabaseConfigurations | null {
    return configurationsStore();
  }

  static set databaseConfiguration(value: DatabaseConfigurations | null) {
    setConfigurationsStore(value ?? new DatabaseConfigurations({}));
  }

  static dbDir: string = "db";
  private static _migrationsPaths: string[] = ["db/migrate"];

  static get migrationsPath(): string[] {
    return this._migrationsPaths;
  }

  static set migrationsPath(value: string[]) {
    this._migrationsPaths = value;
  }

  static get migrationsPaths(): string[] {
    return this._migrationsPaths;
  }

  static set migrationsPaths(value: string[]) {
    this._migrationsPaths = value;
  }

  static fixturesPath: string = "test/fixtures";
  private static _root: string | null = null;

  static get root(): string {
    if (this._root !== null) return this._root;
    return DatabaseTasks._resolveCwd();
  }

  private static _resolveCwd(): string {
    const proc = (globalThis as { process?: { cwd?: () => string } }).process;
    if (proc && typeof proc.cwd === "function") return proc.cwd();
    return getOs().cwd();
  }

  static set root(value: string) {
    this._root = value;
  }

  static seedLoader: { loadSeed(): void | Promise<void> } | null = null;
  static schemaFormat: SchemaFormat = "ts";
  static dumpSchemaAfterMigration: boolean = true;
  static structureDumpFlags: string | string[] | Record<string, string | string[]> | null = null;
  static structureLoadFlags: string | string[] | Record<string, string | string[]> | null = null;
  static dumpSchemas: "schema_search_path" | "all" | (string & {}) = "schema_search_path";

  private static _registeredTasks: Array<{
    pattern: RegExp | string;
    handler: DatabaseTaskHandler;
  }> = [];

  static registerTask(pattern: RegExp | string, task: DatabaseTaskHandler): void {
    this._registeredTasks.push({ pattern, handler: task });
  }

  /** @internal */
  private static classForAdapter(adapter: string | undefined): DatabaseTaskHandler {
    const task =
      adapter === undefined
        ? undefined
        : this._registeredTasks
            .slice()
            .reverse()
            .find(({ pattern }) => {
              if (typeof pattern === "string") return adapter.includes(pattern);
              pattern.lastIndex = 0;
              return pattern.test(adapter);
            })?.handler;
    if (!task) {
      throw new DatabaseNotSupported(`Rake tasks not supported by '${adapter}' adapter`);
    }
    return task;
  }

  /** @internal */
  private static databaseAdapterFor(
    dbConfig: HashConfig,
    ...args: unknown[]
  ): DatabaseTaskInstance {
    const klass = this.classForAdapter(dbConfig.adapter);
    const converted =
      typeof klass.usingDatabaseConfigurations === "function" &&
      klass.usingDatabaseConfigurations();

    const config = converted ? dbConfig : dbConfig.configurationHash;
    const ctor = klass as unknown as new (
      config: HashConfig | DatabaseConfigOptions,
      ...args: unknown[]
    ) => DatabaseTaskInstance;
    return new ctor(config, ...args);
  }

  static clearRegisteredTasks(): void {
    this._registeredTasks = [];
  }

  static async create(configuration: HashConfig | string | Record<string, unknown>): Promise<void> {
    const dbConfig = this.resolveConfiguration(configuration);
    const { DatabaseAlreadyExists } = await import("../errors.js");
    try {
      const handler = this.databaseAdapterFor(dbConfig);
      if (handler.create) {
        await handler.create();
      }
      if (isVerbose()) stdout.write(`Created database '${dbConfig.database}'\n`);
    } catch (error) {
      if (error instanceof DatabaseAlreadyExists) {
        if (isVerbose()) stderr.write(`Database '${dbConfig.database}' already exists\n`);
        return;
      }
      stderr.write(_errorToS(error) + "\n");
      stderr.write(
        `Couldn't create '${dbConfig.database}' database. Please check your configuration.\n`,
      );
      throw error;
    }
  }

  static async createAll(): Promise<void> {
    const dbConfig = this.migrationConnection().pool.dbConfig as HashConfig;

    for (const dbConfig of this.eachLocalConfiguration()) {
      await this.create(dbConfig);
    }

    await this.migrationClass().establishConnection(dbConfig);
  }

  static async createCurrent(environment?: string, name?: string): Promise<void> {
    environment = this._normalizeEnv(environment);
    for (const dbConfig of this.eachCurrentConfiguration(environment, name)) {
      await this.create(dbConfig);
    }
    await this.migrationClass().establishConnection(environment);
  }

  static async drop(configuration: HashConfig | string | Record<string, unknown>): Promise<void> {
    const dbConfig = this.resolveConfiguration(configuration);
    const { NoDatabaseError } = await import("../errors.js");
    try {
      const handler = this.databaseAdapterFor(dbConfig);
      if (handler.drop) {
        await handler.drop();
      }
      if (isVerbose()) stdout.write(`Dropped database '${dbConfig.database}'\n`);
    } catch (error) {
      if (error instanceof NoDatabaseError) {
        stderr.write(`Database '${dbConfig.database}' does not exist\n`);
        return;
      }
      stderr.write(_errorToS(error) + "\n");
      stderr.write(`Couldn't drop database '${dbConfig.database}'\n`);
      throw error;
    }
  }

  static async dropAll(): Promise<void> {
    for (const dbConfig of this.eachLocalConfiguration()) {
      await this.drop(dbConfig);
    }
  }

  static async dropCurrent(environment?: string): Promise<void> {
    for (const dbConfig of this.eachCurrentConfiguration(this._normalizeEnv(environment))) {
      await this.drop(dbConfig);
    }
  }

  static async migrate(options?: { skipInitialize?: boolean }): Promise<void>;
  static async migrate(
    version: number | string | null,
    options?: { skipInitialize?: boolean },
  ): Promise<void>;
  static async migrate(
    version: number | string | null | { skipInitialize?: boolean } = null,
    options: { skipInitialize?: boolean } = {},
  ): Promise<void> {
    if (version !== null && typeof version === "object") {
      options = version;
      version = null;
    }
    const { skipInitialize = false } = options;
    this.checkTargetVersion();
    const effectiveVersion = this.targetVersion();

    const { Migration } = await import("../migration.js");
    const scope = getEnv("SCOPE");
    const verboseWas = Migration.verbose;
    Migration.verbose = isVerbose();

    const runMigration = async (pool: ConnectionPool) => {
      const explicitVersion =
        version == null ? null : typeof version === "string" ? version.trim() || null : version;
      let filter: ((m: import("../migration.js").MigrationProxy) => boolean) | undefined;
      if (explicitVersion !== null) {
        const versionKey = String(BigInt(explicitVersion));
        filter = (m) => String(BigInt(m.version)) === versionKey;
      } else if (scope !== undefined && scope.trim() !== "") {
        filter = (m) => m.scope === scope;
      }
      const ran = await pool.migrationContext.migrate(effectiveVersion ?? null, filter);
      if (scope && scope.trim() !== "" && ran.length === 0 && Migration.verbose) {
        stdout.write(`No migrations ran. (using ${scope} scope)\n`);
      }
      (await pool.leaseConnection()).schemaCache.clearBang();
    };

    try {
      const pool = this.migrationConnectionPool();
      if (!skipInitialize) await initializeDatabase(pool.dbConfig);
      await runMigration(pool);
    } finally {
      Migration.verbose = verboseWas;
    }
  }

  private static async _migrationAdapter(): Promise<
    import("../connection-adapters/abstract-adapter.js").AbstractAdapter
  > {
    return this.migrationClass().connectionPool().leaseConnection();
  }

  static async purge(configuration: HashConfig | string | Record<string, unknown>): Promise<void> {
    const dbConfig = this.resolveConfiguration(configuration);
    const handler = this.databaseAdapterFor(dbConfig);
    if (handler.purge) {
      await handler.purge();
    }
  }

  static async purgeCurrent(environment?: string): Promise<void> {
    environment = this._normalizeEnv(environment);
    for (const dbConfig of this.eachCurrentConfiguration(environment)) {
      await this.purge(dbConfig);
    }
    await this.migrationClass().establishConnection(environment);
  }

  static async purgeAll(): Promise<void> {
    for (const dbConfig of this.eachLocalConfiguration()) {
      await this.purge(dbConfig);
    }
  }

  static async truncateAll(environment: string = DatabaseTasks.env): Promise<void> {
    for (const dbConfig of this.configsFor({ envName: environment })) {
      await this.truncateTables(dbConfig);
    }
  }

  static async charset(
    configuration: HashConfig | string | Record<string, unknown>,
  ): Promise<string | null> {
    const dbConfig = this.resolveConfiguration(configuration);
    const handler = this.databaseAdapterFor(dbConfig);
    if (!handler.charset) {
      throw new NoMethodError(
        `undefined method 'charset' for an instance of ${handler.constructor.name}`,
      );
    }
    return handler.charset();
  }

  static async charsetCurrent(
    envName: string = DatabaseTasks.env,
    dbName: string = DatabaseTasks.name,
  ): Promise<string | null> {
    const dbConfig = this.configsFor({ envName, name: dbName });
    if (!dbConfig) return null;
    return this.charset(dbConfig);
  }

  static async collation(
    configuration: HashConfig | string | Record<string, unknown>,
  ): Promise<string | null> {
    const dbConfig = this.resolveConfiguration(configuration);
    const handler = this.databaseAdapterFor(dbConfig);
    if (!handler.collation) {
      throw new NoMethodError(
        `undefined method 'collation' for an instance of ${handler.constructor.name}`,
      );
    }
    return handler.collation();
  }

  static async collationCurrent(
    envName: string = DatabaseTasks.env,
    dbName: string = DatabaseTasks.name,
  ): Promise<string | null> {
    const dbConfig = this.configsFor({ envName, name: dbName });
    if (!dbConfig) return null;
    return this.collation(dbConfig);
  }

  /** @missingRailsCall empty? — PERMANENT */
  static targetVersion(): number | null {
    const version = getEnv("VERSION");
    if (version === undefined || version === "") return null;
    const match = version.match(/^\s*(-?\d+)/);
    return match ? Number(match[1]) : 0;
  }

  static checkTargetVersion(): void {
    const version = getEnv("VERSION");
    if (this.targetVersion() !== null && !Migration.isValidVersionFormat(version ?? "")) {
      throw new Error(`Invalid format of target version: \`VERSION=${version}\``);
    }
  }

  static dumpSchemaFilename(dbConfig?: HashConfig, format?: SchemaFormat): string {
    const envSchema = getEnv("SCHEMA");
    if (envSchema !== undefined) return envSchema;
    const fmt = format ?? this.schemaFormat;
    const ext = fmt === "sql" ? "sql" : fmt;
    const base = fmt === "sql" ? "structure" : "schema";
    if (dbConfig && dbConfig.name !== "primary") {
      return `${this.dbDir}/${dbConfig.name}_${base}.${ext}`;
    }
    return `${this.dbDir}/${base}.${ext}`;
  }

  static checkSchemaFile(filename: string): void {
    if (!File.isExist(filename)) {
      let message = `${filename} doesn't exist yet. Run \`bin/rails db:migrate\` to create it, then try again.`;
      const root = trailsRoot();
      if (root != null) {
        message += ` If you do not intend to use a database, you should instead alter ${root}/config/application.rb to limit the frameworks that will be loaded.`;
      }
      abort(message);
    }
  }

  static async checkProtectedEnvironmentsBang(
    environment: string = DatabaseTasks.env,
  ): Promise<void> {
    if (getEnv("DISABLE_DATABASE_ENVIRONMENT_CHECK") !== undefined) return;

    for (const dbConfig of this.configsFor({ envName: environment })) {
      await checkCurrentProtectedEnvironmentBang(dbConfig);
    }
  }

  /** @internal */
  static configsFor(options: {
    envName?: string;
    name: string;
    includeHidden?: boolean;
  }): HashConfig | undefined;
  /** @internal */
  static configsFor(options?: {
    envName?: string;
    name?: undefined;
    includeHidden?: boolean;
  }): HashConfig[];
  /** @internal */
  static configsFor(
    options: { envName?: string; name?: string; includeHidden?: boolean } = {},
  ): HashConfig[] | HashConfig | undefined {
    return baseClass()
      .configurations()
      .configsFor(options as { name: string });
  }

  /** @internal */
  private static resolveConfiguration(configuration: unknown): HashConfig {
    return baseClass().configurations().resolve(configuration);
  }

  /** @internal */
  private static eachCurrentConfiguration(environment: string, name?: string): HashConfig[] {
    const results: HashConfig[] = [];
    for (const env of eachCurrentEnvironment(environment)) {
      for (const dbConfig of this.configsFor({ envName: env })) {
        if (name != null && name !== dbConfig.name) continue;
        results.push(dbConfig);
      }
    }
    return results;
  }

  private static _normalizeEnv(environment?: string): string {
    const trimmed = environment?.trim();
    return trimmed || this.env;
  }

  /** @internal */
  static eachLocalConfiguration(): HashConfig[] {
    const result: HashConfig[] = [];
    for (const dbConfig of configurationsStore().configsFor()) {
      if (!dbConfig.database) continue;
      if (this.isLocalDatabase(dbConfig)) {
        result.push(dbConfig);
      } else {
        stderr.write(
          `This task only modifies local databases. ${dbConfig.database} is on a remote host.\n`,
        );
      }
    }
    return result;
  }

  /** @internal */
  private static isLocalDatabase(dbConfig: HashConfig): boolean {
    const host = dbConfig.host;
    return isBlank(host) || this.LOCAL_HOSTS.includes(host as string);
  }

  static cacheDumpFilename(dbConfig: HashConfig, options?: { schemaCachePath?: string }): string {
    return (
      options?.schemaCachePath ||
      dbConfig.schemaCachePath ||
      dbConfig.defaultSchemaCachePath(this.dbDir)
    );
  }

  static async dumpSchemaCache(connOrPool: unknown, filename: string): Promise<void> {
    const reflection = (connOrPool as { schemaCache?: { dumpTo?: unknown; addAll?: unknown } })
      ?.schemaCache;
    if (
      reflection &&
      typeof (reflection as { dumpTo?: unknown }).dumpTo === "function" &&
      typeof (reflection as { addAll?: unknown }).addAll !== "function"
    ) {
      await (reflection as { dumpTo: (f: string) => Promise<void> }).dumpTo(filename);
      return;
    }

    const required = ["dataSources", "columns", "primaryKey", "indexes"] as const;
    const assertSupported = (connection: unknown): void => {
      const missing = required.filter(
        (m) => typeof (connection as Record<string, unknown>)[m] !== "function",
      );
      if (missing.length > 0) {
        throw new Error(
          `dumpSchemaCache requires the connection to implement [${missing.join(", ")}]. ` +
            `The adapter isn't exposing the schema introspection API that ` +
            `SchemaCache.addAll needs to populate a cache dump.`,
        );
      }
    };
    const maybePool = connOrPool as {
      withConnection?: <T>(cb: (connection: unknown) => T | Promise<T>) => Promise<T> | T;
    };
    if (typeof maybePool.withConnection === "function") {
      await maybePool.withConnection((connection: unknown) => {
        assertSupported(connection);
      });
    } else {
      assertSupported(connOrPool);
    }

    const { SchemaCache } = await import("../connection-adapters/schema-cache.js");
    const fresh = new SchemaCache();
    await fresh.addAll(connOrPool);
    await fresh.dumpTo(filename);
  }

  static clearSchemaCache(filename: string): void {
    FileUtils.rmF(filename, { verbose: false });
  }

  static async structureDump(
    configuration: HashConfig | string | Record<string, unknown>,
    ...args: unknown[]
  ): Promise<void> {
    const dbConfig = this.resolveConfiguration(configuration);
    const filename = args.shift() as string;
    const flags = this.structureDumpFlagsFor(dbConfig.adapter);
    const handler = this.databaseAdapterFor(dbConfig, ...args);
    if (!handler.structureDump) {
      throw new Error(`Adapter '${dbConfig.adapter}' does not support structureDump`);
    }
    await handler.structureDump(filename, flags);
  }

  static async structureLoad(
    configuration: HashConfig | string | Record<string, unknown>,
    ...args: unknown[]
  ): Promise<void> {
    const dbConfig = this.resolveConfiguration(configuration);
    const filename = args.shift() as string;
    const flags = this.structureLoadFlagsFor(dbConfig.adapter);
    const handler = this.databaseAdapterFor(dbConfig, ...args);
    if (!handler.structureLoad) {
      throw new Error(`Adapter '${dbConfig.adapter}' does not support structureLoad`);
    }
    await handler.structureLoad(filename, flags);
  }

  /** @internal */
  private static structureDumpFlagsFor(adapter: string | undefined): string | string[] | null {
    const structureDumpFlags = this.structureDumpFlags;
    if (
      structureDumpFlags !== null &&
      !Array.isArray(structureDumpFlags) &&
      typeof structureDumpFlags === "object"
    ) {
      return adapter === undefined ? null : (structureDumpFlags[adapter] ?? null);
    }
    return structureDumpFlags;
  }

  /** @internal */
  private static structureLoadFlagsFor(adapter: string | undefined): string | string[] | null {
    const structureLoadFlags = this.structureLoadFlags;
    if (
      structureLoadFlags !== null &&
      !Array.isArray(structureLoadFlags) &&
      typeof structureLoadFlags === "object"
    ) {
      return adapter === undefined ? null : (structureLoadFlags[adapter] ?? null);
    }
    return structureLoadFlags;
  }

  static schemaDumpPath(dbConfig?: HashConfig, format?: SchemaFormat): string | null {
    const envSchema = getEnv("SCHEMA");
    if (envSchema !== undefined) return envSchema;

    const rawCfg = (dbConfig as unknown as { configurationHash?: Record<string, unknown> })
      ?.configurationHash;
    const hasExplicitSchemaDump =
      rawCfg != null && Object.hasOwn(rawCfg, "schemaDump") && rawCfg["schemaDump"] !== undefined;

    if (!hasExplicitSchemaDump) {
      return this.dumpSchemaFilename(dbConfig, format);
    }

    const cfgWithDump = dbConfig as unknown as { schemaDump?: (format?: string) => string | null };
    if (typeof cfgWithDump?.schemaDump !== "function") {
      return this.dumpSchemaFilename(dbConfig, format);
    }
    const fmt = (format ?? this.schemaFormat) === "js" ? "ts" : (format ?? this.schemaFormat);
    const filename = cfgWithDump.schemaDump(fmt);
    if (filename == null) return null;

    if (File.dirname(filename) === this.dbDir) return filename;
    return File.join(this.dbDir, filename);
  }

  /** @internal */
  static _resolveSchemaPath(filename: string): string {
    return File.isAbsolutePath(filename) ? filename : File.expandPath(filename, this.root);
  }

  static async dumpSchema(
    dbConfig: HashConfig,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
  ): Promise<void> {
    const rawFilename = this.schemaDumpPath(dbConfig, format);
    if (rawFilename == null) return;
    const filename = this._resolveSchemaPath(rawFilename);
    FileUtils.mkdirP(File.dirname(filename));
    if (format !== "sql") {
      const { SchemaDumper } = await import("../connection-adapters/abstract/schema-dumper.js");
      const languageWas = SchemaDumper.language;
      SchemaDumper.language = format === "js" ? "js" : "ts";
      try {
        const migrationConnectionPool = this.migrationConnectionPool();
        const file: string[] = [];
        await SchemaDumper.dump(migrationConnectionPool, file);
        File.open(filename, "w", (f) => f.write(file.join("\n")));
      } finally {
        SchemaDumper.language = languageWas;
      }
    } else {
      await this.structureDump(dbConfig, filename);
      await this._appendSchemaInformation(filename);
    }
  }

  /** @missingRailsCall load — PERMANENT */
  static async loadSchema(
    dbConfig: HashConfig,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
  ): Promise<void> {
    file ??= this.schemaDumpPath(dbConfig, format) ?? undefined;
    if (file == null) return;

    const { Migration } = await import("../migration.js");
    const verboseWas = Migration.verbose;
    Migration.verbose = isVerbose() && getEnv("VERBOSE") !== undefined;
    try {
      this.checkSchemaFile(file);

      if (format === "sql") {
        await this.structureLoad(dbConfig, file);
        await this._stampSchemaSha1(dbConfig, file);
        return;
      }

      const path = getPath();
      if (!path.pathToFileURL) {
        throw new Error(
          "DatabaseTasks.loadSchema requires PathAdapter.pathToFileURL. " +
            "The configured PathAdapter does not provide it.",
        );
      }
      const absolute = this._resolveSchemaPath(file);
      const href = path.pathToFileURL(absolute).href;
      const mod = (await import(href)) as {
        default?: (ctx: unknown) => Promise<void> | void;
        defineParams?: { version?: string | number };
      };
      const defineSchema =
        mod.default ?? (mod as unknown as (ctx: unknown) => Promise<void> | void);
      if (typeof defineSchema !== "function") {
        throw new Error(`Schema file must export a default function (got ${typeof defineSchema})`);
      }
      const { Schema } = await import("../schema.js");
      await Schema.define(mod.defineParams ?? {}, (schema) => defineSchema(schema.connection));
      await this._stampSchemaSha1(dbConfig, absolute);
    } finally {
      Migration.verbose = verboseWas;
    }
  }

  private static async _stampSchemaSha1(dbConfig: HashConfig, filename: string): Promise<void> {
    if (!dbConfig.useMetadataTable) return;
    try {
      const adapter = await this._migrationAdapter();
      const { InternalMetadata } = await import("../internal-metadata.js");
      const metadata = new InternalMetadata(adapter.pool);
      const sha1 = await this.schemaSha1(filename);
      await metadata.createTableAndSetFlags(dbConfig.envName, sha1);
    } catch (error) {
      console.debug?.(
        `[trails] _stampSchemaSha1 failed for ${dbConfig.envName} (${filename})`,
        error,
      );
    }
  }

  static async loadSchemaCurrent(
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
    environment?: string,
  ): Promise<void> {
    for (const dbConfig of this.eachCurrentConfiguration(this._normalizeEnv(environment))) {
      await this.withTemporaryConnection(dbConfig, async () => {
        await this.loadSchema(dbConfig, format, file);
      });
    }
  }

  static async loadSeed(): Promise<void> {
    if (!this.seedLoader) {
      throw new Error(
        "You tried to load seed data, but no seed loader is specified. " +
          "Set DatabaseTasks.seedLoader = { loadSeed() { ... } }",
      );
    }
    await this.seedLoader.loadSeed();
  }

  static async migrateStatus(): Promise<void> {
    if (!(await this.migrationConnectionPool().schemaMigration.tableExists())) {
      abort("Schema migrations table does not exist yet.");
    }
    const rows = await this.migrationConnectionPool().migrationContext.migrationsStatus();
    const center = (s: string, w: number) => {
      const pad = w - s.length;
      const left = Math.floor(pad / 2);
      return " ".repeat(left) + s + " ".repeat(pad - left);
    };
    const puts = (s = "") => stdout.write(s + "\n");
    puts(`\ndatabase: ${this.migrationConnectionPool().dbConfig.database}\n`);
    puts(`${center("Status", 8)}  ${"Migration ID".padEnd(14)}  Migration Name`);
    puts("-".repeat(50));
    for (const row of rows) {
      puts(`${center(row.status, 8)}  ${row.version.padEnd(14)}  ${row.name}`);
    }
    puts();
  }

  static async migrateAll(): Promise<void> {
    const configs = baseClass().configurations().configsFor({ envName: this._normalizeEnv() });

    for (const dbConfig of configs) {
      await initializeDatabase(dbConfig);
    }

    if (configs.length === 1 && (configs[0] as { isPrimary?(): boolean }).isPrimary?.()) {
      await this.migrate({ skipInitialize: true });
      return;
    }

    const mappedVersions = await this.dbConfigsWithVersions();
    const sorted = Array.from(mappedVersions.entries()).sort(([a], [b]) =>
      BigInt(String(a)) < BigInt(String(b)) ? -1 : BigInt(String(a)) > BigInt(String(b)) ? 1 : 0,
    );
    for (const [version, dbConfigs] of sorted) {
      for (const dbConfig of dbConfigs) {
        await this.withTemporaryConnection(dbConfig, async () => {
          await this.migrate(version, { skipInitialize: true });
        });
      }
    }
  }

  static async prepareAll(): Promise<void> {
    const env = this._normalizeEnv();
    let seed = false;
    const dumpDbConfigs: HashConfig[] = [];

    for (const dbConfig of this.eachCurrentConfiguration(env)) {
      const databaseInitialized = await initializeDatabase(dbConfig);
      if (databaseInitialized && dbConfig.seeds) seed = true;
    }

    for (const environment of eachCurrentEnvironment(env)) {
      const mappedVersions = await this.dbConfigsWithVersions(environment);
      const sorted = Array.from(mappedVersions.entries()).sort(([a], [b]) =>
        BigInt(String(a)) < BigInt(String(b)) ? -1 : BigInt(String(a)) > BigInt(String(b)) ? 1 : 0,
      );
      for (const [version, dbConfigs] of sorted) {
        for (const dbConfig of dbConfigs) {
          if (!dumpDbConfigs.includes(dbConfig)) dumpDbConfigs.push(dbConfig);
          await this.withTemporaryPool(dbConfig, async (pool) => {
            await pool.migrationContext.migrate(version ?? null);
          });
        }
      }
    }

    if (this.dumpSchemaAfterMigration) {
      for (const dbConfig of dumpDbConfigs) {
        await this.withTemporaryPool(dbConfig, async () => {
          await this.dumpSchema(dbConfig);
        });
      }
    }

    if (seed && this.seedLoader) await this.loadSeed();
  }

  static async dbConfigsWithVersions(
    environment?: string,
  ): Promise<Map<string | number, HashConfig[]>> {
    const dbConfigsWithVersions = new Map<string | number, HashConfig[]>();
    environment = this._normalizeEnv(environment);
    await this.withTemporaryPoolForEach({ env: environment }, async (pool) => {
      const dbConfig = pool.dbConfig;
      const versionsToRun = await pool.migrationContext.pendingMigrationVersions();
      const targetVersion = this.targetVersion();
      for (const version of versionsToRun) {
        if (targetVersion !== null && targetVersion !== Number(version)) continue;
        const list = dbConfigsWithVersions.get(version) ?? [];
        list.push(dbConfig);
        dbConfigsWithVersions.set(version, list);
      }
    });
    return dbConfigsWithVersions;
  }

  /** @internal */
  static async withTemporaryPool<T>(
    dbConfig: HashConfig,
    fn: (pool: ConnectionPool) => Promise<T>,
    { clobber = false }: { clobber?: boolean } = {},
  ): Promise<T> {
    const migrationClass = this.migrationClass();
    const originalDbConfig = migrationClass.connectionDbConfig();
    try {
      const pool = migrationClass.connectionHandler.establishConnection(dbConfig, {
        clobber,
      });
      await pool.adapterReady;
      return await fn(pool);
    } finally {
      await migrationClass.connectionHandler.establishConnection(originalDbConfig, {
        clobber,
      }).adapterReady;
    }
  }

  static async withTemporaryConnection<T>(
    dbConfig: HashConfig,
    fn: (
      adapter: import("../connection-adapters/abstract-adapter.js").AbstractAdapter,
    ) => Promise<T>,
    { clobber = false }: { clobber?: boolean } = {},
  ): Promise<T> {
    return this.withTemporaryPool(dbConfig, async (pool) => fn(await pool.leaseConnection()), {
      clobber,
    });
  }

  static async withTemporaryPoolForEach(
    { env, name, clobber = false }: { env?: string; name?: string; clobber?: boolean } = {},
    block: (pool: ConnectionPool) => Promise<void>,
  ): Promise<void> {
    env = this._normalizeEnv(env);
    if (name != null) {
      const dbConfig = this.migrationClass().configurations().configsFor({ envName: env, name });
      if (dbConfig) await this.withTemporaryPool(dbConfig, block, { clobber });
    } else {
      for (const dbConfig of this.migrationClass()
        .configurations()
        .configsFor({ envName: env, name })) {
        await this.withTemporaryPool(dbConfig, block, { clobber });
      }
    }
  }

  static migrationClass(): typeof Base {
    return baseClass();
  }

  /** @internal */
  static _registerBase(base: typeof import("../base.js").Base): void {
    setModuleBase(base);
  }

  static migrationConnection(): import("../connection-adapters/abstract-adapter.js").AbstractAdapter {
    return this.migrationClass().connectionPool().leaseConnectionSync();
  }

  static migrationConnectionPool(): ConnectionPool {
    return this.migrationClass().connectionPool();
  }

  static async schemaUpToDate(
    configuration: unknown,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
  ): Promise<boolean> {
    void format;
    const dbConfig = this.resolveConfiguration(configuration);
    file ??= this.schemaDumpPath(dbConfig) ?? undefined;
    if (!file) return true;
    if (!File.isExist(file)) return true;

    return await this.withTemporaryPool(dbConfig, async (pool) => {
      const internalMetadata = pool.internalMetadata;
      if (internalMetadata.enabled == null || internalMetadata.enabled === false) return false;
      if (!(await internalMetadata.tableExists())) return false;

      return (await internalMetadata.get("schema_sha1")) === (await this.schemaSha1(file));
    });
  }

  /** @internal */
  private static async schemaSha1(file: string): Promise<string> {
    const bytes = File.read(file);
    const crypto = await getCryptoAsync();
    const hash = crypto.createHash("sha1");
    hash.update(bytes);
    return hash.digest("hex");
  }

  private static async _appendSchemaInformation(filename: string): Promise<void> {
    let adapter: import("../connection-adapters/abstract-adapter.js").AbstractAdapter;
    try {
      adapter = await this._migrationAdapter();
    } catch (error) {
      if (error instanceof ConnectionNotDefined) return;
      throw error;
    }

    const { SchemaMigration } = await import("../schema-migration.js");
    const migration = new SchemaMigration(adapter.pool);
    if (!(await migration.tableExists())) return;

    const versions = await migration.allVersions();
    if (versions.length === 0) return;

    const quotedTable = adapter.quoteTableName(migration.tableName);
    const quoted = versions
      .slice()
      .reverse()
      .map((v) => `('${String(v).replace(/'/g, "''")}')`)
      .join(",\n");
    const insertSql = `\nINSERT INTO ${quotedTable} (version) VALUES\n${quoted};\n`;
    File.open(filename, "a", (f) => f.write(insertSql));
  }

  static setupInitialDatabaseYaml(): Record<string, unknown> {
    return {};
  }

  static forEach(databases: RawConfigurations | HashConfig[], fn: (name: string) => void): void {
    const databaseConfigs = new DatabaseConfigurations(databases).configsFor({
      envName: this.env,
    });

    if (databaseConfigs.length === 1) return;

    for (const dbConfig of databaseConfigs) {
      if (dbConfig instanceof HashConfig && !dbConfig.databaseTasks()) continue;

      fn(dbConfig.name);
    }
  }

  static raiseForMultiDb(environment: string | undefined, opts: { command: string }): void {
    environment ??= DatabaseTasks.env;
    const configs = this.configsFor({ envName: environment });
    if (configs.length > 1) {
      const list = configs.map((c) => `${opts.command}:${c.name}`).join(", ");
      throw new Error(
        `You're using a multiple database application. To use \`${opts.command}\` you must ` +
          `run the namespaced task with a VERSION. Available tasks are ${list}.`,
      );
    }
  }

  /** @internal */
  static async truncateTables(dbConfig: HashConfig): Promise<void> {
    await this.withTemporaryConnection(dbConfig, async (conn) => {
      await conn.truncateTables(...(await conn.tables()));
    });
  }

  static async reconstructFromSchema(
    dbConfig: HashConfig,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
  ): Promise<void> {
    file ??= this.schemaDumpPath(dbConfig, format) ?? undefined;
    if (file !== undefined) this.checkSchemaFile(file);

    const { NoDatabaseError } = await import("../errors.js");
    await this.withTemporaryPool(
      dbConfig,
      async () => {
        try {
          if (await this.schemaUpToDate(dbConfig, format, file)) {
            if (getEnv("SKIP_TEST_DATABASE_TRUNCATE") === undefined) {
              await this.truncateTables(dbConfig);
            }
          } else {
            await this.purge(dbConfig);
            await this.loadSchema(dbConfig, format, file);
          }
        } catch (error) {
          if (!(error instanceof NoDatabaseError)) throw error;
          await this.create(dbConfig);
          await this.loadSchema(dbConfig, format, file);
        }
      },
      { clobber: true },
    );
  }
}

export interface DatabaseTaskInstance {
  create?(): Promise<void>;
  drop?(): Promise<void>;
  purge?(): Promise<void>;
  charset?(): Promise<string | null>;
  collation?(): Promise<string | null>;
  structureDump?(filename: string, flags?: string | string[] | null): Promise<void>;
  structureLoad?(filename: string, flags?: string | string[] | null): Promise<void>;
}

export interface DatabaseTaskHandler {
  new (...args: never[]): DatabaseTaskInstance;
  usingDatabaseConfigurations?(): boolean;
}

function _errorToS(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** @internal */
export function isVerbose(): boolean {
  const v = getEnv("VERBOSE");
  return v !== undefined ? v !== "false" : true;
}

export function metadataTableNames(): Set<string> {
  const base = baseClass();
  const prefix = base.tableNamePrefix;
  const suffix = base.tableNameSuffix;
  return new Set([
    `${prefix}${base.schemaMigrationsTableName}${suffix}`,
    `${prefix}${base.internalMetadataTableName}${suffix}`,
  ]);
}

/** @internal */
export function eachCurrentEnvironment(environment: string): string[] {
  const envs = [environment];
  if (
    environment === "development" &&
    getEnv("SKIP_TEST_DATABASE") === undefined &&
    getEnv("DATABASE_URL") === undefined
  ) {
    envs.push("test");
  }
  return envs;
}

/** @internal */
export async function checkCurrentProtectedEnvironmentBang(dbConfig: HashConfig): Promise<void> {
  const { NoDatabaseError } = await import("../errors.js");
  const { EnvironmentMismatchError } = await import("../migration.js");
  await DatabaseTasks.withTemporaryPool(dbConfig, async (pool) => {
    try {
      const migrationContext = pool.migrationContext;
      const current = migrationContext.currentEnvironment;
      const stored = await migrationContext.lastStoredEnvironment();

      if (await migrationContext.protectedEnvironment()) {
        throw new ProtectedEnvironmentError(stored!);
      }

      if (stored && stored !== current) {
        throw new EnvironmentMismatchError({ current, stored });
      }
    } catch (error) {
      if (error instanceof NoDatabaseError) return;
      throw error;
    }
  });
}

/** @internal */
export async function initializeDatabase(dbConfig: HashConfig): Promise<boolean> {
  const { NoDatabaseError } = await import("../errors.js");
  const { SchemaMigration } = await import("../schema-migration.js");
  return DatabaseTasks.withTemporaryPool(dbConfig, async (pool) => {
    let alreadyInitialized: boolean | null = false;
    for (;;) {
      try {
        const adapter = await pool.leaseConnection();
        await adapter.execute("SELECT 1");
        const sm = new SchemaMigration(adapter.pool);
        alreadyInitialized = await sm.tableExists();
        break;
      } catch (error) {
        if (!(error instanceof NoDatabaseError)) throw error;
        await DatabaseTasks.create(dbConfig);
      }
    }
    if (!alreadyInitialized) {
      const rawPath = DatabaseTasks.schemaDumpPath(dbConfig);
      if (rawPath) {
        const resolved = DatabaseTasks._resolveSchemaPath(rawPath);
        if (File.isExist(resolved)) {
          await DatabaseTasks.loadSchema(dbConfig, DatabaseTasks.schemaFormat, undefined);
        }
      }
    }
    return !alreadyInitialized;
  });
}
