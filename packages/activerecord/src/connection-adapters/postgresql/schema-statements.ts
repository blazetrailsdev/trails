/**
 * PostgreSQL schema statements — PostgreSQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements
 */

import { NotImplementedError } from "../../errors.js";
import type {
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CheckConstraintDefinition,
  ForeignKeyDefinition,
} from "../abstract/schema-definitions.js";

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
  foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]>;
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
  addColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: {
      comment?: string | null;
      default?: unknown;
      null?: boolean;
      array?: boolean;
      limit?: number;
      precision?: number;
      scale?: number;
      ifNotExists?: boolean;
    },
  ): Promise<void>;
  renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void>;
  changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;
  changeColumnNull(
    tableName: string,
    columnName: string,
    nullable: boolean,
    defaultValue?: unknown,
  ): Promise<void>;
  changeColumnComment(tableName: string, columnName: string, comment: string | null): Promise<void>;
  changeTableComment(tableName: string, comment: string | null): Promise<void>;
  renameTable(tableName: string, newName: string): Promise<void>;
  changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: {
      using?: string;
      castAs?: string;
      default?: unknown;
      null?: boolean;
      array?: boolean;
    },
  ): Promise<void>;
  buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: string,
    options?: {
      using?: string;
      castAs?: string;
      default?: unknown;
      null?: boolean;
      array?: boolean;
    },
  ): ChangeColumnDefinition;
  buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined>;
  addIndex(
    tableName: string,
    columnName: string | string[],
    options?: {
      name?: string;
      unique?: boolean;
      using?: string;
      where?: string;
      algorithm?: string;
      order?: Record<string, string> | string;
      opclass?: Record<string, string>;
      ifNotExists?: boolean;
      nullsNotDistinct?: boolean;
      include?: string[];
    },
  ): Promise<string>;
  buildCreateIndexDefinition(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): unknown;
  removeIndex(tableName: string, options: { name: string; algorithm?: string }): Promise<void>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
  indexName(tableName: string, options: { column?: string | string[] }): string;
  addForeignKey(
    fromTable: string,
    toTable: string,
    options?: {
      column?: string;
      primaryKey?: string;
      name?: string;
      onDelete?: "cascade" | "nullify" | "restrict" | "no_action" | "set_default";
      onUpdate?: "cascade" | "nullify" | "restrict" | "no_action" | "set_default";
      deferrable?: "immediate" | "deferred";
      validate?: boolean;
    },
  ): Promise<void>;
  checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]>;
  addExclusionConstraint(
    tableName: string,
    expression: string,
    options?: {
      name?: string;
      using?: string;
      where?: string;
      deferrable?: "immediate" | "deferred";
    },
  ): Promise<void>;
  exclusionConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown>;
  removeExclusionConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): Promise<void>;
  addUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | null,
    options?: {
      name?: string;
      deferrable?: "immediate" | "deferred";
      usingIndex?: string;
      nullsNotDistinct?: boolean;
    },
  ): Promise<void>;
  uniqueConstraintOptions(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: Record<string, unknown>,
  ): Record<string, unknown>;
  removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): Promise<void>;
  typeToSql(
    type: string,
    options?: {
      limit?: number;
      precision?: number;
      scale?: number;
      array?: boolean;
      enumType?: string;
    },
  ): string;
  columnsForDistinct(
    columns: string | string[],
    orders?: (string | import("@blazetrails/arel").Nodes.Node)[],
  ): string;
  updateTableDefinition(tableName: string, base: unknown): unknown;
  createSchemaDumper(options: unknown): unknown;
  foreignKeyColumnFor(tableName: string, columnName?: string): string;
  addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): unknown;
  /** @internal */
  sequenceNameFromParts(tableName: string, columnName: string, suffix: string): string;
  /** @internal */
  assertValidDeferrable(deferrable: unknown): void;
  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | "restrict" | undefined;
  /** @internal */
  extractConstraintDeferrable(
    deferrable: boolean,
    deferred: boolean,
  ): "deferred" | "immediate" | false;
  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /** @internal */
  quotedScope(
    name?: string | null,
    options?: { type?: string },
  ): { schema: string; name: string | null; type: string | null };
  /** @internal */
  referenceNameForTable(tableName: string): string;
  /** @internal */
  columnNamesFromColumnNumbers(tableOid: number, columnNumbers: number[]): Promise<string[]>;
  foreignTables(): Promise<string[]>;
  foreignTableExists(tableName: string): Promise<boolean>;
  quotedIncludeColumnsForIndex(columnNames: string | string[]): string;
  schemaCreation(): unknown;
}

/** @internal */
function createTableDefinition(name: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#create_table_definition is not implemented",
  );
}

/** @internal */
function createAlterTable(name: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#create_alter_table is not implemented",
  );
}

/** @internal */
function newColumnFromField(tableName: any, field: any, Definitions: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#new_column_from_field is not implemented",
  );
}

/** @internal */
function fetchTypeMetadata(columnName: any, sqlType: any, oid: any, fmod: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#fetch_type_metadata is not implemented",
  );
}

/** @internal */
function sequenceNameFromParts(tableName: any, columnName: any, suffix: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#sequence_name_from_parts is not implemented",
  );
}

/** @internal */
function extractForeignKeyAction(specifier: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#extract_foreign_key_action is not implemented",
  );
}

/** @internal */
function assertValidDeferrable(deferrable: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#assert_valid_deferrable is not implemented",
  );
}

/** @internal */
function extractConstraintDeferrable(deferrable: any, deferred: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#extract_constraint_deferrable is not implemented",
  );
}

/** @internal */
function referenceNameForTable(tableName: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#reference_name_for_table is not implemented",
  );
}

/** @internal */
function addColumnForAlter(tableName: any, columnName: any, type: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#add_column_for_alter is not implemented",
  );
}

/** @internal */
function changeColumnForAlter(tableName: any, columnName: any, type: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#change_column_for_alter is not implemented",
  );
}

/** @internal */
function changeColumnNullForAlter(
  tableName: any,
  columnName: any,
  null_: any,
  default_?: any,
): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#change_column_null_for_alter is not implemented",
  );
}

/** @internal */
function addIndexOpclass(quotedColumns: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#add_index_opclass is not implemented",
  );
}

/** @internal */
function addOptionsForIndexColumns(quotedColumns: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#add_options_for_index_columns is not implemented",
  );
}

/** @internal */
function exclusionConstraintName(tableName: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#exclusion_constraint_name is not implemented",
  );
}

/** @internal */
function exclusionConstraintFor(tableName: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#exclusion_constraint_for is not implemented",
  );
}

/** @internal */
function exclusionConstraintForBang(tableName: any, expression?: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#exclusion_constraint_for! is not implemented",
  );
}

/** @internal */
function uniqueConstraintName(tableName: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#unique_constraint_name is not implemented",
  );
}

/** @internal */
function uniqueConstraintFor(tableName: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#unique_constraint_for is not implemented",
  );
}

/** @internal */
function uniqueConstraintForBang(tableName: any, column?: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#unique_constraint_for! is not implemented",
  );
}

/** @internal */
function dataSourceSql(name?: any, type?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#data_source_sql is not implemented",
  );
}

/** @internal */
function quotedScope(name?: any, type?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#quoted_scope is not implemented",
  );
}

/** @internal */
function extractSchemaQualifiedName(string: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#extract_schema_qualified_name is not implemented",
  );
}

/** @internal */
function columnNamesFromColumnNumbers(tableOid: any, columnNumbers: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#column_names_from_column_numbers is not implemented",
  );
}
