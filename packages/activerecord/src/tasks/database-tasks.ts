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
        const adapter = await this._connectFor(config);
        try {
          // Honor the config's use_metadata_table opt-out. When set to
          // false, Rails treats the DB as unstamped and
          // last_stored_environment returns nil — don't probe the
          // ar_internal_metadata table even if it's there from a prior
          // run with the flag enabled. Read via the DatabaseConfig
          // getter so defaulting/coercion stays consistent across
          // HashConfig / UrlConfig.
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
        } finally {
          const close = (adapter as { close?: () => Promise<void> }).close;
          if (typeof close === "function") await close.call(adapter);
        }
      } catch (error) {
        if (error instanceof NoDatabaseError) continue;
        throw error;
      }
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
    // Rails: `return unless db_config.schema_dump` — lets per-config
    // `schemaDump: false` (or null) suppress dumping. HashConfig.schemaDump()
    // returns `string | false | null`; false AND null both mean "don't dump".
    // Pass the current format so the check matches what's being dumped.
    const cfgWithDump = config as unknown as {
      schemaDump?: (format?: string) => string | false | null;
    };
    if (typeof cfgWithDump.schemaDump === "function") {
      // JS dumps use the same schema file path/config as TS; normalize
      // so HashConfig.schemaDump (which recognizes ruby/sql/ts but not
      // js) doesn't return null and accidentally suppress the dump.
      const format = this.schemaFormat === "js" ? "ts" : this.schemaFormat;
      const result = cfgWithDump.schemaDump(format);
      if (result === false || result === null) return;
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
    const adapter = this._adapterInstance;
    if (!adapter) {
      throw new Error("No adapter configured. Call DatabaseTasks.setAdapter first.");
    }
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
    const adapter = this._adapterInstance;
    if (!adapter) return;
    // Respect useMetadataTable opt-out — if the config says don't use
    // the metadata table, don't create one just to stamp the SHA1.
    if (!config.useMetadataTable) return;
    try {
      const { InternalMetadata } = await import("../internal-metadata.js");
      const metadata = new InternalMetadata(adapter);
      const sha1 = this._schemaSha1(filename);
      await metadata.createTableAndSetFlags(config.envName, sha1);
    } catch (error) {
      // Best effort — a failed stamp just means schemaUpToDate
      // returns false next time, triggering a full reload instead
      // of a truncate. No worse than before Phase 15. Log at debug
      // level so failures are diagnosable without crashing the load.

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
    const adapter = this._adapterInstance;
    if (!adapter) return;

    const { SchemaMigration } = await import("../schema-migration.js");
    const migration = new SchemaMigration(adapter);
    if (!(await migration.tableExists())) return;

    const versions = await migration.allVersions();
    if (versions.length === 0) return;

    const { quoteTableName } = await import("../connection-adapters/abstract/quoting.js");
    const adapterKind = this._adapterQuotingKind(adapter);
    const quotedTable = quoteTableName(migration.tableName, adapterKind);
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

  /**
   * Map a DatabaseAdapter instance to the quoting kind expected by the
   * abstract quoting helpers. Adapter classes report adapterName as
   * "SQLite" / "PostgreSQL" / "Mysql2"; the helper expects lowercased
   * "sqlite" / "postgres" / "mysql". Defaults to undefined (which the
   * helper treats as standard double-quoted identifiers).
   */
  private static _adapterQuotingKind(
    adapter: import("../adapter.js").DatabaseAdapter,
  ): "sqlite" | "postgres" | "mysql" | undefined {
    const name = (adapter as { adapterName?: string }).adapterName?.toLowerCase() ?? "";
    if (name.includes("sqlite")) return "sqlite";
    if (name.includes("postgres")) return "postgres";
    if (name.includes("mysql") || name.includes("trilogy") || name.includes("mariadb")) {
      return "mysql";
    }
    return undefined;
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
      const { PostgreSQLAdapter } = await import("../connection-adapters/postgresql-adapter.js");
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
