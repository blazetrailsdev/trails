import { Command } from "commander";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import {
  env,
  setExitCode,
  getProcessAdapter,
  registerProcessAdapter,
} from "@blazetrails/activesupport/process-adapter";
import {
  loadDatabaseConfig,
  loadAllDatabaseConfigs,
  connectAdapter,
  resolveEnv,
  resolveSchemaFormat,
  type DatabaseConfig as RawConfig,
} from "../database.js";
import { discoverMigrations } from "../migration-loader.js";
import {
  Base,
  DatabaseTasks,
  HashConfig,
  InternalMetadata,
  Migrator,
  SchemaMigration,
  eachCurrentEnvironment,
} from "@blazetrails/activerecord";
import type { DatabaseAdapter } from "@blazetrails/activerecord";

async function closeAdapter(adapter: DatabaseAdapter): Promise<void> {
  const maybeClose = (adapter as unknown as { close?: () => Promise<void> }).close;
  if (typeof maybeClose === "function") await maybeClose.call(adapter);
}

function normalizeRawConfig(raw: RawConfig): RawConfig {
  const normalized: Record<string, unknown> = { ...raw };
  if (!normalized.adapter) {
    if (typeof normalized.url === "string") {
      const inferred = inferAdapterFromUrl(normalized.url);
      if (inferred) normalized.adapter = inferred;
    }
    if (!normalized.adapter) normalized.adapter = "sqlite3";
  }
  if (!normalized.database && typeof normalized.url === "string") {
    const db = databaseFromUrl(normalized.url, normalized.adapter as string | undefined);
    if (db) normalized.database = db;
    try {
      const parsed = new URL(normalized.url);
      const protocol = parsed.protocol;
      const isSqlite =
        normalized.adapter === "sqlite3" ||
        normalized.adapter === "sqlite" ||
        protocol === "sqlite:" ||
        protocol === "sqlite3:" ||
        protocol === "file:";
      if (!isSqlite) {
        if (!normalized.host && parsed.hostname) normalized.host = parsed.hostname;
        if (!normalized.username && parsed.username) {
          normalized.username = decodeURIComponent(parsed.username);
        }
        if (!normalized.password && parsed.password) {
          normalized.password = decodeURIComponent(parsed.password);
        }
      }
    } catch {
      // leave unparsed url as-is; adapters will surface the error
    }
  }
  return normalized as RawConfig;
}

async function migrationsDir(): Promise<string> {
  const [fs, path] = await Promise.all([getFsAsync(), getPathAsync()]);
  return path.join(fs.cwd(), "db", "migrations");
}

/**
 * Resolve the migrations directories for a named database config.
 * Mirrors Rails' per-DB migrations_paths: the user can set
 * `migrationsPaths` (string or string[]) in config/database.ts;
 * otherwise primary defaults to `db/migrations` and named DBs
 * default to `db/migrations_<name>`. Returns an array because
 * Rails supports multiple directories per config.
 */
async function migrationsDirsForConfig(name: string, config: RawConfig): Promise<string[]> {
  const [fs, path] = await Promise.all([getFsAsync(), getPathAsync()]);
  const cwd = fs.cwd();
  const raw = (config as { migrationsPaths?: string | string[] }).migrationsPaths;
  if (typeof raw === "string" && raw.length > 0) return [path.resolve(cwd, raw)];
  if (Array.isArray(raw)) {
    const dirs = [...new Set(raw.filter((p) => p.length > 0).map((p) => path.resolve(cwd, p)))];
    if (dirs.length > 0) return dirs;
  }
  if (name === "primary") return [path.join(cwd, "db", "migrations")];
  return [path.join(cwd, "db", `migrations_${name}`)];
}

/**
 * Discover migrations across multiple directories and concatenate them.
 * Duplicate-version validation is handled by Migrator (which throws
 * DuplicateMigrationVersionError) so conflicting migrations are
 * surfaced as errors instead of being silently skipped.
 */
async function discoverMigrationsFromDirs(dirs: string[]): ReturnType<typeof discoverMigrations> {
  const all = await Promise.all(dirs.map((d) => discoverMigrations(d)));
  return all.flat();
}

interface DatabaseOpts {
  database?: string;
}

/**
 * Presence-based validation for --database. Rejects empty strings so
 * `--database=""` doesn't silently fan out across all DBs (which
 * would be destructive for `drop`).
 */
function validateDatabaseFlag(opts: DatabaseOpts): string | undefined {
  if (opts.database === undefined) return undefined;
  const trimmed = opts.database.trim();
  if (trimmed.length === 0) {
    throw new Error("--database requires a non-empty name (e.g. --database=primary).");
  }
  return trimmed;
}

interface DatabaseEntry {
  name: string;
  raw: RawConfig;
  hashConfig: HashConfig;
}

/**
 * Every named config in the current env, optionally filtered to one name
 * via `--database`. Builds HashConfigs first so we can filter by
 * databaseTasks() — replicas and configs with `databaseTasks: false` are
 * skipped, matching Rails' `configsFor(includeHidden: false)`.
 */
async function taskableDatabaseEntries(
  opts: DatabaseOpts,
  envName: string = resolveEnv(),
): Promise<DatabaseEntry[]> {
  const dbName = validateDatabaseFlag(opts);
  const allConfigs = await loadAllDatabaseConfigs(envName);
  const all = allConfigs.map(({ name, config: rawConfig }) => {
    const raw = normalizeRawConfig(rawConfig);
    return { name, raw, hashConfig: new HashConfig(envName, name, raw as Record<string, unknown>) };
  });
  const taskable = all.filter((c) => c.hashConfig.databaseTasks());
  const filtered = dbName ? taskable.filter((c) => c.name === dbName) : taskable;
  if (filtered.length === 0 && dbName) {
    const available = taskable.map((c) => c.name).join(", ");
    throw new Error(
      `No database configuration named "${dbName}" in environment "${envName}". ` +
        `Available: ${available || "(none)"}`,
    );
  }
  return filtered;
}

/**
 * Iterate every named database config in the current env, optionally
 * filtered to a single name via `--database`. Mirrors Rails'
 * `DatabaseTasks.for_each(databases) { |name| ... }` which generates
 * per-name rake tasks. Commander can't generate dynamic subcommands,
 * so we use a `--database` flag instead.
 *
 * For each config: connects an adapter, runs `fn`, closes the adapter.
 * `fn` receives the adapter, the raw config, the HashConfig, and the
 * config name.
 */
async function forEachDatabase(
  opts: DatabaseOpts,
  fn: (ctx: {
    adapter: DatabaseAdapter;
    raw: RawConfig;
    config: HashConfig;
    name: string;
    /** Prefix for log output — empty string for single-DB apps so
     *  the output stays clean; "[name] " for multi-DB. */
    prefix: string;
  }) => Promise<void>,
): Promise<void> {
  const filtered = await taskableDatabaseEntries(opts);
  const multiDb = filtered.length > 1;
  for (const { name, raw, hashConfig } of filtered) {
    const prefix = multiDb ? `[${name}] ` : "";
    await DatabaseTasks.withTemporaryPool(hashConfig, async (pool) => {
      const adapter = await pool.leaseConnection();
      await fn({ adapter, raw, config: hashConfig, name, prefix });
    });
  }
}

/**
 * Like forEachDatabase but doesn't connect an adapter — for commands
 * like `create` and `drop` that need to operate BEFORE the DB exists.
 */
async function forEachDatabaseConfig(
  opts: DatabaseOpts,
  fn: (ctx: { raw: RawConfig; config: HashConfig; name: string; prefix: string }) => Promise<void>,
): Promise<void> {
  const filtered = await taskableDatabaseEntries(opts);
  const multiDb = filtered.length > 1;
  for (const { name, raw, hashConfig } of filtered) {
    const prefix = multiDb ? `[${name}] ` : "";
    await fn({ raw, config: hashConfig, name, prefix });
  }
}

function databaseFromUrl(url: string, adapter?: string): string | undefined {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol;
    const isSqlite =
      adapter === "sqlite3" ||
      adapter === "sqlite" ||
      protocol === "sqlite:" ||
      protocol === "sqlite3:" ||
      protocol === "file:";
    if (isSqlite) {
      // SQLite URLs carry a filesystem path (often absolute). Preserve the
      // leading slash and host prefix if any: `sqlite3:///tmp/app.sqlite3`
      // -> `/tmp/app.sqlite3`; `sqlite3://./rel.sqlite3` -> `./rel.sqlite3`.
      const host = parsed.host;
      const pathname = decodeURIComponent(parsed.pathname);
      return host ? `${host}${pathname}` : pathname;
    }
    const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return name || undefined;
  } catch {
    return undefined;
  }
}

function inferAdapterFromUrl(url: string): string | undefined {
  try {
    switch (new URL(url).protocol) {
      case "postgres:":
      case "postgresql:":
        return "postgresql";
      case "mysql:":
      case "mysql2:":
        return "mysql2";
      case "sqlite:":
      case "sqlite3:":
      case "file:":
        return "sqlite3";
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function toDbConfig(raw: RawConfig, envName: string = resolveEnv()): HashConfig {
  // `withAdapter` normalizes the config before handing it to callers, so
  // this wrapper is a thin adapter from RawConfig to HashConfig. Re-run
  // normalization defensively so external callers that build a
  // HashConfig out-of-band still get adapter/database inference from a
  // url-only config.
  const normalized = normalizeRawConfig(raw);
  return new HashConfig(envName, "primary", normalized as Record<string, unknown>);
}

/**
 * Run `fn` with `DatabaseTasks.databaseConfiguration`, the module-level
 * `DatabaseConfigurations.current` singleton, AND `DatabaseTasks.env`
 * temporarily aligned with `config`. Captures/restores all three so
 * callers can safely invoke methods like `DatabaseTasks.truncateAll(env)`
 * that resolve the env via `_normalizeEnv()` (reads DatabaseTasks.env by
 * default) and then call `configsFor` against it.
 */
async function withRegisteredConfiguration<T>(
  config: HashConfig,
  fn: () => Promise<T>,
): Promise<T> {
  return withRegisteredConfigurations([config], config.envName, fn);
}

/**
 * Multi-config variant: register every HashConfig for the env so
 * `DatabaseTasks.configsFor(envName)` fans out across them. Used by
 * commands that mirror Rails' `with_temporary_pool_for_each` /
 * `configs_for(env_name:).each` — schema:cache:dump, schema:cache:clear
 * — which need to hit every named DB (primary + animals + ...) in a
 * multi-DB app.
 */
async function withRegisteredConfigurations<T>(
  configs: HashConfig[],
  envName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { DatabaseConfigurations } = await import("@blazetrails/activerecord");
  const previousTasksConfig = DatabaseTasks.databaseConfiguration;
  const previousCurrent = DatabaseConfigurations.current;
  const previousEnv = DatabaseTasks.env;
  DatabaseTasks.databaseConfiguration = new DatabaseConfigurations(configs);
  DatabaseTasks.env = envName;
  try {
    return await fn();
  } finally {
    DatabaseTasks.databaseConfiguration = previousTasksConfig;
    DatabaseConfigurations.current = previousCurrent;
    DatabaseTasks.env = previousEnv;
  }
}

/**
 * Run Rails' `check_protected_environments!` guard with a temporarily-
 * registered `DatabaseTasks.databaseConfiguration` so it actually consults
 * the stored env in `ar_internal_metadata`. Without the registration the
 * guard has no configs to loop over and silently checks nothing, which
 * misses `EnvironmentMismatchError` and the protected-stamp case.
 */
async function runProtectedEnvCheck(config: HashConfig, envName: string): Promise<void> {
  const { DatabaseConfigurations } = await import("@blazetrails/activerecord");
  // DatabaseConfigurations' constructor registers itself as the
  // module-level "current" singleton (HashConfig.isPrimary consults it),
  // so swapping DatabaseTasks.databaseConfiguration isn't enough on its
  // own. Capture BOTH slots — they may differ when other code (e.g.
  // connection-handling) created a DatabaseConfigurations without
  // assigning it to DatabaseTasks.databaseConfiguration — and restore
  // both in finally instead of clobbering the singleton with an empty
  // fallback.
  const previousTasksConfig = DatabaseTasks.databaseConfiguration;
  const previousCurrent = DatabaseConfigurations.current;
  DatabaseTasks.databaseConfiguration = new DatabaseConfigurations([config]);
  try {
    await DatabaseTasks.checkProtectedEnvironmentsBang(envName);
  } finally {
    DatabaseTasks.databaseConfiguration = previousTasksConfig;
    DatabaseConfigurations.current = previousCurrent;
  }
}

/**
 * Dump the schema to disk after a migration-writing task. Mirrors Rails'
 * `db:_dump`: gated on `DatabaseTasks.dumpSchemaAfterMigration`, and
 * delegates to `DatabaseTasks.dumpSchema(config)` so ts / js / sql formats
 * route through the same code path the standalone `trails db schema:dump`
 * subcommand uses.
 *
 * Respects the same schema-format precedence as the standalone command —
 * SCHEMA_FORMAT env / config.schemaFormat / existence inference — so an
 * app that commits a structure.sql stays on sql through the whole
 * migrate → dump cycle.
 */
async function dumpSchemaAfterMigrate(raw: RawConfig, hashConfig?: HashConfig): Promise<void> {
  if (!DatabaseTasks.dumpSchemaAfterMigration) return;
  const config = hashConfig ?? toDbConfig(raw);
  const previousFormat = DatabaseTasks.schemaFormat;
  try {
    DatabaseTasks.schemaFormat = await resolveSchemaFormat();
    await DatabaseTasks.dumpSchema(config);
  } finally {
    DatabaseTasks.schemaFormat = previousFormat;
  }
}

interface RunOptions {
  /**
   * When true, skip the post-task schema dump. Used by composite
   * commands (e.g. `migrate:redo`) that want to dump once at the end
   * instead of twice.
   */
  skipDump?: boolean;
}

/**
 * Centralized Migrator construction so every CLI command stamps
 * ar_internal_metadata.environment with the resolved TRAILS_ENV and
 * respects useMetadataTable. Without this, `db migrate:up`,
 * `db migrate:status`, etc. would default to NODE_ENV and potentially
 * stamp a different env than `db migrate`.
 */
function createMigrator(
  adapter: DatabaseAdapter,
  migrations: Awaited<ReturnType<typeof discoverMigrations>>,
): Migrator {
  return new Migrator(
    "up",
    migrations,
    new SchemaMigration(adapter),
    new InternalMetadata(adapter),
  );
}

async function runMigrate(
  adapter: DatabaseAdapter,
  raw: RawConfig,
  targetVersion?: string,
  options: RunOptions = {},
): Promise<void> {
  const migrations = await discoverMigrations(await migrationsDir());
  if (migrations.length === 0) {
    console.log("No migrations found.");
    return;
  }

  const migrator = createMigrator(adapter, migrations);
  await migrator.migrate(targetVersion ?? null);

  const pending = await migrator.pendingMigrations();
  if (pending.length === 0) console.log("All migrations are up to date.");

  if (!options.skipDump) await dumpSchemaAfterMigrate(raw);
}

/**
 * Run a seed-running callback with `Base.adapter` temporarily set so
 * seed files that touch ActiveRecord models work. Restores the previous
 * `Base.adapter` on exit (including when the outer caller is about to
 * close the provided adapter) so we don't leave `Base` pointing at a
 * closed connection.
 */
async function withSeedAdapter(adapter: DatabaseAdapter, fn: () => Promise<void>): Promise<void> {
  const { Base } = await import("@blazetrails/activerecord");
  const previous = Base._adapter;
  Base.adapter = adapter;
  try {
    await fn();
  } finally {
    // Preserve setter side effects (schema reset, arel-visitor wiring)
    // when restoring a non-null adapter. Fall back to the backing field
    // for a previous null because the public setter is typed as
    // DatabaseAdapter, not DatabaseAdapter | null.
    if (previous === null) {
      Base._adapter = previous;
    } else {
      Base.adapter = previous;
    }
  }
}

/**
 * Purge the test DB and load the schema file. Shared implementation
 * behind `trails db test:load_schema` and `trails db test:prepare` —
 * Rails' `db:test:prepare` task just invokes `db:test:load_schema`, so
 * keeping the flow in one helper prevents the two commands from
 * drifting.
 *
 * Rails' chain: `test:load_schema → test:purge → DatabaseTasks.purge`
 * (disconnect → drop → create → reconnect). We delegate to
 * DatabaseTasks.purge to preserve the disconnect/reconnect semantics
 * instead of hand-rolling drop+create.
 */
async function runTestLoadSchema(options: {
  successMessage: (displayName: string, filename: string) => string;
}): Promise<void> {
  const raw = normalizeRawConfig(await loadDatabaseConfig("test"));
  const config = toDbConfig(raw, "test");
  await runProtectedEnvCheck(config, "test");
  const filename = DatabaseTasks.schemaDumpPath(config);
  const fs = await getFsAsync();
  if (!filename || !(await fs.exists(filename))) {
    console.error(
      `No schema file found at ${filename ?? "(none)"}. Run \`trails db schema:dump\` first.`,
    );
    setExitCode(1);
    return;
  }
  await DatabaseTasks.purge(config);
  await DatabaseTasks.withTemporaryPool(config, async () => {
    await DatabaseTasks.loadSchema(config);
  });
  console.log(options.successMessage(displayNameFor(config, raw), filename));
}

let _seedImportCounter = 0;
async function runSeed(prefix = ""): Promise<void> {
  const [fs, path] = await Promise.all([getFsAsync(), getPathAsync()]);
  const cwd = fs.cwd();
  const seedCandidates = [path.join(cwd, "db", "seeds.ts"), path.join(cwd, "db", "seeds.js")];
  let seedFile: string | undefined;
  for (const f of seedCandidates) {
    if (await fs.exists(f)) {
      seedFile = f;
      break;
    }
  }
  if (!seedFile) {
    console.log(`${prefix}No seeds file found at db/seeds.ts or db/seeds.js`);
    return;
  }

  console.log(`${prefix}Running seeds...`);
  // Cache-bust the import so the seed file is re-evaluated for each
  // database in a multi-DB fan-out. Node caches dynamic imports by URL;
  // without the query string, the second iteration sees a cached module
  // and skips execution entirely. Mirrors Rails' `load` semantics
  // (which always re-evaluates the file).
  const pathToFileURL = path.pathToFileURL;
  if (!pathToFileURL) {
    throw new Error("Seed loading requires a path adapter with pathToFileURL support.");
  }
  const url = pathToFileURL(seedFile);
  url.searchParams.set("_t", `${++_seedImportCounter}`);
  await import(url.href);
  console.log(`${prefix}Seeds completed.`);
}

/** Strip credentials from a DB URL before we log it. */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    if (parsed.username && parsed.password === "***") {
      // Keep username visible so operators can still identify the connection.
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function displayNameFor(config: HashConfig, raw: RawConfig): string {
  return (
    config.database ??
    raw.database ??
    (typeof raw.url === "string" ? sanitizeUrl(raw.url) : undefined) ??
    `${config.adapter ?? "unknown"} database`
  );
}

async function runCreate(opts: DatabaseOpts = {}): Promise<void> {
  await forEachDatabaseConfig(opts, async ({ config }) => {
    await DatabaseTasks.create(config);
  });
}

async function runDrop(opts: DatabaseOpts = {}): Promise<void> {
  await forEachDatabaseConfig(opts, async ({ config }) => {
    await runProtectedEnvCheck(config, config.envName);
    await DatabaseTasks.drop(config);
  });
}

/**
 * Migration output goes to stdout (Rails' Migration#write is `puts`), so the
 * per-database prefix is applied by swapping in a stdout-wrapping process
 * adapter for the duration of the run.
 *
 * A callback prefix is resolved per write, for runs like `migrate_all` that
 * interleave databases within one wrapped block and so have no single prefix.
 */
async function withPrefixedStdout(
  prefix: string | (() => string),
  fn: () => Promise<void>,
): Promise<void> {
  const resolvePrefix = typeof prefix === "function" ? prefix : () => prefix;
  const prevAdapter = prefix === "" ? null : getProcessAdapter();
  if (prevAdapter) {
    registerProcessAdapter({
      ...prevAdapter,
      stdout: {
        write: (chunk) => prevAdapter.stdout.write(`${resolvePrefix()}${chunk}`),
        get isTTY() {
          return prevAdapter.stdout.isTTY;
        },
        get columns() {
          return prevAdapter.stdout.columns;
        },
        get rows() {
          return prevAdapter.stdout.rows;
        },
      },
    });
  }
  try {
    await fn();
  } finally {
    if (prevAdapter) registerProcessAdapter(prevAdapter);
  }
}

async function withMigrationTasksForDb(
  ctx: {
    adapter: DatabaseAdapter;
    raw: RawConfig;
    name: string;
    prefix: string;
    config: HashConfig;
  },
  operation: () => Promise<void>,
  opts?: { afterPending?: (pending: number) => void; runWhenEmpty?: boolean },
): Promise<void> {
  const mDirs = await migrationsDirsForConfig(ctx.name, ctx.raw);
  const migrations = await discoverMigrationsFromDirs(mDirs);
  if (migrations.length === 0 && !opts?.runWhenEmpty) {
    console.log(`${ctx.prefix}No migrations found.`);
    return;
  }
  DatabaseTasks.registerMigrations(migrations, ctx.config);
  await withPrefixedStdout(ctx.prefix, async () => {
    await withRegisteredConfiguration(ctx.config, operation);
  });
  if (opts?.afterPending) {
    const migrator = new Migrator(
      "up",
      migrations,
      new SchemaMigration(ctx.adapter),
      new InternalMetadata(ctx.adapter),
    );
    opts.afterPending((await migrator.pendingMigrations()).length);
  }
  await dumpSchemaAfterMigrate(ctx.raw, ctx.config);
}

/**
 * `db:migrate` — `DatabaseTasks.migrate_all` followed by `db:_dump`
 * (`railties/databases.rake:88-92`). `migrate_all` owns the multi-database
 * routing (single-primary fast path, then `db_configs_with_versions` sorted so
 * one timestamp runs across every config before the next), so the migrations
 * for each config are registered up front and the whole run happens inside a
 * single `configs_for` registration rather than a per-database loop.
 */
async function runMigrateAll(targetVersion: string | null): Promise<void> {
  const envName = resolveEnv();
  const entries = await taskableDatabaseEntries({}, envName);
  const migrationsFor = new Map<string, Awaited<ReturnType<typeof discoverMigrations>>>();
  for (const { name, raw, hashConfig } of entries) {
    const migrations = await discoverMigrationsFromDirs(await migrationsDirsForConfig(name, raw));
    migrationsFor.set(name, migrations);
    DatabaseTasks.registerMigrations(migrations, hashConfig);
  }
  if ([...migrationsFor.values()].every((m) => m.length === 0)) {
    console.log("No migrations found.");
    return;
  }

  // Rails' `load_config` leaves the primary connection established, which is
  // what `migrate_all`'s single-primary fast path migrates directly. The dump
  // stays inside that same scope so a `:memory:` database — whose data dies
  // with its pool — is dumped from the connection that was just migrated.
  const primary = entries.find((e) => e.name === "primary") ?? entries[0];
  const configs = entries.map((e) => e.hashConfig);
  const multiDb = entries.length > 1;
  // migrate_all interleaves databases by version, so the prefix has to follow
  // whichever config it currently has established rather than being fixed for
  // the whole run.
  const { Base } = await import("@blazetrails/activerecord");
  const currentDbPrefix = (): string => {
    if (!multiDb) return "";
    try {
      const name = Base.connectionDbConfig()?.name;
      return name ? `[${name}] ` : "";
    } catch {
      return "";
    }
  };

  await withRegisteredConfigurations(configs, envName, () =>
    DatabaseTasks.withTemporaryPool(primary.hashConfig, async () => {
      await withPrefixedStdout(currentDbPrefix, () => DatabaseTasks.migrateAll({ targetVersion }));
      for (const { name, raw, hashConfig } of entries) {
        const prefix = multiDb ? `[${name}] ` : "";
        await DatabaseTasks.withTemporaryPool(hashConfig, async (pool) => {
          const migrations = migrationsFor.get(name) ?? [];
          const adapter = await pool.leaseConnection();
          const migrator = new Migrator(
            "up",
            migrations,
            new SchemaMigration(adapter),
            new InternalMetadata(adapter),
          );
          const pending = await migrator.pendingMigrations();
          if (pending.length === 0) console.log(`${prefix}All migrations are up to date.`);
          await dumpSchemaAfterMigrate(raw, hashConfig);
        });
      }
    }),
  );
}

/**
 * Every task in `railties/lib/.../databases.rake` is declared
 * `task <name>: :load_config`, and `load_config` itself depends on
 * `:environment` (databases.rake:22) — so by the time any of them runs, the
 * app has booted and `ActiveRecord::Base` holds a pool. `with_temporary_pool`
 * relies on it: its first line is `migration_class.connection_db_config`
 * (`tasks/database_tasks.rb:542`), which raises on a class with no pool in
 * Ruby too. This hook is the `:environment` prerequisite for the `db` command
 * group.
 *
 * `establish_connection` only builds the pool, it does not connect, so this is
 * safe ahead of `db create` on a database that does not exist yet. A config
 * that cannot be resolved is left to the subcommand, which reports it with the
 * message written for that command.
 */
async function establishTaskConnection(): Promise<void> {
  try {
    const envName = resolveEnv();
    const raw = normalizeRawConfig(await loadDatabaseConfig(envName));
    await Base.establishConnection(toDbConfig(raw, envName));
  } catch {
    return;
  }
}

export function dbCommand(): Command {
  const cmd = new Command("db");
  cmd.description("Database management commands");
  cmd.hook("preSubcommand", establishTaskConnection);

  cmd
    .command("migrate")
    .description("Run pending migrations for all databases (or a specific one via --database)")
    .option("--version <version>", "Migrate to a specific version (also reads VERSION env)")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => {
      // Rails: ENV["VERSION"] is an alternative to the --version flag
      // for CI scripts that set VERSION=20260101000000. Normalize blank
      // to null so an empty VERSION="" doesn't fail BigInt parsing.
      const rawVersion = opts.version != null ? String(opts.version).trim() : env.VERSION?.trim();
      const targetVersion = rawVersion && rawVersion.length > 0 ? rawVersion : null;
      if (opts.database === undefined) {
        await runMigrateAll(targetVersion);
        return;
      }
      await forEachDatabase(opts, async (ctx) => {
        await withMigrationTasksForDb(
          ctx,
          () => DatabaseTasks.migrate(undefined, { targetVersion }),
          {
            afterPending: (pending) => {
              if (pending === 0) {
                console.log(`${ctx.prefix}All migrations are up to date.`);
              }
            },
          },
        );
      });
    });

  cmd
    .command("rollback")
    .description("Rollback migrations")
    .option("--step <n>", "Number of migrations to rollback", "1")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => {
      const step = Number(opts.step);
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
        setExitCode(1);
        return;
      }
      await forEachDatabase(opts, async (ctx) => {
        await withMigrationTasksForDb(ctx, () => DatabaseTasks.rollback(step));
      });
    });

  cmd
    .command("forward")
    .description("Move the schema forward N migrations (inverse of rollback)")
    .option("--step <n>", "Number of migrations to apply", "1")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => {
      const step = Number(opts.step);
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
        setExitCode(1);
        return;
      }
      await forEachDatabase(opts, async (ctx) => {
        await withMigrationTasksForDb(ctx, () => DatabaseTasks.forward(step));
      });
    });

  cmd
    .command("version")
    .description("Print the current schema version")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts: DatabaseOpts) => {
      await forEachDatabase(opts, async ({ adapter, prefix }) => {
        const migrator = createMigrator(adapter, []);
        const version = await migrator.currentVersionReadOnly();
        console.log(`${prefix}Current version: ${version}`);
      });
    });

  cmd
    .command("environment:set")
    .description("Stamp the schema with the current environment name")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts: DatabaseOpts) => {
      await forEachDatabase(opts, async ({ adapter, prefix }) => {
        const envName = resolveEnv();
        const internalMetadata = new InternalMetadata(adapter);
        if (!internalMetadata.enabled) {
          const { EnvironmentStorageError } = await import("@blazetrails/activerecord");
          throw new EnvironmentStorageError();
        }
        await internalMetadata.createTableAndSetFlags(envName);
        console.log(`${prefix}Stamped schema with environment: ${envName}`);
      });
    });

  cmd
    .command("environment:check")
    .description(
      "Abort if the stored schema environment is protected or does not match the current environment",
    )
    .action(async () => {
      // Don't go through withAdapter — we don't want to open a connection
      // here. The guard itself connects per-config (and swallows
      // NoDatabaseError) so a missing DB shouldn't crash this command.
      // Pass resolveEnv() explicitly so the check runs against the
      // environment the CLI is currently operating as (RawConfig doesn't
      // carry envName).
      const envName = resolveEnv();
      const raw = normalizeRawConfig(await loadDatabaseConfig(envName));
      const config = toDbConfig(raw, envName);
      try {
        await runProtectedEnvCheck(config, envName);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        setExitCode(1);
      }
    });

  cmd
    .command("abort_if_pending_migrations")
    .description("Exit with non-zero status if any migrations are pending")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts: DatabaseOpts) => {
      await forEachDatabase(opts, async ({ adapter, raw, name, prefix }) => {
        const mDirs = await migrationsDirsForConfig(name, raw);
        const migrations = await discoverMigrationsFromDirs(mDirs);
        if (migrations.length === 0) return;
        const migrator = createMigrator(adapter, migrations);
        // Use the read-only pending check so running this in a
        // production-health-check context (e.g. before deploying) doesn't
        // silently create schema_migrations / ar_internal_metadata.
        const pending = await migrator.pendingMigrationsReadOnly();
        if (pending.length > 0) {
          // Match Rails' output format (from activerecord/lib/active_record/
          // railties/databases.rake), with the command name swapped for
          // trails:
          //   "You have N pending migration[s]:"
          //   "  %4d %s" per pending
          //   "Run `trails db migrate` to resolve this issue."
          // Rails prints `bin/rails db:migrate`; the trails CLI is
          // commander-style (`trails db migrate`, space-separated), not
          // rake-style colon namespaces.
          console.error(
            `${prefix}You have ${pending.length} pending migration${pending.length === 1 ? "" : "s"}:`,
          );
          for (const m of pending) {
            const version = String(BigInt(m.version));
            console.error(`${prefix}  ${version.padStart(4, " ")} ${m.name}`);
          }
          console.error(`${prefix}Run \`trails db migrate\` to resolve this issue.`);
          setExitCode(1);
        }
      });
    });

  cmd
    .command("migrate:up")
    .description("Run a specific migration up (by version)")
    .requiredOption("--version <version>", "Migration version to run up")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => {
      await forEachDatabase(opts, async (ctx) => {
        await withMigrationTasksForDb(ctx, () => DatabaseTasks.runMigration("up", opts.version), {
          runWhenEmpty: true,
        });
      });
    });

  cmd
    .command("migrate:down")
    .description("Run a specific migration down (by version)")
    .requiredOption("--version <version>", "Migration version to run down")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => {
      await forEachDatabase(opts, async (ctx) => {
        await withMigrationTasksForDb(ctx, () => DatabaseTasks.runMigration("down", opts.version), {
          runWhenEmpty: true,
        });
      });
    });

  cmd
    .command("seed")
    .description("Run database seeds")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts: DatabaseOpts) => {
      await forEachDatabase(opts, async ({ adapter, prefix }) => {
        await withSeedAdapter(adapter, () => runSeed(prefix));
      });
    });

  cmd
    .command("seed:replant")
    .description("Truncate all tables in the current environment and re-run seeds")
    .action(async () => {
      // Open the seed adapter only after the protected-env guard has
      // passed and the truncate has completed, so we don't double-connect.
      const raw = normalizeRawConfig(await loadDatabaseConfig());
      const config = toDbConfig(raw);
      await runProtectedEnvCheck(config, config.envName);
      await withRegisteredConfiguration(config, async () => {
        await DatabaseTasks.truncateAll(config.envName);
      });

      const adapter = await connectAdapter(raw);
      try {
        await withSeedAdapter(adapter, runSeed);
      } finally {
        await closeAdapter(adapter);
      }
    });

  cmd
    .command("truncate_all")
    .description("Truncate all tables in the current environment")
    .action(async () => {
      // No need for withAdapter — DatabaseTasks.truncateAll opens its
      // own per-config connection. Connecting here first would create
      // sqlite files as a side effect before the protected-env guard
      // can abort.
      const raw = normalizeRawConfig(await loadDatabaseConfig());
      const config = toDbConfig(raw);
      await runProtectedEnvCheck(config, config.envName);
      await withRegisteredConfiguration(config, async () => {
        await DatabaseTasks.truncateAll(config.envName);
      });
    });

  cmd
    .command("prepare")
    .description(
      "Create the database if it doesn't exist, run pending migrations, and seed when fresh",
    )
    .action(async () => {
      const envName = resolveEnv();
      // prepare_all walks each_current_environment, which appends "test" to a
      // development run (`database_tasks.rb:592-595`), so the test databases
      // must be registered too or prepareAll finds no configs for them.
      const entriesByEnv = await Promise.all(
        eachCurrentEnvironment(envName).map((environment) =>
          taskableDatabaseEntries({}, environment),
        ),
      );
      const entries = entriesByEnv[0];
      if (entries.length === 0) {
        throw new Error(`No database configuration found for environment "${envName}".`);
      }
      const allEntries = entriesByEnv.flat();
      const primaryIndex = Math.max(
        entries.findIndex((entry) => entry.hashConfig.isPrimary()),
        0,
      );

      // Per config, not per name: an env may point the same-named database at
      // its own migrationsPaths.
      const migrationSets = await Promise.all(
        allEntries.map(async (entry) =>
          discoverMigrationsFromDirs(await migrationsDirsForConfig(entry.name, entry.raw)),
        ),
      );
      // Register the current env's primary set unregistered first: that clears
      // any per-config registrations left by an earlier command and leaves a
      // sensible fallback for a config with no directory of its own.
      // `allEntries` leads with the current env, so `primaryIndex` lines up.
      DatabaseTasks.registerMigrations(migrationSets[primaryIndex] ?? []);
      allEntries.forEach((entry, i) => {
        DatabaseTasks.registerMigrations(migrationSets[i] ?? [], entry.hashConfig);
      });

      // Rails' load_seed runs against the established connection, which is
      // the primary's; Base has no connection here, so lend it one.
      const seedTarget = entries[primaryIndex].hashConfig;
      const previousSeedLoader = DatabaseTasks.seedLoader;
      const previousFormat = DatabaseTasks.schemaFormat;
      DatabaseTasks.seedLoader = {
        async loadSeed() {
          await DatabaseTasks.withTemporaryPool(seedTarget, async (pool) => {
            await withSeedAdapter(await pool.leaseConnection(), runSeed);
          });
        },
      };
      try {
        DatabaseTasks.schemaFormat = await resolveSchemaFormat();
        await withRegisteredConfigurations(
          allEntries.map((entry) => entry.hashConfig),
          envName,
          () => DatabaseTasks.prepareAll(),
        );
      } finally {
        DatabaseTasks.seedLoader = previousSeedLoader;
        DatabaseTasks.schemaFormat = previousFormat;
      }
    });

  cmd
    .command("test:load_schema")
    .description("Purge the test DB and load the schema")
    .action(async () => {
      await runTestLoadSchema({ successMessage: (d) => `Loaded test schema into '${d}'` });
    });

  cmd
    .command("test:prepare")
    .description("Prepare the test database (Rails parallel to db:test:prepare)")
    .action(async () => {
      // Rails db:test:prepare → db:test:load_schema. The two commands
      // run the same flow — test:prepare exists as a semantically-named
      // entry point for dev/CI scripts; the implementation delegates to
      // the shared runTestLoadSchema helper.
      await runTestLoadSchema({ successMessage: (_d, f) => `Test database prepared (${f})` });
    });

  cmd
    .command("create")
    .description("Create database(s) — all in the env, or a specific one via --database")
    .option("--database <name>", "Target a specific named database (e.g. primary, animals)")
    .action(async (opts) => runCreate(opts));

  cmd
    .command("drop")
    .description("Drop database(s) — all in the env, or a specific one via --database")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => runDrop(opts));

  cmd
    .command("migrate:status")
    .description("Show migration status")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts: DatabaseOpts) => {
      await forEachDatabase(opts, async ({ adapter, raw, name, prefix }) => {
        const mDirs = await migrationsDirsForConfig(name, raw);
        const migrations = await discoverMigrationsFromDirs(mDirs);
        if (migrations.length === 0) {
          console.log(`${prefix}No migrations found.`);
          return;
        }

        const migrator = createMigrator(adapter, migrations);
        const statuses = await migrator.migrationsStatus();

        console.log("");
        console.log(`${prefix}Status   Migration ID    Migration Name`);
        console.log(`${prefix}--------------------------------------------------`);
        for (const s of statuses) {
          const statusStr = s.status === "up" ? "  up  " : " down ";
          console.log(`${prefix}${statusStr}   ${s.version.padEnd(16)}${s.name}`);
        }
        console.log("");
      });
    });

  cmd
    .command("migrate:redo")
    .description("Rollback and re-run the last migration")
    .option("--step <n>", "Number of migrations to redo", "1")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => {
      const step = Number(opts.step);
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
        setExitCode(1);
        return;
      }
      await forEachDatabase(opts, async (ctx) => {
        await withMigrationTasksForDb(
          ctx,
          async () => {
            await DatabaseTasks.rollback(step);
            await DatabaseTasks.migrate();
          },
          {
            afterPending: (pending) => {
              if (pending === 0) {
                console.log(`${ctx.prefix}All migrations are up to date.`);
              }
            },
          },
        );
      });
    });

  cmd
    .command("reset")
    .description("Drop, create, migrate, and seed the primary database")
    .action(async () => {
      const primary: DatabaseOpts = { database: "primary" };
      await runDrop(primary);
      await runCreate(primary);
      await forEachDatabase(primary, async (ctx) => {
        await withMigrationTasksForDb(ctx, () => DatabaseTasks.migrate());
        await withSeedAdapter(ctx.adapter, () => runSeed(ctx.prefix));
      });
    });

  cmd
    .command("setup")
    .description("Create, migrate, and seed the primary database")
    .action(async () => {
      const primary: DatabaseOpts = { database: "primary" };
      await runCreate(primary);
      await forEachDatabase(primary, async (ctx) => {
        await withMigrationTasksForDb(ctx, () => DatabaseTasks.migrate());
        await withSeedAdapter(ctx.adapter, () => runSeed(ctx.prefix));
      });
    });

  cmd
    .command("schema:dump")
    .description(
      "Dump the current database schema (format precedence: --format > SCHEMA_FORMAT env > config.schemaFormat > existing structure.sql/schema.js/schema.ts > ts)",
    )
    .option("--format <format>", "Override schema format: ts, js, or sql")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => {
      await forEachDatabase(opts, async ({ config, prefix }) => {
        const previousFormat = DatabaseTasks.schemaFormat;
        try {
          DatabaseTasks.schemaFormat = await resolveSchemaFormat(opts);
          const filename = DatabaseTasks.schemaDumpPath(config);
          await DatabaseTasks.dumpSchema(config);
          console.log(`${prefix}Schema dumped to ${filename ?? "(skipped — schemaDump disabled)"}`);
        } finally {
          DatabaseTasks.schemaFormat = previousFormat;
        }
      });
    });

  cmd
    .command("schema:load")
    .description(
      "Load the schema (format precedence: --format > SCHEMA_FORMAT env > config.schemaFormat > existing structure.sql/schema.js/schema.ts > ts)",
    )
    .option("--format <format>", "Override schema format: ts, js, or sql")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts) => {
      const fs = await getFsAsync();
      await forEachDatabase(opts, async ({ config, prefix }) => {
        // schema:load is destructive — Rails gates on
        // check_protected_environments.
        await runProtectedEnvCheck(config, config.envName);
        const previousFormat = DatabaseTasks.schemaFormat;
        try {
          DatabaseTasks.schemaFormat = await resolveSchemaFormat(opts);
          const filename = DatabaseTasks.schemaDumpPath(config);
          if (!filename || !(await fs.exists(filename))) {
            console.error(`${prefix}No schema file found at ${filename ?? "(none)"}`);
            setExitCode(1);
            return;
          }
          try {
            console.log(`${prefix}Loading schema from ${filename}...`);
            await DatabaseTasks.loadSchema(config);
            console.log(`${prefix}Schema loaded.`);
          } catch (error: unknown) {
            if (filename.endsWith(".ts")) {
              const enhanced = new Error(
                `Failed to load schema file "${filename}". ` +
                  `Ensure a TypeScript loader (tsx, ts-node) is configured, ` +
                  `or choose a different schema format with --format js/sql, ` +
                  `SCHEMA_FORMAT=js/sql, or config.schemaFormat.`,
              );
              (enhanced as { cause?: unknown }).cause = error;
              throw enhanced;
            }
            throw error;
          }
        } finally {
          DatabaseTasks.schemaFormat = previousFormat;
        }
      });
    });

  cmd
    .command("schema:cache:dump")
    .description(
      "Dump db/schema_cache.json for every database configuration in the current environment",
    )
    .action(async () => {
      // Rails: `with_temporary_pool_for_each { |pool| dump_schema_cache(pool, filename) }`.
      // Fans out across every named DB in the env for multi-DB apps
      // (primary + animals + ...) — each gets its own
      // `db/<name>_schema_cache.json` per HashConfig.defaultSchemaCachePath.
      const envName = resolveEnv();
      const named = await loadAllDatabaseConfigs(envName);
      const configs = named.map(
        ({ name, config }) =>
          new HashConfig(envName, name, normalizeRawConfig(config) as Record<string, unknown>),
      );
      await withRegisteredConfigurations(configs, envName, async () => {
        for (const config of DatabaseTasks.configsFor(envName)) {
          await DatabaseTasks.withTemporaryPool(config, async (pool) => {
            const adapter = await pool.leaseConnection();
            const filename = DatabaseTasks.cacheDumpFilename(config);
            await DatabaseTasks.dumpSchemaCache(adapter, filename);
            console.log(`Schema cache dumped to ${filename}`);
          });
        }
      });
    });

  cmd
    .command("schema:cache:clear")
    .description(
      "Delete db/schema_cache.json for every database configuration in the current environment",
    )
    .action(async () => {
      // Rails: `configurations.configs_for(env_name: env).each { |c| clear_schema_cache(cache_dump_filename(c)) }`.
      const fs = await getFsAsync();
      const envName = resolveEnv();
      const named = await loadAllDatabaseConfigs(envName);
      const configs = named.map(
        ({ name, config }) =>
          new HashConfig(envName, name, normalizeRawConfig(config) as Record<string, unknown>),
      );
      await withRegisteredConfigurations(configs, envName, async () => {
        for (const config of DatabaseTasks.configsFor(envName)) {
          const filename = DatabaseTasks.cacheDumpFilename(config);
          // clearSchemaCache is a no-op on ENOENT; don't log "Cleared"
          // unless we actually removed something.
          if (!(await fs.exists(filename))) continue;
          DatabaseTasks.clearSchemaCache(filename);
          console.log(`Cleared schema cache at ${filename}`);
        }
      });
    });

  return cmd;
}
