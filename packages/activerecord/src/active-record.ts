import { ArgumentError } from "@blazetrails/activemodel";
import { ActiveSupport, any, Autoload, InheritableOptions } from "@blazetrails/activesupport";
import { ThreadPoolExecutor } from "@blazetrails/ruby-compat";
import { ActiveRecord } from "./namespaces.js";
import type { SQLWarning } from "./errors.js";
import type { Transaction } from "./connection-adapters/abstract/transaction.js";
import type { QueryTransformer } from "./query-transformers.js";
import * as Marshalling from "./marshalling.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import type { SchemaFormat } from "./tasks/database-tasks.js";

type AnyClass = abstract new (...args: never[]) => object;

type DbWarningsAction = "ignore" | "log" | "raise" | "report" | ((warning: SQLWarning) => void);

let _disablePreparedStatements = false;
let _lazilyLoadSchemaCache = false;
let _schemaCacheIgnoredTables: ReadonlyArray<string | RegExp> = [];
let _databaseCli: Record<string, string | string[]> = {
  postgresql: "psql",
  mysql: ["mysql", "mysql5"],
  sqlite: "sqlite3",
};
let _defaultTimezone: "utc" | "local" = "utc";
let _dbWarningsAction: ((warning: SQLWarning) => void) | null = null;
let _dbWarningsIgnore: (string | RegExp)[] = [];
let _writingRole = "writing";
let _readingRole = "reading";
let _asyncQueryExecutor: "global_thread_pool" | "multi_thread_pool" | null = null;
let _globalThreadPoolAsyncQueryExecutor: ThreadPoolExecutor | undefined;
let _globalExecutorConcurrency: number | null | undefined;
let _permanentConnectionCheckout: true | "deprecated" | "disallowed" = true;
let _indexNestedAttributeErrors = false;
let _verboseQueryLogs = false;
let _queues: Record<string, unknown> = {};
let _maintainTestSchema: boolean | null = null;
let _raiseOnAssignToAttrReadonly = false;
let _belongsToRequiredValidatesForeignKey = true;
let _beforeCommittedOnAllRecords = false;
let _runAfterTransactionCallbacksInOrderDefined = false;
let _applicationRecordClass: AnyClass | null = null;
let _actionOnStrictLoadingViolation: "raise" | "log" = "raise";
let _schemaFormat: SchemaFormat = "ts";
let _errorOnIgnoredOrder = false;
let _timestampedMigrations = true;
let _validateMigrationTimestamps = false;
let _migrationStrategy: AnyClass = DefaultStrategy;
let _dumpSchemaAfterMigration = true;
let _dumpSchemas: "schema_search_path" | "all" | (string & {}) = "schema_search_path";
let _verifyForeignKeysForFixtures = false;
let _queryTransformers: QueryTransformer[] = [];
let _useYamlUnsafeLoad = false;
let _raiseIntWiderThan64bit = true;
let _yamlColumnPermittedClasses: unknown[] = [Symbol];
let _generateSecureTokenOn: "create" | "initialize" = "create";
let _protocolAdapters: InheritableOptions = new InheritableOptions({
  sqlite: "sqlite3",
  mysql: "mysql2",
  postgres: "postgresql",
});

export function disablePreparedStatements(): boolean {
  return _disablePreparedStatements;
}

export function setDisablePreparedStatements(disablePreparedStatements: boolean): void {
  _disablePreparedStatements = disablePreparedStatements;
}

export function lazilyLoadSchemaCache(): boolean {
  return _lazilyLoadSchemaCache;
}

export function setLazilyLoadSchemaCache(lazilyLoadSchemaCache: boolean): void {
  _lazilyLoadSchemaCache = lazilyLoadSchemaCache;
}

export function schemaCacheIgnoredTables(): ReadonlyArray<string | RegExp> {
  return _schemaCacheIgnoredTables;
}

export function setSchemaCacheIgnoredTables(
  schemaCacheIgnoredTables: ReadonlyArray<string | RegExp>,
): void {
  _schemaCacheIgnoredTables = schemaCacheIgnoredTables;
}

export function isSchemaCacheIgnoredTable(tableName: string): boolean {
  return any(schemaCacheIgnoredTables(), (ignored) => {
    if (ignored instanceof RegExp) {
      ignored.lastIndex = 0;
      return ignored.test(tableName);
    }
    return ignored === tableName;
  });
}

export function databaseCli(): Record<string, string | string[]> {
  return _databaseCli;
}

export function setDatabaseCli(databaseCli: Record<string, string | string[]>): void {
  _databaseCli = databaseCli;
}

export function defaultTimezone(): "utc" | "local" {
  return _defaultTimezone;
}

export function setDefaultTimezone(defaultTimezone: "utc" | "local"): void {
  if (!["local", "utc"].includes(defaultTimezone)) {
    throw new ArgumentError("default_timezone must be either :utc (default) or :local.");
  }

  _defaultTimezone = defaultTimezone;
}

export function dbWarningsAction(): ((warning: SQLWarning) => void) | null {
  return _dbWarningsAction;
}

export function setDbWarningsAction(action: DbWarningsAction): void {
  switch (action) {
    case "ignore":
      _dbWarningsAction = null;
      break;
    case "log":
      _dbWarningsAction = (warning) => {
        let warningMessage = `[${warning.name}] ${warning.message}`;
        if (warning.code) warningMessage += ` (${warning.code})`;
        (ActiveRecord.Base.logger as { warn: (msg: string) => void }).warn(warningMessage);
      };
      break;
    case "raise":
      _dbWarningsAction = (warning) => {
        throw warning;
      };
      break;
    case "report":
      _dbWarningsAction = (warning) => {
        ActiveSupport.errorReporter.report(warning, { handled: true });
      };
      break;
    default:
      if (typeof action === "function") {
        _dbWarningsAction = action;
        break;
      }
      throw new ArgumentError(
        "db_warnings_action must be one of :ignore, :log, :raise, :report, or a custom proc.",
      );
  }
}

export function dbWarningsIgnore(): (string | RegExp)[] {
  return _dbWarningsIgnore;
}

export function setDbWarningsIgnore(dbWarningsIgnore: (string | RegExp)[]): void {
  _dbWarningsIgnore = dbWarningsIgnore;
}

export function writingRole(): string {
  return _writingRole;
}

export function setWritingRole(writingRole: string): void {
  _writingRole = writingRole;
}

export function readingRole(): string {
  return _readingRole;
}

export function setReadingRole(readingRole: string): void {
  _readingRole = readingRole;
}

export function asyncQueryExecutor(): "global_thread_pool" | "multi_thread_pool" | null {
  return _asyncQueryExecutor;
}

export function setAsyncQueryExecutor(
  asyncQueryExecutor: "global_thread_pool" | "multi_thread_pool" | null,
): void {
  _asyncQueryExecutor = asyncQueryExecutor;
}

export function globalThreadPoolAsyncQueryExecutor(): ThreadPoolExecutor {
  const concurrency = globalExecutorConcurrency() ?? 4;
  return (_globalThreadPoolAsyncQueryExecutor ??= new ThreadPoolExecutor({
    minThreads: 0,
    maxThreads: concurrency,
    maxQueue: concurrency * 4,
    fallbackPolicy: "caller_runs",
  }));
}

export function setGlobalExecutorConcurrency(globalExecutorConcurrency: number | null): void {
  if (asyncQueryExecutor() == null || asyncQueryExecutor() === "multi_thread_pool") {
    throw new ArgumentError(
      "`global_executor_concurrency` cannot be set when the executor is nil or set to `:multi_thread_pool`. For multiple thread pools, please set the concurrency in your database configuration.",
    );
  }

  _globalExecutorConcurrency = globalExecutorConcurrency;
}

export function globalExecutorConcurrency(): number | null {
  return (_globalExecutorConcurrency ??= null);
}

export function permanentConnectionCheckout(): true | "deprecated" | "disallowed" {
  return _permanentConnectionCheckout;
}

export function setPermanentConnectionCheckout(value: true | "deprecated" | "disallowed"): void {
  if (!([true, "deprecated", "disallowed"] as unknown[]).includes(value)) {
    throw new ArgumentError(
      "permanent_connection_checkout must be one of: `true`, `:deprecated` or `:disallowed`",
    );
  }
  _permanentConnectionCheckout = value;
}

export function indexNestedAttributeErrors(): boolean {
  return _indexNestedAttributeErrors;
}

export function setIndexNestedAttributeErrors(indexNestedAttributeErrors: boolean): void {
  _indexNestedAttributeErrors = indexNestedAttributeErrors;
}

export function verboseQueryLogs(): boolean {
  return _verboseQueryLogs;
}

export function setVerboseQueryLogs(verboseQueryLogs: boolean): void {
  _verboseQueryLogs = verboseQueryLogs;
}

export function queues(): Record<string, unknown> {
  return _queues;
}

export function setQueues(queues: Record<string, unknown>): void {
  _queues = queues;
}

export function maintainTestSchema(): boolean | null {
  return _maintainTestSchema;
}

export function setMaintainTestSchema(maintainTestSchema: boolean | null): void {
  _maintainTestSchema = maintainTestSchema;
}

export function raiseOnAssignToAttrReadonly(): boolean {
  return _raiseOnAssignToAttrReadonly;
}

export function setRaiseOnAssignToAttrReadonly(raiseOnAssignToAttrReadonly: boolean): void {
  _raiseOnAssignToAttrReadonly = raiseOnAssignToAttrReadonly;
}

export function belongsToRequiredValidatesForeignKey(): boolean {
  return _belongsToRequiredValidatesForeignKey;
}

export function setBelongsToRequiredValidatesForeignKey(
  belongsToRequiredValidatesForeignKey: boolean,
): void {
  _belongsToRequiredValidatesForeignKey = belongsToRequiredValidatesForeignKey;
}

export function beforeCommittedOnAllRecords(): boolean {
  return _beforeCommittedOnAllRecords;
}

export function setBeforeCommittedOnAllRecords(beforeCommittedOnAllRecords: boolean): void {
  _beforeCommittedOnAllRecords = beforeCommittedOnAllRecords;
}

export function runAfterTransactionCallbacksInOrderDefined(): boolean {
  return _runAfterTransactionCallbacksInOrderDefined;
}

export function setRunAfterTransactionCallbacksInOrderDefined(
  runAfterTransactionCallbacksInOrderDefined: boolean,
): void {
  _runAfterTransactionCallbacksInOrderDefined = runAfterTransactionCallbacksInOrderDefined;
}

export function applicationRecordClass(): AnyClass | null {
  return _applicationRecordClass;
}

export function setApplicationRecordClass(applicationRecordClass: AnyClass | null): void {
  _applicationRecordClass = applicationRecordClass;
}

export function actionOnStrictLoadingViolation(): "raise" | "log" {
  return _actionOnStrictLoadingViolation;
}

export function setActionOnStrictLoadingViolation(
  actionOnStrictLoadingViolation: "raise" | "log",
): void {
  _actionOnStrictLoadingViolation = actionOnStrictLoadingViolation;
}

export function schemaFormat(): SchemaFormat {
  return _schemaFormat;
}

export function setSchemaFormat(schemaFormat: SchemaFormat): void {
  _schemaFormat = schemaFormat;
}

export function errorOnIgnoredOrder(): boolean {
  return _errorOnIgnoredOrder;
}

export function setErrorOnIgnoredOrder(errorOnIgnoredOrder: boolean): void {
  _errorOnIgnoredOrder = errorOnIgnoredOrder;
}

export function timestampedMigrations(): boolean {
  return _timestampedMigrations;
}

export function setTimestampedMigrations(timestampedMigrations: boolean): void {
  _timestampedMigrations = timestampedMigrations;
}

export function validateMigrationTimestamps(): boolean {
  return _validateMigrationTimestamps;
}

export function setValidateMigrationTimestamps(validateMigrationTimestamps: boolean): void {
  _validateMigrationTimestamps = validateMigrationTimestamps;
}

export function migrationStrategy(): AnyClass {
  return _migrationStrategy;
}

export function setMigrationStrategy(migrationStrategy: AnyClass): void {
  _migrationStrategy = migrationStrategy;
}

export function dumpSchemaAfterMigration(): boolean {
  return _dumpSchemaAfterMigration;
}

export function setDumpSchemaAfterMigration(dumpSchemaAfterMigration: boolean): void {
  _dumpSchemaAfterMigration = dumpSchemaAfterMigration;
}

export function dumpSchemas(): "schema_search_path" | "all" | (string & {}) {
  return _dumpSchemas;
}

export function setDumpSchemas(dumpSchemas: "schema_search_path" | "all" | (string & {})): void {
  _dumpSchemas = dumpSchemas;
}

export function verifyForeignKeysForFixtures(): boolean {
  return _verifyForeignKeysForFixtures;
}

export function setVerifyForeignKeysForFixtures(verifyForeignKeysForFixtures: boolean): void {
  _verifyForeignKeysForFixtures = verifyForeignKeysForFixtures;
}

export function queryTransformers(): QueryTransformer[] {
  return _queryTransformers;
}

export function setQueryTransformers(queryTransformers: QueryTransformer[]): void {
  _queryTransformers = queryTransformers;
}

export function useYamlUnsafeLoad(): boolean {
  return _useYamlUnsafeLoad;
}

export function setUseYamlUnsafeLoad(useYamlUnsafeLoad: boolean): void {
  _useYamlUnsafeLoad = useYamlUnsafeLoad;
}

export function raiseIntWiderThan64bit(): boolean {
  return _raiseIntWiderThan64bit;
}

export function setRaiseIntWiderThan64bit(raiseIntWiderThan64bit: boolean): void {
  _raiseIntWiderThan64bit = raiseIntWiderThan64bit;
}

export function yamlColumnPermittedClasses(): unknown[] {
  return _yamlColumnPermittedClasses;
}

export function setYamlColumnPermittedClasses(yamlColumnPermittedClasses: unknown[]): void {
  _yamlColumnPermittedClasses = yamlColumnPermittedClasses;
}

export function generateSecureTokenOn(): "create" | "initialize" {
  return _generateSecureTokenOn;
}

export function setGenerateSecureTokenOn(generateSecureTokenOn: "create" | "initialize"): void {
  _generateSecureTokenOn = generateSecureTokenOn;
}

export function marshallingFormatVersion(): 6.1 | 7.1 {
  return Marshalling.formatVersion();
}

export function setMarshallingFormatVersion(value: unknown): void {
  Marshalling.setFormatVersion(value);
}

export function protocolAdapters(): InheritableOptions {
  return _protocolAdapters;
}

export function setProtocolAdapters(protocolAdapters: InheritableOptions): void {
  _protocolAdapters = protocolAdapters;
}

export async function eagerLoadBang(): Promise<void> {
  await Autoload.eagerLoadBang.call(ActiveRecord);
  await ActiveRecord.Associations.eagerLoadBang();
  await ActiveRecord.ConnectionAdapters.eagerLoadBang();
  const { Encryption } = await import("./encryption.js");
  await Encryption.eagerLoadBang();
}

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
