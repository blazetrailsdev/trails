/**
 * MySQL schema statements — MySQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements (module)
 */

import { NotImplementedError } from "../../errors.js";
export interface SchemaStatements {
  createDatabase(name: string, options?: Record<string, unknown>): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  currentDatabase(): Promise<string>;
  charset(): Promise<string>;
  collation(): Promise<string>;
  tables(): Promise<string[]>;
  views(): Promise<string[]>;
  dataSources(): Promise<string[]>;
  indexes(tableName: string): Promise<unknown[]>;
  primaryKeys(tableName: string): Promise<string[]>;
  foreignKeys(tableName: string): Promise<unknown[]>;
  checkConstraints(tableName: string): Promise<unknown[]>;
  tableOptions(tableName: string): Promise<Record<string, string>>;
  tableComment(tableName: string): Promise<string | null>;
  showVariable(name: string): Promise<string | null>;
  renameTable(tableName: string, newName: string): Promise<void>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
  dropTable(...tableNames: (string | Record<string, unknown>)[]): Promise<void>;
  changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;
  changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void>;
  changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: string | Record<string, string | null>,
  ): Promise<void>;
  changeTableComment(
    tableName: string,
    commentOrChanges: string | Record<string, string | null>,
  ): Promise<void>;
  renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void>;
  addIndex(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): Promise<void>;
  columns(tableName: string): Promise<unknown[]>;
  columnDefinitions(tableName: string): Promise<unknown[]>;
  removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  createTable(tableName: string, options?: Record<string, unknown>): Promise<void>;
  removeForeignKey(
    fromTable: string,
    toTable?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  internalStringOptionsForPrimaryKey(): Record<string, unknown>;
  updateTableDefinition(tableName: string, base: unknown): unknown;
  createSchemaDumper(options?: Record<string, unknown>): unknown;
  typeToSql(type: string, options?: Record<string, unknown>): string;
  tableAliasLength(): number;
  schemaCreation(): unknown;
}

function isRowFormatDynamicByDefault(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#row_format_dynamic_by_default? is not implemented",
  );
}

function defaultRowFormat(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#default_row_format is not implemented",
  );
}

function validPrimaryKeyOptions(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#valid_primary_key_options is not implemented",
  );
}

function createTableDefinition(name: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#create_table_definition is not implemented",
  );
}

function defaultType(tableName: any, fieldName: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#default_type is not implemented",
  );
}

function newColumnFromField(tableName: any, field: any, Definitions: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#new_column_from_field is not implemented",
  );
}

function fetchTypeMetadata(sqlType: any, extra?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#fetch_type_metadata is not implemented",
  );
}

function extractForeignKeyAction(specifier: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#extract_foreign_key_action is not implemented",
  );
}

function addIndexLength(quotedColumns: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#add_index_length is not implemented",
  );
}

function addOptionsForIndexColumns(quotedColumns: any, options?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#add_options_for_index_columns is not implemented",
  );
}

function dataSourceSql(name?: any, type?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#data_source_sql is not implemented",
  );
}

function quotedScope(name?: any, type?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#quoted_scope is not implemented",
  );
}

function extractSchemaQualifiedName(string: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#extract_schema_qualified_name is not implemented",
  );
}

function typeWithSizeToSql(type: any, size: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#type_with_size_to_sql is not implemented",
  );
}

function limitToSize(limit: any, type: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#limit_to_size is not implemented",
  );
}

function integerToSql(limit: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#integer_to_sql is not implemented",
  );
}
