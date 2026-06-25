/**
 * Module-level configuration flags for ActiveRecord.
 *
 * Rails stores these as singleton_class.attr_accessor on the ActiveRecord
 * module itself (active_record.rb:321-322).
 */
import { ArgumentError } from "@blazetrails/activemodel";
import { DefaultStrategy } from "./migration/default-strategy.js";

/** Any constructable class — used for module-config flags that hold a class. */
type AnyClass = abstract new (...args: never[]) => object;

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
 * When true, `after_commit`/`after_rollback` callbacks run in the order they
 * were defined; when false (the raw framework default) they run in reverse
 * definition order. Only transactional (commit/rollback) callbacks are
 * affected — ordinary `after_*` callbacks always run in definition order.
 * Read at registration time and threaded into the callback chain as the
 * `prepend` flag, mirroring Rails' `prepend_option` (transactions.rb:320-327).
 * Mirrors `ActiveRecord.run_after_transaction_callbacks_in_order_defined`
 * (active_record.rb:351-352, default false).
 */
export let runAfterTransactionCallbacksInOrderDefined = false;

export function setRunAfterTransactionCallbacksInOrderDefined(value: boolean): void {
  runAfterTransactionCallbacksInOrderDefined = value;
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

/**
 * Maps each DBMS to the command-line client invoked by `dbconsole`. Mirrors
 * `ActiveRecord.database_cli` (active_record.rb:211-212, default
 * `{ postgresql: "psql", mysql: %w[mysql mysql5], sqlite: "sqlite3" }`).
 */
export let databaseCli: Record<string, string | string[]> = {
  postgresql: "psql",
  mysql: ["mysql", "mysql5"],
  sqlite: "sqlite3",
};

export function setDatabaseCli(value: Record<string, string | string[]>): void {
  databaseCli = value;
}

/**
 * Selects the async query executor backing `load_async`. `null` (the default)
 * disables background execution; `"thread_pool"` uses a single shared pool and
 * `"multi_thread_pool"` a per-database pool. Mirrors
 * `ActiveRecord.async_query_executor` (active_record.rb:283-284, default nil).
 */
export let asyncQueryExecutor: "thread_pool" | "multi_thread_pool" | null = null;

export function setAsyncQueryExecutor(value: "thread_pool" | "multi_thread_pool" | null): void {
  asyncQueryExecutor = value;
}

/**
 * Names of the queues used by background jobs (e.g. `destroy_association_async`).
 * Mirrors `ActiveRecord.queues` (active_record.rb:317-318, default `{}`).
 */
export let queues: Record<string, unknown> = {};

export function setQueues(value: Record<string, unknown>): void {
  queues = value;
}

/**
 * When the test suite should keep the test schema current against
 * `schema.rb`/`structure.sql`. `null` (the default) defers to the framework's
 * `maintainTestSchemaBang` opt-in. Mirrors `ActiveRecord.maintain_test_schema`
 * (active_record.rb:320-321, default nil).
 */
export let maintainTestSchema: boolean | null = null;

export function setMaintainTestSchema(value: boolean | null): void {
  maintainTestSchema = value;
}

/**
 * When true (the default), a required `belongs_to` also validates that the
 * association's foreign key is present, not just the association object.
 * Mirrors `ActiveRecord.belongs_to_required_validates_foreign_key`
 * (active_record.rb:326-327, default true).
 */
export let belongsToRequiredValidatesForeignKey = true;

export function setBelongsToRequiredValidatesForeignKey(value: boolean): void {
  belongsToRequiredValidatesForeignKey = value;
}

/**
 * The application's primary abstract record class (`ApplicationRecord`). `null`
 * until `primary_abstract_class` is declared. Mirrors
 * `ActiveRecord.application_record_class` (active_record.rb:329-330, default nil).
 */
export let applicationRecordClass: AnyClass | null = null;

export function setApplicationRecordClass(value: AnyClass | null): void {
  applicationRecordClass = value;
}

/**
 * When true, a batch enumerator (`find_each`/`in_batches`) raises if the
 * relation carries an explicit order it must ignore; when false (the default)
 * it silently overrides the order. Mirrors `ActiveRecord.error_on_ignored_order`
 * (active_record.rb:376-381, default false).
 */
export let errorOnIgnoredOrder = false;

export function setErrorOnIgnoredOrder(value: boolean): void {
  errorOnIgnoredOrder = value;
}

/**
 * When true (the default), generated migration filenames are prefixed with a
 * UTC timestamp rather than a sequential number. Mirrors
 * `ActiveRecord.timestamped_migrations` (active_record.rb:384-387, default true).
 */
export let timestampedMigrations = true;

export function setTimestampedMigrations(value: boolean): void {
  timestampedMigrations = value;
}

/**
 * The execution strategy migrations run through. Defaults to
 * {@link DefaultStrategy}, which runs the migration's `up`/`down` directly.
 * Mirrors `ActiveRecord.migration_strategy` (active_record.rb:398-401, default
 * `Migration::DefaultStrategy`).
 */
export let migrationStrategy: AnyClass = DefaultStrategy;

export function setMigrationStrategy(value: AnyClass): void {
  migrationStrategy = value;
}

/**
 * When true, fixtures are loaded with foreign-key checks verified afterwards.
 * Mirrors `ActiveRecord.verify_foreign_keys_for_fixtures`
 * (active_record.rb:423-429, default false).
 */
export let verifyForeignKeysForFixtures = false;

export function setVerifyForeignKeysForFixtures(value: boolean): void {
  verifyForeignKeysForFixtures = value;
}

/**
 * When true, the YAML column coder loads with Psych's unsafe loader instead of
 * `safe_load`. Mirrors `ActiveRecord.use_yaml_unsafe_load`
 * (active_record.rb:435-439, default false).
 */
export let useYamlUnsafeLoad = false;

export function setUseYamlUnsafeLoad(value: boolean): void {
  useYamlUnsafeLoad = value;
}

/**
 * When true (the default), the PostgreSQL adapter raises if handed an integer
 * wider than signed 64-bit. Mirrors `ActiveRecord.raise_int_wider_than_64bit`
 * (active_record.rb:451-456, default true).
 */
export let raiseIntWiderThan64bit = true;

export function setRaiseIntWiderThan64bit(value: boolean): void {
  raiseIntWiderThan64bit = value;
}

/**
 * Additional classes the YAML column coder permits during `safe_load`. Mirrors
 * `ActiveRecord.yaml_column_permitted_classes` (active_record.rb:458-462,
 * default `[Symbol]`).
 */
export let yamlColumnPermittedClasses: unknown[] = [Symbol];

export function setYamlColumnPermittedClasses(value: unknown[]): void {
  yamlColumnPermittedClasses = value;
}

/**
 * Controls when `has_secure_token` generates its value: `"create"` (the
 * default) or `"initialize"`. Mirrors `ActiveRecord.generate_secure_token_on`
 * (active_record.rb:464-468, default `:create`).
 */
export let generateSecureTokenOn: "create" | "initialize" = "create";

export function setGenerateSecureTokenOn(value: "create" | "initialize"): void {
  generateSecureTokenOn = value;
}
