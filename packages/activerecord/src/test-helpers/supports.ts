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
  // MySQL 8 is not MariaDB and is ≥ 5.7.8 → true. (abstract_mysql_adapter.rb:108)
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
  // MySQL 8 is not MariaDB and is ≥ 8.0.13 → true. PostgreSQL always true.
  // SQLite true (≥ 3.9). (postgresql_adapter.rb:208, sqlite3_adapter.rb:155,
  // abstract_mysql_adapter.rb:104)
  expression_index: ALL,
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

/** Per-test feature gate: `itIfSupports("json", "round-trips", async () => {…})`. */
export function itIfSupports(
  feature: string,
  name: string,
  fn: TestFunction,
  timeout?: number,
): void {
  (adapterSupports(feature) ? it : it.skip)(name, fn, timeout);
}
