import { ArgumentError } from "@blazetrails/activemodel";
import { ActiveSupport } from "@blazetrails/activesupport";
import type { SQLWarning } from "./errors.js";
import { getBase } from "./log-subscriber.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import type { QueryTransformer } from "./query-transformers.js";

type DbWarningsAction = "ignore" | "log" | "raise" | "report" | ((warning: SQLWarning) => void);

type AnyClass = abstract new (...args: never[]) => object;

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function isSchemaCacheIgnoredTable(tableName: string): boolean {
  for (const entry of ActiveRecord.schemaCacheIgnoredTables) {
    if (entry instanceof RegExp) {
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
let _defaultTimezone: "utc" | "local" = "utc";
let _dbWarningsAction: ((warning: SQLWarning) => void) | null = null;
let _asyncQueryExecutor: "global_thread_pool" | "multi_thread_pool" | null = null;
let _globalThreadPoolAsyncQueryExecutor: AsyncExecutor | undefined;

/** @noRailsEquivalent PERMANENT */
export class AsyncExecutor {
  post(task: () => void): void {
    queueMicrotask(task);
  }
}
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
let _validateMigrationTimestamps = false;
let _migrationStrategy: AnyClass = DefaultStrategy;
let _verifyForeignKeysForFixtures = false;
let _useYamlUnsafeLoad = false;
let _raiseIntWiderThan64bit = true;
let _yamlColumnPermittedClasses: unknown[] = [Symbol];
let _generateSecureTokenOn: "create" | "initialize" = "create";
let _raiseOnAssignToAttrReadonly = false;

export const ActiveRecord = {
  get protocolAdapters(): Record<string, string> {
    return _protocolAdapters;
  },

  set protocolAdapters(value: Record<string, string>) {
    _protocolAdapters = value;
  },

  get disablePreparedStatements(): boolean {
    return _disablePreparedStatements;
  },

  set disablePreparedStatements(value: boolean) {
    _disablePreparedStatements = value;
  },

  get beforeCommittedOnAllRecords(): boolean {
    return _beforeCommittedOnAllRecords;
  },

  set beforeCommittedOnAllRecords(value: boolean) {
    _beforeCommittedOnAllRecords = value;
  },

  get runAfterTransactionCallbacksInOrderDefined(): boolean {
    return _runAfterTransactionCallbacksInOrderDefined;
  },

  set runAfterTransactionCallbacksInOrderDefined(value: boolean) {
    _runAfterTransactionCallbacksInOrderDefined = value;
  },

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

  /** @internal */
  get schemaCacheIgnoredTables(): ReadonlyArray<string | RegExp> {
    return _schemaCacheIgnoredTables;
  },

  /** @internal */
  set schemaCacheIgnoredTables(value: ReadonlyArray<string | RegExp>) {
    _schemaCacheIgnoredTables = value;
  },

  get dbWarningsAction(): ((warning: SQLWarning) => void) | null {
    return _dbWarningsAction;
  },

  set dbWarningsAction(action: DbWarningsAction) {
    switch (action) {
      case "ignore":
        _dbWarningsAction = null;
        break;
      case "log":
        _dbWarningsAction = (warning) => {
          let warningMessage = `[ActiveRecord::${warning.name}] ${warning.message}`;
          if (warning.code) warningMessage += ` (${warning.code})`;
          const logger = getBase().logger as { warn: (msg: string) => void };
          logger.warn(warningMessage);
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
  },

  get defaultTimezone(): "utc" | "local" {
    return _defaultTimezone;
  },

  set defaultTimezone(value: "utc" | "local") {
    if (value !== "utc" && value !== "local") {
      throw new ArgumentError("default_timezone must be either :utc (default) or :local.");
    }
    _defaultTimezone = value;
  },

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
  get asyncQueryExecutor(): "global_thread_pool" | "multi_thread_pool" | null {
    return _asyncQueryExecutor;
  },

  set asyncQueryExecutor(value: "global_thread_pool" | "multi_thread_pool" | null) {
    _asyncQueryExecutor = value;
  },

  globalThreadPoolAsyncQueryExecutor(): AsyncExecutor {
    return (_globalThreadPoolAsyncQueryExecutor ??= new AsyncExecutor());
  },

  get queues(): Record<string, unknown> {
    return _queues;
  },

  set queues(value: Record<string, unknown>) {
    _queues = value;
  },

  get maintainTestSchema(): boolean | null {
    return _maintainTestSchema;
  },

  set maintainTestSchema(value: boolean | null) {
    _maintainTestSchema = value;
  },

  get queryTransformers(): QueryTransformer[] {
    return _queryTransformers;
  },

  set queryTransformers(value: QueryTransformer[]) {
    _queryTransformers = value;
  },

  get databaseCli(): Record<string, string | string[]> {
    return _databaseCli;
  },

  set databaseCli(value: Record<string, string | string[]>) {
    _databaseCli = value;
  },

  get belongsToRequiredValidatesForeignKey(): boolean {
    return _belongsToRequiredValidatesForeignKey;
  },

  set belongsToRequiredValidatesForeignKey(value: boolean) {
    _belongsToRequiredValidatesForeignKey = value;
  },

  get applicationRecordClass(): AnyClass | null {
    return _applicationRecordClass;
  },

  set applicationRecordClass(value: AnyClass | null) {
    _applicationRecordClass = value;
  },

  get errorOnIgnoredOrder(): boolean {
    return _errorOnIgnoredOrder;
  },

  set errorOnIgnoredOrder(value: boolean) {
    _errorOnIgnoredOrder = value;
  },

  get timestampedMigrations(): boolean {
    return _timestampedMigrations;
  },

  set timestampedMigrations(value: boolean) {
    _timestampedMigrations = value;
  },

  get validateMigrationTimestamps(): boolean {
    return _validateMigrationTimestamps;
  },

  set validateMigrationTimestamps(value: boolean) {
    _validateMigrationTimestamps = value;
  },

  get migrationStrategy(): AnyClass {
    return _migrationStrategy;
  },

  set migrationStrategy(value: AnyClass) {
    _migrationStrategy = value;
  },

  get verifyForeignKeysForFixtures(): boolean {
    return _verifyForeignKeysForFixtures;
  },

  set verifyForeignKeysForFixtures(value: boolean) {
    _verifyForeignKeysForFixtures = value;
  },

  get useYamlUnsafeLoad(): boolean {
    return _useYamlUnsafeLoad;
  },

  set useYamlUnsafeLoad(value: boolean) {
    _useYamlUnsafeLoad = value;
  },

  get raiseIntWiderThan64bit(): boolean {
    return _raiseIntWiderThan64bit;
  },

  set raiseIntWiderThan64bit(value: boolean) {
    _raiseIntWiderThan64bit = value;
  },

  get yamlColumnPermittedClasses(): unknown[] {
    return _yamlColumnPermittedClasses;
  },

  set yamlColumnPermittedClasses(value: unknown[]) {
    _yamlColumnPermittedClasses = value;
  },

  get generateSecureTokenOn(): "create" | "initialize" {
    return _generateSecureTokenOn;
  },

  set generateSecureTokenOn(value: "create" | "initialize") {
    _generateSecureTokenOn = value;
  },

  get raiseOnAssignToAttrReadonly(): boolean {
    return _raiseOnAssignToAttrReadonly;
  },

  set raiseOnAssignToAttrReadonly(value: boolean) {
    _raiseOnAssignToAttrReadonly = value;
  },
};
