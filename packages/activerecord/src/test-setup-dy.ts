/**
 * D-Y vitest setupFile for the activerecord project: calls `ARTest.connect`'s
 * port (`support/connection.ts`) and loads the canonical fixture schema once
 * per worker via `DatabaseTasks`.
 *
 * The pool it opens lives for the whole worker, as Rails' does for the whole
 * process (`cases/helper.rb` calls `ARTest.connect` at load and never
 * disconnects — `vendor/rails/activerecord/test/support/connection.rb:22-38`).
 *
 * Must run AFTER cases/helper.ts so better-sqlite3 is registered and
 * Base.establishConnection can open the pool.
 *
 * Driver gate (RFC 0002 §Design):
 *   - sqlite :memory: → loadSchema (fresh DB, no existing tables)
 *   - sqlite file → reconstructFromSchema (per-worker isolated file; purge is
 *     safe — no other worker shares this file path)
 *   - PG/MySQL slot >1 (AR_PG_EXCLUSIVE_DB / AR_MYSQL_EXCLUSIVE_DB set by
 *     test-setup-worker-db.ts) → reconstructFromSchema; the worker owns its
 *     own suffixed DB (activerecord_unittest_N), so purge+load is safe.
 *   - PG/MySQL slot 1 → loadSchema (base URL unchanged; the advisory-lock
 *     bootstrap pg.Client / GET_LOCK connection lives in the same DB as the
 *     worker pool, so DROP DATABASE fails with PG error 55006 and releasing
 *     GET_LOCK would allow slot races on MySQL. The schema file uses
 *     force:"cascade" for per-table drop+recreate instead.)
 */
import { connect } from "./support/connection.js";
import { generateSchemaFile } from "./support/schema-file-generator.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { getEnv } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
// Registers _RelationCtor so Model.first()/.all()/.where() etc. work in
// test files that import base.js directly rather than index.js (which
// re-exports relation.js as a side effect).
import "./relation.js";

const { adapter, envConfig } = await connect();

// Resolve `supports_expression_index?` from the live connection BEFORE
// generating the schema file: without it the generator falls back to its
// coarse `adapterName === "mysql"` skip and this per-worker rebuild silently
// strips the canonical expression indexes a MySQL-8 template DB carries
// (company_expression_index / full_name_index), diverging from schema.rb.
const { supportsExpressionIndex } = await import("./support/schema-types.js");
const schemaFilePath = await generateSchemaFile(
  TEST_SCHEMA,
  adapter,
  await supportsExpressionIndex(await Base.leaseConnection()),
);

const pgExclusive = adapter === "postgres" && !!getEnv("AR_PG_EXCLUSIVE_DB");
const mysqlExclusive = adapter === "mysql" && !!getEnv("AR_MYSQL_EXCLUSIVE_DB");
if ((adapter === "sqlite" && envConfig.database !== ":memory:") || pgExclusive || mysqlExclusive) {
  await DatabaseTasks.reconstructFromSchema(envConfig, "ts", schemaFilePath);
} else {
  await DatabaseTasks.loadSchema(envConfig, "ts", schemaFilePath);
}

// Permanent worker-startup assertion: key canonical tables must exist after
// DatabaseTasks loads the schema. Failure here means the load path is broken,
// not just the signature cache. Cast because tableExists is on the concrete
// adapter class, not the DatabaseAdapter interface.
const _conn = (await Base.leaseConnection()) as unknown as {
  tableExists(n: string): Promise<boolean>;
};
const missingTables: string[] = [];
for (const t of ["accounts", "topics", "posts"]) {
  if (!(await _conn.tableExists(t))) missingTables.push(t);
}
if (missingTables.length > 0) {
  throw new Error(
    `[test-setup-dy] DatabaseTasks schema load incomplete — missing tables: ${missingTables.join(", ")}`,
  );
}

// `load_schema_helper.rb:15` — the adapter-specific arm. DatabaseTasks lays
// only schema.rb's mirror, so the `<adapter>_specific_schema.rb` tables have to
// be laid here, on the same per-worker DB (the reconstruct path purges whatever
// the template carried).
const { loadAdapterSpecificSchema } = await import("./support/load-schema-helper.js");
await loadAdapterSpecificSchema(await Base.leaseConnection());

// `schema.rb:1444-1462` — the arunit2 tables Rails creates through
// `Course.lease_connection`. Imported lazily so the second-database models load
// after the canonical schema is in place.
const { provisionSecondDatabase } = await import("./support/setup-second-pool.js");
await provisionSecondDatabase();

// Clear DatabaseTasks global state so database-tasks.test.ts sees the null
// invariant it expects (it tests checkProtectedEnvironmentsBang with no config).
DatabaseTasks.databaseConfiguration = null;
