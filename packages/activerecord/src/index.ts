export { Base } from "./base.js";
export type { PrimaryKeyScalar, PrimaryKeyValue } from "./base.js";
export { Result, IndexedRow } from "./result.js";
export type { ColumnType as ResultColumnType, ColumnTypes as ResultColumnTypes } from "./result.js";
export * as Type from "./type.js";

// Wire ExecutorHooks to lazily resolve Base.connectionHandler at call time,
// matching Rails' ActiveRecord::Base.connection_handler late binding.
import { ExecutorHooks } from "./connection-adapters/abstract/connection-pool.js";
import { Base as _Base } from "./base.js";
ExecutorHooks.setConnectionHandlerResolver(() => _Base.connectionHandler);
export { Relation, Range } from "./relation.js";
export type { LoadedRelation } from "./relation.js";
export { QueryAttribute } from "./relation/query-attribute.js";
export { InsertAll, Builder as InsertAllBuilder } from "./insert-all.js";
export type { InsertAllOptions } from "./insert-all.js";
export type { DatabaseAdapter, ExplainOption } from "./adapter.js";
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
export { MigrationRunner } from "./migration-runner.js";
export {
  Associations,
  registerModel,
  modelRegistry,
  loadBelongsTo,
  loadHasOne,
  buildHasOne,
  buildBelongsTo,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  association,
  isAssociationCached,
  loadHabtm,
  updateCounterCaches,
  touchBelongsToParents,
} from "./associations.js";
export { CollectionProxy } from "./associations/collection-proxy.js";
export type { AssociationProxy } from "./associations/collection-proxy.js";
export { AssociationRelation } from "./association-relation.js";
export type { AssociationOptions } from "./associations.js";
// Public Rails-facing Transaction wrapper. The internal transaction
// class lives at connection-adapters/abstract/transaction.ts and is
// intentionally NOT re-exported at the top level — Rails doesn't
// expose ConnectionAdapters::Transaction as part of the
// ActiveRecord:: surface either.
export { Transaction } from "./transaction.js";
export {
  LogSubscriber,
  getVerboseQueryLogs,
  setVerboseQueryLogs,
  setBaseResolver as setLogSubscriberBaseResolver,
} from "./log-subscriber.js";
export { ExplainSubscriber } from "./explain-subscriber.js";
export { ExplainRegistry } from "./explain-registry.js";

// Wire LogSubscriber's Base resolver so it can delegate logger/filter
// to ActiveRecord::Base without circular imports.
import { setBaseResolver as _setBaseResolver } from "./log-subscriber.js";
_setBaseResolver(() => _Base);

// Auto-attach LogSubscriber to :active_record, matching Rails'
// `ActiveRecord::LogSubscriber.attach_to :active_record`.
import { LogSubscriber as _LogSubscriber } from "./log-subscriber.js";
_LogSubscriber.attachTo("active_record");

// Auto-subscribe ExplainSubscriber to sql.active_record, matching Rails'
// `ActiveSupport::Notifications.subscribe("sql.active_record", new)`.
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
  afterCommit,
  afterRollback,
  afterSaveCommit,
  afterCreateCommit,
  afterUpdateCommit,
  afterDestroyCommit,
  beforeCommit,
  setCallback,
  beforeCommittedBang,
  committedBang,
  rolledbackBang,
  withTransactionReturningStatus,
  isTriggerTransactionalCallbacks,
} from "./transactions.js";
export { delegate } from "./delegate.js";
export { defineEnum, readEnumValue, castEnumValue } from "./enum.js";
export {
  enableSti,
  getInheritanceColumn,
  instantiateSti,
  registerSubclass,
  findStiClass,
} from "./inheritance.js";
// hasSecurePassword requires node:crypto — use subpath: @blazetrails/activerecord/secure-password
// CounterCache, ReadonlyAttributes, Timestamp, Locking::Pessimistic, and
// Translation are consumed via the Base mixins — class methods like
// `User.incrementCounter(...)`, `User.touchAll(...)`, `User.attrReadonly(...)`,
// and instance methods like `user.touch()`, `user.lockBang()`,
// `user.withLock(cb)`. They are no longer exported as standalone free
// functions — their `this:`-typed signatures are only callable on a Base
// subclass (statics) or a Base instance (instance methods).
// establishConnection requires node:fs — use subpath: @blazetrails/activerecord/connection-handling
// signedId requires MessageVerifier (node:crypto) — use subpath: @blazetrails/activerecord/signed-id
export {
  lockingColumn,
  setLockingColumn,
  lockingEnabled,
  LockingType,
} from "./locking/optimistic.js";
// ModelSchema is consumed via the Base mixins — `User.columnNames()`,
// `User.columnsHash()`, `User.contentColumns()`, `User.createTable()`, etc.
// (mixed in via activesupport `extend()`). The underlying functions are
// no longer exported as standalone free functions — their `this:`-typed
// signatures are only callable on a Base subclass.
export {
  store,
  storeAccessor,
  storedAttributes,
  HashAccessor,
  IndifferentHashAccessor,
  StringKeyedHashAccessor,
} from "./store.js";
export { QueryCache, QueryCacheAdapter, QueryCacheStore } from "./query-cache.js";
export { QueryLogs, escapeComment, LegacyFormatter, SQLCommenter } from "./query-logs.js";
export type { TagValue, TagHandler, TagDefinition, QueryLogsFormatter } from "./query-logs.js";
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
export type {
  SchemaSource,
  ColumnInfo,
  IndexInfo,
} from "./connection-adapters/abstract/schema-dumper.js";
export { dumpSchemaColumns } from "./schema-columns-dump.js";
export type { DumpSchemaColumnsOptions } from "./schema-columns-dump.js";
export {
  ActiveRecordError,
  SubclassNotFound,
  AdapterNotSpecified,
  AdapterNotFound,
  AdapterError,
  ConnectionNotEstablished,
  ConnectionTimeoutError,
  ReadOnlyError,
  RecordNotFound,
  RecordNotSaved,
  RecordNotDestroyed,
  SoleRecordExceeded,
  StatementInvalid,
  WrappedDatabaseException,
  RecordNotUnique,
  InvalidForeignKey,
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
  MultiparameterAssignmentErrors,
  SerializationTypeMismatch,
  ConnectionNotDefined,
  DatabaseConnectionError,
  ValueTooLong,
  PreparedStatementInvalid,
  PreparedStatementCacheExpired,
  NoDatabaseError,
  DatabaseAlreadyExists,
  AttributeAssignmentError,
  TransactionIsolationError,
  IrreversibleOrderError,
} from "./errors.js";
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
  ColumnReflection,
  columns,
  columnNames,
  contentColumns,
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
  assignNestedAttributes,
  TooManyRecords,
} from "./nested-attributes.js";
// hasSecureToken requires node:crypto — use subpath: @blazetrails/activerecord/secure-token
export { composedOf } from "./composed-of.js";
export { serialize } from "./serialize.js";
export { encrypts, defaultEncryptor, isEncryptedAttribute } from "./encryption.js";
export { EncryptedAttributeType } from "./encrypted-attribute-type.js";
export type { Encryptor } from "./encryption.js";
// generatesTokenFor requires node:crypto — use subpath: @blazetrails/activerecord/generates-token-for
export { delegatedType, getDelegatedTypeConfig } from "./delegated-type.js";
export { DatabaseConfig } from "./database-configurations/database-config.js";
export type { DatabaseConfigOptions } from "./database-configurations/database-config.js";
export { HashConfig } from "./database-configurations/hash-config.js";
export { UrlConfig } from "./database-configurations/url-config.js";
export { DatabaseConfigurations } from "./database-configurations.js";
export { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
export { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
export { DatabaseTasks } from "./tasks/database-tasks.js";
export type { DatabaseTaskHandler, SchemaFormat } from "./tasks/database-tasks.js";
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
export type { MigrationProxy, MigrationLike } from "./migration.js";
export type { DelegatedTypeOptions } from "./delegated-type.js";

export {
  markForDestruction,
  isMarkedForDestruction,
  isDestroyable,
} from "./autosave-association.js";
export { Connection as TypeCasterConnection } from "./type-caster/connection.js";
export { Map as TypeCasterMap } from "./type-caster/map.js";
