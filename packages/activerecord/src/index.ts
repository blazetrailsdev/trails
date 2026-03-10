export { Base } from "./base.js";
export { Relation, Range } from "./relation.js";
export { MemoryAdapter } from "./adapter.js";
export type { DatabaseAdapter } from "./adapter.js";
export {
  Migration,
  TableDefinition,
  Schema,
  MigrationContext,
} from "./migration.js";
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
export { Transaction, transaction, savepoint, currentTransaction } from "./transactions.js";
export { delegate } from "./delegate.js";
export { defineEnum, readEnumValue, castEnumValue } from "./enum.js";
export { enableSti, getInheritanceColumn, instantiateSti, registerSubclass, findStiClass } from "./sti.js";
export { hasSecurePassword } from "./secure-password.js";
export { store, storeAccessor, storedAttributes } from "./store.js";
export { SqliteAdapter } from "./adapters/sqlite-adapter.js";
export { PostgresAdapter } from "./adapters/postgres-adapter.js";
export { MysqlAdapter } from "./adapters/mysql-adapter.js";
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
} from "./errors.js";
export {
  AssociationReflection,
  ColumnReflection,
  columns,
  columnNames,
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
export type { DelegatedTypeOptions } from "./delegated-type.js";

export { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";
