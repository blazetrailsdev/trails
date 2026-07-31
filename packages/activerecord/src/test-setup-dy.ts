/**
 * D-Y vitest setupFile for the activerecord project: calls `ARTest.connect`'s
 * port (`support/connection.ts`) and loads the canonical fixture schema once
 * per worker through `support/load-schema-helper.ts`'s `loadSchema`.
 *
 * The pool it opens lives for the whole worker, as Rails' does for the whole
 * process (`cases/helper.rb` calls `ARTest.connect` at load and never
 * disconnects — `vendor/rails/activerecord/test/support/connection.rb:22-38`).
 *
 * Must run AFTER cases/helper.ts so better-sqlite3 is registered and
 * Base.establishConnection can open the pool.
 *
 * What Rails has no counterpart for is the step *before* the load: this
 * database is not freshly created, so it has to be emptied first. Which form
 * that takes is the driver gate (RFC 0002 §Design):
 *   - already laid by this run (`canonicalSchemaUpToDate`) → TRUNCATE, skipping
 *     the canonical DDL only. All three lanes reach it: globalSetup stamps what
 *     it lays (a PG slot cloned from the stamped template, the sqlite template
 *     file each worker clones, each MySQL slot DB), and this arm re-stamps, so
 *     a worker recycled onto a database an earlier worker used takes it too.
 *   - sqlite file → purge (per-worker isolated file; drop+create is safe — no
 *     other worker shares this file path).
 *   - PG/MySQL worker-owned DB (AR_PG_EXCLUSIVE_DB / AR_MYSQL_EXCLUSIVE_DB set
 *     by test-setup-worker-db.ts) → purge; the worker owns its own database
 *     (activerecord_unittest_<runToken>_N), so drop+create is safe. Every slot
 *     qualifies once globalSetup stamps a run token — slot 1 included.
 *   - otherwise (sqlite `:memory:`, or an unstamped PG/MySQL slot 1) → drop
 *     every table. Without a run token slot 1 *is* the shared base database,
 *     which other consumers point at too, so it must not be dropped.
 */
import { connect } from "./support/connection.js";
import { getEnv } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
// Registers _RelationCtor so Model.first()/.all()/.where() etc. work in
// test files that import base.js directly rather than index.js (which
// re-exports relation.js as a side effect).
import "./relation.js";

const { adapter, envConfig } = await connect();

const pgExclusive = adapter === "postgres" && !!getEnv("AR_PG_EXCLUSIVE_DB");
const mysqlExclusive = adapter === "mysql" && !!getEnv("AR_MYSQL_EXCLUSIVE_DB");
const ownsDatabase =
  (adapter === "sqlite" && envConfig.database !== ":memory:") || pgExclusive || mysqlExclusive;

const { recordBootLaidTables, dropAllTables, resetTestTables } =
  await import("./support/drop-all-tables.js");
const { loadSchema, loadAdapterSpecificSchema } = await import("./support/load-schema-helper.js");
const { canonicalSchemaUpToDate, stampCanonicalSchema } =
  await import("./support/canonical-schema-stamp.js");

if (await canonicalSchemaUpToDate(await Base.leaseConnection())) {
  if (getEnv("SKIP_TEST_DATABASE_TRUNCATE") === undefined) {
    await DatabaseTasks.truncateTables(envConfig);
  }
  // Only the canonical arm is skipped here — those tables are already laid, and
  // now empty. The adapter-specific arm is re-run as on the full path: its
  // tables are `force: true` throughout, and a worker recycled onto a database
  // an earlier worker's tests ran against finds them dropped — `resetTestTables`
  // drops every table it did not snapshot as boot-laid.
  const conn = await Base.leaseConnection();
  await resetTestTables(conn);
  await loadAdapterSpecificSchema(conn);
  // Re-stamp: `resetTestTables` drops `ar_internal_metadata` along with the
  // other bookkeeping tables, so the stamp this boot consumed is gone. What is
  // left behind is the same state the full-load arm below stamps — canonical
  // plus adapter-specific, laid and empty — so the next worker recycled onto
  // this database is entitled to the same fast path. Without this the stamp is
  // single-use per database and every recycle pays the full purge+reload.
  await stampCanonicalSchema(conn);
} else {
  // `DatabaseTasks.purge` re-establishes Base's pool on the recreated database,
  // so the connection has to be leased after it, not before.
  if (ownsDatabase) {
    await DatabaseTasks.purge(envConfig);
  } else {
    await dropAllTables(await Base.leaseConnection());
  }
  const canonicalConn = await Base.leaseConnection();
  await loadSchema(canonicalConn);
  await stampCanonicalSchema(canonicalConn);
}

// Permanent worker-startup assertion: a broken arm of the load path fails here
// rather than as a per-file "relation does not exist". `defaults` is the one
// table all three `<adapter>_specific_schema.rb` arms lay, so it covers the
// second arm. Cast because tableExists is on the concrete adapter class, not
// the DatabaseAdapter interface.
const _conn = (await Base.leaseConnection()) as unknown as {
  tableExists(n: string): Promise<boolean>;
};
const missingTables: string[] = [];
for (const t of ["accounts", "topics", "posts", "defaults"]) {
  if (!(await _conn.tableExists(t))) missingTables.push(t);
}
if (missingTables.length > 0) {
  throw new Error(
    `[test-setup-dy] schema load incomplete — missing tables: ${missingTables.join(", ")}`,
  );
}

await recordBootLaidTables(await Base.leaseConnection());

// `schema.rb:1444-1462` — the arunit2 tables Rails creates through
// `Course.lease_connection`. Imported lazily so the second-database models load
// after the canonical schema is in place.
const { provisionSecondDatabase } = await import("./support/setup-second-pool.js");
await provisionSecondDatabase();

// Clear DatabaseTasks global state so database-tasks.test.ts sees the null
// invariant it expects (it tests checkProtectedEnvironmentsBang with no config).
DatabaseTasks.databaseConfiguration = null;
