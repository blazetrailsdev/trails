import { DatabaseTasks, DatabaseConfigurations, Migrator } from "@blazetrails/activerecord";
import type { MigrationProxy } from "@blazetrails/activerecord";
import { loadDatabaseConfig, loadMigrations } from "./db-helpers.js";

async function resolvePending(migrations: MigrationProxy[]): Promise<MigrationProxy[]> {
  const env = DatabaseConfigurations.currentEnv();
  const configs = DatabaseTasks.configsFor(env);
  if (configs.length === 0) return [];
  const config = configs.find((c) => c.name === "primary") ?? configs[0];
  let pending: MigrationProxy[] = [];
  await DatabaseTasks.withTemporaryConnection(config, async (adapter) => {
    const migrator = new Migrator(adapter, migrations);
    pending = await migrator.pendingMigrationsReadOnly();
  });
  return pending;
}

function pendingMessage(pending: MigrationProxy[]): string {
  const count = pending.length;
  let msg = `You have ${count} pending ${count > 1 ? "migrations:" : "migration:"}`;
  for (const m of pending) {
    msg += `\n  ${String(m.version).padStart(4, " ")} ${m.name}`;
  }
  return msg;
}

/**
 * Resolve the list of pending migrations for the current environment.
 * Loads config and migration registry from `cwd` (defaults to `process.cwd()`).
 * Returns an empty array when all migrations are up to date.
 */
export async function checkPendingMigrations(cwd?: string): Promise<MigrationProxy[]> {
  const dir = cwd ?? process.cwd();
  await loadDatabaseConfig(dir);
  const migrations = loadMigrations(dir);
  return resolvePending(migrations);
}

export async function dbAbortIfPendingMigrations(cwd: string): Promise<number> {
  let pending: MigrationProxy[];
  try {
    pending = await checkPendingMigrations(cwd);
  } catch (err) {
    console.error(`ar: db:abort_if_pending_migrations failed — ${String(err)}`);
    return 1;
  }

  if (pending.length > 0) {
    console.error(pendingMessage(pending));
    console.error("Run `ar db:migrate` to update your database then try again.");
    return 1;
  }
  return 0;
}
