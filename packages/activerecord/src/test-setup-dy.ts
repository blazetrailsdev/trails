/**
 * D-Y vitest setupFile for the activerecord project: establishes Base from
 * the Phase-1 test config, loads the canonical fixture schema once per worker
 * via `DatabaseTasks`, then tears the handler down so old-path test files
 * (those that never call `setupHandlerSuite`) are not affected by a
 * globally-installed handler pool.
 *
 * Handler-path test files re-establish the connection in their own beforeAll
 * via setupHandlerSuite() → establishFromTestConfig().
 *
 * Must run AFTER test-setup-ar.ts so better-sqlite3 is registered and
 * Base.establishConnection can open the pool.
 *
 * Driver gate (RFC 0002 §Design):
 *   - sqlite :memory: → loadSchema (fresh DB, no existing tables)
 *   - sqlite file → reconstructFromSchema (per-worker isolated file; purge is
 *     safe — no other worker shares this file path)
 *   - PG/MySQL → loadSchema (shared DB; reconstructFromSchema would purge the
 *     whole database, which fails while other workers hold sessions (PG error
 *     55006) and resets DB collation on MySQL 8, breaking case-sensitivity.
 *     The schema file uses force:"cascade" for per-table drop+recreate.)
 */
import { buildTestDatabaseConfig } from "./test-helpers/test-database-config.js";
import { generateSchemaFile } from "./test-helpers/schema-file-generator.js";
import { seedSchemaSignatures, setCanonicalSchemaPreload } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { Base } from "./base.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
// Registers _RelationCtor so Model.first()/.all()/.where() etc. work in
// test files that import base.js directly rather than index.js (which
// re-exports relation.js as a side effect).
import "./relation.js";

const { adapter, envConfig } = await buildTestDatabaseConfig();
const schemaFilePath = await generateSchemaFile(TEST_SCHEMA, adapter);

await Base.establishConnection(envConfig.configuration as Record<string, unknown>);

if (adapter === "sqlite" && envConfig.database !== ":memory:") {
  await DatabaseTasks.reconstructFromSchema(envConfig, "ts", schemaFilePath);
} else {
  await DatabaseTasks.loadSchema(envConfig, "ts", schemaFilePath);
}

// Permanent worker-startup assertion: key canonical tables must exist after
// DatabaseTasks loads the schema. Failure here means the load path is broken,
// not just the signature cache. Cast because tableExists is on the concrete
// adapter class, not the DatabaseAdapter interface.
const _conn = Base.connection as unknown as { tableExists(n: string): Promise<boolean> };
const missingTables: string[] = [];
for (const t of ["accounts", "topics", "posts"]) {
  if (!(await _conn.tableExists(t))) missingTables.push(t);
}
if (missingTables.length > 0) {
  throw new Error(
    `[test-setup-dy] DatabaseTasks schema load incomplete — missing tables: ${missingTables.join(", ")}`,
  );
}

// Seed the signature cache so handler-path files' defineSchema(TEST_SCHEMA)
// calls remain cache-hit no-ops. DatabaseTasks.loadSchema goes through
// MigrationContext (not defineSchema), so _appliedSchemaSignatures is empty
// after the load — seedSchemaSignatures bridges the gap before
// setCanonicalSchemaPreload snapshots the cache.
seedSchemaSignatures(Base.connection, TEST_SCHEMA);
setCanonicalSchemaPreload(Base.connection);

// Remove the connection pool from the handler so old-path workers don't
// inherit an active pool.  isConnectedQ() returns false after this, so
// handler-path files reinstall it cleanly via setupHandlerSuite() →
// establishFromTestConfig().
Base.removeConnection();
// Also clear the cached checkout: Base.adapter caches a pool-leased
// connection in Base._adapter; subclasses without their own _adapter
// resolve through the prototype chain and would inherit the MySQL/PG
// adapter from this preload on MariaDB/PG CI workers.
Base._adapter = null;
// Clear DatabaseTasks global state so database-tasks.test.ts sees the null
// invariant it expects (it tests checkProtectedEnvironmentsBang with no config).
DatabaseTasks.databaseConfiguration = null;
