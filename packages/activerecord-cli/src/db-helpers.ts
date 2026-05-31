import { join, resolve } from "path";
import { getFsAsync } from "@blazetrails/activesupport";
import { DatabaseTasks, DatabaseConfigurations, Migrator } from "@blazetrails/activerecord";

/**
 * Load `config/database.ts` from `cwd` and install it into `DatabaseTasks`.
 * Returns the resolved `DatabaseConfigurations` so callers can inspect it.
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
  const configs = DatabaseConfigurations.fromEnv(raw);
  DatabaseTasks.databaseConfiguration = configs;
  DatabaseTasks.root = cwd;
  return configs;
}

export function loadMigrations(cwd: string): import("@blazetrails/activerecord").MigrationProxy[] {
  const paths = DatabaseTasks.migrationsPaths.map((p) => resolve(join(cwd, p)));
  const migrations = Migrator.discoverMigrations(paths);
  DatabaseTasks.registerMigrations(migrations);
  return migrations;
}
