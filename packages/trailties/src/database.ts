import { reverseMerge, trailsRoot } from "@blazetrails/activesupport";
import { getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";
import { env } from "@blazetrails/ruby-compat";
import type { DatabaseAdapter } from "@blazetrails/activerecord";

/**
 * One environment's entry as it is written in `database.yml` — the raw hash,
 * before `DatabaseConfigurations` resolves it into config objects.
 *
 * @noRailsEquivalent PERMANENT — name collision only. Ruby's
 * `ActiveRecord::DatabaseConfigurations::DatabaseConfig` is the *resolved*
 * config object built from a hash like this one, not the hash.
 */
export interface DatabaseConfig {
  adapter?: string;
  database?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  url?: string;
  [key: string]: unknown;
}

/**
 * Resolve the current environment.
 *
 * Mirrors Rails' RAILS_ENV: reads TRAILS_ENV, defaults to "development".
 *
 * Deliberately does NOT fall back to NODE_ENV. The JS ecosystem treats
 * NODE_ENV as a build-time hint (bundler optimization, dead-code
 * elimination via `process.env.NODE_ENV !== "production"` checks), not
 * a runtime environment selector. Conflating the two leads to scripts
 * running with `NODE_ENV=test` silently picking the wrong database,
 * skipping production-only setup, etc.
 */
export function resolveEnv(): string {
  return env.TRAILS_ENV || "development";
}

/**
 * Shape of the exported object in config/database.ts: each env key maps
 * to a DatabaseConfig, plus the optional `schemaFormat` top-level key
 * (the only non-env key we currently recognize — keep in sync with
 * TOP_LEVEL_CONFIG_KEYS below). Kept loose (`unknown`) so callers
 * inspect the keys they need without the type fighting them.
 */
export interface DatabaseConfigModule {
  [key: string]: unknown;
  schemaFormat?: string;
}

/**
 * Non-environment top-level keys recognized in config/database.ts.
 * Currently: `schemaFormat`. The env-name lookup / "Available" error
 * message excludes these so users don't see `schemaFormat` listed
 * alongside `development`/`test`/`production`. When adding a new
 * top-level key, update both this set and the DatabaseConfigModule
 * shape above.
 */
const TOP_LEVEL_CONFIG_KEYS = new Set<string>(["schemaFormat"]);

/**
 * Safely render an unknown value for inclusion in an error message.
 * Total over every JS value: bigint -> `42n`, symbol -> `Symbol(foo)`,
 * undefined/null -> `undefined`/`null`, objects fall back to a type tag
 * when they can't be JSON-serialized (circular refs, thrown toJSON).
 * No Node deps — this file sits at the boundary between trailties CLI
 * code and the rest of the system, which should stay browser-safe.
 */
function formatUnknown(value: unknown): string {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "bigint") return `${value as bigint}n`;
  if (type === "symbol" || type === "function" || type === "undefined") return String(value);
  if (type === "number" || type === "boolean") return String(value);
  // Objects: prefer a JSON repr, fall back to a type tag if that
  // blows up (circular ref, toJSON that throws, etc).
  try {
    return JSON.stringify(value);
  } catch {
    const proto = Object.getPrototypeOf(value as object);
    const ctor = proto?.constructor?.name ?? "Object";
    return `[object ${ctor}]`;
  }
}

/**
 * Locate + import the app's `config/database.*`. Centralizing this keeps
 * the lookup/import logic in one place — both loadDatabaseConfig and
 * resolveSchemaFormat route through here. Node's ESM loader caches by
 * URL, so repeat calls for the same path return the same module without
 * re-running module side effects (the import() call itself still runs,
 * it just resolves against the cache).
 *
 * Returns `null` when no config file is present — callers decide whether
 * that's an error (loadDatabaseConfig) or just absence (resolver
 * falling through to existence inference).
 *
 * Throws a source-labeled error when the config file loads but its
 * default export isn't an object (e.g. `export default "oops"`), so
 * downstream code doesn't need to defensively guard every key lookup.
 */
export async function loadDatabaseConfigModule(
  cwd?: string,
): Promise<{ path: string; module: DatabaseConfigModule } | null> {
  const fs = await getFsAsync();
  const path = await getPathAsync();
  const resolvedCwd = cwd ?? fs.cwd();

  // Prefer .ts (source of truth) over .js (compiled)
  const candidates = [
    path.join(resolvedCwd, "config", "database.ts"),
    path.join(resolvedCwd, "config", "database.js"),
  ];

  let configPath: string | undefined;
  for (const candidate of candidates) {
    if (await fs.exists(candidate)) {
      configPath = candidate;
      break;
    }
  }
  if (!configPath) return null;

  let mod: { default?: unknown } & Record<string, unknown>;
  try {
    const pathToFileURL = path.pathToFileURL;
    if (!pathToFileURL) {
      throw new Error("Config loading requires a path adapter with pathToFileURL support.");
    }
    mod = (await import(pathToFileURL(configPath).href)) as typeof mod;
  } catch (error: unknown) {
    const rel = path.relative?.(resolvedCwd, configPath) || configPath;
    const rawMessage = error instanceof Error ? error.message : formatUnknown(error);
    const message = rawMessage.replace(/[.!?]+$/, "");
    const enhanced = new Error(
      `Failed to load database config from "${rel}": ${message}. ` +
        `Run with tsx (e.g., "npx tsx node_modules/.bin/trails").`,
    );
    (enhanced as { cause?: unknown }).cause = error;
    throw enhanced;
  }
  const candidateVal = mod.default ?? mod;
  if (
    candidateVal === null ||
    (typeof candidateVal !== "object" && typeof candidateVal !== "function")
  ) {
    const rel = path.relative?.(resolvedCwd, configPath) || configPath;
    throw new Error(
      `Invalid database config in "${rel}": expected an object, got ${formatUnknown(candidateVal)}.`,
    );
  }
  return { path: configPath, module: candidateVal as DatabaseConfigModule };
}

/**
 * Loads and returns the entire raw configuration of database from values
 * stored in the app's `config/database.*`.
 *
 * trails' seat for `Rails::Application::Configuration#database_configuration`
 * (`railties/lib/rails/application/configuration.rb:434-468`), which reads
 * `paths["config/database"].existent.first`, returns `{}` when the file is
 * absent but `DATABASE_URL` is set (Active Record builds the primary config
 * from the env var), and otherwise raises. `root` defaults to `Trails.root` —
 * Rails' `Rails.root` — falling back to the working directory.
 *
 * This is the seam `establish_connection` reads *through*, never from: the
 * Railtie's `active_record.initialize_database`
 * (`activerecord/lib/active_record/railtie.rb:256-262`) assigns this to
 * `Base.configurations` and only then calls `establish_connection`.
 *
 * The `shared` key (configuration.rb:439-458) is deleted and reverse-merged
 * into every environment, with the nested arm for the multi-database shape.
 * Rails' `reverse_merge!` mutates the parsed YAML in place; the loaded value
 * here is an imported module's export, shared with (and possibly frozen by) the
 * module registry, so each merged hash is rebuilt instead.
 *
 * Rails then returns `Hash.new(shared).merge(loaded_yaml)`, whose default value
 * answers an environment the file never listed. A plain object has no default,
 * so the returned record is a Proxy whose `get` falls back to `shared` — the
 * one JS construct with `Hash.new`'s semantics, leaving its own keys (and so
 * its enumeration) exactly the loaded ones, as in Ruby.
 */
type AnyHash = Record<string, unknown>;

export async function databaseConfiguration(root?: string): Promise<DatabaseConfigModule> {
  const fs = await getFsAsync();
  const path = await getPathAsync();
  const resolvedRoot = root ?? trailsRoot() ?? fs.cwd();

  const loaded = await loadDatabaseConfigModule(resolvedRoot);
  const jsonPath = path.join(resolvedRoot, "config", "database.json");
  let loadedYaml: DatabaseConfigModule | null = null;
  if (loaded) {
    loadedYaml = loaded.module;
  } else if (await fs.exists(jsonPath)) {
    if (!fs.readFile)
      throw new Error("Config loading requires an fs adapter with readFile support.");
    loadedYaml = JSON.parse(await fs.readFile(jsonPath, "utf-8")) as DatabaseConfigModule;
  }

  if (loadedYaml) {
    const shared = loadedYaml.shared;
    if (shared == null || shared === false) return loadedYaml;

    const merged: Record<string, unknown> = { ...loadedYaml };
    delete merged.shared;
    for (const [env, config] of Object.entries(merged)) {
      if (isMultiDatabaseEnv(config)) {
        const subConfigs: Record<string, unknown> = {};
        for (const [name, subConfig] of Object.entries(config)) {
          subConfigs[name] = isMultiDatabaseEnv(shared)
            ? reverseMerge(subConfig as AnyHash, (shared as Record<string, AnyHash>)[name] ?? {})
            : reverseMerge(subConfig as AnyHash, shared as AnyHash);
        }
        merged[env] = subConfigs;
      } else if (config !== null && typeof config === "object") {
        merged[env] = reverseMerge(config as AnyHash, shared as AnyHash);
      }
    }
    return new Proxy(merged, {
      get(target, key, receiver) {
        if (typeof key === "string" && !Reflect.has(target, key)) return shared;
        return Reflect.get(target, key, receiver);
      },
    }) as DatabaseConfigModule;
  }

  if (env.DATABASE_URL) return {};

  throw new Error(
    `Could not load database configuration. No such file - ${path.join(resolvedRoot, "config", "database.*")}`,
  );
}

/**
 * Load the database configuration for the given environment.
 * Looks for config/database.ts (or .js) in the cwd.
 */
export async function loadDatabaseConfig(env?: string, cwd?: string): Promise<DatabaseConfig> {
  const resolvedEnv = env ?? resolveEnv();
  const loaded = await loadDatabaseConfigModule(cwd);
  if (!loaded) {
    throw new Error("No database config found. Expected config/database.ts (.js)");
  }

  const envs = Object.keys(loaded.module).filter((k) => !TOP_LEVEL_CONFIG_KEYS.has(k));
  // Distinguish "asked for 'production' but only have 'development'"
  // from "config file defines no environments at all" — the latter
  // would otherwise produce the confusing "Available: " with nothing
  // after the colon.
  const available = envs.length > 0 ? `Available: ${envs.join(", ")}` : "No environments defined";

  // Explicitly reject env names that collide with top-level keys (e.g.
  // `TRAILS_ENV=schemaFormat`). Without this, the lookup below would
  // happily return the string "ts" as a DatabaseConfig and adapter
  // resolution would crash with a confusing error downstream.
  if (TOP_LEVEL_CONFIG_KEYS.has(resolvedEnv)) {
    throw new Error(`No database configuration for environment "${resolvedEnv}". ${available}`);
  }

  const envConfig = (loaded.module as Record<string, unknown>)[resolvedEnv];
  if (envConfig === undefined) {
    throw new Error(`No database configuration for environment "${resolvedEnv}". ${available}`);
  }

  // Reject arrays explicitly: they pass `typeof === "object"` but a
  // `development: []` config is never valid and the downstream
  // multi-DB error message would just confuse the user.
  if (envConfig === null || typeof envConfig !== "object" || Array.isArray(envConfig)) {
    throw new Error(
      `Invalid database configuration for environment "${resolvedEnv}": ` +
        `expected an object, got ${formatUnknown(envConfig)}.`,
    );
  }

  // Legacy single-DB layout: the env value IS the config (Rails rule:
  // not every sub-value is a Hash).
  if (!isMultiDatabaseEnv(envConfig)) return envConfig as DatabaseConfig;

  // Multi-DB layout: pull the `primary` sub-config so single-adapter
  // CLI commands (migrate, schema:dump, etc.) operate against it.
  // Anything that needs to fan out across every named DB should call
  // loadAllDatabaseConfigs directly.
  const primary = (envConfig as Record<string, unknown>).primary;
  if (primary !== null && typeof primary === "object" && !Array.isArray(primary)) {
    return primary as DatabaseConfig;
  }
  const names = Object.keys(envConfig).join(", ");
  throw new Error(
    `Multi-database environment "${resolvedEnv}" has no "primary" sub-config. ` +
      `Found: ${names || "(empty)"}. Either add a primary entry or use loadAllDatabaseConfigs.`,
  );
}

/**
 * Distinguish Rails' multi-DB shape from the legacy single-DB shape:
 *
 *   // multi-DB:
 *   development:
 *     primary: { adapter, database, ... }
 *     animals: { adapter, database, ... }
 *
 *   // single-DB:
 *   development: { adapter, database, ... }
 *
 * Mirrors Rails' rule from
 * `DatabaseConfigurations#build_configs` (activerecord/lib/active_record/
 * database_configurations.rb:205):
 *
 *     if config.is_a?(Hash) && config.values.all?(Hash)
 *       walk_configs(env_name, config)     # multi-DB
 *     else
 *       build_db_config_from_raw_config(env_name, "primary", config)
 *     end
 *
 * So an env value is treated as multi-DB iff it's a non-null object
 * AND every value inside it is also a non-null object. A single
 * string/number/boolean field inside the env collapses it back to
 * single-DB — exactly matching Rails.
 */
function isMultiDatabaseEnv(value: unknown): value is Record<string, object> {
  if (value === null || typeof value !== "object") return false;
  // Matches Ruby's `.all? { Hash === _1 }` on hash values: vacuously
  // true for an empty hash. An empty env still counts as multi-DB (with
  // zero named sub-configs) — the caller catches that case and throws
  // a clearer error than "single-DB with no fields".
  return Object.values(value).every(
    (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  );
}

/**
 * Named database configuration for the given environment. `name` is
 * `"primary"` for legacy single-DB configs; for multi-DB layouts it
 * matches the key under the env object (`primary`, `animals`, etc.).
 */
export interface NamedDatabaseConfig {
  name: string;
  config: DatabaseConfig;
}

/**
 * Load every database configuration defined for the given environment.
 * Supports two config shapes:
 *
 *   // Single-DB (legacy):
 *   development: { adapter: "sqlite3", database: "db/dev.sqlite3" }
 *
 *   // Multi-DB (Rails-style):
 *   development:
 *     primary: { adapter: "postgresql", database: "app_dev" }
 *     animals: { adapter: "postgresql", database: "app_animals_dev" }
 *
 * Detection mirrors Rails' `DatabaseConfigurations#build_configs`:
 * the env value is treated as multi-DB iff it's a non-null object AND
 * every value inside it is also a non-null object. A single scalar
 * field inside the env (e.g. `adapter: "sqlite3"`) collapses it back
 * to single-DB — same rule as Rails' `config.values.all?(Hash)`.
 *
 * Mirrors: `ActiveRecord::DatabaseConfigurations#configs_for(env_name:)`
 * which returns one HashConfig per named DB in an environment.
 */
export async function loadAllDatabaseConfigs(
  env?: string,
  cwd?: string,
): Promise<NamedDatabaseConfig[]> {
  const resolvedEnv = env ?? resolveEnv();
  const loaded = await loadDatabaseConfigModule(cwd);
  if (!loaded) {
    throw new Error("No database config found. Expected config/database.ts (.js)");
  }

  const envs = Object.keys(loaded.module).filter((k) => !TOP_LEVEL_CONFIG_KEYS.has(k));
  const available = envs.length > 0 ? `Available: ${envs.join(", ")}` : "No environments defined";

  if (TOP_LEVEL_CONFIG_KEYS.has(resolvedEnv)) {
    throw new Error(`No database configuration for environment "${resolvedEnv}". ${available}`);
  }

  const raw = (loaded.module as Record<string, unknown>)[resolvedEnv];
  if (raw === undefined) {
    throw new Error(`No database configuration for environment "${resolvedEnv}". ${available}`);
  }

  // Reject arrays explicitly: they pass `typeof === "object"` but
  // would slip into the multi-DB path and produce a misleading error
  // about no configurations defined.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Invalid database configuration for environment "${resolvedEnv}": ` +
        `expected an object, got ${formatUnknown(raw)}.`,
    );
  }

  if (!isMultiDatabaseEnv(raw)) {
    // Single-DB: the env value IS the config — matches Rails'
    // `build_db_config_from_raw_config(env, "primary", config)`
    // fallback when `config.values.all?(Hash)` is false.
    return [{ name: "primary", config: raw as DatabaseConfig }];
  }

  // Multi-DB: each key is a named sub-config. isMultiDatabaseEnv is
  // explicitly vacuously true for an empty object (matches Ruby's
  // `[].all?` returning true), so this is the explicit empty-env
  // check that produces a clear error instead of silently returning
  // an empty array.
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error(`Environment "${resolvedEnv}" has no database configurations defined.`);
  }
  return entries.map(([name, sub]) => ({ name, config: sub as DatabaseConfig }));
}

export type SchemaFormat = "ts" | "js" | "sql";

/**
 * Resolve the effective `schemaFormat` for CLI dump/load commands.
 *
 * Precedence (highest wins):
 *   1. Explicit CLI flag (`opts.format`) — Rails' rake task arg equivalent
 *   2. `SCHEMA_FORMAT` env var — matches Rails
 *      `ENV.fetch("SCHEMA_FORMAT", ActiveRecord.schema_format).to_sym`
 *      pattern used throughout `activerecord/lib/active_record/railties/
 *      databases.rake`
 *   3. Top-level `schemaFormat` key in config/database.ts — equivalent
 *      of `ActiveRecord.schema_format` (set via
 *      `config.active_record.schema_format` in Rails' application.rb)
 *   4. Existence inference — pick ts/js/sql based on which schema file
 *      is already present in `db/`. Trails-specific convenience so
 *      deleting the old file + dumping migrates format without touching
 *      config.
 *   5. Default "ts"
 *
 * Returns the resolved format. Callers should assign it to
 * `DatabaseTasks.schemaFormat` before invoking dump/load.
 */
export async function resolveSchemaFormat(
  opts: { format?: string } = {},
  cwd?: string,
): Promise<SchemaFormat> {
  const normalize = (raw: unknown, source: string): SchemaFormat => {
    // `schemaFormat` in config/database.ts is user-authored with only
    // structural typing, so we can be handed a number, boolean, etc.
    // Refuse with the same source-labeled error instead of blowing up
    // when the unchecked input lacks `.toLowerCase`.
    if (typeof raw !== "string") {
      // Format the offending value for the error message. JSON.stringify
      // throws on bigint / circular objects, and util.inspect would pull
      // in a Node-only dep — neither is acceptable for code that sits
      // in a package whose runtime surface should route through
      // activesupport adapters. Roll our own minimal, total formatter:
      // typeof-dispatched and always returns a string.
      throw new Error(
        `Invalid ${source} value ${formatUnknown(raw)}. Expected one of: ts, js, sql.`,
      );
    }
    const normalized = raw.toLowerCase();
    if (normalized !== "ts" && normalized !== "js" && normalized !== "sql") {
      throw new Error(`Invalid ${source} value "${raw}". Expected one of: ts, js, sql.`);
    }
    return normalized;
  };

  // Presence-based, not truthy — `--format ""` and `SCHEMA_FORMAT=""`
  // should error (caller clearly set the knob to something) rather than
  // silently falling through to the next rung.
  if (opts.format !== undefined) return normalize(opts.format, "--format");

  if ("SCHEMA_FORMAT" in env) {
    return normalize(env.SCHEMA_FORMAT ?? "", "SCHEMA_FORMAT env var");
  }

  // Inspect the config file for a top-level `schemaFormat` key (sibling
  // of the per-env configs). Rails sets this via
  // `config.active_record.schema_format` in config/application.rb; trails
  // folds it into config/database.ts so the one file holds everything a
  // db command needs to know.
  //
  // Routes through the shared loader so we don't double-import the
  // config file — Node's ESM cache already dedups by URL, but funneling
  // both call sites through one function keeps error handling (the
  // "failed to load config" rethrow) in one place and surfaces real
  // import failures instead of silently falling through to inference.
  const fs = await getFsAsync();
  const path = await getPathAsync();
  const resolvedCwd = cwd ?? fs.cwd();

  const loaded = await loadDatabaseConfigModule(resolvedCwd);
  if (loaded && "schemaFormat" in loaded.module) {
    // Presence-based: an explicitly-set-but-garbage value (including an
    // empty string) is a misconfig that should throw, not silently fall
    // through to inference. Use a relative path in the error source so
    // it stays short and consistent with other config-loading errors.
    const loadedRel = path.relative?.(resolvedCwd, loaded.path) || loaded.path;
    return normalize(loaded.module.schemaFormat ?? "", `schemaFormat in ${loadedRel}`);
  }

  const dbDir = path.join(resolvedCwd, "db");
  if (await fs.exists(path.join(dbDir, "structure.sql"))) return "sql";
  if (await fs.exists(path.join(dbDir, "schema.js"))) return "js";
  if (await fs.exists(path.join(dbDir, "schema.ts"))) return "ts";
  return "ts";
}

/**
 * Create the appropriate database adapter from a config object.
 */
export async function connectAdapter(config: DatabaseConfig): Promise<DatabaseAdapter> {
  const adapter = config.adapter ?? "sqlite3";

  switch (adapter) {
    case "sqlite3":
    case "sqlite":
    case "node-sqlite":
    case "expo-sqlite": {
      // Each SQLite adapter name resolves to its own concrete subclass, matching
      // `ConnectionAdapters.resolve(name)`. Each subclass bundles its own client
      // library via defaultSqliteDriver(), so no registry dance is needed. The
      // `sqlite3`/`sqlite` names map to the better-sqlite3-backed default.
      // Literal `import()` specifiers (not a computed path) so bundlers and the
      // vitest alias map can statically resolve each subclass module. We open
      // via the static `openAsync()` factory, which works for both sync drivers
      // (better-sqlite3, node:sqlite) and async-only ones (expo-sqlite).
      type SqliteCtor = {
        openAsync(filename: string, options?: Record<string, unknown>): Promise<DatabaseAdapter>;
      };
      const load = async (): Promise<SqliteCtor> => {
        if (adapter === "node-sqlite") {
          return (
            await import("@blazetrails/activerecord/connection-adapters/node-sqlite-adapter.js")
          ).NodeSQLiteAdapter as unknown as SqliteCtor;
        }
        if (adapter === "expo-sqlite") {
          return (
            await import("@blazetrails/activerecord/connection-adapters/expo-sqlite-adapter.js")
          ).ExpoSQLiteAdapter as unknown as SqliteCtor;
        }
        return (
          await import("@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js")
        ).BetterSQLite3Adapter as unknown as SqliteCtor;
      };
      const need =
        adapter === "node-sqlite"
          ? "Node 22.5+ with the built-in `node:sqlite` module"
          : adapter === "expo-sqlite"
            ? "the `expo-sqlite` package (Expo / React Native runtimes)"
            : "the `better-sqlite3` package (e.g. `npm add better-sqlite3`)";
      let SQLiteAdapter: SqliteCtor;
      try {
        SQLiteAdapter = await load();
      } catch (cause) {
        throw new Error(`trailties needs ${need} to open a "${adapter}" SQLite database.`, {
          cause,
        });
      }
      // Forward adapter-level options from database.yml (driver, readonly,
      // statementLimit, pragmas, …). Stripping adapter/database/url keeps
      // adapter options clean of routing fields.
      const { adapter: _a, database: _d, url: _u, ...rest } = config;
      void _a;
      void _d;
      void _u;
      return SQLiteAdapter.openAsync(
        config.database ?? ":memory:",
        rest as Record<string, unknown>,
      );
    }
    case "postgresql":
    case "postgres": {
      const { PostgreSQLAdapter } =
        await import("@blazetrails/activerecord/connection-adapters/postgresql-adapter.js");
      if (config.url) {
        return new PostgreSQLAdapter(config.url);
      }
      return new PostgreSQLAdapter({
        host: config.host ?? "localhost",
        port: config.port ?? 5432,
        database: config.database,
        user: config.username,
        password: config.password,
      });
    }
    case "mysql2":
    case "mysql": {
      const { Mysql2Adapter } =
        await import("@blazetrails/activerecord/connection-adapters/mysql2-adapter.js");
      if (config.url) {
        return new Mysql2Adapter(config.url);
      }
      return new Mysql2Adapter({
        host: config.host ?? "localhost",
        port: config.port ?? 3306,
        database: config.database,
        user: config.username,
        password: config.password,
      });
    }
    default:
      throw new Error(`Unknown database adapter: "${adapter}"`);
  }
}
