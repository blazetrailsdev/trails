/**
 * PostgreSQL schema statements — PostgreSQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
 */

export interface PgIndexDefinition {
  table: string;
  name: string;
  unique: boolean;
  columns: string[];
  using: string;
  orders?: Record<string, string> | string;
}

export interface CreateDatabaseOptions {
  encoding?: string;
  collation?: string;
  ctype?: string;
  owner?: string;
  template?: string;
  tablespace?: string;
  connectionLimit?: number;
}

export interface SchemaStatements {
  createDatabase(name: string, options?: CreateDatabaseOptions): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  recreateDatabase(name: string, options?: CreateDatabaseOptions): Promise<void>;
  createSchema(name: string, options?: { force?: boolean; ifNotExists?: boolean }): Promise<void>;
  dropSchema(name: string, options?: { ifExists?: boolean; cascade?: boolean }): Promise<void>;
  schemaExists(name: string): Promise<boolean>;
  schemaNames(): Promise<string[]>;
  currentSchema(): Promise<string>;
  schemaSearchPath(): Promise<string>;
  setSchemaSearchPath(searchPath: string | null): Promise<void>;
  currentDatabase(): Promise<string>;
  encoding(): Promise<string>;
  collation(): Promise<string>;
  ctype(): Promise<string>;
  clientMinMessages(): Promise<string>;
  setClientMinMessages(level: string): Promise<void>;
  indexes(tableName: string): Promise<PgIndexDefinition[]>;
  indexNameExists(tableName: string, indexName: string): Promise<boolean>;
  tableOptions(tableName: string): Promise<Record<string, unknown>>;
  tableComment(tableName: string): Promise<string | null>;
  tablePartitionDefinition(tableName: string): Promise<string | null>;
  inheritedTableNames(tableName: string): Promise<string[]>;
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
  defaultSequenceName(tableName: string, pk?: string | string[]): Promise<string | null>;
  serialSequence(tableName: string, column: string): Promise<string | null>;
  setPkSequenceBang(tableName: string, value: number): Promise<void>;
  resetPkSequenceBang(
    tableName: string,
    pk?: string | null,
    sequence?: string | null,
  ): Promise<void>;
  pkAndSequenceFor(tableName: string): Promise<[string, { schema: string; name: string }] | null>;
  primaryKeys(tableName: string): Promise<string[]>;
  dropTable(
    ...args:
      | [...tableNames: string[], options: { ifExists?: boolean; force?: "cascade" }]
      | string[]
  ): Promise<void>;
  validateConstraint(tableName: string, constraintName: string): Promise<void>;
  validateCheckConstraint(tableName: string, name: string): Promise<void>;
  validateForeignKey(tableName: string, name: string): Promise<void>;
  exclusionConstraints(tableName: string): Promise<unknown[]>;
  uniqueConstraints(tableName: string): Promise<unknown[]>;
  commentOnColumn(tableName: string, columnName: string, comment: string | null): Promise<void>;
  commentOnTable(tableName: string, comment: string | null): Promise<void>;
}
