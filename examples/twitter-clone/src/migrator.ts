import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Base, Migration, MigrationRunner } from "@blazetrails/activerecord";

const MIGRATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrate");

const MIGRATION_FILE = /^(\d{14})_([a-z0-9_]+)\.ts$/;

/**
 * Load every `db/migrate/<version>_<name>.ts` file, in version order, and
 * instantiate its default-exported Migration subclass. The 14-digit
 * filename prefix is the version (Rails' `VERSION` timestamp), stamped onto
 * the class so `MigrationRunner` records it in `schema_migrations`.
 */
export async function loadMigrations(): Promise<Migration[]> {
  const files = readdirSync(MIGRATE_DIR)
    .filter((f) => MIGRATION_FILE.test(f))
    .sort();

  const migrations: Migration[] = [];
  for (const file of files) {
    const match = MIGRATION_FILE.exec(file);
    if (!match) continue; // unreachable after the filter above; keeps the type checker happy
    const version = match[1];
    const mod = (await import(join(MIGRATE_DIR, file))) as { default?: new () => Migration };
    if (!mod.default) throw new Error(`${file} must \`export default\` a Migration subclass`);
    (mod.default as unknown as { version: string }).version = version;
    migrations.push(new mod.default());
  }
  return migrations;
}

async function runner(): Promise<MigrationRunner> {
  return new MigrationRunner(Base.connection, await loadMigrations());
}

/** Run all pending migrations up. */
export async function migrate(): Promise<void> {
  await (await runner()).migrate();
}

/** Roll back the last `steps` applied migrations. */
export async function rollback(steps = 1): Promise<void> {
  await (await runner()).rollback(steps);
}

/** Print a Rails-style `db:migrate:status` table. */
export async function status(): Promise<void> {
  const rows = await (await runner()).status();
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
  const rows = await (await runner()).status();
  return rows.some((r) => r.status === "down");
}
