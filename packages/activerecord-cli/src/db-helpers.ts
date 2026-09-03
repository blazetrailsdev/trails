import { join, resolve } from "path";
import { getFsAsync } from "@blazetrails/ruby-compat";
import { DatabaseTasks, DatabaseConfigurations, Migrator } from "@blazetrails/activerecord";
import { establishEnvironmentConnection, normalizeSqlitePaths } from "./environment.js";

/**
 * Load `config/database.ts` from `cwd` and install it into `DatabaseTasks`.
 * Returns the resolved `DatabaseConfigurations` so callers can inspect it.
 *
 * The port of `db:load_config` (`railties/databases.rake:22-26`), which depends
 * on `:environment` — a booted Rails app, with `ActiveRecord::Base` already
 * connected. Every task downstream relies on that: `with_temporary_pool`'s
 * first line is `migration_class.connection_db_config`
 * (`tasks/database_tasks.rb:542`), which raises on an unconnected class in
 * Ruby too. Establishing the current environment's connection here is this
 * CLI's stand-in for that prerequisite.
 */
export async function loadDatabaseConfig(cwd: string): Promise<DatabaseConfigurations> {
  const configPath = resolve(join(cwd, "config", "database.ts"));
  const fsAdapter = await getFsAsync();
  if (!fsAdapter.existsSync(configPath)) {
    throw new Error(`config/database.ts not found at ${configPath}`);
  }
  const { pathToFileURL } = await import("node:url");
  const mod = await import(pathToFileURL(configPath).href);
  const raw = mod.default ?? mod;
  const configs = normalizeSqlitePaths(new DatabaseConfigurations(raw), cwd);
  DatabaseTasks.databaseConfiguration = configs;
  DatabaseTasks.root = cwd;
  // `db:load_config` (`railties/databases.rake:27`): the discovery paths every
  // pool falls back to when its own `db_config.migrations_paths` is absent
  // (`connection_pool.rb:299`). Absolute, as `Rails.application.paths` are.
  Migrator.migrationsPaths = DatabaseTasks.migrationsPaths.map((p) => resolve(join(cwd, p)));
  await establishEnvironmentConnection(DatabaseConfigurations.defaultEnv);
  return configs;
}

export async function tryLoadModels(cwd: string): Promise<Record<string, unknown>> {
  const fsAdapter = await getFsAsync();
  const modelsPath = resolve(join(cwd, "app", "models", "index.ts"));
  if (!fsAdapter.existsSync(modelsPath)) return {};
  const { pathToFileURL } = await import("node:url");
  return import(pathToFileURL(modelsPath).href) as Promise<Record<string, unknown>>;
}
