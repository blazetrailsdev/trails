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
import { defineSchema, setCanonicalSchemaPreload } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { Base } from "./base.js";

await bootstrapTestHandler();
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
