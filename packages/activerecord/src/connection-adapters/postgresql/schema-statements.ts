/**
 * PostgreSQL schema statements — PostgreSQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
 */

export interface SchemaStatements {
  createDatabase(name: string, options?: Record<string, unknown>): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  createSchema(name: string): Promise<void>;
  dropSchema(name: string, options?: { ifExists?: boolean; cascade?: boolean }): Promise<void>;
  schemaExists(name: string): Promise<boolean>;
  schemaNames(): Promise<string[]>;
  currentSchema(): Promise<string>;
  indexes(tableName: string): Promise<unknown[]>;
  createEnum(name: string, values: string[]): Promise<void>;
  dropEnum(name: string, options?: { ifExists?: boolean }): Promise<void>;
  renameEnum(name: string, newName: string): Promise<void>;
  addEnumValue(
    name: string,
    value: string,
    options?: { before?: string; after?: string; ifNotExists?: boolean },
  ): Promise<void>;
  renameEnumValue(name: string, existingValue: string, newValue: string): Promise<void>;
  enumTypes(): Promise<Record<string, string[]>>;
  columns(tableName: string): Promise<unknown[]>;
  columnDefinitions(tableName: string): Promise<unknown[]>;
  foreignKeys(tableName: string): Promise<unknown[]>;
  validateConstraint(tableName: string, constraintName: string): Promise<void>;
  validateCheckConstraint(tableName: string, name: string): Promise<void>;
  validateForeignKey(tableName: string, name: string): Promise<void>;
  exclusionConstraints(tableName: string): Promise<unknown[]>;
  uniqueConstraints(tableName: string): Promise<unknown[]>;
  commentOnColumn(tableName: string, columnName: string, comment: string | null): Promise<void>;
  commentOnTable(tableName: string, comment: string | null): Promise<void>;
}
