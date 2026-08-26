import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MigrationContext } from "@blazetrails/activerecord";

const MIGRATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrate");

/**
 * Rails' `db:*` tasks all go through a `MigrationContext` over the migration
 * paths (`migration.rb:1214-1218`): it globs `db/migrate/<version>_<name>`,
 * loads each file's Migration subclass, and records applied versions in
 * `schema_migrations` through `SchemaMigration`.
 */
function context(): MigrationContext {
  return new MigrationContext([MIGRATE_DIR]);
}

/** Run all pending migrations up. */
export async function migrate(): Promise<void> {
  await context().migrate();
}

/** Roll back the last `steps` applied migrations. */
export async function rollback(steps = 1): Promise<void> {
  await context().rollback(steps);
}

/** Print a Rails-style `db:migrate:status` table. */
export async function status(): Promise<void> {
  const rows = await context().migrationsStatus();
  console.log("\n Status   Migration ID    Name");
  console.log("--------------------------------------------------");
  for (const r of rows) {
    const mark = r.status === "up" ? "  up  " : " down ";
    console.log(`  ${mark}   ${r.version}  ${r.name}`);
  }
  console.log();
}

/** True when any migration has not yet been applied. */
export async function hasPendingMigrations(): Promise<boolean> {
  return (await context().open().pendingMigrations()).length > 0;
}
