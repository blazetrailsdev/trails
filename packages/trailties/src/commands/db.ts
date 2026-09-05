import { Command } from "commander";
import { setEnv } from "@blazetrails/ruby-compat";
import { getFs, getPath } from "@blazetrails/ruby-compat";
import {
  env,
  setExitCode,
  getProcessAdapter,
  registerProcessAdapter,
} from "@blazetrails/ruby-compat";
import {
  loadDatabaseConfig,
  loadDatabaseConfigModule,
  loadAllDatabaseConfigs,
  connectAdapter,
  resolveEnv,
  resolveSchemaFormat,
  type DatabaseConfig as RawConfig,
} from "../database.js";
import {
  Base,
  DatabaseTasks,
  HashConfig,
  InternalMetadata,
  MigrationContext,
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
      /** @empty */
    }
  }
  return normalized as RawConfig;
}

async function migrationsDirsForConfig(config: RawConfig): Promise<string[]> {
  const fs = getFs();
  const path = getPath();
  const cwd = fs.cwd();
  const raw = (config as { migrationsPaths?: string | string[] }).migrationsPaths;
  if (typeof raw === "string" && raw.length > 0) return [path.resolve(cwd, raw)];
  if (Array.isArray(raw)) {
    const dirs = [...new Set(raw.filter((p) => p.length > 0).map((p) => path.resolve(cwd, p)))];
    if (dirs.length > 0) return dirs;
  }
  return Migrator.migrationsPaths.map((p) => path.resolve(cwd, p));
}

interface DatabaseOpts {
  database?: string;
}

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

async function taskableDatabaseEntries(
  opts: DatabaseOpts,
  envName: string = resolveEnv(),
): Promise<DatabaseEntry[]> {
  const dbName = validateDatabaseFlag(opts);
  const allConfigs = await loadAllDatabaseConfigs(envName);
  const all = await Promise.all(
    allConfigs.map(async ({ name, config: rawConfig }) => {
      const raw = normalizeRawConfig(rawConfig);
      raw.migrationsPaths = await migrationsDirsForConfig(raw);
      return {
        name,
        raw,
        hashConfig: new HashConfig(envName, name, raw as Record<string, unknown>),
      };
    }),
  );
  const namespacedNames = new Set<string>();
  await withRegisteredConfigurations(
    all.map((c) => c.hashConfig),
    envName,
    async () => {
      DatabaseTasks.forEach(
        { [envName]: Object.fromEntries(all.map((c) => [c.name, c.raw])) },
        (name) => {
          namespacedNames.add(name);
        },
      );
    },
  );
  const taskable =
    namespacedNames.size > 0
      ? all.filter((c) => namespacedNames.has(c.name))
      : all.filter((c) => c.hashConfig.databaseTasks());
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

async function forEachDatabase(
  opts: DatabaseOpts,
  fn: (ctx: {
    adapter: DatabaseAdapter;
    raw: RawConfig;
    config: HashConfig;
    name: string;
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
  const normalized = normalizeRawConfig(raw);
  return new HashConfig(envName, "primary", normalized as Record<string, unknown>);
}

async function withRegisteredConfiguration<T>(
  config: HashConfig,
  fn: () => Promise<T>,
): Promise<T> {
  return withRegisteredConfigurations([config], config.envName, fn);
}

async function withRegisteredConfigurations<T>(
  configs: HashConfig[],
  envName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { DatabaseConfigurations } = await import("@blazetrails/activerecord");
  const previousTasksConfig = DatabaseTasks.databaseConfiguration;
  const previousEnv = DatabaseTasks.env;
  DatabaseTasks.databaseConfiguration = new DatabaseConfigurations(configs);
  DatabaseTasks.env = envName;
  try {
    return await fn();
  } finally {
    DatabaseTasks.databaseConfiguration = previousTasksConfig;
    DatabaseTasks.env = previousEnv;
  }
}

async function runProtectedEnvCheck(config: HashConfig, envName: string): Promise<void> {
  const { DatabaseConfigurations } = await import("@blazetrails/activerecord");
  const previousTasksConfig = DatabaseTasks.databaseConfiguration;
  DatabaseTasks.databaseConfiguration = new DatabaseConfigurations([config]);
  try {
    await DatabaseTasks.checkProtectedEnvironmentsBang(envName);
  } finally {
    DatabaseTasks.databaseConfiguration = previousTasksConfig;
  }
}

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
  skipDump?: boolean;
}

function migrationContextFor(adapter: DatabaseAdapter, dirs: string[]): MigrationContext {
  return new MigrationContext(
    dirs,
    new SchemaMigration(adapter.pool),
    new InternalMetadata(adapter.pool),
  );
}

async function runMigrate(
  adapter: DatabaseAdapter,
  raw: RawConfig,
  targetVersion?: string,
  options: RunOptions = {},
): Promise<void> {
  const migrationContext = migrationContextFor(adapter, await migrationsDirsForConfig(raw));
  await migrationContext.migrate(targetVersion ?? null);

  const pending = await migrationContext.open().pendingMigrations();
  if (pending.length === 0) console.log("All migrations are up to date.");

  if (!options.skipDump) await dumpSchemaAfterMigrate(raw);
}

async function withSeedAdapter(adapter: DatabaseAdapter, fn: () => Promise<void>): Promise<void> {
  const { Base } = await import("@blazetrails/activerecord");
  const previous = Base._adapter;
  Base.adapter = adapter;
  try {
    await fn();
  } finally {
    if (previous === null) {
      Base._adapter = previous;
    } else {
      Base.adapter = previous;
    }
  }
}

async function runTestLoadSchema(options: {
  successMessage: (displayName: string, filename: string) => string;
}): Promise<void> {
  const raw = normalizeRawConfig(await loadDatabaseConfig("test"));
  const config = toDbConfig(raw, "test");
  await runProtectedEnvCheck(config, "test");
  const filename = DatabaseTasks.schemaDumpPath(config);
  const fs = getFs();
  if (!filename || !(await fs.exists(filename))) {
    console.error(
      `No schema file found at ${filename ?? "(none)"}. Run \`trails db schema:dump\` first.`,
    );
    setExitCode(1);
    return;
  }
  if (DatabaseTasks.schemaFormat === "sql" && !(await structureLoadReachesDatabase(config))) {
    console.error(
      `Loading a structure.sql is not meaningful for an in-memory database: ` +
        `the sqlite3 child process loads it into its own throwaway database. ` +
        `Use --format ts/js, or point the config at a file.`,
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

async function structureLoadReachesDatabase(
  config: Parameters<typeof DatabaseTasks.withTemporaryConnection>[0],
): Promise<boolean> {
  return DatabaseTasks.withTemporaryConnection(config, async (adapter) =>
    adapter.supportsConcurrentConnections(),
  );
}

let _seedImportCounter = 0;
async function runSeed(prefix = ""): Promise<void> {
  const fs = getFs();
  const path = getPath();
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
  const pathToFileURL = path.pathToFileURL;
  if (!pathToFileURL) {
    throw new Error("Seed loading requires a path adapter with pathToFileURL support.");
  }
  const url = pathToFileURL(seedFile);
  url.searchParams.set("_t", `${++_seedImportCounter}`);
  await import(url.href);
  console.log(`${prefix}Seeds completed.`);
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    if (parsed.username && parsed.password === "***") {
      /** @empty */
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
  opts?: { afterPending?: (pending: number) => void },
): Promise<void> {
  await withPrefixedStdout(ctx.prefix, async () => {
    await withRegisteredConfiguration(ctx.config, operation);
  });
  if (opts?.afterPending) {
    const migrationContext = DatabaseTasks.migrationConnectionPool().migrationContext;
    opts.afterPending((await migrationContext.pendingMigrationVersions()).length);
  }
  await dumpSchemaAfterMigrate(ctx.raw, ctx.config);
}

async function withTargetVersionEnv(
  targetVersion: string | null,
  fn: () => Promise<void>,
): Promise<void> {
  if (targetVersion === null) return fn();
  const was = env.VERSION;
  setEnv("VERSION", targetVersion);
  try {
    await fn();
  } finally {
    setEnv("VERSION", was);
  }
}

async function runMigrateAll(): Promise<void> {
  const envName = resolveEnv();
  const entries = await taskableDatabaseEntries({}, envName);
  const migrationsDirsFor = new Map<string, string[]>();
  for (const { name, raw } of entries) {
    migrationsDirsFor.set(name, await migrationsDirsForConfig(raw));
  }

  const primary = entries.find((e) => e.name === "primary") ?? entries[0];
  const configs = entries.map((e) => e.hashConfig);
  const multiDb = entries.length > 1;
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
      await withPrefixedStdout(currentDbPrefix, () => DatabaseTasks.migrateAll());
      for (const { name, raw, hashConfig } of entries) {
        const prefix = multiDb ? `[${name}] ` : "";
        await DatabaseTasks.withTemporaryPool(hashConfig, async (pool) => {
          const adapter = await pool.leaseConnection();
          const migrationContext = migrationContextFor(adapter, migrationsDirsFor.get(name) ?? []);
          const pending = await migrationContext.open().pendingMigrations();
          if (pending.length === 0) console.log(`${prefix}All migrations are up to date.`);
          await dumpSchemaAfterMigrate(raw, hashConfig);
        });
      }
    }),
  );
}

async function establishTaskConnection(): Promise<void> {
  const envName = resolveEnv();
  const loaded = await loadDatabaseConfigModule();
  if (!loaded || (loaded.module as Record<string, unknown>)[envName] === undefined) return;
  const raw = normalizeRawConfig(await loadDatabaseConfig(envName));
  await Base.establishConnection(toDbConfig(raw, envName));
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
      const rawVersion = opts.version != null ? String(opts.version).trim() : env.VERSION?.trim();
      const targetVersion = rawVersion && rawVersion.length > 0 ? rawVersion : null;
      await withTargetVersionEnv(targetVersion, async () => {
        if (opts.database === undefined) {
          await runMigrateAll();
          return;
        }
        await forEachDatabase(opts, async (ctx) => {
          await withMigrationTasksForDb(ctx, () => DatabaseTasks.migrate(), {
            afterPending: (pending) => {
              if (pending === 0) {
                console.log(`${ctx.prefix}All migrations are up to date.`);
              }
            },
          });
        });
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
        await withMigrationTasksForDb(ctx, async () => {
          await DatabaseTasks.migrationConnectionPool().migrationContext.rollback(step);
        });
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
        await withMigrationTasksForDb(ctx, async () => {
          await DatabaseTasks.migrationConnectionPool().migrationContext.forward(step);
        });
      });
    });

  cmd
    .command("version")
    .description("Print the current schema version")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts: DatabaseOpts) => {
      await forEachDatabase(opts, async ({ adapter, config, prefix }) => {
        const version = (await migrationContextFor(adapter, []).currentVersion()) ?? "";
        console.log(`\n${prefix}database: ${config.database}`);
        console.log(`${prefix}Current version: ${version}`);
        console.log();
      });
    });

  cmd
    .command("environment:set")
    .description("Stamp the schema with the current environment name")
    .option("--database <name>", "Target a specific named database")
    .action(async (opts: DatabaseOpts) => {
      await forEachDatabase(opts, async ({ adapter, prefix }) => {
        const envName = resolveEnv();
        const internalMetadata = new InternalMetadata(adapter.pool);
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
        const mDirs = await migrationsDirsForConfig(raw);
        const migrationContext = migrationContextFor(adapter, mDirs);
        const pending = await migrationContext.open().pendingMigrations();
        if (pending.length > 0) {
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
        await withMigrationTasksForDb(ctx, async () => {
          await withTargetVersionEnv(opts.version, async () => {
            DatabaseTasks.checkTargetVersion();
            await DatabaseTasks.migrationConnectionPool().migrationContext.run(
              "up",
              DatabaseTasks.targetVersion()!,
            );
          });
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
        await withMigrationTasksForDb(ctx, async () => {
          await withTargetVersionEnv(opts.version, async () => {
            DatabaseTasks.checkTargetVersion();
            await DatabaseTasks.migrationConnectionPool().migrationContext.run(
              "down",
              DatabaseTasks.targetVersion()!,
            );
          });
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
      await forEachDatabase(opts, async (ctx) => {
        await withPrefixedStdout(ctx.prefix, () => DatabaseTasks.migrateStatus());
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
            await DatabaseTasks.migrationConnectionPool().migrationContext.rollback(step);
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
      const fs = getFs();
      await forEachDatabase(opts, async ({ config, prefix }) => {
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
          if (
            DatabaseTasks.schemaFormat === "sql" &&
            !(await structureLoadReachesDatabase(config))
          ) {
            console.error(
              `${prefix}Loading a structure.sql is not meaningful for an in-memory database: ` +
                `the sqlite3 child process loads it into its own throwaway database. ` +
                `Use --format ts/js, or point the config at a file.`,
            );
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
      const envName = resolveEnv();
      const named = await loadAllDatabaseConfigs(envName);
      const configs = named.map(
        ({ name, config }) =>
          new HashConfig(envName, name, normalizeRawConfig(config) as Record<string, unknown>),
      );
      await withRegisteredConfigurations(configs, envName, async () => {
        for (const config of DatabaseTasks.configsFor({ envName })) {
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
      const fs = getFs();
      const envName = resolveEnv();
      const named = await loadAllDatabaseConfigs(envName);
      const configs = named.map(
        ({ name, config }) =>
          new HashConfig(envName, name, normalizeRawConfig(config) as Record<string, unknown>),
      );
      await withRegisteredConfigurations(configs, envName, async () => {
        for (const config of DatabaseTasks.configsFor({ envName })) {
          const filename = DatabaseTasks.cacheDumpFilename(config);
          if (!(await fs.exists(filename))) continue;
          DatabaseTasks.clearSchemaCache(filename);
          console.log(`Cleared schema cache at ${filename}`);
        }
      });
    });

  return cmd;
}
