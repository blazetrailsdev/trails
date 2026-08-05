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
 *   - already laid by this run (`canonicalSchemaUpToDate`) → purge back to the
 *     canonical tables, skipping the canonical DDL only. All three lanes reach
 *     it: globalSetup stamps what
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

const { adapter, envConfig } = await connect();

const pgExclusive = adapter === "postgres" && !!getEnv("AR_PG_EXCLUSIVE_DB");
const mysqlExclusive = adapter === "mysql" && !!getEnv("AR_MYSQL_EXCLUSIVE_DB");
const ownsDatabase =
  (adapter === "sqlite" && envConfig.database !== ":memory:") || pgExclusive || mysqlExclusive;

const { recordBootLaidTables, dropAllTables, purgeToCanonicalTables } =
  await import("./support/drop-all-tables.js");
const { loadSchema, loadAdapterSpecificSchema } = await import("./support/load-schema-helper.js");
const { canonicalSchemaUpToDate, stampCanonicalSchema, laidTables } =
  await import("./support/canonical-schema-stamp.js");
const { recordBootOutcome } = await import("./support/boot-outcome.js");

if (await canonicalSchemaUpToDate(await Base.leaseConnection())) {
  // No truncate ahead of the purge: `purgeToCanonicalTables` already truncates
  // every non-empty canonical table and drops everything else, so a
  // `DatabaseTasks.truncateTables` here emptied the same tables a second time.
  //
  // Both arms are skipped here when the stamp carries a `laidTables` snapshot:
  // those tables — canonical *and* adapter-specific — are already laid, and the
  // purge below truncates them rather than dropping them, so there is nothing
  // for the adapter-specific arm to re-lay. Read the snapshot first: the purge
  // drops `ar_internal_metadata` along with the other bookkeeping tables.
  //
  // Without a snapshot (a database stamped before this key existed) the old
  // behaviour stands: the purge drops every table outside the canonical half
  // and the arm re-lays the adapter-specific ones it took with it.
  const conn = await Base.leaseConnection();
  const laid = await laidTables(conn);
  await purgeToCanonicalTables(conn, laid ?? []);
  if (!laid) await loadAdapterSpecificSchema(conn);
  // Re-stamp: the purge drops `ar_internal_metadata` along with the
  // other bookkeeping tables, so the stamp this boot consumed is gone. What is
  // left behind is the same state the full-load arm below stamps — canonical
  // plus adapter-specific, laid and empty — so the next worker recycled onto
  // this database is entitled to the same fast path. Without this the stamp is
  // single-use per database and every recycle pays the full purge+reload.
  await stampCanonicalSchema(conn);
  await recordBootOutcome("fastPath", await canonicalSchemaUpToDate(conn));
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
  await recordBootOutcome("fullLoad", await canonicalSchemaUpToDate(canonicalConn));
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

// Clear DatabaseTasks global state so database-tasks.test.ts starts from the
// null invariant it expects and registers its own configurations per test.
DatabaseTasks.databaseConfiguration = null;
