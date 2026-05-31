import { join, resolve } from "path";
import { getFsAsync } from "@blazetrails/activesupport";
import {
  DatabaseTasks,
  DatabaseConfigurations,
  NoDatabaseError,
  DatabaseAlreadyExists,
} from "@blazetrails/activerecord";
import { loadDatabaseConfig, loadMigrations, tryLoadModels } from "./db-helpers.js";

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

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  const raw = i >= 0 ? args[i + 1] : undefined;
  return raw && !raw.startsWith("-") ? raw : undefined;
}

function parseStep(args: string[], fallback: number): number {
  const raw = flagValue(args, "--step");
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export async function dbMigrate(cwd: string, args: string[]): Promise<number> {
  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }
  await tryLoadModels(cwd);
  loadMigrations(cwd);

  const version = flagValue(args, "--version");
  try {
    await DatabaseTasks.migrate(version);
    return 0;
  } catch (err) {
    console.error(`ar: db:migrate failed — ${String(err)}`);
    return 1;
  }
}

export async function dbRollback(cwd: string, args: string[]): Promise<number> {
  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }
  await tryLoadModels(cwd);
  loadMigrations(cwd);
  const step = parseStep(args, 1);

  try {
    await DatabaseTasks.rollback(step);
    return 0;
  } catch (err) {
    console.error(`ar: db:rollback failed — ${String(err)}`);
    return 1;
  }
}

export async function dbSchemaLoad(cwd: string, _args: string[]): Promise<number> {
  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }

  const env = DatabaseConfigurations.currentEnv();
  try {
    await DatabaseTasks.checkProtectedEnvironmentsBang(env);
    await DatabaseTasks.loadSchemaCurrent(undefined, undefined, env);
    return 0;
  } catch (err) {
    console.error(`ar: db:schema:load failed — ${String(err)}`);
    return 1;
  }
}

export async function dbSeed(cwd: string, _args: string[]): Promise<number> {
  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }

  const fsAdapter = await getFsAsync();
  const seedsPath = resolve(join(cwd, "db", "seeds.ts"));
  if (!fsAdapter.existsSync(seedsPath)) {
    console.log("db/seeds.ts not found — nothing to seed.");
    return 0;
  }

  DatabaseTasks.seedLoader = {
    loadSeed: async () => {
      const { pathToFileURL } = await import("node:url");
      const mod = await import(pathToFileURL(seedsPath).href);
      const fn = mod.seed ?? mod.default;
      if (typeof fn === "function") await fn();
    },
  };

  try {
    await DatabaseTasks.loadSeed();
    return 0;
  } catch (err) {
    console.error(`ar: db:seed failed — ${String(err)}`);
    return 1;
  }
}

function installSeedLoader(cwd: string): void {
  const seedsPath = resolve(join(cwd, "db", "seeds.ts"));
  DatabaseTasks.seedLoader = {
    loadSeed: async () => {
      const fsAdapter = await getFsAsync();
      if (!fsAdapter.existsSync(seedsPath)) return;
      const { pathToFileURL } = await import("node:url");
      const mod = await import(pathToFileURL(seedsPath).href);
      const fn = mod.seed ?? mod.default;
      if (typeof fn === "function") await fn();
    },
  };
}

export async function dbSetup(cwd: string, _args: string[]): Promise<number> {
  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }
  await tryLoadModels(cwd);
  installSeedLoader(cwd);

  const env = DatabaseConfigurations.currentEnv();
  const configs = DatabaseTasks.configsFor(env);
  if (configs.length === 0) {
    console.error(`ar: no database configuration found for environment "${env}"`);
    return 1;
  }
  let ok = true;
  for (const config of configs) {
    if (!(await runCreate(config))) ok = false;
  }
  if (!ok) return 1;

  try {
    await DatabaseTasks.checkProtectedEnvironmentsBang(env);
    await DatabaseTasks.loadSchemaCurrent(undefined, undefined, env);
  } catch (err) {
    console.error(`ar: db:setup schema load failed — ${String(err)}`);
    return 1;
  }

  try {
    await DatabaseTasks.loadSeed();
  } catch (err) {
    console.error(`ar: db:setup seed failed — ${String(err)}`);
    return 1;
  }
  return 0;
}

export async function dbReset(cwd: string, _args: string[]): Promise<number> {
  const dropCode = await dbDrop(cwd, []);
  if (dropCode !== 0) return dropCode;
  return dbSetup(cwd, []);
}

export async function dbPrepare(cwd: string, _args: string[]): Promise<number> {
  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }

  const env = DatabaseConfigurations.currentEnv();
  if (DatabaseTasks.configsFor(env).length === 0) {
    console.error(`ar: no database configuration found for environment "${env}"`);
    return 1;
  }

  await tryLoadModels(cwd);
  loadMigrations(cwd);
  installSeedLoader(cwd);

  try {
    await DatabaseTasks.prepareAll();
    return 0;
  } catch (err) {
    console.error(`ar: db:prepare failed — ${String(err)}`);
    return 1;
  }
}
