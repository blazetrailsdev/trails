import { reverseMerge, trailsRoot } from "@blazetrails/activesupport";
import { getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";
import { env } from "@blazetrails/ruby-compat";
import type { DatabaseAdapter } from "@blazetrails/activerecord";

/** @noRailsEquivalent PERMANENT */
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

export function resolveEnv(): string {
  return env.TRAILS_ENV || "development";
}

export interface DatabaseConfigModule {
  [key: string]: unknown;
  schemaFormat?: string;
}

const TOP_LEVEL_CONFIG_KEYS = new Set<string>(["schemaFormat"]);

function formatUnknown(value: unknown): string {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "bigint") return `${value as bigint}n`;
  if (type === "symbol" || type === "function" || type === "undefined") return String(value);
  if (type === "number" || type === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    const proto = Object.getPrototypeOf(value as object);
    const ctor = proto?.constructor?.name ?? "Object";
    return `[object ${ctor}]`;
  }
}

export async function loadDatabaseConfigModule(
  cwd?: string,
): Promise<{ path: string; module: DatabaseConfigModule } | null> {
  const fs = await getFsAsync();
  const path = await getPathAsync();
  const resolvedCwd = cwd ?? fs.cwd();

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

export async function loadDatabaseConfig(env?: string, cwd?: string): Promise<DatabaseConfig> {
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

  const envConfig = (loaded.module as Record<string, unknown>)[resolvedEnv];
  if (envConfig === undefined) {
    throw new Error(`No database configuration for environment "${resolvedEnv}". ${available}`);
  }

  if (envConfig === null || typeof envConfig !== "object" || Array.isArray(envConfig)) {
    throw new Error(
      `Invalid database configuration for environment "${resolvedEnv}": ` +
        `expected an object, got ${formatUnknown(envConfig)}.`,
    );
  }

  if (!isMultiDatabaseEnv(envConfig)) return envConfig as DatabaseConfig;

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

function isMultiDatabaseEnv(value: unknown): value is Record<string, object> {
  if (value === null || typeof value !== "object") return false;
  return Object.values(value).every(
    (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  );
}

export interface NamedDatabaseConfig {
  name: string;
  config: DatabaseConfig;
}

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

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Invalid database configuration for environment "${resolvedEnv}": ` +
        `expected an object, got ${formatUnknown(raw)}.`,
    );
  }

  if (!isMultiDatabaseEnv(raw)) {
    return [{ name: "primary", config: raw as DatabaseConfig }];
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error(`Environment "${resolvedEnv}" has no database configurations defined.`);
  }
  return entries.map(([name, sub]) => ({ name, config: sub as DatabaseConfig }));
}

export type SchemaFormat = "ts" | "js" | "sql";

export async function resolveSchemaFormat(
  opts: { format?: string } = {},
  cwd?: string,
): Promise<SchemaFormat> {
  const normalize = (raw: unknown, source: string): SchemaFormat => {
    if (typeof raw !== "string") {
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

  if (opts.format !== undefined) return normalize(opts.format, "--format");

  if ("SCHEMA_FORMAT" in env) {
    return normalize(env.SCHEMA_FORMAT ?? "", "SCHEMA_FORMAT env var");
  }

  const fs = await getFsAsync();
  const path = await getPathAsync();
  const resolvedCwd = cwd ?? fs.cwd();

  const loaded = await loadDatabaseConfigModule(resolvedCwd);
  if (loaded && "schemaFormat" in loaded.module) {
    const loadedRel = path.relative?.(resolvedCwd, loaded.path) || loaded.path;
    return normalize(loaded.module.schemaFormat ?? "", `schemaFormat in ${loadedRel}`);
  }

  const dbDir = path.join(resolvedCwd, "db");
  if (await fs.exists(path.join(dbDir, "structure.sql"))) return "sql";
  if (await fs.exists(path.join(dbDir, "schema.js"))) return "js";
  if (await fs.exists(path.join(dbDir, "schema.ts"))) return "ts";
  return "ts";
}

export async function connectAdapter(config: DatabaseConfig): Promise<DatabaseAdapter> {
  const adapter = config.adapter ?? "sqlite3";

  switch (adapter) {
    case "sqlite3":
    case "sqlite":
    case "node-sqlite":
    case "expo-sqlite": {
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
