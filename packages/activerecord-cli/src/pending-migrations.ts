import { DatabaseTasks } from "@blazetrails/activerecord";
import type { MigrationProxy } from "@blazetrails/activerecord";
import { loadDatabaseConfig } from "./db-helpers.js";

function pendingMessage(pending: MigrationProxy[]): string {
  const count = pending.length;
  let msg = `You have ${count} pending ${count > 1 ? "migrations:" : "migration:"}`;
  for (const m of pending) {
    msg += `\n  ${String(m.version).padStart(4, " ")} ${m.name}`;
  }
  return msg;
}

export async function checkPendingMigrations(cwd?: string): Promise<MigrationProxy[]> {
  const dir = cwd ?? process.cwd();
  await loadDatabaseConfig(dir);
  const pendingMigrations: MigrationProxy[][] = [];
  await DatabaseTasks.withTemporaryPoolForEach({}, async (pool) => {
    const pending = await pool.migrationContext.open().pendingMigrations();
    if (pending != null) pendingMigrations.push(pending);
  });
  return pendingMigrations.flat();
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
