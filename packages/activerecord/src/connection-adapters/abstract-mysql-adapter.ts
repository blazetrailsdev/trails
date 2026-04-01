/**
 * Abstract MySQL adapter — base class for MySQL-compatible adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter
 *
 * Provides shared behavior for Mysql2Adapter and TrilogyAdapter.
 * Includes MySQL-specific feature detection, DDL operations,
 * transaction handling, and advisory lock support.
 */

import { AbstractAdapter, Version } from "./abstract-adapter.js";
import { StatementPool as ConnectionStatementPool } from "./statement-pool.js";
import { quoteString as mysqlQuoteString } from "./mysql/quoting.js";

const NATIVE_DATABASE_TYPES: Record<string, { name: string; limit?: number }> = {
  primary_key: { name: "bigint auto_increment PRIMARY KEY" },
  string: { name: "varchar", limit: 255 },
  text: { name: "text" },
  integer: { name: "int" },
  bigint: { name: "bigint" },
  float: { name: "float" },
  decimal: { name: "decimal" },
  datetime: { name: "datetime" },
  timestamp: { name: "timestamp" },
  time: { name: "time" },
  date: { name: "date" },
  binary: { name: "blob" },
  blob: { name: "blob" },
  boolean: { name: "tinyint", limit: 1 },
  json: { name: "json" },
};

const ER_DUP_ENTRY = 1062;
const ER_NOT_NULL_VIOLATION = 1048;
const ER_DO_NOT_HAVE_DEFAULT = 1364;
const ER_NO_REFERENCED_ROW_2 = 1452;
const ER_DATA_TOO_LONG = 1406;
const ER_OUT_OF_RANGE = 1264;
const ER_LOCK_DEADLOCK = 1213;
const ER_LOCK_WAIT_TIMEOUT = 1205;
const ER_QUERY_INTERRUPTED = 1317;
const ER_QUERY_TIMEOUT = 3024;
const ER_TABLE_EXISTS = 1050;

export class AbstractMysqlAdapter extends AbstractAdapter {
  static readonly Version = Version;

  protected _mariadb = false;
  protected _databaseVersion: Version | null = null;

  get adapterName(): string {
    return "Mysql2";
  }

  isMariadb(): boolean {
    return this._mariadb;
  }

  getDatabaseVersion(): Version {
    if (this._databaseVersion) return this._databaseVersion;
    return new Version("0.0.0");
  }

  supportsBulkAlter(): boolean {
    return true;
  }

  supportsIndexSortOrder(): boolean {
    if (this._mariadb) return this._databaseVersion?.gte("10.8") === true;
    return this._databaseVersion?.gte("8.0") === true;
  }

  supportsExpressionIndex(): boolean {
    if (this._mariadb) return this._databaseVersion?.gte("10.6") === true;
    return this._databaseVersion?.gte("8.0.13") === true;
  }

  supportsTransactionIsolation(): boolean {
    return true;
  }

  supportsRestartDbTransaction(): boolean {
    return true;
  }

  supportsExplain(): boolean {
    return true;
  }

  supportsIndexesInCreate(): boolean {
    return true;
  }

  supportsForeignKeys(): boolean {
    return true;
  }

  supportsCheckConstraints(): boolean {
    if (this._mariadb) return this._databaseVersion?.gte("10.2.1") === true;
    return this._databaseVersion?.gte("8.0.16") === true;
  }

  supportsViews(): boolean {
    return true;
  }

  supportsDatetimeWithPrecision(): boolean {
    return true;
  }

  supportsVirtualColumns(): boolean {
    return true;
  }

  supportsOptimizerHints(): boolean {
    if (this._mariadb) return false;
    return this._databaseVersion?.gte("5.7.7") === true;
  }

  supportsCommonTableExpressions(): boolean {
    if (this._mariadb) return this._databaseVersion?.gte("10.2.1") === true;
    return this._databaseVersion?.gte("8.0") === true;
  }

  supportsAdvisoryLocks(): boolean {
    return true;
  }

  supportsInsertOnDuplicateSkip(): boolean {
    return true;
  }

  supportsInsertOnDuplicateUpdate(): boolean {
    return true;
  }

  supportsInsertReturning(): boolean {
    if (this._mariadb) return this._databaseVersion?.gte("10.5.0") === true;
    return false;
  }

  returnValueAfterInsert(_column: string): boolean {
    return false;
  }

  supportsSavepoints(): boolean {
    return true;
  }

  supportsLazyTransactions(): boolean {
    return true;
  }

  supportsJson(): boolean {
    if (this._mariadb) return this._databaseVersion?.gte("10.2.7") === true;
    return this._databaseVersion?.gte("5.7.8") === true;
  }

  supportsComments(): boolean {
    return true;
  }

  supportsDdlTransactions(): boolean {
    return false;
  }

  nativeDatabaseTypes(): Record<string, { name: string; limit?: number }> {
    return NATIVE_DATABASE_TYPES;
  }

  indexAlgorithms(): Record<string, string> {
    return {
      default: "ALGORITHM = DEFAULT",
      copy: "ALGORITHM = COPY",
      inplace: "ALGORITHM = INPLACE",
    };
  }

  errorNumber(exception: Error & { errno?: number }): number | null {
    return exception.errno ?? null;
  }

  async getAdvisoryLock(lockName: string, timeout: number = 0): Promise<boolean> {
    void lockName;
    void timeout;
    return false;
  }

  async releaseAdvisoryLock(lockName: string): Promise<boolean> {
    void lockName;
    return false;
  }

  async disableReferentialIntegrity(): Promise<void> {}

  async beginDbTransaction(): Promise<void> {}

  async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    void isolation;
  }

  async commitDbTransaction(): Promise<void> {}

  async execRollbackDbTransaction(): Promise<void> {}

  async execRestartDbTransaction(): Promise<void> {}

  emptyInsertStatementValue(_primaryKey?: string): string {
    return "VALUES ()";
  }

  async recreateDatabase(name: string, options: Record<string, unknown> = {}): Promise<void> {
    void name;
    void options;
  }

  async createDatabase(name: string, options: Record<string, unknown> = {}): Promise<void> {
    void name;
    void options;
  }

  async dropDatabase(name: string): Promise<void> {
    void name;
  }

  async currentDatabase(): Promise<string> {
    return "";
  }

  async charset(): Promise<string> {
    return "";
  }

  async collation(): Promise<string> {
    return "";
  }

  async tableComment(tableName: string): Promise<string | null> {
    void tableName;
    return null;
  }

  async changeTableComment(
    tableName: string,
    commentOrChanges: string | Record<string, string | null>,
  ): Promise<void> {
    void tableName;
    void commentOrChanges;
  }

  async renameTable(tableName: string, newName: string): Promise<void> {
    void tableName;
    void newName;
  }

  async dropTable(..._args: unknown[]): Promise<void> {}

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    void tableName;
    void oldName;
    void newName;
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    void tableName;
    void columnName;
    void defaultOrChanges;
  }

  buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Record<string, unknown> {
    void tableName;
    void columnName;
    void defaultOrChanges;
    return {};
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void> {
    void tableName;
    void columnName;
    void null_;
    void default_;
  }

  async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: string | Record<string, string | null>,
  ): Promise<void> {
    void tableName;
    void columnName;
    void commentOrChanges;
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    void tableName;
    void columnName;
    void type;
    void options;
  }

  buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    void tableName;
    void columnName;
    void type;
    void options;
    return {};
  }

  async renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void> {
    void tableName;
    void columnName;
    void newColumnName;
  }

  async addIndex(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Promise<void> {
    void tableName;
    void columnName;
    void options;
  }

  buildCreateIndexDefinition(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    void tableName;
    void columnName;
    void options;
    return {};
  }

  addSqlComment(sql: string, comment: string): string {
    return `${sql} /* ${comment.replace(/\*\//g, "* /")} */`;
  }

  async foreignKeys(tableName: string): Promise<unknown[]> {
    void tableName;
    return [];
  }

  async checkConstraints(tableName: string): Promise<unknown[]> {
    void tableName;
    return [];
  }

  async tableOptions(tableName: string): Promise<Record<string, string>> {
    void tableName;
    return {};
  }

  async showVariable(name: string): Promise<string | null> {
    void name;
    return null;
  }

  async primaryKeys(tableName: string): Promise<string[]> {
    void tableName;
    return [];
  }

  caseSensitiveComparison(attribute: unknown, value: unknown): unknown {
    void attribute;
    void value;
    return null;
  }

  canPerformCaseInsensitiveComparisonFor(column: { collation?: string | null }): boolean {
    return column.collation != null && column.collation.endsWith("_ci");
  }

  columnsForDistinct(columns: string, orders: string[]): string {
    void orders;
    return columns;
  }

  isStrictMode(): boolean {
    return false;
  }

  isDefaultIndexType(index: { using?: string | null }): boolean {
    return index.using == null || index.using.toUpperCase() === "BTREE";
  }

  buildInsertSql(insert: { skip_duplicates?: boolean; update?: unknown }): string | null {
    if (insert.skip_duplicates) {
      return "INSERT IGNORE INTO";
    }
    if (insert.update) {
      return "INSERT INTO";
    }
    return null;
  }

  checkVersion(): void {}

  quoteString(string: string): string {
    return mysqlQuoteString(string);
  }

  static dbconsole(
    config: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): string[] {
    const args: string[] = ["mysql"];
    if (config.host) args.push(`--host=${config.host}`);
    if (config.port) args.push(`--port=${config.port}`);
    if (config.socket) args.push(`--socket=${config.socket}`);
    if (config.username) args.push(`--user=${config.username}`);
    if (config.password && !options.include_password) args.push("-p");
    else if (config.password) args.push(`--password=${config.password}`);
    if (config.sslCa) args.push(`--ssl-ca=${config.sslCa}`);
    if (config.sslCert) args.push(`--ssl-cert=${config.sslCert}`);
    if (config.sslKey) args.push(`--ssl-key=${config.sslKey}`);
    if (config.database) args.push(config.database as string);
    return args;
  }

  static extendedTypeMap(options: {
    defaultTimezone?: string;
    emulateBooleans: boolean;
  }): Map<string, string> {
    void options;
    return new Map();
  }

  /**
   * Error codes for MySQL-specific exception translation.
   */
  static readonly ER_DUP_ENTRY = ER_DUP_ENTRY;
  static readonly ER_NOT_NULL_VIOLATION = ER_NOT_NULL_VIOLATION;
  static readonly ER_DO_NOT_HAVE_DEFAULT = ER_DO_NOT_HAVE_DEFAULT;
  static readonly ER_NO_REFERENCED_ROW_2 = ER_NO_REFERENCED_ROW_2;
  static readonly ER_DATA_TOO_LONG = ER_DATA_TOO_LONG;
  static readonly ER_OUT_OF_RANGE = ER_OUT_OF_RANGE;
  static readonly ER_LOCK_DEADLOCK = ER_LOCK_DEADLOCK;
  static readonly ER_LOCK_WAIT_TIMEOUT = ER_LOCK_WAIT_TIMEOUT;
  static readonly ER_QUERY_INTERRUPTED = ER_QUERY_INTERRUPTED;
  static readonly ER_QUERY_TIMEOUT = ER_QUERY_TIMEOUT;
  static readonly ER_TABLE_EXISTS = ER_TABLE_EXISTS;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter::StatementPool
 *
 * MySQL-specific statement pool that inherits the base eviction logic
 * from ConnectionAdapters::StatementPool.
 */
// Named to avoid collision with the base StatementPool import — consumers
// can import this under the AbstractMysqlAdapter namespace.
export class StatementPool extends ConnectionStatementPool {}
