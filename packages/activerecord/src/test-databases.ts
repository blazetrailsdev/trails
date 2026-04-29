/**
 * Test databases — utilities for managing test database lifecycle.
 *
 * Mirrors: ActiveRecord::TestDatabases
 */

import type { DatabaseAdapter } from "./adapter.js";
import type { MigrationProxy } from "./migration.js";
import { Migrator } from "./migration.js";
import type { Base } from "./base.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";

/**
 * Run migrations on each test database adapter.
 *
 * Mirrors: ActiveRecord::TestDatabases.create_and_migrate
 */
export async function createAndMigrate(
  adapters: DatabaseAdapter[],
  migrations: MigrationProxy[],
): Promise<void> {
  for (const adapter of adapters) {
    const migrator = new Migrator(adapter, migrations, { environment: "test" });
    await migrator.up();
  }
}

/**
 * Iterate over test database adapters, calling the callback for each.
 *
 * Mirrors: ActiveRecord::TestDatabases.each_database
 */
export async function eachDatabase(
  adapters: DatabaseAdapter[],
  callback: (adapter: DatabaseAdapter, index: number) => void | Promise<void>,
): Promise<void> {
  for (let i = 0; i < adapters.length; i++) {
    await callback(adapters[i], i);
  }
}

// Only the canonical `:memory:` name is treated as in-memory by
// SQLiteDatabaseTasks (create/drop skip it). URI variants like
// `file::memory:?cache=shared` are not currently special-cased there,
// so we match only what the task layer actually handles.
function isInMemorySqlite(name: string): boolean {
  return name === ":memory:";
}

/**
 * Create and load test schema(s) for parallelized test execution.
 *
 * For each configuration in the named environment, appends the index to
 * the database name, purges/creates the database, and loads the schema.
 * Finally re-establishes the connection so the worker uses the suffixed per-worker database.
 *
 * Called by ActiveSupport::Testing::Parallelization.after_fork_hook in
 * parallelized test workers (process i gets test databases with suffix `-i`).
 *
 * Mirrors: ActiveRecord::TestDatabases.create_and_load_schema
 */
export async function createAndLoadSchema(
  modelClass: typeof Base,
  index: number,
  { envName }: { envName: string } = { envName: "test" },
): Promise<void> {
  // Rails: configurations is always set before create_and_load_schema is
  // called (app boots first). Guard here is defensive — if null, there is
  // nothing to suffix and the finally reconnect handles the rest.
  const raw = (modelClass as any).configurations;
  if (raw == null) return;

  // Normalize to a DatabaseConfigurations instance. Persist it back so
  // _database mutations and the finally reconnect see the same registry.
  const configurations =
    raw instanceof DatabaseConfigurations
      ? raw
      : DatabaseConfigurations.fromEnv(typeof raw.toH === "function" ? raw.toH() : raw);
  (modelClass as any).configurations = configurations;

  const old = process.env.VERBOSE;
  process.env.VERBOSE = "false";

  try {
    const configs = configurations.configsFor({ envName });
    for (const dbConfig of configs) {
      // `dbConfig.database` falls back to URL parsing for URL-only configs
      // (UrlConfig.database override landed in #957). Only fails for configs
      // with neither an explicit `database` nor a parseable URL.
      const baseName = dbConfig.database;
      if (!baseName) {
        throw new Error(
          `Cannot suffix database name for ${envName}/${dbConfig.name ?? "(unnamed)"}: ` +
            `neither database nor a parseable URL is available`,
        );
      }
      // Skip suffixing for the canonical SQLite in-memory database — `:memory:`
      // is special-cased by SQLiteDatabaseTasks (create/drop are no-ops) and
      // suffixing would turn it into an on-disk path like `:memory:-2`.
      if (!isInMemorySqlite(baseName)) {
        dbConfig._database = `${baseName}-${index}`;
      }
      await DatabaseTasks.reconstructFromSchema(dbConfig, DatabaseTasks.schemaFormat, undefined);
    }
  } finally {
    // Rails ensure order: establish_connection first, then restore VERBOSE
    // (test_databases.rb:18-21). Nest VERBOSE restore in its own finally so
    // it always runs even if establishConnection throws.
    const { establishConnection } = await import("./connection-handling.js");
    try {
      await establishConnection(modelClass);
    } finally {
      if (old !== undefined) {
        process.env.VERBOSE = old;
      } else {
        delete process.env.VERBOSE;
      }
    }
  }
}
