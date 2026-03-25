export { Base } from "./base.js";
export { Relation, Range } from "./relation.js";
export type { DatabaseAdapter } from "./adapter.js";
export { Migration, MigrationContext } from "./migration.js";
export { TableDefinition } from "./connection-adapters/abstract/schema-definitions.js";
export type {
  ColumnType,
  ColumnOptions,
} from "./connection-adapters/abstract/schema-definitions.js";
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
export { Rollback } from "./errors.js";
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
export { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
export type {
  SchemaSource,
  ColumnInfo,
  IndexInfo,
} from "./connection-adapters/abstract/schema-dumper.js";
export {
  RecordNotFound,
  RecordInvalid,
  RecordNotSaved,
  RecordNotDestroyed,
  StaleObjectError,
  ReadOnlyRecord,
  SoleRecordExceeded,
  StrictLoadingViolationError,
  UnknownAttributeError,
  SubclassNotFound,
  NameError,
} from "./errors.js";
export {
  DeleteRestrictionError,
  InverseOfAssociationNotFoundError,
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughNestedAssociationsAreReadonly,
  HasManyThroughOrderError,
} from "./associations/errors.js";
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
export { DatabaseConfig } from "./database-configurations/database-config.js";
export type { DatabaseConfigOptions } from "./database-configurations/database-config.js";
export { HashConfig } from "./database-configurations/hash-config.js";
export { UrlConfig } from "./database-configurations/url-config.js";
export { DatabaseConfigurations } from "./database-configurations/connection-url-resolver.js";
export { ConnectionPool } from "./connection-adapters/abstract/connection-pool/queue.js";
export { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
export { DatabaseTasks } from "./tasks/database-tasks.js";
export type { DatabaseTaskHandler } from "./tasks/database-tasks.js";
export { Migrator } from "./migration.js";
export type { MigrationProxy, MigrationLike } from "./migration.js";
export type { DelegatedTypeOptions } from "./delegated-type.js";

export { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";
