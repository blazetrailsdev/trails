/**
 * DatabaseTasks — coordinates database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::DatabaseTasks
 */

import { DatabaseConfig } from "../database-configurations/database-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { ProtectedEnvironmentError } from "../migration.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { getFs, getPath, getCryptoAsync, getOs, getEnv } from "@blazetrails/activesupport";
import { ConnectionNotDefined } from "../errors.js";

/**
 * Raised when a database task is invoked against an adapter that
 * has no registered task handler. Mirrors Rails'
 * `ActiveRecord::Tasks::DatabaseNotSupported` (tasks/database_tasks.rb:7),
 * which is raised by `class_for_adapter` when no pattern matches.
 * Our `DatabaseTasks._resolveTaskOrThrow` is the direct analog.
 */
export class DatabaseNotSupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseNotSupported";
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
  /**
   * Gating flag for automatic schema dumps after a migration-writing task.
   * DatabaseTasks itself only exposes `migrate()`; trailties' CLI layer
   * reads this flag and chooses whether to call back into
   * `DatabaseTasks.dumpSchema(config)` after its `db migrate`,
   * `db rollback`, `db forward`, `db migrate:up`, `db migrate:down`, and
   * `db migrate:redo` subcommands.
   *
   * Mirrors: ActiveRecord.dump_schema_after_migration (default true).
   */
  static dumpSchemaAfterMigration: boolean = true;
  static structureDumpFlags: string | string[] | Record<string, string | string[]> | null = null;
  static structureLoadFlags: string | string[] | Record<string, string | string[]> | null = null;
  /**
   * Controls which PostgreSQL schemas pg_dump includes in a structure dump.
   *
   * Mirrors Rails' `ActiveRecord.dump_schemas` (default `:schema_search_path`):
   * - `"schema_search_path"` (default): use config's `schemaSearchPath`
   * - `"all"`: dump all schemas (no `--schema=` filter)
   * - Any other string: treat as a comma-separated list of schema names
   *
   * Typed as a union of the two known modes plus `string & {}` for
   * custom comma-separated lists. A misspelled mode still compiles
   * (it's a valid string) but IDE autocompletion surfaces the two
   * recognized modes first.
   */
  static dumpSchemas: "schema_search_path" | "all" | (string & {}) = "schema_search_path";

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
      throw new DatabaseNotSupported(
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

    const runMigration = async (adapter: import("../adapter.js").DatabaseAdapter) => {
      const migrator = new Migrator(adapter, this._migrations);
      await migrator.migrate(effectiveVersion ?? null);
      // Rails: `migration_connection_pool.schema_cache.clear!` — drop the
      // reflected schema so post-migration introspection re-reads the
      // freshly-migrated tables. Optional-chained so an adapter without a
      // schema cache is a no-op rather than a crash.
      adapter.schemaCache?.clear();
    };

    // Pool path: check whether the Base pool is connected to this config's database.
    // When pool and config point to different known databases (multi-db scenario),
    // route through withTemporaryConnection so the owned adapter is properly closed.
    // "database unknown on either side" means a URL-only config or no database
    // restriction — treat as matching so the established pool is reused.
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    let pool: ConnectionPool | undefined;
    try {
      pool = Base.connectionPool();
    } catch (error) {
      if (!(error instanceof ConnectionNotDefined)) throw error;
      // No pool — fall through to withTemporaryConnection.
    }
    // Use the pool when: pool is present AND databases are equal, or either side
    // is unknown (URL-only config / pool established without an explicit database).
    if (
      pool &&
      (!pool.dbConfig.database || !config.database || config.database === pool.dbConfig.database)
    ) {
      await runMigration(pool.leaseConnection());
    } else {
      // Multi-db or no pool: withTemporaryConnection scopes the adapter lifecycle.
      await this.withTemporaryConnection(config, runMigration);
    }
  }

  /** Roll back the last N migrations (default 1). Mirrors `db:rollback`. */
  static async rollback(steps: number = 1): Promise<void> {
    if (!this.databaseConfiguration) return;
    const configs = this.configsFor(this._normalizeEnv());
    if (configs.length === 0) return;
    const config = configs.find((c) => c.name === "primary") ?? configs[0];
    const { Migrator } = await import("../migration.js");
    const adapter = await this._migrationAdapter();
    const migrator = new Migrator(adapter, this._migrations);
    await migrator.rollback(steps);
    adapter.schemaCache?.clear();
  }

  // Cached sync reference to Base, populated on the first _migrationAdapter() call.
  // Lets migrationConnection() (which must be synchronous) lease from the pool
  // without a top-level import that would create a circular-dependency cycle.
  private static _baseClass: typeof import("../base.js").Base | null = null;

  private static async _migrationAdapter(): Promise<import("../adapter.js").DatabaseAdapter> {
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    return Base.connectionPool().leaseConnection();
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
    // TRAILS_MIGRATION_VERSION is canonical; VERSION is the legacy fallback (one-release window).
    const version = getEnv("TRAILS_MIGRATION_VERSION") ?? getEnv("VERSION");
    if (!version) return null;
    const str = version.trim();
    if (str === "" || !/^\d+$/.test(str)) return null;
    return parseInt(str, 10);
  }

  static checkTargetVersion(version?: number | string): void {
    const v = version ?? getEnv("TRAILS_MIGRATION_VERSION") ?? getEnv("VERSION");
    if (v === undefined || v === null || String(v).trim() === "") return;
    const str = String(v).trim();
    if (!/^\d+$/.test(str)) {
      // Mirror Rails' message shape:
      // `raise "Invalid format of target version: \`VERSION=#{ENV['VERSION']}\`"`.
      throw new Error(`Invalid format of target version: \`VERSION=${str}\``);
    }
  }

  static dumpSchemaFilename(config?: DatabaseConfig): string {
    const envSchema = getEnv("SCHEMA")?.trim();
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

  /**
   * Guard destructive tasks against being run against a database that was
   * last stamped with a protected environment (e.g. production).
   *
   * Mirrors ActiveRecord::Tasks::DatabaseTasks.check_protected_environments!
   * exactly:
   *   - If DISABLE_DATABASE_ENVIRONMENT_CHECK is set in the environment,
   *     this is a no-op (escape hatch for intentional production ops).
   *   - For each config in the target environment, read the stored
   *     `environment` key from InternalMetadata.
   *   - Raise ProtectedEnvironmentError if that stored env is in
   *     Base.protectedEnvironments.
   *   - Raise EnvironmentMismatchError if a stored env exists but differs
   *     from the current env.
   *   - Swallow NoDatabaseError (can't check a database that isn't there).
   */
  static async checkProtectedEnvironmentsBang(environment?: string): Promise<void> {
    // Rails: `return if ENV["DISABLE_DATABASE_ENVIRONMENT_CHECK"]`.
    // In Ruby "" is truthy, so any *present* value bypasses. JS "" is
    // falsy, so we use a presence check to preserve Rails semantics.
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    if (proc?.env?.DISABLE_DATABASE_ENVIRONMENT_CHECK !== undefined) return;

    const envName = this._normalizeEnv(environment);
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    const protectedEnvs = Base.protectedEnvironments ?? ["production"];

    // Include hidden / `databaseTasks: false` / replica configs so the
    // guard is a superset of everything destructive callers like dropAll
    // might touch — a hidden config stamped as production should still
    // block the operation even though the regular configsFor filter
    // would have hidden it.
    const configs = this.databaseConfiguration
      ? this.databaseConfiguration.configsFor({ envName, includeHidden: true })
      : [];
    if (configs.length === 0) {
      // Two reasons configsFor can come back empty:
      //   (a) DatabaseTasks.databaseConfiguration was never set (e.g.
      //       in-memory tests or a stand-alone CLI invocation with
      //       just DatabaseTasks.env). Fall back to an env-name-only
      //       check so a flat "production" still raises.
      //   (b) DatabaseConfigurations is registered but has no entries
      //       for this env. Rails' check_protected_environments! loops
      //       over 0 configs and performs no checks — don't raise just
      //       because the requested env is in the protected list.
      if (!this.databaseConfiguration && protectedEnvs.includes(envName)) {
        throw new ProtectedEnvironmentError(envName);
      }
      return;
    }

    const { NoDatabaseError } = await import("../errors.js");
    const { Migrator, EnvironmentMismatchError } = await import("../migration.js");

    for (const config of configs) {
      try {
        await this.withTemporaryConnection(config, async (adapter) => {
          const migrator = new Migrator(adapter, [], {
            internalMetadataEnabled: config.useMetadataTable,
          });
          const stored = await migrator.lastStoredEnvironment();
          if (stored && protectedEnvs.includes(stored)) {
            throw new ProtectedEnvironmentError(stored);
          }
          if (stored && stored !== envName) {
            throw new EnvironmentMismatchError(envName, stored);
          }
        });
      } catch (error) {
        if (error instanceof NoDatabaseError) continue;
        throw error;
      }
    }
  }

  /** @internal */
  static configsFor(environment: string): DatabaseConfig[] {
    if (!this.databaseConfiguration) return [];
    return this.databaseConfiguration.configsFor({ envName: environment });
  }

  private static _normalizeEnv(environment?: string): string {
    const trimmed = environment?.trim();
    return trimmed || this.env;
  }

  /** @internal */
  static eachLocalConfiguration(): DatabaseConfig[] {
    if (!this.databaseConfiguration) return [];
    const result: DatabaseConfig[] = [];
    for (const c of this.databaseConfiguration.configsFor()) {
      if (!c.database) continue;
      if (this._localDatabase(c)) {
        result.push(c);
      } else {
        const stderr = (globalThis as { process?: { stderr?: { write: (s: string) => unknown } } })
          .process?.stderr;
        stderr?.write?.(
          `This task only modifies local databases. ${c.database} is on a remote host.\n`,
        );
      }
    }
    return result;
  }

  // Mirrors Rails: LOCAL_HOSTS = ["127.0.0.1", "localhost"] + host.blank?
  // (blank? treats whitespace-only strings as blank, so we trim before
  // comparing.)
  /** @internal */
  static _localDatabase(c: DatabaseConfig): boolean {
    const host = c.host?.trim();
    return !host || host === "localhost" || host === "127.0.0.1";
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

  /**
   * Dump the schema cache to `filename`. Mirrors Rails'
   * `DatabaseTasks.dump_schema_cache`, which delegates to
   * `conn_or_pool.schema_cache.dump_to(filename)`. In Rails the pool-side
   * `schema_cache` is a `BoundSchemaReflection` whose `dump_to` allocates a
   * fresh `SchemaCache`, `add_all`s every data source through the pool, then
   * writes it. Our adapter's `schemaCache` getter returns a plain
   * `SchemaCache`, so replicate the BoundSchemaReflection semantics here:
   * always dump from a freshly-populated cache instead of serializing
   * whatever incidental entries the in-memory cache accumulated.
   */
  static async dumpSchemaCache(connOrPool: unknown, filename: string): Promise<void> {
    // Rails: `conn_or_pool.schema_cache.dump_to(filename)`. On a real pool
    // `schema_cache` is a BoundSchemaReflection whose `dump_to` runs
    // `add_all(pool)` + write. Honor that when the caller wires up such a
    // reflection — delegate straight to it. Adapter.schemaCache exposes a
    // plain SchemaCache with no bound pool (SchemaCache DOES define
    // `addAll`, but it takes a pool arg that the adapter-level getter
    // can't supply), so don't treat that as the self-populating
    // reflection path; let the fresh-cache fallback below drive the
    // populate+dump, which is what BoundSchemaReflection.dump_to does
    // internally.
    const reflection = (connOrPool as { schemaCache?: { dumpTo?: unknown; addAll?: unknown } })
      ?.schemaCache;
    if (
      reflection &&
      typeof (reflection as { dumpTo?: unknown }).dumpTo === "function" &&
      typeof (reflection as { addAll?: unknown }).addAll !== "function"
    ) {
      // Reflection-shaped (dump_to pulls its own pool): let it self-dump.
      // We distinguish by the absence of `addAll`, which is the
      // SchemaCache-specific populate entry point.
      await (reflection as { dumpTo: (f: string) => Promise<void> | void }).dumpTo(filename);
      return;
    }

    // Adapter/connection path: SchemaCache.addAll routes through
    // `pool.withConnection(...)` when present, so the introspection check
    // has to go through the same lens — otherwise false negatives for
    // real pools whose methods live on the yielded connection.
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
    fresh.dumpTo(filename);
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
    return eachCurrentEnvironment(env);
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
    // Rails: `return unless db_config.schema_dump` — lets per-config
    // `schemaDump: false` (or null) suppress dumping. HashConfig.schemaDump()
    // normalizes both to null. Pass the current format so the check matches
    // what's being dumped.
    const cfgWithDump = config as unknown as {
      schemaDump?: (format?: string) => string | null;
    };
    if (typeof cfgWithDump.schemaDump === "function") {
      // JS dumps use the same schema file path/config as TS; normalize
      // so HashConfig.schemaDump (which recognizes ruby/sql/ts but not
      // js) doesn't return null and accidentally suppress the dump.
      const format = this.schemaFormat === "js" ? "ts" : this.schemaFormat;
      if (cfgWithDump.schemaDump(format) == null) return;
    }
    const filename = this.schemaDumpPath(config);
    if (this.schemaFormat === "sql") {
      const fs = getFs();
      const path = getPath();
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      await this.structureDump(config, filename);
      // Rails' dump_schema appends `dump_schema_information` after a
      // structure_dump so schema_migrations' version rows round-trip
      // through load. Without this, loading structure.sql into a
      // fresh DB would leave schema_migrations empty and every past
      // migration would replay. Gated on the schema_migrations table
      // existing — on a never-migrated DB there's nothing to stamp.
      await this._appendSchemaInformation(filename);
      return;
    }
    const { SchemaDumper } = await import("../schema-dumper.js");
    const adapter = await this._migrationAdapter();
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
      await this._stampSchemaSha1(config, filename);
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
    const adapter = await this._migrationAdapter();
    const { MigrationContext } = await import("../migration.js");
    const ctx = new MigrationContext(adapter);
    await defineSchema(ctx);
    // Stamp using the resolved absolute path — `filename` may be
    // relative and `_schemaSha1` reads the file via getFs(), so the
    // path must match what was actually imported.
    await this._stampSchemaSha1(config, absolute);
  }

  /**
   * After loading a schema file, stamp ar_internal_metadata with the
   * file's SHA1 so `schemaUpToDate` can skip purge+reload on
   * subsequent `reconstructFromSchema` calls (the test:prepare fast
   * path). Mirrors Rails' `load_schema` which calls
   * `internal_metadata.create_table_and_set_flags(env, schema_sha1(file))`.
   */
  private static async _stampSchemaSha1(config: DatabaseConfig, filename: string): Promise<void> {
    if (!config.useMetadataTable) return;
    try {
      const adapter = await this._migrationAdapter();
      const { InternalMetadata } = await import("../internal-metadata.js");
      const metadata = new InternalMetadata(adapter);
      const sha1 = await this._schemaSha1(filename);
      await metadata.createTableAndSetFlags(config.envName, sha1);
    } catch (error) {
      console.debug?.(
        `[trails] _stampSchemaSha1 failed for ${config.envName} (${filename})`,
        error,
      );
    }
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
    const adapter = await this._migrationAdapter();
    const { Migrator } = await import("../migration.js");
    const migrator = new Migrator(adapter, this._migrations);
    return migrator.migrationsStatus();
  }

  static async migrateAll(): Promise<void> {
    const configs = this.configsFor(this._normalizeEnv());

    // Rails: a single primary database short-circuits the per-config loop and
    // migrates the already-established connection directly, skipping the
    // temporary-pool churn (`db_configs.size == 1 && db_configs.first.primary?`).
    // Rails: `db_configs.size == 1 && db_configs.first.primary?`. `primary?`
    // (TS: `isPrimary()`) lives on HashConfig/UrlConfig, not the abstract
    // DatabaseConfig, so reach it structurally off the concrete instance.
    if (configs.length === 1 && (configs[0] as { isPrimary?(): boolean }).isPrimary?.()) {
      await this.migrate();
      return;
    }

    for (const config of configs) {
      await this.withTemporaryPool(config, async (pool) => {
        const effectiveVersion = this.targetVersion();
        this.checkTargetVersion(effectiveVersion ?? undefined);
        const { Migrator } = await import("../migration.js");
        const adapter = pool.leaseConnection();
        const migrator = new Migrator(adapter, this._migrations);
        await migrator.migrate(effectiveVersion ?? null);
        adapter.schemaCache?.clear();
      });
    }
  }

  static async prepareAll(): Promise<void> {
    const { DatabaseAlreadyExists } = await import("../errors.js");
    const configs = this.configsFor(this._normalizeEnv());

    // Rails seeds only when a database was newly initialized AND its config
    // opts into seeding (`seed = true if database_initialized && db_config.seeds?`).
    // A successful `create` (no DatabaseAlreadyExists) is our "initialized"
    // signal, so a re-prepared, already-existing database is not re-seeded.
    let seed = false;
    for (const config of configs) {
      try {
        await this.create(config);
        if (config.seeds) seed = true;
      } catch (error) {
        if (!(error instanceof DatabaseAlreadyExists)) throw error;
      }
    }
    await this.migrateAll();
    if (seed && this.seedLoader) await this.loadSeed();
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

  /**
   * Mirrors Rails' `DatabaseTasks.with_temporary_pool`: establishes a fresh
   * pool for `config` (clobber: true), yields it, then restores the prior
   * pool (or removes the pool if none existed before).
   *
   * @internal
   */
  static async withTemporaryPool<T>(
    config: DatabaseConfig,
    fn: (pool: ConnectionPool) => Promise<T>,
  ): Promise<T> {
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    let priorConfig: DatabaseConfig | null = null;
    try {
      priorConfig = Base.connectionDbConfig();
    } catch (error) {
      if (!(error instanceof ConnectionNotDefined)) throw error;
    }
    // Mirrors Rails' `ensure` which restores even if establish_connection raises.
    try {
      await Base.establishConnection(config.configuration as Record<string, unknown>);
      const pool = Base.connectionPool();
      return await fn(pool);
    } finally {
      if (priorConfig !== null) {
        await Base.establishConnection(priorConfig.configuration as Record<string, unknown>);
      } else {
        try {
          Base.removeConnection();
        } catch {
          // No pool to remove
        }
      }
    }
  }

  static async withTemporaryConnection<T>(
    config: DatabaseConfig,
    fn: (adapter: import("../adapter.js").DatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    return this.withTemporaryPool(config, (pool) => fn(pool.leaseConnection()));
  }

  static async withTemporaryPoolForEach<T>(
    envName: string,
    fn: (config: DatabaseConfig) => Promise<T>,
  ): Promise<void> {
    for (const config of this.configsFor(envName)) {
      await this.withTemporaryPool(config, async () => {
        await fn(config);
      });
    }
  }

  static async migrationClass(): Promise<typeof import("../base.js").Base> {
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    return Base;
  }

  static migrationConnection(): import("../adapter.js").DatabaseAdapter | null {
    if (!this._baseClass) return null;
    try {
      return this._baseClass.connectionPool().leaseConnection();
    } catch (error) {
      if (error instanceof ConnectionNotDefined) return null;
      throw error;
    }
  }

  static async migrationConnectionPool(): Promise<ConnectionPool | null> {
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    const fn = (Base as unknown as { connectionPool?: () => ConnectionPool }).connectionPool;
    return fn ? fn.call(Base) : null;
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

    let adapter: import("../adapter.js").DatabaseAdapter;
    try {
      adapter = await this._migrationAdapter();
    } catch (error) {
      if (error instanceof ConnectionNotDefined) return false;
      throw error;
    }

    const { InternalMetadata } = await import("../internal-metadata.js");
    const metadata = new InternalMetadata(adapter);
    if (!(await metadata.tableExists())) return false;

    const storedSha1 = await metadata.get("schema_sha1");
    if (!storedSha1) return false;

    const fileSha1 = await this._schemaSha1(filename);
    return storedSha1 === fileSha1;
  }

  private static async _schemaSha1(filename: string): Promise<string> {
    return _sha1File(filename);
  }

  /**
   * Append `INSERT INTO schema_migrations (version) VALUES ...` rows to
   * an already-dumped structure.sql, mirroring Rails'
   * `ConnectionAdapters::SchemaStatements#dump_schema_information` that
   * `DatabaseTasks.dump_schema` calls for the `:sql` format. Gated on
   * the schema_migrations table existing — a fresh DB has nothing to
   * stamp. Required for every adapter (including PG/MySQL): pg_dump
   * runs with `--schema-only` and mysqldump with `--no-data`, so the
   * version rows are NOT in those tools' output.
   *
   * Identifier quoting routes through the per-adapter scheme — backticks
   * for MySQL, double-quotes for SQLite/PostgreSQL — so the appended
   * SQL is valid for whichever `structureLoad` consumes it. Matches
   * Rails' `quote_table_name`. The column name `(version)` is
   * hardcoded verbatim, matching Rails' `insert_versions_sql`.
   */
  private static async _appendSchemaInformation(filename: string): Promise<void> {
    let adapter: import("../adapter.js").DatabaseAdapter;
    try {
      adapter = await this._migrationAdapter();
    } catch (error) {
      if (error instanceof ConnectionNotDefined) return;
      throw error;
    }

    const { SchemaMigration } = await import("../schema-migration.js");
    const migration = new SchemaMigration(adapter);
    if (!(await migration.tableExists())) return;

    const versions = await migration.allVersions();
    if (versions.length === 0) return;

    const quotedTable = adapter.quoteTableName(migration.tableName);
    const quoted = versions
      // Rails inserts versions in reverse order so the final row has
      // the highest version — matches `versions.reverse.map`.
      .slice()
      .reverse()
      // Versions are timestamp strings (`20260101000000`), so escape
      // single quotes defensively via SQL's double-up convention even
      // though no real version should contain one.
      .map((v) => `('${String(v).replace(/'/g, "''")}')`)
      .join(",\n");
    // Rails hardcodes `(version)` in insert_versions_sql — never
    // routes through quote_column_name. Match verbatim.
    const insertSql = `\nINSERT INTO ${quotedTable} (version) VALUES\n${quoted};\n`;
    // Append in place rather than read+rewrite so dump time scales with
    // the appended content, not the dump size. Drop a leading newline
    // into insertSql itself so we don't have to read the file's last
    // byte just to decide whether to add a separator — if structureDump
    // already ended on a newline (it does for sqlite/pg/mysql), the
    // result is one blank line between sections, which matches Rails'
    // `f.puts` + `f.print "\n"` shape.
    getFs().appendFileSync(filename, insertSql);
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

  /** @internal */
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
      // Rails fast path: when the loaded schema already matches the dump's
      // SHA1 (`schema_up_to_date?`), skip the expensive purge+reload and just
      // truncate — unless SKIP_TEST_DATABASE_TRUNCATE is set, mirroring
      // `truncate_tables(db_config) unless ENV["SKIP_TEST_DATABASE_TRUNCATE"]`.
      if (await this.schemaUpToDate(config, format, file)) {
        if (getEnv("SKIP_TEST_DATABASE_TRUNCATE") === undefined) {
          await this.truncateTables(config);
        }
      } else {
        await this.purge(config);
        await this.loadSchema(config, format, file);
      }
    } catch (error) {
      if (!(error instanceof NoDatabaseError)) throw error;
      await this.create(config);
      await this.loadSchema(config, format, file);
    }
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

/** @internal */
export async function withTemporaryPool<T = void>(
  dbConfig: DatabaseConfig,
  fn: (adapter: import("../adapter.js").DatabaseAdapter) => Promise<T>,
): Promise<T> {
  return DatabaseTasks.withTemporaryConnection(dbConfig, fn);
}

/** @internal */
export function resolveConfiguration(configuration: unknown): DatabaseConfig {
  // DatabaseConfig instances don't need a configurations registry — return as-is.
  // Avoids constructing a new DatabaseConfigurations (which mutates the global singleton).
  if (configuration instanceof DatabaseConfig) return configuration;
  const configs = DatabaseTasks.databaseConfiguration;
  if (!configs) throw new Error("DatabaseTasks.databaseConfiguration is not set");
  return configs.resolve(configuration);
}

/** @internal */
export function isVerbose(): boolean {
  const v = getEnv("VERBOSE");
  return v !== undefined ? v !== "false" : true;
}

/** @internal */
export function databaseAdapterFor(
  _dbConfig: DatabaseConfig,
  ...arguments_: unknown[]
): import("../adapter.js").DatabaseAdapter | null {
  void arguments_;
  return DatabaseTasks.migrationConnection();
}

/** @internal */
export function classForAdapter(adapter: string): DatabaseTaskHandler {
  const handler = DatabaseTasks.resolveTask(adapter);
  if (!handler) {
    throw new DatabaseNotSupported(`Rake tasks not supported by '${adapter}' adapter`);
  }
  return handler;
}

/** @internal */
export function eachCurrentConfiguration(environment: string, name?: string): DatabaseConfig[] {
  const results: DatabaseConfig[] = [];
  for (const env of eachCurrentEnvironment(environment)) {
    for (const cfg of DatabaseTasks.configsFor(env)) {
      if (name && name !== cfg.name) continue;
      results.push(cfg);
    }
  }
  return results;
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
export function isLocalDatabase(dbConfig: DatabaseConfig): boolean {
  return DatabaseTasks._localDatabase(dbConfig);
}

/** @internal */
export function schemaSha1(file: string): Promise<string> {
  return _sha1File(file);
}

async function _sha1File(filename: string): Promise<string> {
  const bytes = getFs().readFileSync(filename);
  const crypto = await getCryptoAsync();
  const hash = crypto.createHash("sha1");
  hash.update(bytes);
  return hash.digest("hex");
}

/** @internal */
export function structureDumpFlagsFor(adapter: string): string | string[] | null {
  const flags = DatabaseTasks.structureDumpFlags;
  if (!flags) return null;
  if (typeof flags === "string" || Array.isArray(flags)) return flags;
  return (flags as Record<string, string | string[]>)[adapter] ?? null;
}

/** @internal */
export function structureLoadFlagsFor(adapter: string): string | string[] | null {
  const flags = DatabaseTasks.structureLoadFlags;
  if (!flags) return null;
  if (typeof flags === "string" || Array.isArray(flags)) return flags;
  return (flags as Record<string, string | string[]>)[adapter] ?? null;
}

/** @internal */
export async function checkCurrentProtectedEnvironmentBang(
  dbConfig: DatabaseConfig,
): Promise<void> {
  await DatabaseTasks.withTemporaryConnection(dbConfig, async () => {
    await DatabaseTasks.checkProtectedEnvironmentsBang(dbConfig.envName);
  });
}

/** @internal */
export async function initializeDatabase(dbConfig: DatabaseConfig): Promise<boolean> {
  return DatabaseTasks.withTemporaryConnection(dbConfig, async (adapter) => {
    const { NoDatabaseError } = await import("../errors.js");
    const { SchemaMigration } = await import("../schema-migration.js");
    let alreadyInitialized = false;
    try {
      // Probe DB connectivity first — throws NoDatabaseError if the DB doesn't exist.
      // tableExists() swallows all errors internally so can't detect a missing DB.
      await adapter.execute("SELECT 1");
      const sm = new SchemaMigration(adapter);
      alreadyInitialized = await sm.tableExists();
    } catch (error) {
      if (error instanceof NoDatabaseError || _isMissingDatabaseError(error, adapter)) {
        await DatabaseTasks.create(dbConfig);
      } else {
        throw error;
      }
    }
    if (!alreadyInitialized) {
      const rawPath = DatabaseTasks.schemaDumpPath(dbConfig);
      if (rawPath) {
        const p = getPath();
        const resolved =
          p.isAbsolute && !p.isAbsolute(rawPath) ? p.resolve(DatabaseTasks.root, rawPath) : rawPath;
        if (getFs().existsSync(resolved)) {
          await DatabaseTasks.loadSchema(dbConfig, DatabaseTasks.schemaFormat, resolved);
        }
      }
    }
    return !alreadyInitialized;
  });
}

// Defensive fallback for SQL-level errors that slip through pool proxies or
// adapters that don't yet translate at connection time.
function _isMissingDatabaseError(
  error: unknown,
  adapter?: import("../adapter.js").DatabaseAdapter,
): boolean {
  // Delegate to the adapter's per-driver check when available.
  if (typeof adapter?.isNoDatabaseError === "function") return adapter.isNoDatabaseError(error);
  // Legacy fallback: PostgreSQL SQLSTATE 3D000.
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "3D000";
}
