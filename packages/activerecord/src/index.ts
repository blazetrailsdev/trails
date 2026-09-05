export { Base } from "./base.js";
export type { PrimaryKeyScalar, PrimaryKeyValue } from "./base.js";
export { pp } from "./pretty-print.js";
export type { PrettyPrinter, PPSink } from "./pretty-print.js";
export { Result, IndexedRow } from "./result.js";
export { FutureResult } from "./future-result.js";
export { AsynchronousQueriesTracker } from "./asynchronous-queries-tracker.js";
export { UniquenessValidator } from "./validations.js";
export { ExtendedDeterministicUniquenessValidator } from "./encryption/extended-deterministic-uniqueness-validator.js";
export { deprecator, Deprecator } from "./deprecator.js";
export { SchemaReflection } from "./connection-adapters/schema-cache.js";
export {
  AutoFilteredParameters,
  type AutoFilteredParametersApp,
} from "./encryption/auto-filtered-parameters.js";
export type { ColumnType as ResultColumnType, ColumnTypes as ResultColumnTypes } from "./result.js";
export * as Type from "./type.js";

import { ExecutorHooks } from "./connection-adapters/abstract/connection-pool.js";
import { Base as _Base } from "./base.js";
ExecutorHooks.setConnectionHandlerResolver(() => _Base.connectionHandler);
export { Relation, Range } from "./relation.js";
export { RangeType } from "./connection-adapters/postgresql/oid/range.js";
export { IPAddr } from "./connection-adapters/postgresql/oid/cidr.js";
export type { LoadedRelation, RelationScopes } from "./relation.js";
export type { ScopeMethod, ScopeOn } from "./scoping/named.js";
export { QueryAttribute } from "./relation/query-attribute.js";
export { InsertAll, Builder as InsertAllBuilder } from "./insert-all.js";
export type { InsertAllOptions } from "./insert-all.js";
export type { AdapterName } from "./connection-adapters/abstract-adapter.js";
export type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
export type { ExplainOption } from "./connection-adapters/abstract/database-statements.js";
export { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
export * as ConnectionAdapters from "./connection-adapters.js";
export { Migration, MigrationContext } from "./migration.js";
export {
  TableDefinition,
  Table,
  ColumnDefinition,
  AddColumnDefinition,
  CreateIndexDefinition,
  IndexDefinition,
  ForeignKeyDefinition,
  CheckConstraintDefinition,
} from "./connection-adapters/abstract/schema-definitions.js";
export type {
  ColumnType,
  ColumnOptions,
  ReferentialAction,
  AddForeignKeyOptions,
} from "./connection-adapters/abstract/schema-definitions.js";
export { SchemaCreation } from "./connection-adapters/abstract/schema-creation.js";
export { Schema } from "./schema.js";
export {
  Associations,
  registerModel,
  modelRegistry,
  association,
  isAssociationCached,
  eagerLoadBang,
} from "./associations.js";
export { CollectionProxy } from "./associations/collection-proxy.js";
export type { AssociationProxy } from "./associations/collection-proxy.js";
export { AssociationRelation } from "./association-relation.js";
export type { AssociationOptions } from "./associations.js";
export { Transaction } from "./transaction.js";
export {
  LogSubscriber,
  /** @noRailsEquivalent PERMANENT */
  setBaseResolver as setLogSubscriberBaseResolver,
} from "./log-subscriber.js";
export { ExplainSubscriber } from "./explain-subscriber.js";
export { ExplainRegistry } from "./explain-registry.js";
export { collectingQueriesForExplain, execExplain } from "./explain.js";

import { _registerBase as _registerBaseWithMigration } from "./migration.js";
_registerBaseWithMigration(_Base);

import { LogSubscriber as _LogSubscriber } from "./log-subscriber.js";
_LogSubscriber.attachTo("active_record");

import { Notifications as _Notifications } from "@blazetrails/activesupport";
import { ExplainSubscriber as _ExplainSubscriber } from "./explain-subscriber.js";
const _explainSub = new _ExplainSubscriber();
_Notifications.subscribe("sql.active_record", (event) => {
  _explainSub.finish(event.name, event.transactionId, event.payload);
});
export {
  transaction,
  savepoint,
  currentTransaction,
  currentTransactionPublic,
  afterAllTransactionsCommit,
  beforeCommittedBang,
  committedBang,
  rolledbackBang,
  withTransactionReturningStatus,
  isTriggerTransactionalCallbacks,
} from "./transactions.js";
export { resetCallbacks } from "./callbacks.js";
export { delegate } from "./delegate.js";
export { ActiveRecord, isSchemaCacheIgnoredTable } from "./ar-config.js";
export { defineEnum, readEnumValue, castEnumValue } from "./enum.js";
export type { EnumMacroOptions } from "./enum.js";
export { registerSubclass, findStiClass } from "./inheritance.js";
export { LockingType } from "./locking/optimistic.js";
export {
  storedAttributes,
  HashAccessor,
  IndifferentHashAccessor,
  StringKeyedHashAccessor,
} from "./store.js";
export { QueryCache } from "./query-cache.js";
export { Store as QueryCacheStore } from "./connection-adapters/abstract/query-cache.js";
export { QueryLogs, escapeComment, LegacyFormatter, SQLCommenter } from "./query-logs.js";
export type { TagValue, TagHandler, TagDefinition, QueryLogsFormatter } from "./query-logs.js";
export type { QueryTransformer } from "./query-transformers.js";
export {
  StatementCache,
  Substitute,
  Query as StatementQuery,
  PartialQuery,
  PartialQueryCollector,
  Params as StatementParams,
  BindMap,
} from "./statement-cache.js";
export * as RuntimeRegistry from "./runtime-registry.js";
export { Stats as RuntimeStats } from "./runtime-registry.js";
export { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
export { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
export type { SchemaSource, ColumnInfo, IndexInfo } from "./schema-dumper.js";
export { generateModels } from "./model-codegen.js";
export type { IntrospectedTable, GenerateModelsOptions } from "./model-codegen.js";
export {
  ActiveRecordError,
  SubclassNotFound,
  AdapterNotSpecified,
  AdapterNotFound,
  NotImplementedError,
  AdapterError,
  ConnectionNotEstablished,
  ConnectionTimeoutError,
  ExclusiveConnectionTimeoutError,
  ReadOnlyError,
  RecordNotFound,
  RecordNotSaved,
  RecordNotDestroyed,
  SoleRecordExceeded,
  StatementInvalid,
  WrappedDatabaseException,
  RecordNotUnique,
  InvalidForeignKey,
  MismatchedForeignKey,
  NotNullViolation,
  StaleObjectError,
  ConfigurationError,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  Rollback,
  DangerousAttributeError,
  UnknownAttributeError,
  NameError,
  SQLWarning,
  UnknownPrimaryKey,
  MultiparameterAssignmentErrors,
  SerializationTypeMismatch,
  ConnectionNotDefined,
  DatabaseConnectionError,
  ValueTooLong,
  PreparedStatementInvalid,
  PreparedStatementCacheExpired,
  NoDatabaseError,
  DatabaseVersionError,
  DatabaseAlreadyExists,
  AttributeAssignmentError,
  TransactionIsolationError,
  IrreversibleOrderError,
  UnknownAttributeReference,
  UnmodifiableRelation,
  QueryAborted,
  ConnectionFailed,
  TransactionRollbackError,
  SerializationFailure,
  Deadlocked,
  LockWaitTimeout,
  StatementTimeout,
  AdapterTimeout,
  QueryCanceled,
  RangeError,
  AssociationTypeMismatch,
  AssociationTargetReplacedDuringLoad,
  TableNotSpecified,
  AsynchronousQueryInsideTransactionError,
} from "./errors.js";
export { ReadonlyAttributeError } from "./readonly-attributes.js";
export { RecordInvalid } from "./validations.js";
export {
  AssociationNotFoundError,
  InverseOfAssociationNotFoundError,
  InverseOfAssociationRecursiveError,
  HasManyThroughAssociationNotFoundError,
  HasManyThroughAssociationPolymorphicSourceError,
  HasManyThroughAssociationPolymorphicThroughError,
  HasManyThroughAssociationPointlessSourceTypeError,
  HasOneThroughCantAssociateThroughCollection,
  HasOneAssociationPolymorphicThroughError,
  HasManyThroughSourceAssociationNotFoundError,
  HasManyThroughOrderError,
  ThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasOneThroughCantAssociateThroughHasOneOrManyReflection,
  CompositePrimaryKeyMismatchError,
  AmbiguousSourceReflectionForThroughAssociation,
  ThroughNestedAssociationsAreReadonly,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughNestedAssociationsAreReadonly,
  EagerLoadPolymorphicError,
  DeleteRestrictionError,
  HasOnePersistedAssignmentError,
  CollectionPersistedAssignmentError,
  CollectionIdsAssignmentError,
} from "./associations/errors.js";
export {
  AbstractReflection,
  MacroReflection,
  AggregateReflection,
  AssociationReflection,
  HasManyReflection,
  HasOneReflection,
  BelongsToReflection,
  HasAndBelongsToManyReflection,
  ThroughReflection,
  _reflectOnAssociation,
  reflectOnAssociation,
  reflectOnAllAssociations,
  reflectOnAllAggregations,
  reflectOnAggregation,
  reflectOnAllAutosaveAssociations,
  type AssociationLikeReflection,
} from "./reflection.js";
export {
  acceptsNestedAttributesFor,
  REJECT_ALL_BLANK_PROC,
  TooManyRecords,
} from "./nested-attributes.js";
export { composedOf } from "./aggregations.js";
export { ColumnNotSerializableError } from "./attribute-methods/serialization.js";
export { delegatedType, getDelegatedTypeConfig } from "./delegated-type.js";
export { DatabaseConfig } from "./database-configurations/database-config.js";
export type { DatabaseConfigOptions } from "./database-configurations/database-config.js";
export { HashConfig } from "./database-configurations/hash-config.js";
export { UrlConfig } from "./database-configurations/url-config.js";
export { DatabaseConfigurations } from "./database-configurations.js";
export { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { PoolConfig as _PoolConfig } from "./connection-adapters/pool-config.js";
export async function disconnectAllBang(): Promise<void> {
  await _PoolConfig.disconnectAllBang();
}
export { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
export { DatabaseTasks, DatabaseNotSupported } from "./tasks/database-tasks.js";
export type {
  DatabaseTaskHandler,
  DatabaseTaskInstance,
  SchemaFormat,
} from "./tasks/database-tasks.js";
export { eachCurrentEnvironment } from "./tasks/database-tasks.js";
export { SQLiteDatabaseTasks } from "./tasks/sqlite-database-tasks.js";
export { PostgreSQLDatabaseTasks } from "./tasks/postgresql-database-tasks.js";
export { MySQLDatabaseTasks } from "./tasks/mysql-database-tasks.js";
import { SQLiteDatabaseTasks as _SQLiteTasks } from "./tasks/sqlite-database-tasks.js";
import { PostgreSQLDatabaseTasks as _PGTasks } from "./tasks/postgresql-database-tasks.js";
import { MySQLDatabaseTasks as _MySQLTasks } from "./tasks/mysql-database-tasks.js";
_SQLiteTasks.register();
_PGTasks.register();
_MySQLTasks.register();
export {
  Migrator,
  UnknownMigrationVersionError,
  ProtectedEnvironmentError,
  EnvironmentMismatchError,
  EnvironmentStorageError,
  NoEnvironmentInSchemaError,
} from "./migration.js";
export { InternalMetadata, NullInternalMetadata } from "./internal-metadata.js";
export { SchemaMigration, NullSchemaMigration } from "./schema-migration.js";
export { MigrationProxy } from "./migration.js";
export type { DelegatedTypeOptions } from "./delegated-type.js";

export { isDestroyable } from "./autosave-association.js";
export { Connection as TypeCasterConnection } from "./type-caster/connection.js";
export { Map as TypeCasterMap } from "./type-caster/map.js";

export { ControllerRuntime } from "./trailties/controller-runtime.js";
export { JobRuntime } from "./trailties/job-runtime.js";
export { Resolver as DatabaseSelectorResolver } from "./middleware/database-selector/resolver.js";
export { Session as DatabaseSelectorSession } from "./middleware/database-selector/resolver/session.js";
export { DatabaseSelector } from "./middleware/database-selector.js";
export { ShardSelector } from "./middleware/shard-selector.js";

import "./associations/disable-joins-association-scope.js";
