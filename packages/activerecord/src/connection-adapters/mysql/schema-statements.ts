/**
 * MySQL schema statements — MySQL-specific DDL operations.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements (module)
 */

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
}
