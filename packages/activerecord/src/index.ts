export { Base } from "./base.js";
export * as Type from "./type.js";
export { Relation, Range } from "./relation.js";
export { QueryAttribute } from "./relation/query-attribute.js";
export type { DatabaseAdapter } from "./adapter.js";
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
  loadHabtm,
  updateCounterCaches,
  touchBelongsToParents,
} from "./associations.js";
export { CollectionProxy } from "./associations/collection-proxy.js";
export type { AssociationOptions } from "./associations.js";
export { Transaction } from "./connection-adapters/abstract/transaction.js";
export { transaction, savepoint, currentTransaction } from "./transactions.js";
export { delegate } from "./delegate.js";
export { defineEnum, readEnumValue, castEnumValue } from "./enum.js";
export {
  enableSti,
  getInheritanceColumn,
  instantiateSti,
  registerSubclass,
  findStiClass,
} from "./inheritance.js";
export { hasSecurePassword } from "./secure-password.js";
export {
  incrementCounter,
  decrementCounter,
  updateCounters,
  resetCounters,
} from "./counter-cache.js";
export { attrReadonly, readonlyAttributes, readonlyAttribute } from "./readonly-attributes.js";
export { touch, touchAll } from "./timestamp.js";
export {
  store,
  storeAccessor,
  storedAttributes,
  HashAccessor,
  IndifferentHashAccessor,
} from "./store.js";
export { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
export { PostgreSQLAdapter } from "./adapters/postgresql-adapter.js";
export { Mysql2Adapter } from "./adapters/mysql2-adapter.js";
export { QueryCacheAdapter, QueryCacheStore } from "./query-cache.js";
export { QueryLogs, escapeComment, LegacyFormatter, SQLCommenter } from "./query-logs.js";
export type { TagValue, TagHandler, TagDefinition, QueryLogsFormatter } from "./query-logs.js";
export { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
export { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
export type {
  SchemaSource,
  ColumnInfo,
  IndexInfo,
} from "./connection-adapters/abstract/schema-dumper.js";
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
  RecordInvalid,
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
  SerializationTypeMismatch,
  ConnectionNotDefined,
  DatabaseConnectionError,
  ValueTooLong,
  PreparedStatementInvalid,
  NoDatabaseError,
  AttributeAssignmentError,
  TransactionIsolationError,
  IrreversibleOrderError,
} from "./errors.js";
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
  reflectOnAssociation,
  reflectOnAllAssociations,
  reflectOnAllAggregations,
  reflectOnAggregation,
  reflectOnAllAutosaveAssociations,
  type AssociationLikeReflection,
} from "./reflection.js";
export { acceptsNestedAttributesFor, assignNestedAttributes } from "./nested-attributes.js";
export { hasSecureToken } from "./secure-token.js";
export { composedOf } from "./composed-of.js";
export { serialize } from "./serialize.js";
export { encrypts, defaultEncryptor, getEncryptor, isEncryptedAttribute } from "./encryption.js";
export type { Encryptor } from "./encryption.js";
export { generatesTokenFor } from "./generates-token-for.js";
export { delegatedType, getDelegatedTypeConfig } from "./delegated-type.js";
export { DatabaseConfig } from "./database-configurations/database-config.js";
export type { DatabaseConfigOptions } from "./database-configurations/database-config.js";
export { HashConfig } from "./database-configurations/hash-config.js";
export { UrlConfig } from "./database-configurations/url-config.js";
export { DatabaseConfigurations } from "./database-configurations.js";
export { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
export { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
export { DatabaseTasks } from "./tasks/database-tasks.js";
export type { DatabaseTaskHandler } from "./tasks/database-tasks.js";
export { Migrator } from "./migration.js";
export type { MigrationProxy, MigrationLike } from "./migration.js";
export type { DelegatedTypeOptions } from "./delegated-type.js";

export {
  markForDestruction,
  isMarkedForDestruction,
  isDestroyable,
} from "./autosave-association.js";
export { Connection as TypeCasterConnection } from "./type-caster/connection.js";
export { Map as TypeCasterMap } from "./type-caster/map.js";
