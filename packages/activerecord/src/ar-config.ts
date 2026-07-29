/**
 * Module-level configuration flags for ActiveRecord.
 *
 * Rails stores these as singleton_class.attr_accessor on the ActiveRecord
 * module itself (active_record.rb:321-322).
 */
import { ArgumentError } from "@blazetrails/activemodel";
import { DefaultStrategy } from "./migration/default-strategy.js";
import type { QueryTransformer } from "./query-transformers.js";

/** Any constructable class — used for module-config flags that hold a class. */
type AnyClass = abstract new (...args: never[]) => object;

/**
 * Returns true when `tableName` matches an entry in
 * `schemaCacheIgnoredTables`. Mirrors
 * `ActiveRecord.schema_cache_ignored_table?` (active_record.rb:205).
 *
 * @internal
 */
export function isSchemaCacheIgnoredTable(tableName: string): boolean {
  for (const entry of ActiveRecord.schemaCacheIgnoredTables) {
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

let _protocolAdapters: Record<string, string> = {
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql2",
  mysql2: "mysql2",
  sqlite: "sqlite3",
  sqlite3: "sqlite3",
};
let _disablePreparedStatements = false;
let _beforeCommittedOnAllRecords = false;
let _runAfterTransactionCallbacksInOrderDefined = false;
let _actionOnStrictLoadingViolation: "raise" | "log" = "raise";
let _indexNestedAttributeErrors = false;
let _schemaCacheIgnoredTables: ReadonlyArray<string | RegExp> = [];
let _permanentConnectionCheckout: true | "deprecated" | "disallowed" = true;
let _asyncQueryExecutor: "global_thread_pool" | "multi_thread_pool" | null = null;
let _queues: Record<string, unknown> = {};
let _maintainTestSchema: boolean | null = null;
let _queryTransformers: QueryTransformer[] = [];
let _databaseCli: Record<string, string | string[]> = {
  postgresql: "psql",
  mysql: ["mysql", "mysql5"],
  sqlite: "sqlite3",
};
let _belongsToRequiredValidatesForeignKey = true;
let _applicationRecordClass: AnyClass | null = null;
let _errorOnIgnoredOrder = false;
let _timestampedMigrations = true;
let _migrationStrategy: AnyClass = DefaultStrategy;
let _verifyForeignKeysForFixtures = false;
let _useYamlUnsafeLoad = false;
let _raiseIntWiderThan64bit = true;
let _yamlColumnPermittedClasses: unknown[] = [Symbol];
let _generateSecureTokenOn: "create" | "initialize" = "create";
let _raiseOnAssignToAttrReadonly = false;

/**
 * The `ActiveRecord` module itself, as far as its singleton configuration
 * attributes are concerned. Rails declares these with
 * `singleton_class.attr_accessor` on `module ActiveRecord`
 * (active_record.rb:283-339), so the call site reads and writes them as plain
 * attributes: `ActiveRecord.maintain_test_schema = true`.
 *
 * ESM live bindings are read-only for importers, so a bare `export let` cannot
 * carry the writer half — hence the `get`/`set` accessors. Every module-config
 * flag now lives here; there is no `export let` left in this file.
 */
export const ActiveRecord = {
  /**
   * Provides a mapping between database protocols/DBMSs and the underlying
   * database adapter to be used. This is used only by the `DATABASE_URL`
   * environment variable (and `url:` config keys). The protocol names are
   * arbitrary, so external database adapters can register custom protocols by
   * mutating this object or replacing it.
   *
   * Mirrors `ActiveRecord.protocol_adapters` (active_record.rb:490).
   */
  get protocolAdapters(): Record<string, string> {
    return _protocolAdapters;
  },

  set protocolAdapters(value: Record<string, string>) {
    _protocolAdapters = value;
  },

  /**
   * When true, prepared statements are disabled globally regardless of a
   * connection config's `preparedStatements: true`. Adapters consult this on
   * (re-)establishConnection — it is applied in the `preparedStatements` setter,
   * the single chokepoint every adapter constructor flows through. Mirrors
   * `ActiveRecord.disable_prepared_statements` (active_record.rb:182).
   */
  get disablePreparedStatements(): boolean {
    return _disablePreparedStatements;
  },

  set disablePreparedStatements(value: boolean) {
    _disablePreparedStatements = value;
  },

  /**
   * When true, `before_committed!` runs on every distinct in-memory copy of a
   * record enrolled in a transaction; when false (the raw framework default) it
   * runs only on the first copy of each logical record (deduped by record
   * equality). Affects deferred-touch propagation through associations that hold
   * a second copy of a parent. Mirrors
   * `ActiveRecord.before_committed_on_all_records` (active_record.rb:348-349).
   */
  get beforeCommittedOnAllRecords(): boolean {
    return _beforeCommittedOnAllRecords;
  },

  set beforeCommittedOnAllRecords(value: boolean) {
    _beforeCommittedOnAllRecords = value;
  },

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
  get runAfterTransactionCallbacksInOrderDefined(): boolean {
    return _runAfterTransactionCallbacksInOrderDefined;
  },

  set runAfterTransactionCallbacksInOrderDefined(value: boolean) {
    _runAfterTransactionCallbacksInOrderDefined = value;
  },

  /**
   * Controls what happens when a strict-loading violation is detected: either
   * `"raise"` (the default — throw `StrictLoadingViolationError`) or `"log"`
   * (instrument `strict_loading_violation.active_record` and continue loading).
   *
   * Mirrors `ActiveRecord.action_on_strict_loading_violation`
   * (active_record.rb:362).
   */
  get actionOnStrictLoadingViolation(): "raise" | "log" {
    return _actionOnStrictLoadingViolation;
  },

  set actionOnStrictLoadingViolation(value: "raise" | "log") {
    _actionOnStrictLoadingViolation = value;
  },

  /** @internal */
  get indexNestedAttributeErrors(): boolean {
    return _indexNestedAttributeErrors;
  },

  /** @internal */
  set indexNestedAttributeErrors(value: boolean) {
    _indexNestedAttributeErrors = value;
  },

  /**
   * A list of table names or regular expressions to match tables to ignore
   * when dumping the schema cache. Mirrors
   * `ActiveRecord.schema_cache_ignored_tables` (active_record.rb:197).
   *
   * @internal
   */
  get schemaCacheIgnoredTables(): ReadonlyArray<string | RegExp> {
    return _schemaCacheIgnoredTables;
  },

  /** @internal */
  set schemaCacheIgnoredTables(value: ReadonlyArray<string | RegExp>) {
    _schemaCacheIgnoredTables = value;
  },

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
  get permanentConnectionCheckout(): true | "deprecated" | "disallowed" {
    return _permanentConnectionCheckout;
  },

  set permanentConnectionCheckout(value: true | "deprecated" | "disallowed") {
    if (value !== true && value !== "deprecated" && value !== "disallowed") {
      throw new ArgumentError(
        "permanentConnectionCheckout must be one of: `true`, `'deprecated'` or `'disallowed'`",
      );
    }
    _permanentConnectionCheckout = value;
  },
  /**
   * Selects the async query executor backing `load_async`. `null` (the
   * default) does not initialize an executor and runs async calls in the
   * foreground; `"global_thread_pool"` initializes a single pool sized by
   * `globalExecutorConcurrency` and `"multi_thread_pool"` one per database
   * connection. Mirrors `ActiveRecord.async_query_executor`
   * (active_record.rb:270-283, default nil).
   */
  get asyncQueryExecutor(): "global_thread_pool" | "multi_thread_pool" | null {
    return _asyncQueryExecutor;
  },

  set asyncQueryExecutor(value: "global_thread_pool" | "multi_thread_pool" | null) {
    _asyncQueryExecutor = value;
  },

  /**
   * Names of the queues used by background jobs (e.g.
   * `destroy_association_async`). Mirrors `ActiveRecord.queues`
   * (active_record.rb:336-337, default `{}`).
   */
  get queues(): Record<string, unknown> {
    return _queues;
  },

  set queues(value: Record<string, unknown>) {
    _queues = value;
  },

  /**
   * When the test suite should keep the test schema current against
   * `schema.rb`/`structure.sql`. `null` (the default) defers to the
   * framework's `maintainTestSchemaBang` opt-in. Mirrors
   * `ActiveRecord.maintain_test_schema` (active_record.rb:339-340, default nil).
   */
  get maintainTestSchema(): boolean | null {
    return _maintainTestSchema;
  },

  set maintainTestSchema(value: boolean | null) {
    _maintainTestSchema = value;
  },

  /** Mirrors `ActiveRecord.query_transformers` (active_record.rb:431-432, default `[]`). */
  get queryTransformers(): QueryTransformer[] {
    return _queryTransformers;
  },

  set queryTransformers(value: QueryTransformer[]) {
    _queryTransformers = value;
  },

  /**
   * Maps each DBMS to the command-line client invoked by `dbconsole`. Mirrors
   * `ActiveRecord.database_cli` (active_record.rb:211-212, default
   * `{ postgresql: "psql", mysql: %w[mysql mysql5], sqlite: "sqlite3" }`).
   */
  get databaseCli(): Record<string, string | string[]> {
    return _databaseCli;
  },

  set databaseCli(value: Record<string, string | string[]>) {
    _databaseCli = value;
  },

  /**
   * When true (the default), a required `belongs_to` also validates that the
   * association's foreign key is present, not just the association object.
   * Mirrors `ActiveRecord.belongs_to_required_validates_foreign_key`
   * (active_record.rb:345-346, default true).
   */
  get belongsToRequiredValidatesForeignKey(): boolean {
    return _belongsToRequiredValidatesForeignKey;
  },

  set belongsToRequiredValidatesForeignKey(value: boolean) {
    _belongsToRequiredValidatesForeignKey = value;
  },

  /**
   * The application's primary abstract record class (`ApplicationRecord`).
   * `null` until `primary_abstract_class` is declared. Mirrors
   * `ActiveRecord.application_record_class` (active_record.rb:329-330, default nil).
   */
  get applicationRecordClass(): AnyClass | null {
    return _applicationRecordClass;
  },

  set applicationRecordClass(value: AnyClass | null) {
    _applicationRecordClass = value;
  },

  /**
   * When true, a batch enumerator (`find_each`/`in_batches`) raises if the
   * relation carries an explicit order it must ignore; when false (the default)
   * it silently overrides the order. Mirrors
   * `ActiveRecord.error_on_ignored_order` (active_record.rb:376-381, default false).
   */
  get errorOnIgnoredOrder(): boolean {
    return _errorOnIgnoredOrder;
  },

  set errorOnIgnoredOrder(value: boolean) {
    _errorOnIgnoredOrder = value;
  },

  /**
   * When true (the default), generated migration filenames are prefixed with a
   * UTC timestamp rather than a sequential number. Mirrors
   * `ActiveRecord.timestamped_migrations` (active_record.rb:384-387, default true).
   */
  get timestampedMigrations(): boolean {
    return _timestampedMigrations;
  },

  set timestampedMigrations(value: boolean) {
    _timestampedMigrations = value;
  },

  /**
   * The execution strategy migrations run through. Defaults to
   * {@link DefaultStrategy}, which runs the migration's `up`/`down` directly.
   * Mirrors `ActiveRecord.migration_strategy` (active_record.rb:398-401, default
   * `Migration::DefaultStrategy`).
   */
  get migrationStrategy(): AnyClass {
    return _migrationStrategy;
  },

  set migrationStrategy(value: AnyClass) {
    _migrationStrategy = value;
  },

  /**
   * When true, fixtures are loaded with foreign-key checks verified afterwards.
   * Mirrors `ActiveRecord.verify_foreign_keys_for_fixtures`
   * (active_record.rb:423-429, default false).
   */
  get verifyForeignKeysForFixtures(): boolean {
    return _verifyForeignKeysForFixtures;
  },

  set verifyForeignKeysForFixtures(value: boolean) {
    _verifyForeignKeysForFixtures = value;
  },

  /**
   * When true, the YAML column coder loads with Psych's unsafe loader instead
   * of `safe_load`. Mirrors `ActiveRecord.use_yaml_unsafe_load`
   * (active_record.rb:435-439, default false).
   */
  get useYamlUnsafeLoad(): boolean {
    return _useYamlUnsafeLoad;
  },

  set useYamlUnsafeLoad(value: boolean) {
    _useYamlUnsafeLoad = value;
  },

  /**
   * When true (the default), the PostgreSQL adapter raises if handed an integer
   * wider than signed 64-bit. Mirrors `ActiveRecord.raise_int_wider_than_64bit`
   * (active_record.rb:451-456, default true).
   */
  get raiseIntWiderThan64bit(): boolean {
    return _raiseIntWiderThan64bit;
  },

  set raiseIntWiderThan64bit(value: boolean) {
    _raiseIntWiderThan64bit = value;
  },

  /**
   * Additional classes the YAML column coder permits during `safe_load`.
   * Mirrors `ActiveRecord.yaml_column_permitted_classes`
   * (active_record.rb:458-462, default `[Symbol]`).
   */
  get yamlColumnPermittedClasses(): unknown[] {
    return _yamlColumnPermittedClasses;
  },

  set yamlColumnPermittedClasses(value: unknown[]) {
    _yamlColumnPermittedClasses = value;
  },

  /**
   * Controls when `has_secure_token` generates its value: `"create"` (the
   * default) or `"initialize"`. Mirrors `ActiveRecord.generate_secure_token_on`
   * (active_record.rb:464-468, default `:create`).
   */
  get generateSecureTokenOn(): "create" | "initialize" {
    return _generateSecureTokenOn;
  },

  set generateSecureTokenOn(value: "create" | "initialize") {
    _generateSecureTokenOn = value;
  },

  /**
   * When true, assigning to a readonly attribute on a persisted record raises
   * `ReadonlyAttributeError`; when false (the default) the write is silently
   * skipped. Mirrors `ActiveRecord.raise_on_assign_to_attr_readonly`
   * (active_record.rb:342-343, default false). The Rails 7.1 framework default
   * and the AR test suite (`test/cases/helper.rb:42`) flip it to true.
   */
  get raiseOnAssignToAttrReadonly(): boolean {
    return _raiseOnAssignToAttrReadonly;
  },

  set raiseOnAssignToAttrReadonly(value: boolean) {
    _raiseOnAssignToAttrReadonly = value;
  },
};
