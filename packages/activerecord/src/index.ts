export { Base } from "./base.js";
export { Relation, Range } from "./relation.js";
export type { DatabaseAdapter } from "./adapter.js";
export { Migration, TableDefinition, Schema, MigrationContext } from "./migration.js";
export type { ColumnType, ColumnOptions } from "./migration.js";
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
  CollectionProxy,
  association,
  loadHabtm,
  updateCounterCaches,
  touchBelongsToParents,
} from "./associations.js";
export type { AssociationOptions } from "./associations.js";
export {
  Transaction,
  Rollback,
  transaction,
  savepoint,
  currentTransaction,
} from "./transactions.js";
export { delegate } from "./delegate.js";
export { defineEnum, readEnumValue, castEnumValue } from "./enum.js";
export {
  enableSti,
  getInheritanceColumn,
  instantiateSti,
  registerSubclass,
  findStiClass,
} from "./sti.js";
export { hasSecurePassword } from "./secure-password.js";
export { store, storeAccessor, storedAttributes } from "./store.js";
export { SqliteAdapter } from "./adapters/sqlite-adapter.js";
export { PostgresAdapter } from "./adapters/postgres-adapter.js";
export { MysqlAdapter } from "./adapters/mysql-adapter.js";
export { QueryCacheAdapter, QueryCacheStore } from "./query-cache.js";
export { QueryLogs, escapeComment, LegacyFormatter, SQLCommenter } from "./query-logs.js";
export type { TagValue, TagHandler, TagDefinition, QueryLogsFormatter } from "./query-logs.js";
export { SchemaDumper } from "./schema-dumper.js";
export type { SchemaSource, ColumnInfo, IndexInfo } from "./schema-dumper.js";
export {
  RecordNotFound,
  RecordInvalid,
  RecordNotSaved,
  RecordNotDestroyed,
  StaleObjectError,
  ReadOnlyRecord,
  SoleRecordExceeded,
  StrictLoadingViolationError,
  DeleteRestrictionError,
  UnknownAttributeError,
  SubclassNotFound,
  NameError,
  InverseOfAssociationNotFoundError,
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughNestedAssociationsAreReadonly,
  HasManyThroughOrderError,
} from "./errors.js";
export {
  AssociationReflection,
  ThroughReflection,
  ColumnReflection,
  columns,
  columnNames,
  contentColumns,
  reflectOnAssociation,
  reflectOnAllAssociations,
} from "./reflection.js";
export { acceptsNestedAttributesFor, assignNestedAttributes } from "./nested-attributes.js";
export { hasSecureToken } from "./secure-token.js";
export { composedOf } from "./composed-of.js";
export { serialize } from "./serialize.js";
export { encrypts, defaultEncryptor, getEncryptor, isEncryptedAttribute } from "./encryption.js";
export type { Encryptor } from "./encryption.js";
export { generatesTokenFor } from "./generates-token-for.js";
export { delegatedType, getDelegatedTypeConfig } from "./delegated-type.js";
export {
  DatabaseConfigurations,
  DatabaseConfig,
  HashConfig,
  UrlConfig,
} from "./database-configurations.js";
export { ConnectionPool } from "./connection-pool.js";
export { ConnectionHandler } from "./connection-handler.js";
export { DatabaseTasks } from "./tasks/database-tasks.js";
export type { DatabaseTaskHandler } from "./tasks/database-tasks.js";
export { Migrator } from "./migrator.js";
export type { MigrationProxy, MigrationLike } from "./migrator.js";
export type { DelegatedTypeOptions } from "./delegated-type.js";

export { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";
