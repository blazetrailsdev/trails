import { ArgumentError } from "@blazetrails/activemodel";
import { ActiveSupport, any, Autoload, InheritableOptions } from "@blazetrails/activesupport";
import { rbEqq, rbObjIvarGet, rbObjIvarSet, ThreadPoolExecutor } from "@blazetrails/ruby-compat";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { ActiveRecord } from "./namespaces.js";
import type { SQLWarning } from "./errors.js";
import type { Transaction } from "./connection-adapters/abstract/transaction.js";
import type { QueryTransformer } from "./query-transformers.js";
import * as Marshalling from "./marshalling.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import type { SchemaFormat } from "./tasks/database-tasks.js";

type AnyClass = abstract new (...args: never[]) => object;

type DbWarningsAction = "ignore" | "log" | "raise" | "report" | ((warning: SQLWarning) => void);

rbObjIvarSet(ActiveRecord, "@disable_prepared_statements", false);
rbObjIvarSet(ActiveRecord, "@lazily_load_schema_cache", false);
rbObjIvarSet(ActiveRecord, "@schema_cache_ignored_tables", []);
rbObjIvarSet(ActiveRecord, "@database_cli", {
  postgresql: "psql",
  mysql: ["mysql", "mysql5"],
  sqlite: "sqlite3",
});
rbObjIvarSet(ActiveRecord, "@default_timezone", "utc");
setDbWarningsAction("ignore");
rbObjIvarSet(ActiveRecord, "@db_warnings_ignore", []);
rbObjIvarSet(ActiveRecord, "@writing_role", "writing");
rbObjIvarSet(ActiveRecord, "@reading_role", "reading");
rbObjIvarSet(ActiveRecord, "@async_query_executor", null);
rbObjIvarSet(ActiveRecord, "@permanent_connection_checkout", true);
rbObjIvarSet(ActiveRecord, "@index_nested_attribute_errors", false);
rbObjIvarSet(ActiveRecord, "@verbose_query_logs", false);
rbObjIvarSet(ActiveRecord, "@queues", {});
rbObjIvarSet(ActiveRecord, "@maintain_test_schema", null);
rbObjIvarSet(ActiveRecord, "@raise_on_assign_to_attr_readonly", false);
rbObjIvarSet(ActiveRecord, "@belongs_to_required_validates_foreign_key", true);
rbObjIvarSet(ActiveRecord, "@before_committed_on_all_records", false);
rbObjIvarSet(ActiveRecord, "@run_after_transaction_callbacks_in_order_defined", false);
rbObjIvarSet(ActiveRecord, "@application_record_class", null);
rbObjIvarSet(ActiveRecord, "@action_on_strict_loading_violation", "raise");
rbObjIvarSet(ActiveRecord, "@schema_format", "ts");
rbObjIvarSet(ActiveRecord, "@error_on_ignored_order", false);
rbObjIvarSet(ActiveRecord, "@timestamped_migrations", true);
rbObjIvarSet(ActiveRecord, "@validate_migration_timestamps", false);
rbObjIvarSet(ActiveRecord, "@migration_strategy", DefaultStrategy);
rbObjIvarSet(ActiveRecord, "@dump_schema_after_migration", true);
rbObjIvarSet(ActiveRecord, "@dump_schemas", "schema_search_path");
rbObjIvarSet(ActiveRecord, "@verify_foreign_keys_for_fixtures", false);
rbObjIvarSet(ActiveRecord, "@query_transformers", []);
rbObjIvarSet(ActiveRecord, "@use_yaml_unsafe_load", false);
rbObjIvarSet(ActiveRecord, "@raise_int_wider_than_64bit", true);
rbObjIvarSet(ActiveRecord, "@yaml_column_permitted_classes", [Symbol]);
rbObjIvarSet(ActiveRecord, "@generate_secure_token_on", "create");
rbObjIvarSet(
  ActiveRecord,
  "@protocol_adapters",
  new InheritableOptions({
    sqlite: "sqlite3",
    mysql: "mysql2",
    postgres: "postgresql",
  }),
);

export function disablePreparedStatements(): boolean {
  return rbObjIvarGet(ActiveRecord, "@disable_prepared_statements") as boolean;
}

export function setDisablePreparedStatements(disablePreparedStatements: boolean): void {
  rbObjIvarSet(ActiveRecord, "@disable_prepared_statements", disablePreparedStatements);
}

export function lazilyLoadSchemaCache(): boolean {
  return rbObjIvarGet(ActiveRecord, "@lazily_load_schema_cache") as boolean;
}

export function setLazilyLoadSchemaCache(lazilyLoadSchemaCache: boolean): void {
  rbObjIvarSet(ActiveRecord, "@lazily_load_schema_cache", lazilyLoadSchemaCache);
}

export function schemaCacheIgnoredTables(): ReadonlyArray<string | RegExp> {
  return rbObjIvarGet(ActiveRecord, "@schema_cache_ignored_tables") as ReadonlyArray<
    string | RegExp
  >;
}

export function setSchemaCacheIgnoredTables(
  schemaCacheIgnoredTables: ReadonlyArray<string | RegExp>,
): void {
  rbObjIvarSet(ActiveRecord, "@schema_cache_ignored_tables", schemaCacheIgnoredTables);
}

export function isSchemaCacheIgnoredTable(tableName: string): boolean {
  return any(schemaCacheIgnoredTables(), (ignored) => rbEqq(ignored, tableName));
}

export function databaseCli(): Record<string, string | string[]> {
  return rbObjIvarGet(ActiveRecord, "@database_cli") as Record<string, string | string[]>;
}

export function setDatabaseCli(databaseCli: Record<string, string | string[]>): void {
  rbObjIvarSet(ActiveRecord, "@database_cli", databaseCli);
}

export function defaultTimezone(): "utc" | "local" {
  return rbObjIvarGet(ActiveRecord, "@default_timezone") as "utc" | "local";
}

export function setDefaultTimezone(defaultTimezone: "utc" | "local"): void {
  if (!["local", "utc"].includes(defaultTimezone)) {
    throw new ArgumentError("default_timezone must be either :utc (default) or :local.");
  }

  rbObjIvarSet(ActiveRecord, "@default_timezone", defaultTimezone);
}

export function dbWarningsAction(): ((warning: SQLWarning) => void) | null {
  return rbObjIvarGet(ActiveRecord, "@db_warnings_action") as
    | ((warning: SQLWarning) => void)
    | null;
}

export function setDbWarningsAction(action: DbWarningsAction): void {
  switch (action) {
    case "ignore":
      rbObjIvarSet(ActiveRecord, "@db_warnings_action", null);
      break;
    case "log":
      rbObjIvarSet(ActiveRecord, "@db_warnings_action", (warning: SQLWarning) => {
        let warningMessage = `[${warning.name}] ${warning.message}`;
        if (warning.code) warningMessage += ` (${warning.code})`;
        (ActiveRecord.Base.logger as { warn: (msg: string) => void }).warn(warningMessage);
      });
      break;
    case "raise":
      rbObjIvarSet(ActiveRecord, "@db_warnings_action", (warning: SQLWarning) => {
        throw warning;
      });
      break;
    case "report":
      rbObjIvarSet(ActiveRecord, "@db_warnings_action", (warning: SQLWarning) => {
        ActiveSupport.errorReporter.report(warning, { handled: true });
      });
      break;
    default:
      if (typeof action === "function") {
        rbObjIvarSet(ActiveRecord, "@db_warnings_action", action);
        break;
      }
      throw new ArgumentError(
        "db_warnings_action must be one of :ignore, :log, :raise, :report, or a custom proc.",
      );
  }
}

export function dbWarningsIgnore(): (string | RegExp)[] {
  return rbObjIvarGet(ActiveRecord, "@db_warnings_ignore") as (string | RegExp)[];
}

export function setDbWarningsIgnore(dbWarningsIgnore: (string | RegExp)[]): void {
  rbObjIvarSet(ActiveRecord, "@db_warnings_ignore", dbWarningsIgnore);
}

export function writingRole(): string {
  return rbObjIvarGet(ActiveRecord, "@writing_role") as string;
}

export function setWritingRole(writingRole: string): void {
  rbObjIvarSet(ActiveRecord, "@writing_role", writingRole);
}

export function readingRole(): string {
  return rbObjIvarGet(ActiveRecord, "@reading_role") as string;
}

export function setReadingRole(readingRole: string): void {
  rbObjIvarSet(ActiveRecord, "@reading_role", readingRole);
}

export function asyncQueryExecutor(): "global_thread_pool" | "multi_thread_pool" | null {
  return rbObjIvarGet(ActiveRecord, "@async_query_executor") as
    | "global_thread_pool"
    | "multi_thread_pool"
    | null;
}

export function setAsyncQueryExecutor(
  asyncQueryExecutor: "global_thread_pool" | "multi_thread_pool" | null,
): void {
  rbObjIvarSet(ActiveRecord, "@async_query_executor", asyncQueryExecutor);
}

export function globalThreadPoolAsyncQueryExecutor(): ThreadPoolExecutor {
  const concurrency = globalExecutorConcurrency() ?? 4;
  return (rbObjIvarGet(ActiveRecord, "@global_thread_pool_async_query_executor") ??
    rbObjIvarSet(
      ActiveRecord,
      "@global_thread_pool_async_query_executor",
      new ThreadPoolExecutor({
        minThreads: 0,
        maxThreads: concurrency,
        maxQueue: concurrency * 4,
        fallbackPolicy: "caller_runs",
      }),
    )) as ThreadPoolExecutor;
}

export function setGlobalExecutorConcurrency(globalExecutorConcurrency: number | null): void {
  if (asyncQueryExecutor() == null || asyncQueryExecutor() === "multi_thread_pool") {
    throw new ArgumentError(
      "`global_executor_concurrency` cannot be set when the executor is nil or set to `:multi_thread_pool`. For multiple thread pools, please set the concurrency in your database configuration.",
    );
  }

  rbObjIvarSet(ActiveRecord, "@global_executor_concurrency", globalExecutorConcurrency);
}

export function globalExecutorConcurrency(): number | null {
  return (rbObjIvarGet(ActiveRecord, "@global_executor_concurrency") ??
    rbObjIvarSet(ActiveRecord, "@global_executor_concurrency", null)) as number | null;
}

export function permanentConnectionCheckout(): true | "deprecated" | "disallowed" {
  return rbObjIvarGet(ActiveRecord, "@permanent_connection_checkout") as
    | true
    | "deprecated"
    | "disallowed";
}

export function setPermanentConnectionCheckout(value: true | "deprecated" | "disallowed"): void {
  if (!([true, "deprecated", "disallowed"] as unknown[]).includes(value)) {
    throw new ArgumentError(
      "permanent_connection_checkout must be one of: `true`, `:deprecated` or `:disallowed`",
    );
  }
  rbObjIvarSet(ActiveRecord, "@permanent_connection_checkout", value);
}

export function indexNestedAttributeErrors(): boolean {
  return rbObjIvarGet(ActiveRecord, "@index_nested_attribute_errors") as boolean;
}

export function setIndexNestedAttributeErrors(indexNestedAttributeErrors: boolean): void {
  rbObjIvarSet(ActiveRecord, "@index_nested_attribute_errors", indexNestedAttributeErrors);
}

export function verboseQueryLogs(): boolean {
  return rbObjIvarGet(ActiveRecord, "@verbose_query_logs") as boolean;
}

export function setVerboseQueryLogs(verboseQueryLogs: boolean): void {
  rbObjIvarSet(ActiveRecord, "@verbose_query_logs", verboseQueryLogs);
}

export function queues(): Record<string, unknown> {
  return rbObjIvarGet(ActiveRecord, "@queues") as Record<string, unknown>;
}

export function setQueues(queues: Record<string, unknown>): void {
  rbObjIvarSet(ActiveRecord, "@queues", queues);
}

export function maintainTestSchema(): boolean | null {
  return rbObjIvarGet(ActiveRecord, "@maintain_test_schema") as boolean | null;
}

export function setMaintainTestSchema(maintainTestSchema: boolean | null): void {
  rbObjIvarSet(ActiveRecord, "@maintain_test_schema", maintainTestSchema);
}

export function raiseOnAssignToAttrReadonly(): boolean {
  return rbObjIvarGet(ActiveRecord, "@raise_on_assign_to_attr_readonly") as boolean;
}

export function setRaiseOnAssignToAttrReadonly(raiseOnAssignToAttrReadonly: boolean): void {
  rbObjIvarSet(ActiveRecord, "@raise_on_assign_to_attr_readonly", raiseOnAssignToAttrReadonly);
}

export function belongsToRequiredValidatesForeignKey(): boolean {
  return rbObjIvarGet(ActiveRecord, "@belongs_to_required_validates_foreign_key") as boolean;
}

export function setBelongsToRequiredValidatesForeignKey(
  belongsToRequiredValidatesForeignKey: boolean,
): void {
  rbObjIvarSet(
    ActiveRecord,
    "@belongs_to_required_validates_foreign_key",
    belongsToRequiredValidatesForeignKey,
  );
}

export function beforeCommittedOnAllRecords(): boolean {
  return rbObjIvarGet(ActiveRecord, "@before_committed_on_all_records") as boolean;
}

export function setBeforeCommittedOnAllRecords(beforeCommittedOnAllRecords: boolean): void {
  rbObjIvarSet(ActiveRecord, "@before_committed_on_all_records", beforeCommittedOnAllRecords);
}

export function runAfterTransactionCallbacksInOrderDefined(): boolean {
  return rbObjIvarGet(ActiveRecord, "@run_after_transaction_callbacks_in_order_defined") as boolean;
}

export function setRunAfterTransactionCallbacksInOrderDefined(
  runAfterTransactionCallbacksInOrderDefined: boolean,
): void {
  rbObjIvarSet(
    ActiveRecord,
    "@run_after_transaction_callbacks_in_order_defined",
    runAfterTransactionCallbacksInOrderDefined,
  );
}

export function applicationRecordClass(): AnyClass | null {
  return rbObjIvarGet(ActiveRecord, "@application_record_class") as AnyClass | null;
}

export function setApplicationRecordClass(applicationRecordClass: AnyClass | null): void {
  rbObjIvarSet(ActiveRecord, "@application_record_class", applicationRecordClass);
}

export function actionOnStrictLoadingViolation(): "raise" | "log" {
  return rbObjIvarGet(ActiveRecord, "@action_on_strict_loading_violation") as "raise" | "log";
}

export function setActionOnStrictLoadingViolation(
  actionOnStrictLoadingViolation: "raise" | "log",
): void {
  rbObjIvarSet(ActiveRecord, "@action_on_strict_loading_violation", actionOnStrictLoadingViolation);
}

export function schemaFormat(): SchemaFormat {
  return rbObjIvarGet(ActiveRecord, "@schema_format") as SchemaFormat;
}

export function setSchemaFormat(schemaFormat: SchemaFormat): void {
  rbObjIvarSet(ActiveRecord, "@schema_format", schemaFormat);
}

export function errorOnIgnoredOrder(): boolean {
  return rbObjIvarGet(ActiveRecord, "@error_on_ignored_order") as boolean;
}

export function setErrorOnIgnoredOrder(errorOnIgnoredOrder: boolean): void {
  rbObjIvarSet(ActiveRecord, "@error_on_ignored_order", errorOnIgnoredOrder);
}

export function timestampedMigrations(): boolean {
  return rbObjIvarGet(ActiveRecord, "@timestamped_migrations") as boolean;
}

export function setTimestampedMigrations(timestampedMigrations: boolean): void {
  rbObjIvarSet(ActiveRecord, "@timestamped_migrations", timestampedMigrations);
}

export function validateMigrationTimestamps(): boolean {
  return rbObjIvarGet(ActiveRecord, "@validate_migration_timestamps") as boolean;
}

export function setValidateMigrationTimestamps(validateMigrationTimestamps: boolean): void {
  rbObjIvarSet(ActiveRecord, "@validate_migration_timestamps", validateMigrationTimestamps);
}

export function migrationStrategy(): AnyClass {
  return rbObjIvarGet(ActiveRecord, "@migration_strategy") as AnyClass;
}

export function setMigrationStrategy(migrationStrategy: AnyClass): void {
  rbObjIvarSet(ActiveRecord, "@migration_strategy", migrationStrategy);
}

export function dumpSchemaAfterMigration(): boolean {
  return rbObjIvarGet(ActiveRecord, "@dump_schema_after_migration") as boolean;
}

export function setDumpSchemaAfterMigration(dumpSchemaAfterMigration: boolean): void {
  rbObjIvarSet(ActiveRecord, "@dump_schema_after_migration", dumpSchemaAfterMigration);
}

export function dumpSchemas(): "schema_search_path" | "all" | (string & {}) {
  return rbObjIvarGet(ActiveRecord, "@dump_schemas") as
    | "schema_search_path"
    | "all"
    | (string & {});
}

export function setDumpSchemas(dumpSchemas: "schema_search_path" | "all" | (string & {})): void {
  rbObjIvarSet(ActiveRecord, "@dump_schemas", dumpSchemas);
}

export function verifyForeignKeysForFixtures(): boolean {
  return rbObjIvarGet(ActiveRecord, "@verify_foreign_keys_for_fixtures") as boolean;
}

export function setVerifyForeignKeysForFixtures(verifyForeignKeysForFixtures: boolean): void {
  rbObjIvarSet(ActiveRecord, "@verify_foreign_keys_for_fixtures", verifyForeignKeysForFixtures);
}

export function queryTransformers(): QueryTransformer[] {
  return rbObjIvarGet(ActiveRecord, "@query_transformers") as QueryTransformer[];
}

export function setQueryTransformers(queryTransformers: QueryTransformer[]): void {
  rbObjIvarSet(ActiveRecord, "@query_transformers", queryTransformers);
}

export function useYamlUnsafeLoad(): boolean {
  return rbObjIvarGet(ActiveRecord, "@use_yaml_unsafe_load") as boolean;
}

export function setUseYamlUnsafeLoad(useYamlUnsafeLoad: boolean): void {
  rbObjIvarSet(ActiveRecord, "@use_yaml_unsafe_load", useYamlUnsafeLoad);
}

export function raiseIntWiderThan64bit(): boolean {
  return rbObjIvarGet(ActiveRecord, "@raise_int_wider_than_64bit") as boolean;
}

export function setRaiseIntWiderThan64bit(raiseIntWiderThan64bit: boolean): void {
  rbObjIvarSet(ActiveRecord, "@raise_int_wider_than_64bit", raiseIntWiderThan64bit);
}

export function yamlColumnPermittedClasses(): unknown[] {
  return rbObjIvarGet(ActiveRecord, "@yaml_column_permitted_classes") as unknown[];
}

export function setYamlColumnPermittedClasses(yamlColumnPermittedClasses: unknown[]): void {
  rbObjIvarSet(ActiveRecord, "@yaml_column_permitted_classes", yamlColumnPermittedClasses);
}

export function generateSecureTokenOn(): "create" | "initialize" {
  return rbObjIvarGet(ActiveRecord, "@generate_secure_token_on") as "create" | "initialize";
}

export function setGenerateSecureTokenOn(generateSecureTokenOn: "create" | "initialize"): void {
  rbObjIvarSet(ActiveRecord, "@generate_secure_token_on", generateSecureTokenOn);
}

export function marshallingFormatVersion(): 6.1 | 7.1 {
  return Marshalling.formatVersion();
}

export function setMarshallingFormatVersion(value: unknown): void {
  Marshalling.setFormatVersion(value);
}

export function protocolAdapters(): InheritableOptions {
  return rbObjIvarGet(ActiveRecord, "@protocol_adapters") as InheritableOptions;
}

export function setProtocolAdapters(protocolAdapters: InheritableOptions): void {
  rbObjIvarSet(ActiveRecord, "@protocol_adapters", protocolAdapters);
}

export async function eagerLoadBang(): Promise<void> {
  await Autoload.eagerLoadBang.call(ActiveRecord);
  await ActiveRecord.Locking.eagerLoadBang();
  await import("./scoping.js");
  await ActiveRecord.Scoping.eagerLoadBang();
  await ActiveRecord.Associations.eagerLoadBang();
  await ActiveRecord.AttributeMethods.eagerLoadBang();
  await ActiveRecord.ConnectionAdapters.eagerLoadBang();
  const { Encryption } = await import("./encryption.js");
  await Encryption.eagerLoadBang();
}

Object.defineProperty(ActiveRecord, "eagerLoadBang", {
  value: eagerLoadBang,
  writable: true,
  configurable: true,
});

export async function disconnectAllBang(): Promise<void> {
  const { PoolConfig } = await import("./connection-adapters/pool-config.js");
  await PoolConfig.disconnectAllBang();
}

export function afterAllTransactionsCommit(
  block: () => void | Promise<void>,
): void | Promise<void> {
  let openTransactions: Transaction[] | null = allOpenTransactions();

  if (openTransactions.length === 0) {
    return block();
  } else if (openTransactions.length === 1) {
    openTransactions[0].afterCommit(block);
  } else {
    let count = openTransactions.length;
    const callback = () => {
      count -= 1;
      if (count === 0) return block();
    };
    for (const t of openTransactions) {
      t.afterCommit(callback);
    }
    openTransactions = null;
  }
}

Object.defineProperty(ActiveRecord, "afterAllTransactionsCommit", {
  value: afterAllTransactionsCommit,
  writable: true,
  configurable: true,
});

export function allOpenTransactions(): Transaction[] {
  const openTransactions: Transaction[] = [];
  ActiveRecord.Base.connectionHandler.eachConnectionPool((pool) => {
    const activeConnection = pool.activeConnection;
    if (activeConnection != null) {
      const currentTransaction = activeConnection.currentTransaction();

      if (
        currentTransaction.open &&
        currentTransaction.joinable &&
        !currentTransaction.isInvalidated()
      ) {
        openTransactions.push(currentTransaction as Transaction);
      }
    }
  });
  return openTransactions;
}

YAML.loadTags["!ruby/object:ActiveRecord::AttributeSet"] = "ActiveModel::AttributeSet";
YAML.loadTags["!ruby/object:ActiveRecord::Attribute::FromDatabase"] =
  "ActiveModel::Attribute::FromDatabase";
YAML.loadTags["!ruby/object:ActiveRecord::LazyAttributeHash"] = "ActiveModel::LazyAttributeHash";
YAML.loadTags["!ruby/object:ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter::MysqlString"] =
  "ActiveRecord::Type::String";
