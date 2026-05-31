import { join, resolve } from "path";
import { getFsAsync } from "@blazetrails/activesupport";
import {
  DatabaseTasks,
  DatabaseConfigurations,
  NoDatabaseError,
  DatabaseAlreadyExists,
} from "@blazetrails/activerecord";

/**
 * Load `config/database.ts` from `cwd` and install it into `DatabaseTasks`.
 * Returns the resolved `DatabaseConfigurations` so callers can inspect it.
 */
async function loadDatabaseConfig(cwd: string): Promise<DatabaseConfigurations> {
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

async function runCreate(
  config: import("@blazetrails/activerecord").DatabaseConfig,
): Promise<boolean> {
  const dbName = config.database ?? "(unknown)";
  try {
    await DatabaseTasks.create(config);
    console.log(`Created database '${dbName}'`);
    return true;
  } catch (err) {
    if (err instanceof DatabaseAlreadyExists) {
      console.error(`Database '${dbName}' already exists`);
      return true;
    }
    console.error(`Couldn't create '${dbName}' database. Please check your configuration.`);
    console.error(String(err));
    return false;
  }
}

async function runDrop(
  config: import("@blazetrails/activerecord").DatabaseConfig,
): Promise<boolean> {
  const dbName = config.database ?? "(unknown)";
  try {
    await DatabaseTasks.drop(config);
    console.log(`Dropped database '${dbName}'`);
    return true;
  } catch (err) {
    if (err instanceof NoDatabaseError) {
      console.error(`Database '${dbName}' does not exist`);
      return true;
    }
    console.error(`Couldn't drop database '${dbName}'`);
    console.error(String(err));
    return false;
  }
}

export async function dbCreate(cwd: string, args: string[]): Promise<number> {
  const all = args.includes("--all");
  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }

  const env = DatabaseConfigurations.currentEnv();
  const configs = all ? DatabaseTasks.eachLocalConfiguration() : DatabaseTasks.configsFor(env);
  if (!all && configs.length === 0) {
    console.error(`ar: no database configuration found for environment "${env}"`);
    return 1;
  }
  let ok = true;
  for (const config of configs) {
    if (!(await runCreate(config))) ok = false;
  }
  return ok ? 0 : 1;
}

export async function dbDrop(cwd: string, args: string[]): Promise<number> {
  const all = args.includes("--all");
  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }

  const env = DatabaseConfigurations.currentEnv();
  const configs = all ? DatabaseTasks.eachLocalConfiguration() : DatabaseTasks.configsFor(env);
  if (!all && configs.length === 0) {
    console.error(`ar: no database configuration found for environment "${env}"`);
    return 1;
  }
  // Mirror DatabaseTasks.dropAll / dropCurrent: check protected envs before
  // any drop so a single production config in a multi-db set doesn't slip through.
  try {
    for (const config of configs) {
      await DatabaseTasks.checkProtectedEnvironmentsBang(config.envName);
    }
  } catch (err) {
    console.error(`ar: ${String(err)}`);
    return 1;
  }
  let ok = true;
  for (const config of configs) {
    if (!(await runDrop(config))) ok = false;
  }
  return ok ? 0 : 1;
}
