import type { Base } from "./base.js";
import type { DatabaseAdapter } from "./adapter.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { DatabaseConfigurations } from "./database-configurations.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import {
  AdapterNotFound,
  AdapterNotSpecified,
  ConnectionNotEstablished,
  ConfigurationError,
} from "./errors.js";

/**
 * Connection establishment and management for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::ConnectionHandling
 */

const _adapterCache: Record<string, new (...args: any[]) => DatabaseAdapter> = {};

async function _loadAdapter(normalized: string): Promise<new (...args: any[]) => DatabaseAdapter> {
  if (_adapterCache[normalized]) return _adapterCache[normalized];
  let Cls: new (...args: any[]) => DatabaseAdapter;
  if (normalized === "sqlite") {
    Cls = (await import("./connection-adapters/sqlite3-adapter.js")).SQLite3Adapter;
  } else if (normalized === "postgresql") {
    Cls = (await import("./adapters/postgresql-adapter.js")).PostgreSQLAdapter;
  } else if (normalized === "mysql") {
    Cls = (await import("./adapters/mysql2-adapter.js")).Mysql2Adapter;
  } else {
    throw new AdapterNotFound(
      `Unknown database adapter "${normalized}". Supported adapters: postgresql, mysql, sqlite`,
    );
  }
  _adapterCache[normalized] = Cls;
  return Cls;
}

export async function establishConnection(
  modelClass: typeof Base,
  config?:
    | string
    | {
        adapter?: string;
        url?: string;
        database?: string;
        host?: string;
        port?: number;
        username?: string;
        password?: string;
        [key: string]: unknown;
      },
): Promise<void> {
  // Clear cached adapters up the prototype chain (Base → ApplicationRecord → Model)
  let current: any = modelClass;
  while (current && typeof current === "function") {
    if ("_adapter" in current) {
      current._adapter = null;
    }
    const proto = Object.getPrototypeOf(current.prototype);
    if (!proto) break;
    const parent = proto.constructor;
    if (!parent || parent === current) break;
    current = parent;
  }

  if (config === undefined) {
    await autoConnect(modelClass);
    return;
  }

  const resolved = resolveConfig(modelClass, config);
  await establishWithConfig(modelClass, resolved.adapterName, resolved.url, resolved.config);
}

async function establishWithConfig(
  modelClass: typeof Base,
  adapterName: string,
  url: string,
  config?: Record<string, unknown>,
): Promise<void> {
  const normalized = normalizeAdapterName(adapterName);
  const AdapterClass = await _loadAdapter(normalized);

  let adapterArg: unknown;
  if (normalized === "sqlite") {
    adapterArg = parseSqliteUrl(url || (config?.database as string) || ":memory:");
  } else if (url) {
    adapterArg = url;
  } else if (config) {
    const { adapter: _a, url: _u, username, ...rest } = config;
    const adapterConfig: Record<string, unknown> = { ...rest };
    if (adapterConfig.user === undefined && username !== undefined) {
      adapterConfig.user = username;
    }
    if (adapterConfig.host === undefined) {
      adapterConfig.host = "localhost";
    }
    adapterArg = adapterConfig;
  } else {
    adapterArg = url;
  }

  const dbConfig = new HashConfig(
    process.env.NODE_ENV || DatabaseConfigurations.defaultEnv,
    "primary",
    { adapter: adapterName, url, ...config },
  );

  modelClass.connectionHandler.establishConnection(dbConfig, {
    owner: "primary",
    adapterFactory: () => new AdapterClass(adapterArg),
  });
}

async function autoConnect(modelClass: typeof Base): Promise<void> {
  const raw = await loadConfigFile(modelClass);
  const configs = DatabaseConfigurations.fromEnv(raw);
  const env = process.env.NODE_ENV || DatabaseConfigurations.defaultEnv;
  const primaryConfigs = configs.configsFor({ envName: env, name: "primary" });
  const dbConfig = primaryConfigs[0] ?? configs.findDbConfig(env);

  if (!dbConfig) {
    throw new ConnectionNotEstablished(
      `No database configuration found for ${modelClass.name}. ` +
        `Add config/database.json, set DATABASE_URL, or call ${modelClass.name}.establishConnection(url)`,
    );
  }

  const url = dbConfig.configuration.url || "";
  const adapterName = dbConfig.adapter || (url ? adapterNameFromUrl(url) : undefined);
  if (!adapterName) {
    throw new AdapterNotSpecified(
      `Database configuration for "${env}" must include an adapter name or a URL. ` +
        `Add config/database.json, set DATABASE_URL, or call ${modelClass.name}.establishConnection(url)`,
    );
  }
  await establishWithConfig(
    modelClass,
    adapterName,
    url,
    dbConfig.configuration as Record<string, unknown>,
  );
}

function resolveConfig(
  modelClass: typeof Base,
  config: string | { adapter?: string; url?: string; database?: string; [key: string]: unknown },
): { adapterName: string; url: string; config?: Record<string, unknown> } {
  let url: string;
  let adapterName: string | undefined;
  let fullConfig: Record<string, unknown> | undefined;

  if (typeof config === "string") {
    url = config;
  } else {
    adapterName = config.adapter;
    url = config.url || "";
    fullConfig = config as Record<string, unknown>;
  }

  if (!adapterName && !url && !fullConfig?.database) {
    throw new AdapterNotSpecified(
      "Database configuration must include a url, database, or adapter name",
    );
  }

  if (!adapterName) {
    adapterName = adapterNameFromUrl(url || (fullConfig?.database as string) || "");
  }

  return { adapterName, url, config: fullConfig };
}

async function loadConfigFile(modelClass: typeof Base): Promise<Record<string, any>> {
  if ((modelClass as any)._configPath) {
    return loadJsonConfig((modelClass as any)._configPath);
  }

  const cwd = process.cwd();
  const tsCandidates = [
    resolve(cwd, "config", "database.ts"),
    resolve(cwd, "config", "database.js"),
    resolve(cwd, "src", "config", "database.ts"),
    resolve(cwd, "src", "config", "database.js"),
  ];

  for (const candidate of tsCandidates) {
    if (existsSync(candidate)) {
      try {
        const mod = await import(pathToFileURL(candidate).href);
        return mod.default ?? mod;
      } catch (error: unknown) {
        throw new Error(
          `Failed to load database config at ${candidate}: ${(error as Error).message}`,
          { cause: error },
        );
      }
    }
  }

  return loadJsonConfig(resolve(cwd, "config", "database.json"));
}

function loadJsonConfig(configPath: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new ConfigurationError(
      `Failed to load database config at ${configPath}: ${(error as Error).message}`,
      { cause: error },
    );
  }
}

export function normalizeAdapterName(name: string): string {
  switch (name) {
    case "postgresql":
    case "postgres":
      return "postgresql";
    case "mysql":
    case "mysql2":
      return "mysql";
    case "sqlite":
    case "sqlite3":
      return "sqlite";
    default:
      return name;
  }
}

export function parseSqliteUrl(url: string): string {
  if (url.startsWith("sqlite3://") || url.startsWith("sqlite://")) {
    const stripped = url.replace(/^sqlite3?:\/\//, "");
    return stripped || ":memory:";
  }
  return url;
}

export function adapterNameFromUrl(url: string): string {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return "postgresql";
  }
  if (url.startsWith("mysql://") || url.startsWith("mysql2://")) {
    return "mysql";
  }
  if (
    url.startsWith("sqlite://") ||
    url.startsWith("sqlite3://") ||
    url.endsWith(".sqlite3") ||
    url.endsWith(".db") ||
    url === ":memory:"
  ) {
    return "sqlite";
  }
  throw new AdapterNotFound(
    `Cannot detect database adapter from URL "${url}". ` +
      `Use a URL starting with postgres://, mysql://, or sqlite://, ` +
      `or pass { adapter: "postgresql", url: "..." }`,
  );
}
