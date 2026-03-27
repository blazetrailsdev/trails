import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import type { DatabaseAdapter } from "@blazetrails/activerecord";

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
 * Checks RAILS_TS_ENV, then NODE_ENV, defaults to "development".
 */
export function resolveEnv(): string {
  return process.env.RAILS_TS_ENV || process.env.NODE_ENV || "development";
}

/**
 * Load the database configuration for the given environment.
 * Looks for config/database.ts or src/config/database.ts in the cwd.
 */
export async function loadDatabaseConfig(
  env?: string,
  cwd: string = process.cwd(),
): Promise<DatabaseConfig> {
  const resolvedEnv = env ?? resolveEnv();

  // Prefer .ts (source of truth) over .js (compiled)
  const candidates = [
    path.join(cwd, "config", "database.ts"),
    path.join(cwd, "config", "database.js"),
    path.join(cwd, "src", "config", "database.ts"),
    path.join(cwd, "src", "config", "database.js"),
  ];

  let configPath: string | undefined;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      configPath = candidate;
      break;
    }
  }

  if (!configPath) {
    throw new Error(
      "No database config found. Expected config/database.ts (.js) or src/config/database.ts (.js)",
    );
  }

  let mod: any;
  try {
    mod = await import(pathToFileURL(configPath).href);
  } catch (error: any) {
    const rel = path.relative(cwd, configPath);
    const enhanced = new Error(
      `Failed to load database config from "${rel}": ${error.message}. ` +
        `Run with tsx (e.g., "npx tsx node_modules/.bin/rails-ts").`,
    );
    (enhanced as any).cause = error;
    throw enhanced;
  }
  const configs = mod.default ?? mod;

  const envConfig = configs[resolvedEnv];
  if (!envConfig) {
    throw new Error(
      `No database configuration for environment "${resolvedEnv}". ` +
        `Available: ${Object.keys(configs).join(", ")}`,
    );
  }

  return envConfig as DatabaseConfig;
}

/**
 * Create the appropriate database adapter from a config object.
 */
export async function connectAdapter(config: DatabaseConfig): Promise<DatabaseAdapter> {
  const adapter = config.adapter ?? "sqlite3";

  switch (adapter) {
    case "sqlite3":
    case "sqlite": {
      const { SQLite3Adapter } = await import("@blazetrails/activerecord");
      return new SQLite3Adapter(config.database ?? ":memory:");
    }
    case "postgresql":
    case "postgres": {
      const { PostgreSQLAdapter } = await import("@blazetrails/activerecord");
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
      const { Mysql2Adapter } = await import("@blazetrails/activerecord");
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
