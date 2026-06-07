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
 *   - sqlite :memory: → DatabaseTasks.loadSchema (fresh DB, no purge needed)
 *   - sqlite file / PG / MySQL → DatabaseTasks.reconstructFromSchema (handles
 *     schema-up-to-date check, purge, and load for persistent per-worker DBs)
 */
import { buildTestDatabaseConfig } from "./test-helpers/test-database-config.js";
import { generateSchemaFile } from "./test-helpers/schema-file-generator.js";
import { setCanonicalSchemaPreload } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { Base } from "./base.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
// Registers _RelationCtor so Model.first()/.all()/.where() etc. work in
// test files that import base.js directly rather than index.js (which
// re-exports relation.js as a side effect).
import "./relation.js";

const { adapter, envConfig } = await buildTestDatabaseConfig();
const schemaFilePath = await generateSchemaFile(TEST_SCHEMA);

await Base.establishConnection(envConfig.configuration as Record<string, unknown>);

if (adapter === "sqlite" && envConfig.database === ":memory:") {
  await DatabaseTasks.loadSchema(envConfig, "ts", schemaFilePath);
} else {
  await DatabaseTasks.reconstructFromSchema(envConfig, "ts", schemaFilePath);
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
