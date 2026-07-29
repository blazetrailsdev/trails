import { describe, it, type SuiteFactory, type TestFunction } from "vitest";
import { adapterType } from "../test-adapter.js";
import { inMemoryDb } from "./adapter-helper.js";

/**
 * TS mirror of Rails' connection `supports_<feature>?` predicates — the
 * *feature* counterpart to {@link describeIfPg}/{@link describeIfMysqlAdapter}/
 * {@link describeIfSqlite}'s *adapter* gating. Use these to scope a suite or
 * test to the backends that support a DB capability, exactly as Rails does
 * with `skip unless supports_<feature>?`.
 *
 * Support is resolved at test-collection time off {@link adapterType} — the
 * same idiom suites already use (e.g. `adapterType !== "mysql"` in
 * insert-all.test.ts, which deliberately reads `adapterType` rather than the
 * live `supports_*?` method) — for the backends our matrix runs: CI's
 * postgres:17, mysql:8, and the in-memory sqlite default.
 *
 * This file stays separate from `support/adapter-helper.ts` (the port of
 * `test/support/adapter_helper.rb`): only a handful of the keys below have an
 * `adapter_helper.rb` counterpart — the rest are the adapters' own
 * `supports_*?` methods that Rails tests call straight on the connection, so
 * there is no Rails helper file to fold them into. Keeping the whole set in
 * one feature-keyed table also keeps the test:compare gate extractor reading a
 * single source; splitting the adapter_helper-owned keys out would duplicate
 * the resolution logic. `adapter-helper.ts` holds the predicates that ARE
 * `adapter_helper.rb`'s own (`currentAdapter`, `inMemoryDb`, …).
 *
 * Feature keys match Rails' `supports_<key>?` (and the keys the test:compare
 * gate extractor derives), so a flagged `it.skip` of a Rails feature-gated
 * test converts directly to `itIfSupports("<key>", …)`. Add a key when a
 * suite first gates on it; an unknown key throws rather than silently running
 * everywhere — catching typos and undocumented capability assumptions.
 *
 * Why it is not the connection-backed lookup `adapter_helper.rb:66-83` uses
 * (`define_method(m) { Base.lease_connection.public_send(m) }`): these gates are
 * evaluated while vitest *collects* the file, and `describe`/`it` registration
 * is synchronous, so there is nothing to await a lease on. The static table is
 * therefore load-bearing and stays. What replaces the delegation's built-in
 * accuracy is `supports-live-adapter.trails.test.ts`, which reconciles every
 * key here against the running lane's real `supports_<key>?()` — generalizing
 * the `expression_index` probe below from one key to all of them, so a
 * transcription that drifts from the adapter fails loudly instead of silently
 * mis-gating a suite.
 *
 * The table mirrors Rails' `supports_<feature>?`. Version-independent answers
 * are keyed off {@link adapterType}; every predicate Rails branches on
 * `mariadb?` / `database_version` for is resolved from the live server instead
 * (see the mysql probe below) — the mysql lane is MySQL 8 locally and a MariaDB
 * stand-in in CI, so those have no static answer. Match Rails here (not our own
 * adapter, which may differ) so the gate-mismatch diagnostics compare like with
 * like.
 */
const ALL = ["postgres", "mysql", "sqlite"] as const;
type Backend = (typeof ALL)[number];

// The MySQL-family `supports_*?` predicates that branch on `mariadb?` /
// `database_version` have no static answer: the mysql lane runs MySQL 8 locally
// but a MariaDB stand-in in CI, and the two disagree. Probe the server once, on
// the mysql lane only — the dynamic import keeps the probe's connection attempt
// off the pg/sqlite lanes, where the literals below stand in for a lane that
// never asks.
const mysql =
  adapterType === "mysql"
    ? await import("./mysql-server-version.js")
    : {
        supportsExpressionIndex: false,
        supportsJson: false,
        supportsOptimizerHints: false,
        supportsInsertReturning: false,
        supportsTextColumnWithDefault: false,
        supportsNonUniqueConstraintName: false,
        supportsSqlStandardDropConstraint: false,
        supportsDefaultExpression: false,
        supportsCheckConstraints: false,
      };

function withMysql(base: readonly Backend[], supported: boolean): readonly Backend[] {
  return supported ? [...base, "mysql"] : base;
}

const SUPPORTS: Readonly<Record<string, readonly Backend[]>> = {
  // Available on every backend we test (pg17 / mysql:8 / recent sqlite).
  savepoints: ALL,
  foreign_keys: ALL,
  // `supports_check_constraints?`: MySQL ≥ 8.0.16; MariaDB ≥ 10.3.10 or
  // 10.2.22–10.2.x. (abstract_mysql_adapter.rb:128-132)
  check_constraints: withMysql(["postgres", "sqlite"], mysql.supportsCheckConstraints),
  // `supports_json?`: `!mariadb? && database_version >= "5.7.8"`
  // (mysql2_adapter.rb:70).
  json: withMysql(["postgres", "sqlite"], mysql.supportsJson),
  // SQL-standard COMMENT ON / inline column comments — not SQLite.
  comments: ["postgres", "mysql"],
  // `supports_concurrent_connections?`: `!@memory_database` on SQLite
  // (sqlite3_adapter.rb:198), true elsewhere — so it is config-derived, not
  // adapter-keyed: only the `sqlite3_mem` lane is `:memory:`.
  concurrent_connections: inMemoryDb() ? ["postgres", "mysql"] : ALL,
  // `ON CONFLICT (target)` — Postgres/SQLite only; MySQL has no conflict
  // target. Matches `adapterType !== "mysql"` in insert-all.test.ts.
  insert_conflict_target: ["postgres", "sqlite"],
  // Rails `supports_advisory_locks?`: PostgreSQL + MySQL true, SQLite false
  // (abstract default). (postgresql_adapter.rb:420, abstract_mysql_adapter.rb:161)
  advisory_locks: ["postgres", "mysql"],
  // `supports_exclusion_constraints?` / `supports_unique_constraints?`:
  // PostgreSQL only (postgresql_adapter.rb:224/228; abstract default false).
  exclusion_constraints: ["postgres"],
  unique_constraints: ["postgres"],
  // `supports_validate_constraints?`: PostgreSQL only (postgresql_adapter.rb:232;
  // abstract default false).
  validate_constraints: ["postgres"],
  // `supports_deferrable_constraints?`: PostgreSQL + SQLite true, abstract
  // default false. (postgresql_adapter.rb:236, sqlite3_adapter.rb:249)
  deferrable_constraints: ["postgres", "sqlite"],
  // `supports_expression_index?`: PG + SQLite always; MySQL ≥ 8.0.13, never
  // MariaDB. (postgresql_adapter.rb:208, sqlite3_adapter.rb:155,
  // abstract_mysql_adapter.rb:104)
  expression_index: withMysql(["postgres", "sqlite"], mysql.supportsExpressionIndex),
  // `supports_bulk_alter?`: PostgreSQL + MySQL true, abstract default false.
  // (postgresql_adapter.rb:188, abstract_mysql_adapter.rb:96)
  bulk_alter: ["postgres", "mysql"],
  // `supports_ddl_transactions?`: PostgreSQL + SQLite true, MySQL false (abstract default).
  // (postgresql_adapter.rb:416, sqlite3_adapter.rb:139)
  ddl_transactions: ["postgres", "sqlite"],
  // `supports_partial_index?`: PostgreSQL + SQLite true, abstract default false.
  // (postgresql_adapter.rb:200, sqlite3_adapter.rb:151)
  partial_index: ["postgres", "sqlite"],
  // `supports_index_include?`: PostgreSQL ≥ 11.0 (pg17 qualifies), abstract default false.
  // (postgresql_adapter.rb:204)
  index_include: ["postgres"],
  // `supports_identity_columns?`: PostgreSQL ≥ 10.0 (pg17 qualifies), abstract default false.
  // (postgresql_adapter.rb:279)
  identity_columns: ["postgres"],
  // `supports_nulls_not_distinct?`: PostgreSQL ≥ 15.0 (pg17 qualifies), abstract default false.
  // (postgresql_adapter.rb:283)
  nulls_not_distinct: ["postgres"],
  // `supports_native_partitioning?`: PostgreSQL ≥ 10.0 (pg17 qualifies), abstract default false.
  // (postgresql_adapter.rb:287)
  native_partitioning: ["postgres"],
  // `supports_partitioned_indexes?`: PostgreSQL ≥ 11.0 (pg17 qualifies), abstract default false.
  // (postgresql_adapter.rb:212)
  partitioned_indexes: ["postgres"],
  // `supports_pgcrypto_uuid?`: PostgreSQL database_version >= 9.4.0 (pg17 qualifies);
  // PostgreSQL-only (abstract default false). (postgresql_adapter.rb:299)
  pgcrypto_uuid: ["postgres"],
  // `supports_insert_returning?`: PostgreSQL true; MySQL family only for MariaDB
  // ≥ 10.5.0; SQLite ≥ 3.35.0 (current node sqlite qualifies).
  // (postgresql_adapter.rb:264, abstract_mysql_adapter.rb:173, sqlite3_adapter.rb:187)
  insert_returning: withMysql(["postgres", "sqlite"], mysql.supportsInsertReturning),
  // `supports_text_column_with_default?`: MySQL family only for MariaDB ≥ 10.2.1;
  // all other adapters true. (adapter_helper.rb:42)
  text_column_with_default: withMysql(["postgres", "sqlite"], mysql.supportsTextColumnWithDefault),
  // `supports_non_unique_constraint_name?`: MySQL family only, and only on
  // MariaDB; every other adapter false. (adapter_helper.rb:33)
  non_unique_constraint_name: withMysql([], mysql.supportsNonUniqueConstraintName),
  // `supports_sql_standard_drop_constraint?`: SQLite false; MySQL family needs
  // MariaDB ≥ 10.3.13 or MySQL ≥ 8.0.19; all other adapters true.
  // (adapter_helper.rb:51)
  sql_standard_drop_constraint: withMysql(["postgres"], mysql.supportsSqlStandardDropConstraint),
  // `supports_common_table_expressions?`: PostgreSQL true; MySQL ≥ 8.0.1 (mysql:8 qualifies);
  // SQLite ≥ 3.8.3 (current node sqlite qualifies). (postgresql_adapter.rb:451,
  // abstract_mysql_adapter.rb:153, sqlite3_adapter.rb:183)
  common_table_expressions: ALL,
  // `supports_insert_on_duplicate_skip/update?`: PG ≥ 9.5 (pg17 → true); MySQL true;
  // SQLite ≥ 3.24.0 (current node sqlite → true). (postgresql_adapter.rb:271-272,
  // abstract_mysql_adapter.rb, sqlite3_adapter.rb:194-195)
  insert_on_duplicate_skip: ALL,
  insert_on_duplicate_update: ALL,
  // `supports_explain?`: all adapters true. (abstract default false; overridden in
  // postgresql_adapter.rb:424, abstract_mysql_adapter.rb:116, sqlite3_adapter.rb:241)
  explain: ALL,
  // `supports_views?`: all adapters true. (abstract default false; overridden in
  // postgresql_adapter.rb:240, abstract_mysql_adapter.rb:136, sqlite3_adapter.rb:171)
  views: ALL,
  // `supports_datetime_with_precision?`: all adapters true. (abstract default false;
  // overridden in postgresql_adapter.rb:244, abstract_mysql_adapter.rb:140, sqlite3_adapter.rb:175)
  datetime_with_precision: ALL,
  // `supports_virtual_columns?`: PostgreSQL ≥ 12.0, MySQL ≥ 5.7, SQLite ≥ 3.31 — all CI targets
  // qualify. (postgresql_adapter.rb:291, abstract_mysql_adapter.rb:144, sqlite3_adapter.rb:179)
  virtual_columns: ALL,
  // `supports_foreign_tables?`: PostgreSQL only. (postgresql_adapter.rb:255; abstract default false)
  foreign_tables: ["postgres"] as readonly Backend[],
  // `supports_default_expression?` (adapter_helper.rb:23): PostgreSQL always true;
  // MySQL family needs MariaDB ≥ 10.2.1 or MySQL ≥ 8.0.13; falsy for SQLite (the
  // method only branches on PG / Mysql2 / Trilogy).
  default_expression: withMysql(["postgres"], mysql.supportsDefaultExpression),
  // `supports_optimizer_hints?`: MySQL ≥ 5.7.7, never MariaDB
  // (abstract_mysql_adapter.rb:149). PostgreSQL checks
  // extension_available?("pg_hint_plan") at runtime (postgresql_adapter.rb:295) — CI
  // does not have pg_hint_plan installed, so PG effectively returns false.
  optimizer_hints: withMysql([], mysql.supportsOptimizerHints),
  // `supports_transaction_isolation?`: PostgreSQL + MySQL + SQLite (sqlite3_adapter.rb:147).
  // The Rails test (transaction_isolation_test.rb:20) ANDs this with
  // !current_adapter?(:SQLite3Adapter). The test:compare Ruby extractor drops the
  // adapter half of such mixed adapter+feature conditions (extract-ruby-tests.rb:462),
  // so the canonical railsGate is feature-only `transaction_isolation`. Match it
  // with a bare itIfSupports("transaction_isolation") where the body is adapter-
  // agnostic; only add .skipIf(adapterType === "sqlite") when a subtest genuinely
  // must not run on SQLite (a real body need, not gate-matching) — note that doing
  // so re-introduces an adapter restriction the extractor will flag as wrong-gate.
  transaction_isolation: ALL,
};

/**
 * Every feature key the table answers, in declaration order.
 *
 * The static table is load-bearing — {@link describeIfSupports} and
 * {@link itIfSupports} run at test-collection time, before `Base` has a
 * connection to ask, so the gates cannot delegate to the leased connection the
 * way `adapter_helper.rb:66-83` does. This export exists so
 * `supports-live-adapter.trails.test.ts` can reconcile every key against the
 * running lane's live `supports_<key>?()` and fail loudly on drift, which is
 * the safety net Rails gets for free by never transcribing the answers.
 */
export const SUPPORTS_FEATURES: readonly string[] = Object.keys(SUPPORTS);

/**
 * Does the active backend support Rails' `supports_<feature>?` capability?
 *
 * A comma-joined key (`"insert_conflict_target,insert_on_duplicate_update"`)
 * is a conjunction — true only when every listed feature is supported. This
 * mirrors a Rails test body that stacks multiple `skip unless supports_X?`
 * guards, and lets {@link itIfSupports} express it as one flat (un-nested) gate
 * whose extracted feature key matches Rails' multi-feature gate.
 */
export function adapterSupports(feature: string): boolean {
  if (feature.includes(",")) {
    // Resolve every member before folding: `.every()` short-circuits on the
    // first false, which would let an unknown key downstream of an unsupported
    // one pass silently on exactly the lanes where the typo matters.
    const answers = feature.split(",").map((f) => adapterSupports(f.trim()));
    return answers.every(Boolean);
  }
  const backends = SUPPORTS[feature];
  if (!backends) {
    throw new Error(
      `adapterSupports: unknown feature "${feature}". Add it to ` +
        `support/supports.ts (mirror the adapter's supports_${feature}? method). ` +
        `Known: ${Object.keys(SUPPORTS).sort().join(", ")}.`,
    );
  }
  return backends.includes(adapterType);
}

/** Suite-level feature gate: `describeIfSupports("json", "JsonTest", () => {…})`. */
export function describeIfSupports(feature: string, name: string, factory: SuiteFactory): void {
  (adapterSupports(feature) ? describe : describe.skip)(name, factory);
}

function _itIfSupports(feature: string, name: string, fn: TestFunction, timeout?: number): void {
  (adapterSupports(feature) ? it : it.skip)(name, fn, timeout);
}

/**
 * Per-test feature gate: `itIfSupports("json", "round-trips", async () => {…})`.
 *
 * Also chainable with `.skipIf`: `itIfSupports.skipIf(cond)("key", "name", fn)`
 * adds an extra runtime condition on top of the feature check (adapter AND
 * feature must both pass). The extractor understands this form and produces
 * `adapters + features` gate metadata matching Rails' combined guard.
 */
export const itIfSupports = Object.assign(_itIfSupports, {
  skipIf:
    (cond: boolean) =>
    (feature: string, name: string, fn: TestFunction, timeout?: number): void =>
      (!cond && adapterSupports(feature) ? it : it.skip)(name, fn, timeout),
});
