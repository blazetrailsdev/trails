import { describe, it, type SuiteFactory, type TestFunction } from "vitest";
import { adapterType } from "../test-adapter.js";

/**
 * TS mirror of Rails' connection `supports_<feature>?` predicates — the
 * *feature* counterpart to {@link describeIfPg}/{@link describeIfMysql}/
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
 * Feature keys match Rails' `supports_<key>?` (and the keys the test:compare
 * gate extractor derives), so a flagged `it.skip` of a Rails feature-gated
 * test converts directly to `itIfSupports("<key>", …)`. Add a key when a
 * suite first gates on it; an unknown key throws rather than silently running
 * everywhere — catching typos and undocumented capability assumptions.
 *
 * The table mirrors Rails' `supports_<feature>?` *for the matrix versions* —
 * it bakes in Rails' `mariadb?` / `database_version` branching for the fixed
 * CI backends (pg17 / mysql:8 / in-memory sqlite). Match Rails here (not our
 * own adapter, which may differ) so the gate-mismatch diagnostics compare like
 * with like.
 */
const ALL = ["postgres", "mysql", "sqlite"] as const;
type Backend = (typeof ALL)[number];

const SUPPORTS: Readonly<Record<string, readonly Backend[]>> = {
  // Available on every backend we test (pg17 / mysql:8 / recent sqlite).
  savepoints: ALL,
  foreign_keys: ALL,
  check_constraints: ALL,
  // Rails `supports_json?` is `!mariadb? && database_version >= "5.7.8"`.
  // MySQL 8 is not MariaDB and is ≥ 5.7.8 → true. (mysql2_adapter.rb:70)
  json: ALL,
  // SQL-standard COMMENT ON / inline column comments — not SQLite.
  comments: ["postgres", "mysql"],
  // SQLite's in-memory shared-cache connection can't run truly concurrently.
  concurrent_connections: ["postgres", "mysql"],
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
  // `supports_expression_index?`: `!mariadb? && database_version >= "8.0.13"`.
  // MySQL 8 qualifies at the server level, but our schema-dump DDL generator
  // does not yet emit the correct MySQL 8 expression-index syntax (P-9 family).
  // Unlock "mysql" here once the dump path is fixed. (postgresql_adapter.rb:208,
  // sqlite3_adapter.rb:155, abstract_mysql_adapter.rb:104)
  expression_index: ["postgres", "sqlite"],
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
  // `supports_insert_returning?`: PostgreSQL true; MySQL only for MariaDB ≥ 10.5 (mysql:8
  // is not MariaDB → false); SQLite ≥ 3.35.0 (current node sqlite qualifies → true).
  // (postgresql_adapter.rb:264, abstract_mysql_adapter.rb:173, sqlite3_adapter.rb:187)
  insert_returning: ["postgres", "sqlite"],
  // `supports_text_column_with_default?`: MySQL only for MariaDB ≥ 10.2.1 (mysql:8 is not
  // MariaDB → false); all other adapters true. (adapter_helper.rb:42)
  text_column_with_default: ["postgres", "sqlite"],
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
  // `supports_optimizer_hints?`: MySQL only in CI. PostgreSQL checks
  // extension_available?("pg_hint_plan") at runtime (postgresql_adapter.rb:295) — CI
  // does not have pg_hint_plan installed, so PG effectively returns false.
  // (abstract_mysql_adapter.rb:148; abstract default false)
  optimizer_hints: ["mysql"] as readonly Backend[],
  // `supports_transaction_isolation?`: PostgreSQL + MySQL + SQLite (sqlite3_adapter.rb:147).
  // The Rails test (transaction_isolation_test.rb:20) adds a separate
  // !current_adapter?(:SQLite3Adapter) guard — express via itIfSupports.skipIf(adapterType === "sqlite").
  transaction_isolation: ALL,
};

/** Does the active backend support Rails' `supports_<feature>?` capability? */
export function adapterSupports(feature: string): boolean {
  const backends = SUPPORTS[feature];
  if (!backends) {
    throw new Error(
      `adapterSupports: unknown feature "${feature}". Add it to ` +
        `test-helpers/supports.ts (mirror the adapter's supports_${feature}? method). ` +
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
