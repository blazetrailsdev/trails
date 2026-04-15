import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadDatabaseConfig,
  connectAdapter,
  resolveEnv,
  type DatabaseConfig as RawConfig,
} from "../database.js";
import { discoverMigrations } from "../migration-loader.js";
import {
  DatabaseTasks,
  HashConfig,
  Migrator,
  DatabaseAlreadyExists,
  NoDatabaseError,
} from "@blazetrails/activerecord";
import type { DatabaseAdapter } from "@blazetrails/activerecord";

async function closeAdapter(adapter: DatabaseAdapter): Promise<void> {
  const maybeClose = (adapter as { close?: () => Promise<void> }).close;
  if (typeof maybeClose === "function") await maybeClose.call(adapter);
}

async function withAdapter(
  fn: (adapter: DatabaseAdapter, raw: RawConfig) => Promise<void>,
): Promise<void> {
  // Normalize the raw config once, before connecting. `connectAdapter`
  // uses the adapter/database/url fields to choose a driver; later paths
  // (`toDbConfig` → `DatabaseTasks.dumpSchema`) need the same resolved
  // adapter so the connection and the schema handler agree. If we passed
  // the unnormalized config to connectAdapter and the adapter-less
  // variant to toDbConfig, a url-only `postgres://host/db` config would
  // migrate against postgres but try to dump schema via sqlite3.
  const raw = normalizeRawConfig(await loadDatabaseConfig());
  const adapter = await connectAdapter(raw);
  try {
    await fn(adapter, raw);
  } finally {
    await closeAdapter(adapter);
  }
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

function migrationsDir(): string {
  return path.join(process.cwd(), "db", "migrations");
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
      case "trilogy:":
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
  const { DatabaseConfigurations } = await import("@blazetrails/activerecord");
  const previousTasksConfig = DatabaseTasks.databaseConfiguration;
  const previousCurrent = DatabaseConfigurations.current;
  const previousEnv = DatabaseTasks.env;
  DatabaseTasks.databaseConfiguration = new DatabaseConfigurations([config]);
  DatabaseTasks.env = config.envName;
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
 * guard falls back to checking only the current env name, which misses
 * `EnvironmentMismatchError` and the protected-stamp case.
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
 */
async function dumpSchemaAfterMigrate(adapter: DatabaseAdapter, raw: RawConfig): Promise<void> {
  if (!DatabaseTasks.dumpSchemaAfterMigration) return;
  const config = toDbConfig(raw);
  const previous = DatabaseTasks.migrationConnection();
  DatabaseTasks.setAdapter(adapter);
  try {
    await DatabaseTasks.dumpSchema(config);
  } finally {
    DatabaseTasks.setAdapter(previous);
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

async function runMigrate(
  adapter: DatabaseAdapter,
  raw: RawConfig,
  targetVersion?: string,
  options: RunOptions = {},
): Promise<void> {
  const migrations = await discoverMigrations(migrationsDir());
  if (migrations.length === 0) {
    console.log("No migrations found.");
    return;
  }

  const migrator = new Migrator(adapter, migrations);
  await migrator.migrate(targetVersion ?? null);

  for (const line of migrator.output) console.log(line);

  const pending = await migrator.pendingMigrations();
  if (pending.length === 0) console.log("All migrations are up to date.");

  if (!options.skipDump) await dumpSchemaAfterMigrate(adapter, raw);
}

async function runRollback(
  adapter: DatabaseAdapter,
  raw: RawConfig,
  steps: number,
  options: RunOptions = {},
): Promise<void> {
  const migrations = await discoverMigrations(migrationsDir());
  if (migrations.length === 0) {
    console.log("No migrations found.");
    return;
  }

  const migrator = new Migrator(adapter, migrations);
  await migrator.rollback(steps);

  for (const line of migrator.output) console.log(line);

  if (!options.skipDump) await dumpSchemaAfterMigrate(adapter, raw);
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
    // Preserve setter side effects (Base.adapter's setter fires the
    // internal _onAdapterSet hook) when restoring a non-null adapter.
    // Fall back to the backing field for a previous null because the
    // public setter is typed as DatabaseAdapter, not DatabaseAdapter |
    // null.
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
  if (!fs.existsSync(filename)) {
    console.error(`No schema file found at ${filename}. Run \`trails db schema:dump\` first.`);
    process.exitCode = 1;
    return;
  }
  await DatabaseTasks.purge(config);
  const adapter = await connectAdapter(raw);
  try {
    const previous = DatabaseTasks.migrationConnection();
    DatabaseTasks.setAdapter(adapter);
    try {
      await DatabaseTasks.loadSchema(config);
    } finally {
      DatabaseTasks.setAdapter(previous);
    }
  } finally {
    await closeAdapter(adapter);
  }
  console.log(options.successMessage(displayNameFor(config, raw), filename));
}

async function runSeed(): Promise<void> {
  const seedCandidates = [
    path.join(process.cwd(), "db", "seeds.ts"),
    path.join(process.cwd(), "db", "seeds.js"),
  ];
  const seedFile = seedCandidates.find((f) => fs.existsSync(f));
  if (!seedFile) {
    console.log("No seeds file found at db/seeds.ts or db/seeds.js");
    return;
  }

  console.log("Running seeds...");
  await import(pathToFileURL(seedFile).href);
  console.log("Seeds completed.");
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
    (raw.database as string | undefined) ??
    (typeof raw.url === "string" ? sanitizeUrl(raw.url) : undefined) ??
    `${config.adapter ?? "unknown"} database`
  );
}

async function runCreate(): Promise<void> {
  const raw = await loadDatabaseConfig();
  const config = toDbConfig(raw);
  const displayName = displayNameFor(config, raw);
  try {
    await DatabaseTasks.create(config);
    console.log(`Created database '${displayName}'`);
  } catch (error) {
    if (error instanceof DatabaseAlreadyExists) {
      console.error(`Database '${displayName}' already exists`);
      return;
    }
    throw error;
  }
}

async function runDrop(): Promise<void> {
  const raw = normalizeRawConfig(await loadDatabaseConfig());
  const config = toDbConfig(raw);
  const displayName = displayNameFor(config, raw);
  // Rails db:drop is gated on check_protected_environments; we match.
  // DISABLE_DATABASE_ENVIRONMENT_CHECK=1 is the Rails escape hatch.
  await runProtectedEnvCheck(config, config.envName);
  try {
    await DatabaseTasks.drop(config);
    console.log(`Dropped database '${displayName}'`);
  } catch (error) {
    if (error instanceof NoDatabaseError) {
      console.error(`Database '${displayName}' does not exist`);
      return;
    }
    throw error;
  }
}

export function dbCommand(): Command {
  const cmd = new Command("db");
  cmd.description("Database management commands");

  cmd
    .command("migrate")
    .description("Run pending migrations")
    .option("--version <version>", "Migrate to a specific version")
    .action(async (opts) => {
      await withAdapter((adapter, raw) => runMigrate(adapter, raw, opts.version));
    });

  cmd
    .command("rollback")
    .description("Rollback migrations")
    .option("--step <n>", "Number of migrations to rollback", "1")
    .action(async (opts) => {
      const step = Number(opts.step);
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
        process.exitCode = 1;
        return;
      }
      await withAdapter((adapter, raw) => runRollback(adapter, raw, step));
    });

  cmd
    .command("forward")
    .description("Move the schema forward N migrations (inverse of rollback)")
    .option("--step <n>", "Number of migrations to apply", "1")
    .action(async (opts) => {
      const step = Number(opts.step);
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
        process.exitCode = 1;
        return;
      }
      await withAdapter(async (adapter, raw) => {
        const migrations = await discoverMigrations(migrationsDir());
        if (migrations.length === 0) {
          console.log("No migrations found.");
          return;
        }
        const migrator = new Migrator(adapter, migrations);
        await migrator.forward(step);
        for (const line of migrator.output) console.log(line);
        await dumpSchemaAfterMigrate(adapter, raw);
      });
    });

  cmd
    .command("version")
    .description("Print the current schema version")
    .action(async () => {
      // Don't discover or validate migration files — users should be able
      // to ask for the current version even when the migrations/ directory
      // has a stale file. Use the read-only currentVersion path so running
      // `trails db version` on a fresh/production DB doesn't silently
      // create schema_migrations / ar_internal_metadata as a side effect
      // (matches Rails' current_version contract).
      await withAdapter(async (adapter) => {
        const migrator = new Migrator(adapter, []);
        const version = await migrator.currentVersionReadOnly();
        console.log(`Current version: ${version}`);
      });
    });

  cmd
    .command("environment:set")
    .description("Stamp the schema with the current environment name")
    .action(async () => {
      await withAdapter(async (adapter, raw) => {
        // Use resolveEnv() so the stamped env matches what the trails
        // CLI considers 'current' (TRAILS_ENV takes precedence over
        // NODE_ENV). Without this, `TRAILS_ENV=production trails db
        // environment:set` with NODE_ENV=development would stamp the DB
        // as development and defeat the protected-env guard.
        const envName = resolveEnv();
        const internalMetadataEnabled =
          (raw as { useMetadataTable?: boolean }).useMetadataTable !== false;
        const migrator = new Migrator(adapter, [], {
          environment: envName,
          internalMetadataEnabled,
        });
        // Rails: raise EnvironmentStorageError when
        // internal_metadata.enabled? is false (use_metadata_table opt-out).
        if (!migrator.internalMetadata.enabled) {
          const { EnvironmentStorageError } = await import("@blazetrails/activerecord");
          throw new EnvironmentStorageError();
        }
        await migrator.internalMetadata.createTableAndSetFlags(envName);
        console.log(`Stamped schema with environment: ${envName}`);
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
        process.exitCode = 1;
      }
    });

  cmd
    .command("abort_if_pending_migrations")
    .description("Exit with non-zero status if any migrations are pending")
    .action(async () => {
      await withAdapter(async (adapter) => {
        const migrations = await discoverMigrations(migrationsDir());
        if (migrations.length === 0) return;
        const migrator = new Migrator(adapter, migrations);
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
            `You have ${pending.length} pending migration${pending.length === 1 ? "" : "s"}:`,
          );
          for (const m of pending) {
            // Rails prints `"  %4d %s" % [version, name]`, which emits the
            // version as an integer (no leading zeros). Normalize via BigInt
            // to match and to stay consistent with the rest of Migrator.
            const version = String(BigInt(m.version));
            console.error(`  ${version.padStart(4, " ")} ${m.name}`);
          }
          console.error("Run `trails db migrate` to resolve this issue.");
          process.exitCode = 1;
        }
      });
    });

  cmd
    .command("migrate:up")
    .description("Run a specific migration up (by version)")
    .requiredOption("--version <version>", "Migration version to run up")
    .action(async (opts) => {
      await withAdapter(async (adapter, raw) => {
        const migrations = await discoverMigrations(migrationsDir());
        const migrator = new Migrator(adapter, migrations);
        await migrator.run("up", opts.version);
        for (const line of migrator.output) console.log(line);
        await dumpSchemaAfterMigrate(adapter, raw);
      });
    });

  cmd
    .command("migrate:down")
    .description("Run a specific migration down (by version)")
    .requiredOption("--version <version>", "Migration version to run down")
    .action(async (opts) => {
      await withAdapter(async (adapter, raw) => {
        const migrations = await discoverMigrations(migrationsDir());
        const migrator = new Migrator(adapter, migrations);
        await migrator.run("down", opts.version);
        for (const line of migrator.output) console.log(line);
        await dumpSchemaAfterMigrate(adapter, raw);
      });
    });

  cmd
    .command("seed")
    .description("Run database seeds")
    .action(async () => {
      await withAdapter(async (adapter) => {
        await withSeedAdapter(adapter, runSeed);
      });
    });

  cmd
    .command("seed:replant")
    .description("Truncate all tables in the current environment and re-run seeds")
    .action(async () => {
      // Run the truncate path first (no connection in the CLI — the
      // DatabaseTasks.truncateAll handler opens/closes its own per-
      // config connection). Open the seed adapter only after the
      // protected-env guard has passed and the truncate has completed,
      // so we don't double-connect.
      const raw = normalizeRawConfig(await loadDatabaseConfig());
      const config = toDbConfig(raw);
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
      // Do NOT go through withAdapter — connectAdapter would try to
      // connect to the target DB before we've had a chance to create
      // it, which fails for pg/mysql when the DB doesn't exist yet.
      // Create first, then connect.
      const raw = normalizeRawConfig(await loadDatabaseConfig());
      const config = toDbConfig(raw);
      const { DatabaseAlreadyExists, Migrator } = await import("@blazetrails/activerecord");

      try {
        await DatabaseTasks.create(config);
        console.log(`Created database '${displayNameFor(config, raw)}'`);
      } catch (error) {
        if (!(error instanceof DatabaseAlreadyExists)) throw error;
      }

      const adapter = await connectAdapter(raw);
      try {
        // Rails measures "fresh" via `!schema_migration.table_exists?`,
        // matching its `initialize_database` contract. A sqlite DB file
        // may have been created by either our DatabaseTasks.create call
        // above or by better-sqlite3 on connect; the meaningful signal
        // is whether migrations have been applied.
        const migrator = new Migrator(adapter, []);
        const wasFresh = !(await migrator.schemaMigrationTableExists());

        await runMigrate(adapter, raw);
        if (wasFresh) {
          await withSeedAdapter(adapter, runSeed);
        }
      } finally {
        const close = (adapter as { close?: () => Promise<void> }).close;
        if (typeof close === "function") await close.call(adapter);
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

  cmd.command("create").description("Create the database").action(runCreate);

  cmd.command("drop").description("Drop the database").action(runDrop);

  cmd
    .command("migrate:status")
    .description("Show migration status")
    .action(async () => {
      await withAdapter(async (adapter) => {
        const migrations = await discoverMigrations(migrationsDir());
        if (migrations.length === 0) {
          console.log("No migrations found.");
          return;
        }

        const migrator = new Migrator(adapter, migrations);
        const statuses = await migrator.migrationsStatus();

        console.log("");
        console.log(" Status   Migration ID    Migration Name");
        console.log("--------------------------------------------------");
        for (const s of statuses) {
          const statusStr = s.status === "up" ? "  up  " : " down ";
          console.log(`${statusStr}   ${s.version.padEnd(16)}${s.name}`);
        }
        console.log("");
      });
    });

  cmd
    .command("migrate:redo")
    .description("Rollback and re-run the last migration")
    .option("--step <n>", "Number of migrations to redo", "1")
    .action(async (opts) => {
      const step = Number(opts.step);
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
        process.exitCode = 1;
        return;
      }
      await withAdapter(async (adapter, raw) => {
        // Suppress the intermediate dump on rollback; runMigrate handles
        // the single end-of-task dump.
        await runRollback(adapter, raw, step, { skipDump: true });
        await runMigrate(adapter, raw);
      });
    });

  cmd
    .command("reset")
    .description("Drop, create, migrate, and seed the database")
    .action(async () => {
      await runDrop();
      await runCreate();
      await withAdapter(async (adapter, raw) => {
        await runMigrate(adapter, raw);
        await withSeedAdapter(adapter, runSeed);
      });
    });

  cmd
    .command("setup")
    .description("Create, migrate, and seed the database")
    .action(async () => {
      await runCreate();
      await withAdapter(async (adapter, raw) => {
        await runMigrate(adapter, raw);
        await withSeedAdapter(adapter, runSeed);
      });
    });

  cmd
    .command("schema:dump")
    .description(
      "Dump the current database schema (format: DatabaseTasks.schemaFormat — ts/js/sql)",
    )
    .action(async () => {
      await withAdapter(async (adapter, raw) => {
        const config = toDbConfig(raw);
        const filename = DatabaseTasks.schemaDumpPath(config);
        const previous = DatabaseTasks.migrationConnection();
        DatabaseTasks.setAdapter(adapter);
        try {
          await DatabaseTasks.dumpSchema(config);
        } finally {
          DatabaseTasks.setAdapter(previous);
        }
        console.log(`Schema dumped to ${filename}`);
      });
    });

  cmd
    .command("schema:load")
    .description(
      "Load the schema (format: DatabaseTasks.schemaFormat — ts/js/sql) into the database",
    )
    .action(async () => {
      await withAdapter(async (adapter, raw) => {
        const config = toDbConfig(raw);
        // schema:load is destructive (replaces the schema) — Rails gates
        // it on check_protected_environments.
        await runProtectedEnvCheck(config, config.envName);
        const filename = DatabaseTasks.schemaDumpPath(config);
        if (!fs.existsSync(filename)) {
          console.error(`No schema file found at ${filename}`);
          process.exitCode = 1;
          return;
        }
        const previous = DatabaseTasks.migrationConnection();
        DatabaseTasks.setAdapter(adapter);
        try {
          console.log(`Loading schema from ${filename}...`);
          await DatabaseTasks.loadSchema(config);
          console.log("Schema loaded.");
        } catch (error: unknown) {
          if (filename.endsWith(".ts")) {
            const enhanced = new Error(
              `Failed to load schema file "${filename}". ` +
                `Ensure a TypeScript loader (tsx, ts-node) is configured, ` +
                `or set DatabaseTasks.schemaFormat = "js" / "sql".`,
            );
            (enhanced as { cause?: unknown }).cause = error;
            throw enhanced;
          }
          throw error;
        } finally {
          DatabaseTasks.setAdapter(previous);
        }
      });
    });

  return cmd;
}
