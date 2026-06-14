/**
 * Module-level configuration flags for ActiveRecord.
 *
 * Rails stores these as singleton_class.attr_accessor on the ActiveRecord
 * module itself (active_record.rb:321-322).
 */
import { ArgumentError } from "@blazetrails/activemodel";

/**
 * Provides a mapping between database protocols/DBMSs and the underlying
 * database adapter to be used. This is used only by the `DATABASE_URL`
 * environment variable (and `url:` config keys). The protocol names are
 * arbitrary, so external database adapters can register custom protocols by
 * mutating this object or replacing it via {@link setProtocolAdapters}.
 *
 * Mirrors `ActiveRecord.protocol_adapters` (active_record.rb:490).
 */
export let protocolAdapters: Record<string, string> = {
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql2",
  mysql2: "mysql2",
  sqlite: "sqlite3",
  sqlite3: "sqlite3",
};

export function setProtocolAdapters(value: Record<string, string>): void {
  protocolAdapters = value;
}

/**
 * When true, prepared statements are disabled globally regardless of a
 * connection config's `preparedStatements: true`. Adapters consult this on
 * (re-)establishConnection — it is applied in the `preparedStatements` setter,
 * the single chokepoint every adapter constructor flows through. Mirrors
 * `ActiveRecord.disable_prepared_statements` (active_record.rb:182).
 */
export let disablePreparedStatements = false;

export function setDisablePreparedStatements(value: boolean): void {
  disablePreparedStatements = value;
}

/**
 * When true, `before_committed!` runs on every distinct in-memory copy of a
 * record enrolled in a transaction; when false (the raw framework default) it
 * runs only on the first copy of each logical record (deduped by record
 * equality). Affects deferred-touch propagation through associations that hold
 * a second copy of a parent. Mirrors `ActiveRecord.before_committed_on_all_records`
 * (active_record.rb:348-349).
 */
export let beforeCommittedOnAllRecords = false;

export function setBeforeCommittedOnAllRecords(value: boolean): void {
  beforeCommittedOnAllRecords = value;
}

/**
 * Controls what happens when a strict-loading violation is detected: either
 * `"raise"` (the default — throw `StrictLoadingViolationError`) or `"log"`
 * (instrument `strict_loading_violation.active_record` and continue loading).
 *
 * Mirrors `ActiveRecord.action_on_strict_loading_violation` (active_record.rb:362).
 */
export let actionOnStrictLoadingViolation: "raise" | "log" = "raise";

export function setActionOnStrictLoadingViolation(value: "raise" | "log"): void {
  actionOnStrictLoadingViolation = value;
}

/** @internal */
export let indexNestedAttributeErrors = false;

/** @internal */
export function setIndexNestedAttributeErrors(value: boolean): void {
  indexNestedAttributeErrors = value;
}

/**
 * A list of table names or regular expressions to match tables to ignore
 * when dumping the schema cache. Mirrors
 * `ActiveRecord.schema_cache_ignored_tables` (active_record.rb:197).
 *
 * @internal
 */
export let schemaCacheIgnoredTables: ReadonlyArray<string | RegExp> = [];

/** @internal */
export function setSchemaCacheIgnoredTables(value: ReadonlyArray<string | RegExp>): void {
  schemaCacheIgnoredTables = value;
}

/**
 * Controls what happens when `connection` (the soft-deprecated checkout alias)
 * is called on a model that has not yet made the lease permanent.
 *
 * - `true` (default): `connection` behaves exactly like `leaseConnection`.
 * - `'deprecated'`: emits a deprecation warning on the first checkout, then
 *   behaves like `leaseConnection`.
 * - `'disallowed'`: raises `ActiveRecordError` if the lease is not yet
 *   permanent (i.e. the caller should use `withConnection` or
 *   `leaseConnection` explicitly).
 *
 * Mirrors `ActiveRecord.permanent_connection_checkout` (active_record.rb:310).
 */
export let permanentConnectionCheckout: true | "deprecated" | "disallowed" = true;

export function setPermanentConnectionCheckout(value: true | "deprecated" | "disallowed"): void {
  if (value !== true && value !== "deprecated" && value !== "disallowed") {
    throw new ArgumentError(
      "permanentConnectionCheckout must be one of: `true`, `'deprecated'` or `'disallowed'`",
    );
  }
  permanentConnectionCheckout = value;
}

/**
 * Returns true when `tableName` matches an entry in
 * `schemaCacheIgnoredTables`. Mirrors
 * `ActiveRecord.schema_cache_ignored_table?` (active_record.rb:205).
 *
 * @internal
 */
export function isSchemaCacheIgnoredTable(tableName: string): boolean {
  for (const entry of schemaCacheIgnoredTables) {
    if (entry instanceof RegExp) {
      // Reset lastIndex so /g and /y patterns don't alternate between
      // matches across calls (same precaution SchemaDumper#isIgnored takes).
      entry.lastIndex = 0;
      if (entry.test(tableName)) return true;
    } else if (entry === tableName) {
      return true;
    }
  }
  return false;
}
