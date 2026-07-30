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
 *   - already laid by this run (`canonicalSchemaUpToDate`) → TRUNCATE only, no
 *     DDL. This is the PG template-clone fast path: a slot DB cloned from the
 *     stamped template carries both arms of the load already, and the stamp is
 *     gone the moment a test file's reset runs, so a database that still
 *     reports up-to-date is one no test has touched.
 *   - sqlite file → purge (per-worker isolated file; drop+create is safe — no
 *     other worker shares this file path).
 *   - PG/MySQL slot >1 (AR_PG_EXCLUSIVE_DB / AR_MYSQL_EXCLUSIVE_DB set by
 *     test-setup-worker-db.ts) → purge; the worker owns its own suffixed DB
 *     (activerecord_unittest_N), so drop+create is safe.
 *   - otherwise (sqlite `:memory:`, PG/MySQL slot 1) → drop every table. The
 *     base URL is unchanged there, and the advisory-lock bootstrap pg.Client /
 *     GET_LOCK connection lives in the same DB as the worker pool, so DROP
 *     DATABASE fails with PG error 55006 and releasing GET_LOCK would allow
 *     slot races on MySQL.
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

const { recordBootLaidTables, dropAllTables } = await import("./support/drop-all-tables.js");
const { loadSchema } = await import("./support/load-schema-helper.js");
const { canonicalSchemaUpToDate, stampCanonicalSchema } =
  await import("./support/canonical-schema-stamp.js");

if (await canonicalSchemaUpToDate(await Base.leaseConnection())) {
  if (getEnv("SKIP_TEST_DATABASE_TRUNCATE") === undefined) {
    await DatabaseTasks.truncateTables(envConfig);
  }
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
