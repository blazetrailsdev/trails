/**
 * DatabaseTasks — coordinates database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::DatabaseTasks
 */

import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { ProtectedEnvironmentError } from "../migration.js";
import { getFs, getPath, getCrypto, getOs } from "@blazetrails/activesupport";
import { coercePort } from "./task-utils.js";

function sqliteDatabaseFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname);
    const host = parsed.host;
    const resolved = host ? `${host}${pathname}` : pathname;
    return resolved || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Schema file format.
 *
 * - `"ts"`: TypeScript DSL module (`db/schema.ts`), default.
 * - `"js"`: JavaScript DSL module (`db/schema.js`) — for projects without a
 *   TypeScript toolchain at runtime.
 * - `"sql"`: Native SQL structure dump (`db/structure.sql`), via the
 *   adapter's `structureDump`/`structureLoad`.
 *
 * Mirrors Rails' `ActiveRecord.schema_format` (`:ruby | :sql`) but swaps
 * Ruby for TS/JS since trails has no Ruby runtime.
 */
export type SchemaFormat = "ts" | "js" | "sql";

export class DatabaseTasks {
  static get env(): string {
    return DatabaseConfigurations.defaultEnv;
  }

  static set env(value: string) {
    DatabaseConfigurations.defaultEnv = value;
  }

  static get name(): string {
    return "primary";
  }
  static databaseConfiguration: DatabaseConfigurations | null = null;
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

  /**
   * Resolve the process's current working directory.
   *
   * Tries the fast synchronous fallback first (`globalThis.process.cwd()`)
   * so the sync `root` getter works under Node ESM — where the sync
   * `getOs()` auto-register can't synchronously pull in `node:os`. Falls
   * through to `getOs().cwd()` only if `process` isn't available, so
   * custom OsAdapters (e.g. browser / VFS) can still supply a logical
   * root.
   */
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
  static structureDumpFlags: string | string[] | Record<string, string | string[]> | null = null;
  static structureLoadFlags: string | string[] | Record<string, string | string[]> | null = null;

  private static _registeredTasks: Array<{
    pattern: RegExp | string;
    handler: DatabaseTaskHandler;
  }> = [];

  static registerTask(pattern: RegExp | string, handler: DatabaseTaskHandler): void {
    this._registeredTasks.push({ pattern, handler });
  }

  static resolveTask(adapter: string): DatabaseTaskHandler | undefined {
    for (let i = this._registeredTasks.length - 1; i >= 0; i--) {
      const { pattern, handler } = this._registeredTasks[i];
      if (typeof pattern === "string") {
        if (adapter.startsWith(pattern)) return handler;
      } else {
        pattern.lastIndex = 0;
        if (pattern.test(adapter)) return handler;
      }
    }
    return undefined;
  }

  private static _resolveTaskOrThrow(adapter: string): DatabaseTaskHandler {
    const handler = this.resolveTask(adapter);
    if (!handler) {
      throw new Error(
        `No database task handler registered for adapter '${adapter}'. ` +
          `Register one with DatabaseTasks.registerTask().`,
      );
    }
    return handler;
  }

  private static _adapterFor(config: DatabaseConfig): string {
    const adapter = config.adapter;
    if (!adapter) {
      throw new Error("database configuration does not specify adapter");
    }
    return adapter;
  }

  static clearRegisteredTasks(): void {
    this._registeredTasks = [];
  }

  static async create(config: DatabaseConfig): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.create) {
      await handler.create(config);
    }
  }

  static async createAll(): Promise<void> {
    if (!this.databaseConfiguration) return;
    const configs = this.eachLocalConfiguration();
    for (const config of configs) {
      await this.create(config);
    }
  }

  static async createCurrent(environment?: string): Promise<void> {
    const envs = this._environmentsFor(environment);
    for (const env of envs) {
      const configs = this.configsFor(env);
      for (const config of configs) {
        await this.create(config);
      }
    }
  }

  static async drop(config: DatabaseConfig): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.drop) {
      await handler.drop(config);
    }
  }

  static async dropAll(): Promise<void> {
    if (!this.databaseConfiguration) return;
    const configs = this.eachLocalConfiguration();
    for (const config of configs) {
      await this.checkProtectedEnvironmentsBang(config.envName);
    }
    for (const config of configs) {
      await this.drop(config);
    }
  }

  static async dropCurrent(environment?: string): Promise<void> {
    const envs = this._environmentsFor(environment);
    for (const env of envs) {
      await this.checkProtectedEnvironmentsBang(env);
      const configs = this.configsFor(env);
      for (const config of configs) {
        await this.drop(config);
      }
    }
  }

  private static _migrations: Array<import("../migration.js").MigrationProxy> = [];

  static registerMigrations(migrations: Array<import("../migration.js").MigrationProxy>): void {
    this._migrations = migrations;
  }

  static async migrate(version?: number | string): Promise<void> {
    const raw = version ?? this.targetVersion();
    const effectiveVersion = typeof raw === "string" ? raw.trim() || null : raw;
    this.checkTargetVersion(effectiveVersion ?? undefined);

    if (!this.databaseConfiguration) return;
    const configs = this.configsFor(this._normalizeEnv());
    if (configs.length === 0) return;

    const config = configs.find((c) => c.name === "primary") ?? configs[0];
    const { Migrator } = await import("../migration.js");
    const adapter = await this._resolveAdapter(config);
    if (!adapter) {
      throw new Error("No database adapter configured. Call DatabaseTasks.setAdapter() first.");
    }

    const migrator = new Migrator(adapter, this._migrations);
    await migrator.migrate(effectiveVersion ?? null);
  }

  private static _adapterInstance: import("../adapter.js").DatabaseAdapter | null = null;

  static setAdapter(adapter: import("../adapter.js").DatabaseAdapter | null): void {
    this._adapterInstance = adapter;
  }

  private static async _resolveAdapter(
    _config: DatabaseConfig,
  ): Promise<import("../adapter.js").DatabaseAdapter | null> {
    return this._adapterInstance;
  }

  static async purge(config: DatabaseConfig): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.purge) {
      await handler.purge(config);
    }
  }

  static async purgeCurrent(environment?: string): Promise<void> {
    await this.checkProtectedEnvironmentsBang(environment);
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    for (const config of configs) {
      await this.purge(config);
    }
  }

  static async purgeAll(): Promise<void> {
    if (!this.databaseConfiguration) return;
    const configs = this.eachLocalConfiguration();
    for (const config of configs) {
      await this.checkProtectedEnvironmentsBang(config.envName);
    }
    for (const config of configs) {
      await this.purge(config);
    }
  }

  static async truncateAll(environment?: string): Promise<void> {
    await this.checkProtectedEnvironmentsBang(environment);
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    for (const config of configs) {
      const handler = this._resolveTaskOrThrow(this._adapterFor(config));
      if (handler.truncateAll) {
        await handler.truncateAll(config);
      }
    }
  }

  static async charset(config: DatabaseConfig): Promise<string | null> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    return handler.charset ? handler.charset(config) : null;
  }

  static async charsetCurrent(environment?: string): Promise<string | null> {
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    if (configs.length === 0) return null;
    const primary = configs.find((c) => c.name === "primary") ?? configs[0];
    return this.charset(primary);
  }

  static async collation(config: DatabaseConfig): Promise<string | null> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.collation) {
      return handler.collation(config);
    }
    return null;
  }

  static async collationCurrent(environment?: string): Promise<string | null> {
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    if (configs.length === 0) return null;
    const primary = configs.find((c) => c.name === "primary") ?? configs[0];
    return this.collation(primary);
  }

  static targetVersion(): number | null {
    const version = process.env.VERSION;
    if (!version) return null;
    const str = version.trim();
    if (str === "" || !/^\d+$/.test(str)) return null;
    return parseInt(str, 10);
  }

  static checkTargetVersion(version?: number | string): void {
    const v = version ?? process.env.VERSION;
    if (v === undefined || v === null || String(v).trim() === "") return;
    const str = String(v).trim();
    if (!/^\d+$/.test(str)) {
      throw new Error(`Invalid format of target version: '${str}'`);
    }
  }

  static dumpSchemaFilename(config?: DatabaseConfig): string {
    const envSchema = process.env.SCHEMA?.trim();
    if (envSchema) return envSchema;
    const format = this.schemaFormat;
    const ext = format === "sql" ? "sql" : format;
    const base = format === "sql" ? "structure" : "schema";
    if (config && config.name !== "primary") {
      return `${this.dbDir}/${config.name}_${base}.${ext}`;
    }
    return `${this.dbDir}/${base}.${ext}`;
  }

  static checkSchemaFile(filename: string): void {
    if (!filename || filename.trim() === "") {
      throw new Error("Schema file not specified");
    }
  }

  static async checkProtectedEnvironmentsBang(environment?: string): Promise<void> {
    const env = this._normalizeEnv(environment);
    const { Base } = await import("../base.js");
    const protectedEnvs = Base.protectedEnvironments;
    if (protectedEnvs.includes(env)) {
      throw new ProtectedEnvironmentError(env);
    }
  }

  static configsFor(environment: string): DatabaseConfig[] {
    if (!this.databaseConfiguration) return [];
    return this.databaseConfiguration.configsFor({ envName: environment });
  }

  private static _normalizeEnv(environment?: string): string {
    const trimmed = environment?.trim();
    return trimmed || this.env;
  }

  static eachLocalConfiguration(): DatabaseConfig[] {
    if (!this.databaseConfiguration) return [];
    return this.databaseConfiguration.configurations.filter((c) => {
      if (!c.database) return false;
      const host = c.host;
      return !host || host === "localhost" || host === "127.0.0.1" || host === "::1";
    });
  }

  static cacheDumpFilename(
    dbConfig: DatabaseConfig,
    options?: { schemaCachePath?: string },
  ): string {
    const explicit = options?.schemaCachePath;
    if (explicit) return explicit;

    const configPath =
      typeof (dbConfig as any).schemaCachePath === "function"
        ? (dbConfig as any).schemaCachePath()
        : (dbConfig as any).schemaCachePath;
    if (configPath) return configPath;

    const configDefault =
      typeof (dbConfig as any).defaultSchemaCachePath === "function"
        ? (dbConfig as any).defaultSchemaCachePath(this.dbDir)
        : null;
    if (configDefault) return configDefault;

    return `${this.dbDir}/schema_cache.json`;
  }

  static async dumpSchemaCache(connOrPool: unknown, filename: string): Promise<void> {
    const schemaCache = (connOrPool as any).schemaCache;
    if (schemaCache && typeof schemaCache.dumpTo === "function") {
      await schemaCache.dumpTo(filename);
    }
  }

  static clearSchemaCache(filename: string): void {
    const fs = getFs();
    try {
      fs.unlinkSync(filename);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
  }

  private static _environmentsFor(environment?: string): string[] {
    const env = this._normalizeEnv(environment);
    if (!environment?.trim() && env === "development") {
      return ["development", "test"];
    }
    return [env];
  }

  static async structureDump(
    config: DatabaseConfig,
    filename: string,
    extraFlags?: string | string[] | null,
  ): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (!handler.structureDump) {
      throw new Error(`Adapter '${this._adapterFor(config)}' does not support structureDump`);
    }
    const flags = extraFlags ?? this._flagsFor(this.structureDumpFlags, config.adapter);
    await handler.structureDump(config, filename, flags);
  }

  static async structureLoad(
    config: DatabaseConfig,
    filename: string,
    extraFlags?: string | string[] | null,
  ): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (!handler.structureLoad) {
      throw new Error(`Adapter '${this._adapterFor(config)}' does not support structureLoad`);
    }
    const flags = extraFlags ?? this._flagsFor(this.structureLoadFlags, config.adapter);
    await handler.structureLoad(config, filename, flags);
  }

  private static _flagsFor(
    source: typeof DatabaseTasks.structureDumpFlags,
    adapter?: string,
  ): string | string[] | null {
    if (!source) return null;
    if (Array.isArray(source) || typeof source === "string") return source;
    if (adapter && typeof source === "object" && adapter in source) {
      const value = (source as Record<string, string | string[]>)[adapter];
      return value;
    }
    return null;
  }

  static schemaDumpPath(config?: DatabaseConfig): string {
    return this.dumpSchemaFilename(config);
  }

  static async dumpSchema(config: DatabaseConfig): Promise<void> {
    const filename = this.schemaDumpPath(config);
    if (this.schemaFormat === "sql") {
      const fs = getFs();
      const path = getPath();
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      await this.structureDump(config, filename);
      return;
    }
    const { SchemaDumper } = await import("../schema-dumper.js");
    const adapter = this._adapterInstance;
    if (!adapter) {
      throw new Error("No adapter available for schema dump. Call DatabaseTasks.setAdapter first.");
    }
    const fs = getFs();
    const path = getPath();
    const dir = path.dirname(filename);
    fs.mkdirSync(dir, { recursive: true });
    const language = this.schemaFormat === "js" ? "js" : "ts";
    const output = await SchemaDumper.dump(adapter, { language });
    fs.writeFileSync(filename, output);
  }

  static async loadSchema(
    config: DatabaseConfig,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
  ): Promise<void> {
    const filename = file ?? this.schemaDumpPath(config);
    this.checkSchemaFile(filename);

    if (format === "sql") {
      await this.structureLoad(config, filename);
      return;
    }

    const path = getPath();
    if (!path.pathToFileURL) {
      throw new Error(
        "DatabaseTasks.loadSchema requires PathAdapter.pathToFileURL. " +
          "The configured PathAdapter does not provide it.",
      );
    }
    // Missing isAbsolute means the PathAdapter doesn't model relative vs.
    // absolute (e.g. a VFS) — treat the incoming filename as already
    // absolute in that case.
    const absolute = path.isAbsolute
      ? path.isAbsolute(filename)
        ? filename
        : path.resolve(this.root, filename)
      : filename;
    const href = path.pathToFileURL(absolute).href;
    const mod = (await import(href)) as {
      default?: (ctx: unknown) => Promise<void> | void;
    };
    const defineSchema = mod.default ?? (mod as unknown as (ctx: unknown) => Promise<void> | void);
    if (typeof defineSchema !== "function") {
      throw new Error(`Schema file must export a default function (got ${typeof defineSchema})`);
    }
    const adapter = this._adapterInstance;
    if (!adapter) {
      throw new Error("No adapter configured. Call DatabaseTasks.setAdapter first.");
    }
    const { MigrationContext } = await import("../migration.js");
    const ctx = new MigrationContext(adapter);
    await defineSchema(ctx);
  }

  static async loadSchemaCurrent(
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
    environment?: string,
  ): Promise<void> {
    const envs = this._environmentsFor(environment);
    for (const env of envs) {
      for (const config of this.configsFor(env)) {
        await this.loadSchema(config, format, file);
      }
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

  static async migrateStatus(): Promise<
    Array<{ status: "up" | "down"; version: string; name: string }>
  > {
    const adapter = this._adapterInstance;
    if (!adapter) {
      throw new Error("No adapter configured. Call DatabaseTasks.setAdapter first.");
    }
    const { Migrator } = await import("../migration.js");
    const migrator = new Migrator(adapter, this._migrations);
    return migrator.migrationsStatus();
  }

  static async migrateAll(): Promise<void> {
    const configs = this.configsFor(this._normalizeEnv());
    for (const config of configs) {
      await this.withTemporaryConnection(config, async () => {
        await this.migrate();
      });
    }
  }

  static async prepareAll(): Promise<void> {
    const { DatabaseAlreadyExists } = await import("../errors.js");
    const configs = this.configsFor(this._normalizeEnv());
    for (const config of configs) {
      try {
        await this.create(config);
      } catch (error) {
        if (!(error instanceof DatabaseAlreadyExists)) throw error;
      }
    }
    await this.migrateAll();
    if (this.seedLoader) await this.loadSeed();
  }

  static async dbConfigsWithVersions(): Promise<Map<string, DatabaseConfig[]>> {
    const result = new Map<string, DatabaseConfig[]>();
    const env = this._normalizeEnv();
    for (const config of this.configsFor(env)) {
      const key = config.envName;
      const list = result.get(key) ?? [];
      list.push(config);
      result.set(key, list);
    }
    return result;
  }

  static async withTemporaryConnection<T>(
    config: DatabaseConfig,
    fn: (adapter: import("../adapter.js").DatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    const adapter = await this._connectFor(config);
    const previous = this._adapterInstance;
    this._adapterInstance = adapter;
    try {
      return await fn(adapter);
    } finally {
      this._adapterInstance = previous;
      const close = (adapter as { close?: () => Promise<void> }).close;
      if (typeof close === "function") await close.call(adapter);
    }
  }

  static async withTemporaryPoolForEach<T>(
    envName: string,
    fn: (config: DatabaseConfig) => Promise<T>,
  ): Promise<void> {
    for (const config of this.configsFor(envName)) {
      await this.withTemporaryConnection(config, async () => {
        await fn(config);
      });
    }
  }

  static async migrationClass(): Promise<typeof import("../base.js").Base> {
    const { Base } = await import("../base.js");
    return Base;
  }

  static migrationConnection(): import("../adapter.js").DatabaseAdapter | null {
    return this._adapterInstance;
  }

  static async migrationConnectionPool(): Promise<unknown> {
    const { Base } = await import("../base.js");
    const pool = (Base as unknown as { connectionPool?: unknown }).connectionPool;
    return pool ?? null;
  }

  static async schemaUpToDate(
    config: DatabaseConfig,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
  ): Promise<boolean> {
    void format;
    const filename = file ?? this.schemaDumpPath(config);
    const fs = getFs();
    if (!fs.existsSync(filename)) return true;

    const adapter = this._adapterInstance;
    if (!adapter) return false;

    const { InternalMetadata } = await import("../internal-metadata.js");
    const metadata = new InternalMetadata(adapter);
    if (!(await metadata.tableExists())) return false;

    const storedSha1 = await metadata.get("schema_sha1");
    if (!storedSha1) return false;

    const fileSha1 = this._schemaSha1(filename);
    return storedSha1 === fileSha1;
  }

  private static _schemaSha1(filename: string): string {
    const contents = getFs().readFileSync(filename, "utf-8");
    const hash = getCrypto().createHash("sha1");
    hash.update(contents);
    return hash.digest("hex");
  }

  static setupInitialDatabaseYaml(): Record<string, unknown> {
    return {};
  }

  static forEach(databases: DatabaseConfigurations, fn: (name: string) => void): void {
    const env = this.env;
    const configs = databases.configsFor({ envName: env });
    if (configs.length <= 1) return;
    for (const cfg of configs) {
      fn(cfg.name);
    }
  }

  static raiseForMultiDb(environment: string | undefined, opts: { command: string }): void {
    const envName = this._normalizeEnv(environment);
    const configs = this.configsFor(envName);
    if (configs.length > 1) {
      const list = configs.map((c) => `${opts.command}:${c.name}`).join(", ");
      throw new Error(
        `You're using a multiple database application. To use \`${opts.command}\` you must ` +
          `run the namespaced task with a VERSION. Available tasks are ${list}.`,
      );
    }
  }

  static async truncateTables(config: DatabaseConfig): Promise<void> {
    const handler = this._resolveTaskOrThrow(this._adapterFor(config));
    if (handler.truncateAll) {
      await handler.truncateAll(config);
    }
  }

  static async reconstructFromSchema(
    config: DatabaseConfig,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
  ): Promise<void> {
    const { NoDatabaseError } = await import("../errors.js");
    try {
      await this.purge(config);
    } catch (error) {
      if (!(error instanceof NoDatabaseError)) throw error;
      await this.create(config);
    }
    await this.loadSchema(config, format, file);
  }

  private static async _connectFor(
    config: DatabaseConfig,
  ): Promise<import("../adapter.js").DatabaseAdapter> {
    const adapter = config.adapter;
    if (!adapter) throw new Error("config missing adapter");
    if (/sqlite/.test(adapter)) {
      const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
      const c = config.configuration;
      const fromUrl = typeof c.url === "string" ? sqliteDatabaseFromUrl(String(c.url)) : undefined;
      const database = config.database ?? fromUrl ?? ":memory:";
      const path = getPath();
      // Missing isAbsolute means the PathAdapter (e.g. a VFS) doesn't
      // model relative/absolute — treat as already absolute.
      const resolved =
        database === ":memory:" || !path.isAbsolute || path.isAbsolute(database)
          ? database
          : path.resolve(this.root, database);
      return new SQLite3Adapter(resolved);
    }
    if (/postgres/.test(adapter)) {
      const { PostgreSQLAdapter } = await import("../adapters/postgresql-adapter.js");
      const c = config.configuration;
      if (c.url) return new PostgreSQLAdapter(String(c.url));
      return new PostgreSQLAdapter({
        host: (c.host as string) ?? "localhost",
        port: coercePort(c.port, 5432),
        database: config.database,
        user: c.username as string | undefined,
        password: c.password as string | undefined,
      });
    }
    if (/mysql|trilogy/.test(adapter)) {
      const { Mysql2Adapter } = await import("../adapters/mysql2-adapter.js");
      const c = config.configuration;
      if (c.url) return new Mysql2Adapter(String(c.url));
      return new Mysql2Adapter({
        host: (c.host as string) ?? "localhost",
        port: coercePort(c.port, 3306),
        database: config.database,
        user: c.username as string | undefined,
        password: c.password as string | undefined,
      });
    }
    throw new Error(`Unsupported adapter: ${adapter}`);
  }
}

export interface DatabaseTaskHandler {
  create?(config: DatabaseConfig): Promise<void>;
  drop?(config: DatabaseConfig): Promise<void>;
  purge?(config: DatabaseConfig): Promise<void>;
  truncateAll?(config: DatabaseConfig): Promise<void>;
  charset?(config: DatabaseConfig): Promise<string | null>;
  collation?(config: DatabaseConfig): Promise<string | null>;
  structureDump?(
    config: DatabaseConfig,
    filename: string,
    extraFlags?: string | string[] | null,
  ): Promise<void>;
  structureLoad?(
    config: DatabaseConfig,
    filename: string,
    extraFlags?: string | string[] | null,
  ): Promise<void>;
}
