import { resolve } from "node:path";
import config from "../config/database.js";

/**
 * Connection config helpers for the `db:*` CLI. `config/database.ts` is the
 * single source of connection settings (the analog of Rails'
 * `config/database.yml`); `Base.establishConnection()` reads that same file
 * with no arguments. Nothing else in the app hardcodes connection details.
 *
 * The environment is selected by `TRAILS_ENV` (default "development"), with
 * `NODE_ENV` honored only as a fallback — see the note in `config/database.ts`.
 */
const ENV = process.env.TRAILS_ENV ?? process.env.NODE_ENV ?? "development";

interface EnvConfig {
  adapter?: string;
  database?: string;
  [k: string]: unknown;
}

/** The config hash for the current environment. */
export function currentConfig(): EnvConfig {
  const cfg = (config as Record<string, EnvConfig>)[ENV];
  if (!cfg || typeof cfg !== "object") {
    throw new Error(`No "${ENV}" entry in config/database.ts`);
  }
  return cfg;
}

/** Absolute path of the SQLite file for the current env, or null (e.g. :memory:). */
export function sqliteDatabasePath(): string | null {
  const cfg = currentConfig();
  if (cfg.adapter?.startsWith("sqlite") && cfg.database && cfg.database !== ":memory:") {
    return resolve(cfg.database);
  }
  return null;
}
