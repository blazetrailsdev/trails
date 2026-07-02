import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { SchemaMigration } from "../schema-migration.js";
import { InternalMetadata } from "../internal-metadata.js";

/**
 * Reset migrator bookkeeping to a clean slate the way Rails' migrator tests do
 * in `setup` (activerecord/test/cases/migrator_test.rb): ensure the
 * `schema_migrations` and `internal_metadata` tables exist, then clear their
 * rows. This mirrors Rails' `create_table` + `delete_all_versions` /
 * `delete_all_entries` and relies on no DROP TABLE, so it works under
 * one-schema mode where those tables persist across tests (the truncate-only
 * reset does not restore them the way per-test drop/recreate used to).
 */
export async function resetMigratorState(adapter: DatabaseAdapter): Promise<void> {
  const schemaMigration = new SchemaMigration(adapter);
  await schemaMigration.createTable();
  await schemaMigration.deleteAllVersions();

  const internalMetadata = new InternalMetadata(adapter);
  await internalMetadata.createTable();
  await internalMetadata.deleteAllEntries();
}
