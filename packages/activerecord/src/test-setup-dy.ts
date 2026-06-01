/**
 * D-Y vitest setupFile for the activerecord project: loads the canonical
 * fixture schema once per worker via a temporary handler connection, then
 * tears the handler down so old-path test files (those that never call
 * setupHandlerSuite) are not affected by a globally-installed handler pool.
 *
 * Handler-path test files re-establish the connection in their own beforeAll
 * via setupHandlerSuite() → bootstrapTestHandler().
 *
 * Must run AFTER test-setup-ar.ts so better-sqlite3 is registered and
 * bootstrapTestHandler can open the pool.
 */
import { bootstrapTestHandler } from "./test-helpers/bootstrap-test-handler.js";
import {
  defineSchema,
  seedSchemaSignatures,
  setCanonicalSchemaPreload,
} from "./test-helpers/define-schema.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { Base } from "./base.js";

await bootstrapTestHandler();
// Phase 0 sqlite template-clone: the worker DB is a file copy of a pre-built
// template, so the canonical tables already exist. Seed their signatures so
// the defineSchema() below short-circuits to a cache-hit (no per-file DDL).
// defineSchema's dataSourceExists guard still recreates any table a prior
// file's reset dropped from the shared worker file, preserving correctness.
if (process.env.AR_TEST_WORKER_DB && Base.connection.adapterName === "sqlite") {
  seedSchemaSignatures(Base.connection, TEST_SCHEMA);
}
if (process.env.AR_TEST_PG_TEMPLATE && Base.connection.adapterName === "postgres") {
  seedSchemaSignatures(Base.connection, TEST_SCHEMA);
}
if (process.env.AR_TEST_MYSQL_TEMPLATE && Base.connection.adapterName === "mysql") {
  seedSchemaSignatures(Base.connection, TEST_SCHEMA);
}
await defineSchema(TEST_SCHEMA);
setCanonicalSchemaPreload(Base.connection);

// Remove the connection pool from the handler so old-path workers don't
// inherit an active pool.  isConnectedQ() returns false after this, so
// handler-path files reinstall it cleanly via setupHandlerSuite() →
// bootstrapTestHandler().
Base.removeConnection();
// Also clear the cached checkout: Base.adapter caches a pool-leased
// connection in Base._adapter; subclasses without their own _adapter
// resolve through the prototype chain and would inherit the MySQL/PG
// adapter from this preload on MariaDB/PG CI workers.
Base._adapter = null;
