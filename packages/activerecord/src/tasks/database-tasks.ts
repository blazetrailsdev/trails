/**
 * DatabaseTasks — coordinates database lifecycle operations.
 *
 * Mirrors: ActiveRecord::Tasks::DatabaseTasks
 */

import { DatabaseConfig } from "../database-configurations/database-config.js";
import {
  DatabaseConfigurations,
  configurationsStore,
  setConfigurationsStore,
} from "../database-configurations.js";
import { ProtectedEnvironmentError } from "../migration.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import {
  getFs,
  getPath,
  getCryptoAsync,
  getOs,
  getEnv,
  stdout,
  stderr,
} from "@blazetrails/activesupport";
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

/**
 * Raised when a database task is invoked against an adapter that
 * has no registered task handler. Mirrors Rails'
 * `ActiveRecord::Tasks::DatabaseNotSupported` (tasks/database_tasks.rb:7),
 * which is raised by `class_for_adapter` when no pattern matches.
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
  // Rails' `attr_accessor :database_configuration` (database_tasks.rb:61) is an
  // *input* to `ActiveRecord::Base.configurations`, never a rival store: every
  // task-side reader goes through `Base.configurations.configs_for`
  // (database_tasks.rb:514,517,552). So this reads and writes the one
  // `@@configurations` registry (core.rb:71-79) that `Base.configurations`
  // backs on to, rather than a second global that can drift out of step.
  static get databaseConfiguration(): DatabaseConfigurations | null {
    return configurationsStore();
  }

  static set databaseConfiguration(value: DatabaseConfigurations | null) {
    setConfigurationsStore(value ?? DatabaseConfigurations.fromEnv({}));
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

  /**
   * @internal Mirrors: `class_for_adapter` (`tasks/database_tasks.rb:574-580`).
   * Ruby's `@tasks.reverse_each.detect { |pattern, _| adapter[pattern] }` is
   * `resolveTask` above, which walks the same registrations newest-first;
   * `task.is_a?(String) ? task.constantize : task` has no analogue because
   * `registerTask` takes the handler itself, never its name.
   *
   * `adapter` carries `db_config.adapter`, nilable at `hash_config.rb:107-109`.
   * Ruby raises NoMethodError from `adapter[pattern]` in that case; matching
   * nothing and raising DatabaseNotSupported below keeps the reachable path's
   * error class and message exact.
   */
  private static classForAdapter(adapter: string | undefined): DatabaseTaskHandler {
    const task = adapter === undefined ? undefined : this.resolveTask(adapter);
    if (!task) {
      throw new DatabaseNotSupported(`Rake tasks not supported by '${adapter}' adapter`);
    }
    return task;
  }

  /**
   * @internal Mirrors: `database_adapter_for` (`tasks/database_tasks.rb:566-572`).
   * Rails instantiates the resolved task class per call; trails registers task
   * singletons through `registerTask`, so the handler itself is the instance
   * and there are no `*arguments` to forward to a constructor.
   */
  private static databaseAdapterFor(dbConfig: DatabaseConfig): DatabaseTaskHandler {
    return this.classForAdapter(dbConfig.adapter);
  }

  static clearRegisteredTasks(): void {
    this._registeredTasks = [];
  }

  static async create(
    configuration: DatabaseConfig | string | Record<string, unknown>,
  ): Promise<void> {
    const config = this.resolveConfiguration(configuration);
    const { DatabaseAlreadyExists } = await import("../errors.js");
    try {
      const handler = this.databaseAdapterFor(config);
      if (handler.create) {
        await handler.create(config);
      }
      if (isVerbose()) stdout.write(`Created database '${config.database}'\n`);
    } catch (error) {
      if (error instanceof DatabaseAlreadyExists) {
        if (isVerbose()) stderr.write(`Database '${config.database}' already exists\n`);
        return;
      }
      stderr.write(_errorToS(error) + "\n");
      stderr.write(
        `Couldn't create '${config.database}' database. Please check your configuration.\n`,
      );
      throw error;
    }
  }

  static async createAll(): Promise<void> {
    // Rails: capture current db_config before iterating so we can restore it after.
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    let originalConfig: DatabaseConfig | null = null;
    try {
      originalConfig = Base.connectionDbConfig();
    } catch (error) {
      if (!(error instanceof ConnectionNotDefined)) throw error;
    }
    const configs = this.eachLocalConfiguration();
    for (const config of configs) {
      await this.create(config);
    }
    // Rails: re-establish connection to the original config after all creates.
    if (originalConfig !== null) {
      await Base.establishConnection(originalConfig);
    }
  }

  static async createCurrent(environment?: string, name?: string): Promise<void> {
    for (const dbConfig of this.eachCurrentConfiguration(this._normalizeEnv(environment), name)) {
      await this.create(dbConfig);
    }
    // database_tasks.rb:173 — `migration_class.establish_connection(environment.to_sym)`,
    // which resolves the bare env name through `Base.configurations`.
    const envName = this._normalizeEnv(environment);
    await (await this.migrationClass()).establishConnection(envName);
  }

  static async drop(
    configuration: DatabaseConfig | string | Record<string, unknown>,
  ): Promise<void> {
    const config = this.resolveConfiguration(configuration);
    const { NoDatabaseError } = await import("../errors.js");
    try {
      const handler = this.databaseAdapterFor(config);
      if (handler.drop) {
        await handler.drop(config);
      }
      if (isVerbose()) stdout.write(`Dropped database '${config.database}'\n`);
    } catch (error) {
      if (error instanceof NoDatabaseError) {
        stderr.write(`Database '${config.database}' does not exist\n`);
        return;
      }
      stderr.write(_errorToS(error) + "\n");
      stderr.write(`Couldn't drop database '${config.database}'\n`);
      throw error;
    }
  }

  static async dropAll(): Promise<void> {
    for (const config of this.eachLocalConfiguration()) {
      await this.drop(config);
    }
  }

  static async dropCurrent(environment?: string): Promise<void> {
    for (const dbConfig of this.eachCurrentConfiguration(this._normalizeEnv(environment))) {
      await this.drop(dbConfig);
    }
  }

  private static _migrations: Array<import("../migration.js").MigrationProxy> = [];

  private static _migrationsByConfig = new Map<
    string,
    Array<import("../migration.js").MigrationProxy>
  >();

  /**
   * Rails derives migrations per config from `db_config.migrations_paths`
   * via the pool's `migration_context` (`connection_pool.rb:294-299`); there
   * is no filesystem loader down here, so the caller pre-loads them and
   * registers them against a config. Registering without one sets the
   * fallback used by configs with no entry of their own, and resets the
   * per-config registry so a fresh invocation never inherits stale
   * migrations.
   */
  static registerMigrations(
    migrations: Array<import("../migration.js").MigrationProxy>,
    dbConfig?: DatabaseConfig,
  ): void {
    if (dbConfig === undefined) {
      this._migrations = migrations;
      this._migrationsByConfig.clear();
    } else {
      this._migrationsByConfig.set(this._migrationsKey(dbConfig), migrations);
    }
  }

  // `configs_for(env_name:, name:)` is how Rails identifies one config, so
  // env + name is the key — name alone collides across environments, which
  // may carry different migrations_paths (`hash_config.rb:50-53`).
  private static _migrationsKey(dbConfig: DatabaseConfig): string {
    return `${dbConfig.envName}\u0000${dbConfig.name}`;
  }

  private static _migrationsFor(
    dbConfig: DatabaseConfig,
  ): Array<import("../migration.js").MigrationProxy> {
    return this._migrationsByConfig.get(this._migrationsKey(dbConfig)) ?? this._migrations;
  }

  /**
   * Rails reaches the run surface through `MigrationContext`
   * (`migration.rb:1211`), whose `#migrations` reads `migrations_paths` off
   * disk. trails registers migrations in memory per db_config, so the context
   * answers that list instead — the same override Rails' own
   * `migrator_class` test helper uses.
   */
  /** @internal */
  static async _migrationContextFor(
    adapter: import("../connection-adapters/abstract-adapter.js").AbstractAdapter,
    dbConfig: DatabaseConfig,
  ): Promise<import("../migration.js").MigrationContext> {
    const { MigrationContext } = await import("../migration.js");
    const { SchemaMigration } = await import("../schema-migration.js");
    const { InternalMetadata } = await import("../internal-metadata.js");
    const migrations = this._migrationsFor(dbConfig);
    const paths = dbConfig.migrationsPaths;
    return new (class extends MigrationContext {
      override get migrations(): import("../migration.js").MigrationProxy[] {
        return migrations;
      }
    })(
      paths == null ? [] : Array.isArray(paths) ? paths : [paths],
      new SchemaMigration(adapter),
      new InternalMetadata(adapter),
    );
  }

  private static async _migratorFor(
    adapter: import("../connection-adapters/abstract-adapter.js").AbstractAdapter,
    dbConfig: DatabaseConfig,
  ): Promise<import("../migration.js").Migrator> {
    const { Migrator } = await import("../migration.js");
    const { SchemaMigration } = await import("../schema-migration.js");
    const { InternalMetadata } = await import("../internal-metadata.js");
    return new Migrator(
      "up",
      this._migrationsFor(dbConfig),
      new SchemaMigration(adapter),
      new InternalMetadata(adapter),
    );
  }

  /**
   * @param version Exact-version *filter* — only the migration with this
   *   version runs (`db:migrate:up` / `:down` semantics). Rails' `db:migrate`
   *   rake task never passes it.
   * @param options.targetVersion "Migrate up to here", the in-process stand-in
   *   for Rails' `ENV["VERSION"]` that {@link targetVersion} reads. trails has
   *   no env writer, so a CLI `--version` flag hands the target down through
   *   this option instead of the `version` argument, which would filter.
   */
  static async migrate(
    version?: number | string,
    {
      skipInitialize = false,
      targetVersion,
    }: { skipInitialize?: boolean; targetVersion?: number | string | null } = {},
  ): Promise<void> {
    const raw = version ?? targetVersion ?? this.targetVersion();
    const effectiveVersion = typeof raw === "string" ? raw.trim() || null : raw;
    this.checkTargetVersion(effectiveVersion ?? undefined);

    const { Migration } = await import("../migration.js");
    const scope = getEnv("SCOPE");
    // Rails: `verbose_was, Migration.verbose = Migration.verbose, verbose?`
    // (`database_tasks.rb:264`), restored in the ensure block at `:282`.
    const verboseWas = Migration.verbose;
    Migration.verbose = isVerbose();

    const runMigration = async (
      adapter: import("../connection-adapters/abstract-adapter.js").AbstractAdapter,
      dbConfig: DatabaseConfig,
    ) => {
      // Rails builds the migrator from `migration_connection_pool.migration_context`
      // (`connection_pool.rb:294-299`), i.e. from the pool's own
      // `db_config.migrations_paths` — not from a process-global list.
      const migrator = await this._migratorFor(adapter, dbConfig);
      // Rails block: `version.blank? ? (scope.blank? || scope == m.scope) : m.version == version`
      // `version` is the *method parameter* (explicit arg), NOT ENV["VERSION"].
      // The rake task always calls migrate() with no arg, so version is nil → scope filter only.
      // The exact-version branch fires only for explicit migrate(version) callers (migrate:up/down).
      // Normalize version the same way Rails does `version.blank?`: treat "", " " as nil.
      const explicitVersion =
        version == null ? null : typeof version === "string" ? version.trim() || null : version;
      let filter: ((m: import("../migration.js").MigrationProxy) => boolean) | undefined;
      if (explicitVersion !== null) {
        const versionKey = String(BigInt(explicitVersion));
        filter = (m) => String(BigInt(m.version)) === versionKey;
      } else if (scope !== undefined && scope.trim() !== "") {
        filter = (m) => m.scope === scope;
      }
      const ran = await migrator.migrate(effectiveVersion ?? null, filter);
      if (scope && scope.trim() !== "" && ran.length === 0 && Migration.verbose) {
        // Rails: `Migration.write("No migrations ran. ...")` — write puts to
        // $stdout (`migration.rb:1001`); `Migration.verbose` is the gate
        // Migration#write applies. `stdout` is the activesupport $stdout shim.
        stdout.write(`No migrations ran. (using ${scope} scope)\n`);
      }
      // Rails: `migration_connection_pool.schema_cache.clear!` — drop the
      // reflected schema so post-migration introspection re-reads the
      // freshly-migrated tables. Optional-chained so an adapter without a
      // schema cache is a no-op rather than a crash.
      adapter.schemaCache.clearBang();
    };

    try {
      const pool = await this.migrationConnectionPool();
      if (!skipInitialize) await initializeDatabase(pool.dbConfig);
      await runMigration(await pool.leaseConnection(), pool.dbConfig);
    } finally {
      Migration.verbose = verboseWas;
    }
  }

  /**
   * @internal Rails has no `DatabaseTasks.rollback`; `rake db:rollback`
   * (`railties/databases.rake:269`) inlines
   * `DatabaseTasks.migration_connection_pool.migration_context.rollback(step)`.
   * The body lives here rather than in the CLI because the pool handle is
   * here — otherwise this is the rake task: the pool it is handed, no
   * `configurations` lookup and no early return.
   */
  static async rollback(steps: number = 1): Promise<void> {
    await this._stepMigrations("rollback", steps);
  }

  /** @internal Same deviation as {@link rollback}, for `db:forward` (`databases.rake:279`). */
  static async forward(steps: number = 1): Promise<void> {
    await this._stepMigrations("forward", steps);
  }

  /**
   * @internal Same deviation as {@link rollback}: `db:migrate:up` /
   * `db:migrate:down` (`railties/databases.rake:174-177`, `:205-208`) inline
   * `migration_connection_pool.migration_context.run(direction, target_version)`.
   * The body lives here because the CLI has no pool handle of its own.
   */
  static async runMigration(direction: "up" | "down", version: number | string): Promise<void> {
    this.checkTargetVersion(version);
    const pool = await this.migrationConnectionPool();
    const adapter = await pool.leaseConnection();
    const context = await this._migrationContextFor(adapter, pool.dbConfig);
    await context.run(direction, version);
    adapter.schemaCache.clearBang();
  }

  private static async _stepMigrations(
    direction: "rollback" | "forward",
    steps: number,
  ): Promise<void> {
    const pool = await this.migrationConnectionPool();
    const adapter = await pool.leaseConnection();
    const dbConfig = pool.dbConfig;
    const context = await this._migrationContextFor(adapter, dbConfig);
    await context[direction](steps);
    adapter.schemaCache.clearBang();
  }

  // Cached sync reference to Base, populated on the first _migrationAdapter() call.
  // Lets migrationConnection() (which must be synchronous) lease from the pool
  // without a top-level import that would create a circular-dependency cycle.
  private static _baseClass: typeof import("../base.js").Base | null = null;

  private static async _migrationAdapter(): Promise<
    import("../connection-adapters/abstract-adapter.js").AbstractAdapter
  > {
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    return Base.connectionPool().leaseConnection();
  }

  static async purge(
    configuration: DatabaseConfig | string | Record<string, unknown>,
  ): Promise<void> {
    const config = this.resolveConfiguration(configuration);
    const handler = this.databaseAdapterFor(config);
    if (handler.purge) {
      await handler.purge(config);
    }
  }

  static async purgeCurrent(environment?: string): Promise<void> {
    const env = this._normalizeEnv(environment);
    for (const dbConfig of this.eachCurrentConfiguration(env)) {
      await this.purge(dbConfig);
    }
    // database_tasks.rb:359 — `migration_class.establish_connection(environment.to_sym)`,
    // which resolves the bare env name through `Base.configurations`.
    await (await this.migrationClass()).establishConnection(env);
  }

  static async purgeAll(): Promise<void> {
    for (const config of this.eachLocalConfiguration()) {
      await this.purge(config);
    }
  }

  static async truncateAll(environment?: string): Promise<void> {
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    for (const config of configs) {
      const handler = this.databaseAdapterFor(config);
      if (handler.truncateAll) {
        await handler.truncateAll(config);
      } else {
        await this.truncateTables(config);
      }
    }
  }

  static async charset(
    configuration: DatabaseConfig | string | Record<string, unknown>,
  ): Promise<string | null> {
    const config = this.resolveConfiguration(configuration);
    const handler = this.databaseAdapterFor(config);
    return handler.charset ? handler.charset(config) : null;
  }

  static async charsetCurrent(environment?: string): Promise<string | null> {
    const env = this._normalizeEnv(environment);
    const configs = this.configsFor(env);
    if (configs.length === 0) return null;
    const primary = configs.find((c) => c.name === "primary") ?? configs[0];
    return this.charset(primary);
  }

  static async collation(
    configuration: DatabaseConfig | string | Record<string, unknown>,
  ): Promise<string | null> {
    const config = this.resolveConfiguration(configuration);
    const handler = this.databaseAdapterFor(config);
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

  static dumpSchemaFilename(config?: DatabaseConfig, format?: SchemaFormat): string {
    const envSchema = getEnv("SCHEMA");
    if (envSchema !== undefined) return envSchema;
    const fmt = format ?? this.schemaFormat;
    const ext = fmt === "sql" ? "sql" : fmt;
    const base = fmt === "sql" ? "structure" : "schema";
    if (config && config.name !== "primary") {
      return `${this.dbDir}/${config.name}_${base}.${ext}`;
    }
    return `${this.dbDir}/${base}.${ext}`;
  }

  static checkSchemaFile(filename: string): void {
    // Rails: unless File.exist?(filename) → Kernel.abort (database_tasks.rb:482-487).
    // No blank-string special case — Rails only does File.exist?, so "" flows through
    // the same path (existsSync("") === false) and aborts with the filename in the message.
    if (!getFs().existsSync(filename)) {
      throw new Error(
        `${filename} doesn't exist yet. Run \`db:migrate\` to create it, then try again.`,
      );
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
   *   - Otherwise run {@link checkCurrentProtectedEnvironmentBang} against
   *     every config in the target environment.
   */
  static async checkProtectedEnvironmentsBang(environment?: string): Promise<void> {
    // Rails: `return if ENV["DISABLE_DATABASE_ENVIRONMENT_CHECK"]`.
    // In Ruby "" is truthy, so any *present* value bypasses. JS "" is
    // falsy, so we use a presence check to preserve Rails semantics.
    if (getEnv("DISABLE_DATABASE_ENVIRONMENT_CHECK") !== undefined) return;

    const envName = this._normalizeEnv(environment);
    for (const config of this.configsFor(envName)) {
      await checkCurrentProtectedEnvironmentBang(config);
    }
  }

  /** @internal */
  static configsFor(environment: string): DatabaseConfig[] {
    // database_tasks.rb:551-553 — `Base.configurations.configs_for(**options)`.
    return configurationsStore().configsFor({ envName: environment });
  }

  /**
   * @internal Mirrors: `resolve_configuration`
   * (`tasks/database_tasks.rb:555-557`).
   */
  private static resolveConfiguration(configuration: unknown): DatabaseConfig {
    return configurationsStore().resolve(configuration);
  }

  /**
   * @internal Mirrors: `each_current_configuration`
   * (`tasks/database_tasks.rb:582-590`). Ruby yields; TS collects and the
   * caller iterates the result.
   */
  private static eachCurrentConfiguration(environment: string, name?: string): DatabaseConfig[] {
    const results: DatabaseConfig[] = [];
    for (const env of eachCurrentEnvironment(environment)) {
      for (const dbConfig of this.configsFor(env)) {
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
  static eachLocalConfiguration(): DatabaseConfig[] {
    const result: DatabaseConfig[] = [];
    // database_tasks.rb:599 — `configs_for.each`, i.e. Base.configurations.
    for (const c of configurationsStore().configsFor()) {
      if (!c.database) continue;
      if (this.isLocalDatabase(c)) {
        result.push(c);
      } else {
        stderr.write(
          `This task only modifies local databases. ${c.database} is on a remote host.\n`,
        );
      }
    }
    return result;
  }

  // Mirrors Rails: LOCAL_HOSTS = ["127.0.0.1", "localhost"] + host.blank?
  // (blank? treats whitespace-only strings as blank, so we trim before
  // comparing.)
  /** @internal Mirrors: `local_database?` (`tasks/database_tasks.rb:610-613`). */
  private static isLocalDatabase(dbConfig: DatabaseConfig): boolean {
    const host = dbConfig.host?.trim();
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
   * writes it. Both our pool-side and adapter-side `schemaCache` getters
   * return that reflection, so delegate to it; the fallback below replicates
   * the same semantics for callers that hand over a bare `SchemaCache`.
   */
  static async dumpSchemaCache(connOrPool: unknown, filename: string): Promise<void> {
    // Rails: `conn_or_pool.schema_cache.dump_to(filename)`. On a real pool
    // `schema_cache` is a BoundSchemaReflection whose `dump_to` runs
    // `add_all(pool)` + write. Honor that when the caller hands over such a
    // reflection — delegate straight to it. A bare `SchemaCache` also defines
    // `dumpTo`, but its `addAll` takes a pool arg it can't supply itself, so
    // that shape falls through to the fresh-cache path below, which is what
    // BoundSchemaReflection.dump_to does internally.
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

  static async structureDump(
    configuration: DatabaseConfig | string | Record<string, unknown>,
    filename: string,
    extraFlags?: string | string[] | null,
  ): Promise<void> {
    const config = this.resolveConfiguration(configuration);
    const flags = extraFlags ?? this.structureDumpFlagsFor(config.adapter);
    const handler = this.databaseAdapterFor(config);
    if (!handler.structureDump) {
      throw new Error(`Adapter '${config.adapter}' does not support structureDump`);
    }
    await handler.structureDump(config, filename, flags);
  }

  static async structureLoad(
    configuration: DatabaseConfig | string | Record<string, unknown>,
    filename: string,
    extraFlags?: string | string[] | null,
  ): Promise<void> {
    const config = this.resolveConfiguration(configuration);
    const flags = extraFlags ?? this.structureLoadFlagsFor(config.adapter);
    const handler = this.databaseAdapterFor(config);
    if (!handler.structureLoad) {
      throw new Error(`Adapter '${config.adapter}' does not support structureLoad`);
    }
    await handler.structureLoad(config, filename, flags);
  }

  /**
   * @internal Mirrors: `structure_dump_flags_for`
   * (`tasks/database_tasks.rb:619-625`). Ruby reaches `adapter` only inside the
   * Hash arm (`flags[adapter.to_sym]`) and raises NoMethodError there when
   * `db_config.adapter` is nil; TS types it nilable, so that arm misses
   * instead. `is_a?(Hash)` becomes an object test that excludes the Array and
   * String forms the accessor also accepts.
   */
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

  /**
   * @internal Mirrors: `structure_load_flags_for`
   * (`tasks/database_tasks.rb:627-633`). Ruby reaches `adapter` only inside the
   * Hash arm (`flags[adapter.to_sym]`) and raises NoMethodError there when
   * `db_config.adapter` is nil; TS types it nilable, so that arm misses
   * instead. `is_a?(Hash)` becomes an object test that excludes the Array and
   * String forms the accessor also accepts.
   */
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

  /**
   * Mirrors Rails' `DatabaseTasks.schema_dump_path`:
   * 1. Returns `ENV["SCHEMA"]` when set.
   * 2. When `schemaDump` is explicitly set in the config hash, consults
   *    `config.schemaDump(format)` — returns `null` for `false`/null (disabled),
   *    or the custom path string. Applies Rails' db_dir prefix rule:
   *    dirname == dbDir → return as-is; otherwise prepend dbDir.
   * 3. For configs with no explicit `schemaDump` key, falls back to
   *    `dumpSchemaFilename()` which already includes dbDir and handles all
   *    formats including the Trails-specific `"js"` format.
   *
   * Returns `null` when the config disables schema dumping (`schemaDump: false`).
   */
  static schemaDumpPath(config?: DatabaseConfig, format?: SchemaFormat): string | null {
    const envSchema = getEnv("SCHEMA");
    if (envSchema !== undefined) return envSchema;

    // Only consult config.schemaDump() when the key is explicitly present.
    // When absent, dumpSchemaFilename() is the authoritative path — it handles
    // all formats (including the Trails-only "js") with the dbDir prefix.
    // Calling schemaDump() unconditionally for "js" would return "schema.ts"
    // (after "js"→"ts" normalization) giving the wrong extension.
    const rawCfg = (config as unknown as { configuration?: Record<string, unknown> })
      ?.configuration;
    const hasExplicitSchemaDump =
      rawCfg != null && Object.hasOwn(rawCfg, "schemaDump") && rawCfg["schemaDump"] !== undefined;

    if (!hasExplicitSchemaDump) {
      return this.dumpSchemaFilename(config, format);
    }

    // Explicit key: call schemaDump() for the value.
    // Normalize "js" → "ts": HashConfig.schemaDump() has no "js" case and
    // returns null for unknown formats, which would incorrectly gate the dump.
    const cfgWithDump = config as unknown as { schemaDump?: (format?: string) => string | null };
    if (typeof cfgWithDump?.schemaDump !== "function") {
      return this.dumpSchemaFilename(config, format);
    }
    const fmt = (format ?? this.schemaFormat) === "js" ? "ts" : (format ?? this.schemaFormat);
    const filename = cfgWithDump.schemaDump(fmt);
    if (filename == null) return null;

    // Mirrors: `File.dirname(filename) == db_dir ? filename : File.join(db_dir, filename)`.
    const p = getPath();
    const dir = p.dirname ? p.dirname(filename) : ".";
    if (dir === this.dbDir) return filename;
    return p.join ? p.join(this.dbDir, filename) : `${this.dbDir}/${filename}`;
  }

  /**
   * Resolve a schema-file path against `root`. Absolute paths pass through;
   * a PathAdapter without `isAbsolute` (e.g. a VFS) is treated as already
   * absolute. Shared by dumpSchema and loadSchema so dump/load agree.
   *
   * @internal
   */
  static _resolveSchemaPath(filename: string): string {
    const path = getPath();
    if (!path.isAbsolute) return filename;
    return path.isAbsolute(filename) ? filename : (path.resolve?.(this.root, filename) ?? filename);
  }

  static async dumpSchema(config: DatabaseConfig): Promise<void> {
    // Rails: `return unless db_config.schema_dump` — lets per-config
    // `schemaDump: false` (or null) suppress dumping.
    // schemaDumpPath() returns null when schemaDump is disabled.
    const rawFilename = this.schemaDumpPath(config);
    if (rawFilename == null) return;
    // Resolve relative paths against `root` so the dump lands in the app's
    // db/ dir regardless of process cwd — mirrors loadSchema's resolution.
    const filename = this._resolveSchemaPath(rawFilename);
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
    const { SchemaDumper } = await import("../connection-adapters/abstract/schema-dumper.js");
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
    // Rails: file ||= schema_dump_path(db_config, format); return unless file
    // Ruby `unless file` is nil/false only — "" is truthy there, so blank strings
    // reach check_schema_file. Use == null (nullish) to match that.
    const filename = file ?? this.schemaDumpPath(config, format);
    if (filename == null) return;

    // Rails: `verbose_was, Migration.verbose = Migration.verbose, verbose? && ENV["VERBOSE"]`
    // (`database_tasks.rb:380`) — the extra ENV["VERBOSE"] term keeps a schema
    // load quiet unless VERBOSE was set explicitly; restored at `:394`.
    const { Migration } = await import("../migration.js");
    const verboseWas = Migration.verbose;
    Migration.verbose = isVerbose() && getEnv("VERBOSE") !== undefined;
    try {
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
      const absolute = this._resolveSchemaPath(filename);
      const href = path.pathToFileURL(absolute).href;
      const mod = (await import(href)) as {
        default?: (ctx: unknown) => Promise<void> | void;
      };
      const defineSchema =
        mod.default ?? (mod as unknown as (ctx: unknown) => Promise<void> | void);
      if (typeof defineSchema !== "function") {
        throw new Error(`Schema file must export a default function (got ${typeof defineSchema})`);
      }
      const adapter = await this._migrationAdapter();
      await defineSchema(adapter);
      // Stamp using the resolved absolute path — `filename` may be
      // relative and `schemaSha1` reads the file via getFs(), so the
      // path must match what was actually imported.
      await this._stampSchemaSha1(config, absolute);
    } finally {
      Migration.verbose = verboseWas;
    }
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
      const sha1 = await this.schemaSha1(filename);
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
    for (const dbConfig of this.eachCurrentConfiguration(this._normalizeEnv(environment))) {
      await this.loadSchema(dbConfig, format, file);
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
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    const pool = Base.connectionPool();
    const adapter = await pool.leaseConnection();
    const migrator = await this._migratorFor(adapter, pool.dbConfig);
    // Mirrors database_tasks.rb:302-305: abort unless schema_migrations exists.
    if (!(await migrator.schemaMigrationTableExists())) {
      throw new Error("Schema migrations table does not exist yet.");
    }
    const rows = await migrator.migrationsStatus();
    const dbName = pool.dbConfig.database ?? ":memory:";
    const center = (s: string, w: number) => {
      const pad = w - s.length;
      const left = Math.floor(pad / 2);
      return " ".repeat(left) + s + " ".repeat(pad - left);
    };
    const puts = (s: string) => stdout.write(s + "\n");
    puts(`\ndatabase: ${dbName}\n`);
    puts(`${center("Status", 8)}  ${"Migration ID".padEnd(14)}  Migration Name`);
    puts("-".repeat(50));
    for (const row of rows) {
      puts(`${center(row.status, 8)}  ${row.version.padEnd(14)}  ${row.name}`);
    }
    puts("");
  }

  /**
   * Return the highest applied migration version, or 0 if no migrations
   * have been run (or the schema_migrations table does not yet exist).
   *
   * Mirrors: `ActiveRecord::Base.connection_pool.migration_context.current_version`
   * (called by `rails db:version`).
   */
  static async currentVersion(): Promise<number> {
    const pool = await this.migrationConnectionPool();
    const adapter = await pool.leaseConnection();
    const migrator = await this._migratorFor(adapter, pool.dbConfig);
    return migrator.currentVersionReadOnly();
  }

  /**
   * @param options.targetVersion "Migrate up to here" — the in-process
   *   stand-in for Rails' `ENV["VERSION"]`, which `migrate_all` reads through
   *   `target_version` in `db_configs_with_versions`. See {@link migrate}.
   */
  static async migrateAll({
    targetVersion,
  }: { targetVersion?: number | string | null } = {}): Promise<void> {
    const configs = this.configsFor(this._normalizeEnv());

    // Rails: initialize_database for every config before the single-primary fast path or version loop.
    for (const config of configs) {
      await initializeDatabase(config);
    }

    // Rails: a single primary database short-circuits the per-config loop and
    // migrates the already-established connection directly, skipping the
    // temporary-pool churn (`db_configs.size == 1 && db_configs.first.primary?`).
    // Rails: `db_configs.size == 1 && db_configs.first.primary?`. `primary?`
    // (TS: `isPrimary()`) lives on HashConfig/UrlConfig, not the abstract
    // DatabaseConfig, so reach it structurally off the concrete instance.
    if (configs.length === 1 && (configs[0] as { isPrimary?(): boolean }).isPrimary?.()) {
      await this.migrate(undefined, { skipInitialize: true, targetVersion });
      return;
    }

    const mappedVersions = await this.dbConfigsWithVersions(undefined, targetVersion);
    const sorted = Array.from(mappedVersions.entries()).sort(([a], [b]) =>
      BigInt(String(a)) < BigInt(String(b)) ? -1 : BigInt(String(a)) > BigInt(String(b)) ? 1 : 0,
    );
    for (const [version, dbConfigs] of sorted) {
      for (const dbConfig of dbConfigs) {
        await this.withTemporaryConnection(dbConfig, async (adapter) => {
          const migrator = await this._migratorFor(adapter, dbConfig);
          await migrator.migrate(version ?? null);
          adapter.schemaCache.clearBang();
        });
      }
    }
  }

  static async prepareAll(): Promise<void> {
    const env = this._normalizeEnv();
    let seed = false;
    const dumpDbConfigs: DatabaseConfig[] = [];

    // Rails: each_current_configuration { |db_config| initialize_database(db_config) }
    for (const envName of eachCurrentEnvironment(env)) {
      for (const dbConfig of this.configsFor(envName)) {
        const databaseInitialized = await initializeDatabase(dbConfig);
        if (databaseInitialized && dbConfig.seeds) seed = true;
      }
    }

    // Rails: db_configs_with_versions per environment, sort, migrate each.
    for (const envName of eachCurrentEnvironment(env)) {
      const mappedVersions = await this.dbConfigsWithVersions(envName);
      const sorted = Array.from(mappedVersions.entries()).sort(([a], [b]) =>
        BigInt(String(a)) < BigInt(String(b)) ? -1 : BigInt(String(a)) > BigInt(String(b)) ? 1 : 0,
      );
      for (const [version, dbConfigs] of sorted) {
        for (const dbConfig of dbConfigs) {
          if (!dumpDbConfigs.includes(dbConfig)) dumpDbConfigs.push(dbConfig);
          await this.withTemporaryPool(dbConfig, async (pool) => {
            const migrator = await this._migratorFor(await pool.leaseConnection(), dbConfig);
            await migrator.migrate(version ?? null);
          });
        }
      }
    }

    if (this.dumpSchemaAfterMigration) {
      for (const config of dumpDbConfigs) {
        await this.withTemporaryPool(config, async () => {
          await this.dumpSchema(config);
        });
      }
    }

    if (seed && this.seedLoader) await this.loadSeed();
  }

  /**
   * @param targetVersionOverride In-process stand-in for Rails'
   *   `ENV["VERSION"]`, which this reads through {@link targetVersion} when
   *   not supplied. See {@link migrate}.
   */
  static async dbConfigsWithVersions(
    environment?: string,
    targetVersionOverride?: number | string | null,
  ): Promise<Map<string | number, DatabaseConfig[]>> {
    const dbConfigsWithVersions = new Map<string | number, DatabaseConfig[]>();
    const env = this._normalizeEnv(environment);
    const explicit =
      typeof targetVersionOverride === "string"
        ? targetVersionOverride.trim() || null
        : (targetVersionOverride ?? null);
    const targetVersion = explicit === null ? this.targetVersion() : Number(explicit);
    for (const config of this.configsFor(env)) {
      await this.withTemporaryPool(config, async (pool) => {
        const context = await this._migrationContextFor(await pool.leaseConnection(), config);
        const versionsToRun = await context.pendingMigrationVersions();
        for (const version of versionsToRun) {
          if (targetVersion !== null && targetVersion !== Number(version)) continue;
          const list = dbConfigsWithVersions.get(version) ?? [];
          list.push(config);
          dbConfigsWithVersions.set(version, list);
        }
      });
    }
    return dbConfigsWithVersions;
  }

  /**
   * Mirrors Rails' `DatabaseTasks.with_temporary_pool`
   * (`tasks/database_tasks.rb:541-548`): establishes a pool for `config`
   * (clobber defaults to false, so an existing pool for the same config object
   * is reused), yields it, then re-establishes the original config.
   *
   * @internal
   */
  static async withTemporaryPool<T>(
    config: DatabaseConfig,
    fn: (pool: ConnectionPool) => Promise<T>,
    { clobber = false }: { clobber?: boolean } = {},
  ): Promise<T> {
    const migrationClass = await this.migrationClass();
    const originalDbConfig = migrationClass.connectionDbConfig();
    // Rails passes the `DatabaseConfig` object itself
    // (tasks/database_tasks.rb:542,544), which is what lets
    // `ConnectionHandler#establish_connection` recognise an already-established
    // pool for the same config and reuse it instead of opening a second one
    // (connection_adapters/abstract/connection_handler.rb:139). Handing over a
    // plain hash would mint a fresh `HashConfig` that can never match, and a
    // second pool on a `:memory:` database discards the first one's data.
    try {
      // Rails: `connection_handler.establish_connection(db_config, clobber:)`
      // (database_tasks.rb:543). Ruby's `establish_connection(config_or_env = nil)`
      // takes no `clobber:`, so the kwarg can only be threaded through the handler.
      const pool = migrationClass.connectionHandler.establishConnection(config, {
        owner: migrationClass.connectionClassForSelf(),
        clobber,
      });
      // Deviation: ESM cannot import synchronously, so the handler resolves the
      // adapter class through a dynamic `import()` when given no adapterFactory
      // (connection-handler.ts:181-186) and the pool is not leasable until it
      // settles. Ruby resolves the constant inline at :543.
      await pool.adapterReady;
      return await fn(pool);
    } finally {
      // Rails: `establish_connection(original_db_config, clobber: clobber)`
      // (database_tasks.rb:547), unconditionally. Same reason as above for
      // restoring through the config OBJECT rather than a plain hash.
      await migrationClass.connectionHandler.establishConnection(originalDbConfig, {
        owner: migrationClass.connectionClassForSelf(),
        clobber,
      }).adapterReady;
    }
  }

  static async withTemporaryConnection<T>(
    config: DatabaseConfig,
    fn: (
      adapter: import("../connection-adapters/abstract-adapter.js").AbstractAdapter,
    ) => Promise<T>,
    { clobber = false }: { clobber?: boolean } = {},
  ): Promise<T> {
    return this.withTemporaryPool(config, async (pool) => fn(await pool.leaseConnection()), {
      clobber,
    });
  }

  /**
   * @internal Mirrors: `DatabaseTasks.with_temporary_pool_for_each`
   * (`tasks/database_tasks.rb:512-521`).
   */
  static async withTemporaryPoolForEach(
    { env, name, clobber = false }: { env?: string; name?: string; clobber?: boolean } = {},
    block: (pool: ConnectionPool) => Promise<void>,
  ): Promise<void> {
    env = this._normalizeEnv(env);
    if (name != null) {
      const dbConfig = (await this.migrationClass())
        .configurations()
        .configsFor({ envName: env, name })[0];
      if (dbConfig) await this.withTemporaryPool(dbConfig, block, { clobber });
    } else {
      for (const dbConfig of (await this.migrationClass())
        .configurations()
        .configsFor({ envName: env, name })) {
        await this.withTemporaryPool(dbConfig, block, { clobber });
      }
    }
  }

  static async migrationClass(): Promise<typeof import("../base.js").Base> {
    const { Base } = await import("../base.js");
    this._baseClass = Base;
    return Base;
  }

  /**
   * @internal Receives `ActiveRecord::Base` from base.ts at module init. Rails
   * resolves the constant at call time via autoload
   * (database_statements.rb:222-223), so base.rb is not required here; in ESM a
   * value import of `base.js` would instead be a load-time edge putting base.ts
   * in an import cycle, leaving its own module-evaluation-time mixin wiring
   * dependent on the graph's entry order.
   */
  static _registerBase(base: typeof import("../base.js").Base): void {
    this._baseClass = base;
    setModuleBase(base);
  }

  static migrationConnection():
    | import("../connection-adapters/abstract-adapter.js").AbstractAdapter
    | null {
    if (!this._baseClass) return null;
    try {
      // The Rails-named `leaseConnection` is now async (it awaits per-checkout
      // `verifyBang` — see ConnectionPool#checkout). This sync accessor uses the
      // `leaseConnectionSync` escape hatch, which resolves a pinned connection /
      // establishes a first lease without the async verify.
      return this._baseClass.connectionPool().leaseConnectionSync();
    } catch (error) {
      if (error instanceof ConnectionNotDefined) return null;
      throw error;
    }
  }

  static async migrationConnectionPool(): Promise<ConnectionPool> {
    return (await this.migrationClass()).connectionPool();
  }

  static async schemaUpToDate(
    config: DatabaseConfig,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
  ): Promise<boolean> {
    void format;
    const filename = file ?? this.schemaDumpPath(config);
    if (!filename) return true;
    const fs = getFs();
    if (!fs.existsSync(filename)) return true;

    let adapter: import("../connection-adapters/abstract-adapter.js").AbstractAdapter;
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

    const fileSha1 = await this.schemaSha1(filename);
    return storedSha1 === fileSha1;
  }

  /**
   * @internal Mirrors: `schema_sha1` (`tasks/database_tasks.rb:615-617`).
   * `OpenSSL::Digest::SHA1.hexdigest` has no synchronous JS analogue, so the
   * `crypto` module is resolved through the async platform accessor.
   */
  private static async schemaSha1(file: string): Promise<string> {
    const bytes = getFs().readFileSync(file);
    const crypto = await getCryptoAsync();
    const hash = crypto.createHash("sha1");
    hash.update(bytes);
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
    let adapter: import("../connection-adapters/abstract-adapter.js").AbstractAdapter;
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

  /**
   * Mirrors: DatabaseTasks#truncate_tables (`tasks/database_tasks.rb:230-234`)
   * — `with_temporary_connection(db_config) { |conn| conn.truncate_tables(*conn.tables) }`,
   * letting each adapter emit its own statement
   * (`abstract/database_statements.rb:222-231`). The handler hook checked first
   * is a trails invention the remaining mysql/sqlite tasks still ride on.
   * @internal
   */
  static async truncateTables(config: DatabaseConfig): Promise<void> {
    const handler = this.databaseAdapterFor(config);
    if (handler.truncateAll) {
      await handler.truncateAll(config);
      return;
    }
    await this.withTemporaryConnection(config, async (conn) => {
      await conn.truncateTables(...(await conn.tables()));
    });
  }

  static async reconstructFromSchema(
    config: DatabaseConfig,
    format: SchemaFormat = DatabaseTasks.schemaFormat,
    file?: string,
  ): Promise<void> {
    // Rails: file ||= schema_dump_path(db_config, format)
    const resolvedFile = file ?? this.schemaDumpPath(config, format) ?? undefined;
    // Rails: check_schema_file(file) if file
    if (resolvedFile !== undefined) this.checkSchemaFile(resolvedFile);

    const { NoDatabaseError } = await import("../errors.js");
    // Mirrors Rails' `with_temporary_pool(db_config, clobber: true)` wrapper:
    // establishes a fresh connection so schemaUpToDate can query ar_internal_metadata,
    // then restores the prior connection when done.
    await this.withTemporaryPool(config, async () => {
      try {
        if (await this.schemaUpToDate(config, format, resolvedFile)) {
          if (getEnv("SKIP_TEST_DATABASE_TRUNCATE") === undefined) {
            await this.truncateTables(config);
          }
        } else {
          await this.purge(config);
          await this.loadSchema(config, format, resolvedFile);
        }
      } catch (error) {
        if (!(error instanceof NoDatabaseError)) throw error;
        await this.create(config);
        await this.loadSchema(config, format, resolvedFile);
      }
    });
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

function _errorToS(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** @internal */
export function isVerbose(): boolean {
  const v = getEnv("VERBOSE");
  return v !== undefined ? v !== "false" : true;
}

/**
 * The bookkeeping tables `truncate_tables` excludes from truncation — the
 * composed schema_migrations and ar_internal_metadata table names. Rails reads
 * `pool.schema_migration.table_name` / `pool.internal_metadata.table_name`
 * (database_statements.rb:222-223), each composed from the configurable Base
 * accessors plus table_name_prefix/suffix (schema_migration.rb:49-50,
 * internal_metadata.rb:31-32).
 */
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
export async function checkCurrentProtectedEnvironmentBang(
  dbConfig: DatabaseConfig,
): Promise<void> {
  const { NoDatabaseError } = await import("../errors.js");
  const { EnvironmentMismatchError } = await import("../migration.js");
  // Deviation: Rails uses `with_temporary_pool { |pool| pool.migration_context }`
  // and rescues inside the block (`database_tasks.rb:635-636`, `:648-649`).
  // `ConnectionPool#migrationContext` builds its collaborators over the pool's
  // adapter proxy, which routes the synchronous `toSql` those queries need
  // through `withConnection` and hands them a Promise instead of SQL; and
  // `withTemporaryConnection` leases eagerly, so `NoDatabaseError` can surface
  // from the lease. Both converge in
  // `check-current-protected-environment-pool-migration-context-blocked-on-adapter-proxy`.
  try {
    await DatabaseTasks.withTemporaryConnection(dbConfig, async (adapter) => {
      const migrationContext = await DatabaseTasks._migrationContextFor(adapter, dbConfig);
      const current = migrationContext.currentEnvironment;
      const stored = await migrationContext.lastStoredEnvironment();

      if (await migrationContext.protectedEnvironment()) {
        throw new ProtectedEnvironmentError(stored!);
      }

      if (stored && stored !== current) {
        throw new EnvironmentMismatchError(current, stored);
      }
    });
  } catch (error) {
    if (error instanceof NoDatabaseError) return;
    throw error;
  }
}

/** @internal */
export async function initializeDatabase(dbConfig: DatabaseConfig): Promise<boolean> {
  const { NoDatabaseError } = await import("../errors.js");
  const { SchemaMigration } = await import("../schema-migration.js");
  return DatabaseTasks.withTemporaryPool(dbConfig, async (pool) => {
    let alreadyInitialized = false;
    for (;;) {
      try {
        const adapter = await pool.leaseConnection();
        // Probe DB connectivity first — throws NoDatabaseError if the DB doesn't exist.
        // tableExists() swallows all errors internally so can't detect a missing DB.
        await adapter.execute("SELECT 1");
        const sm = new SchemaMigration(adapter);
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
