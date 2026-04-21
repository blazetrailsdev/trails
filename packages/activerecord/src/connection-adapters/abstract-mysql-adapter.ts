/**
 * Abstract MySQL adapter — base class for MySQL-compatible adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter
 *
 * Provides shared behavior for Mysql2Adapter and TrilogyAdapter.
 * Includes MySQL-specific feature detection, DDL operations,
 * transaction handling, and advisory lock support.
 */

import { inspectExplainOption } from "../adapter.js";
import type { ExplainOption } from "../adapter.js";
import { AbstractAdapter, Version } from "./abstract-adapter.js";
import {
  InvalidForeignKey,
  NotNullViolation,
  RecordNotUnique,
  StatementInvalid,
  ValueTooLong,
} from "../errors.js";
import type { Nodes } from "@blazetrails/arel";
import { StatementPool as ConnectionStatementPool } from "./statement-pool.js";
import {
  quoteString as mysqlQuoteString,
  quote as mysqlQuote,
  typeCast as mysqlTypeCast,
} from "./mysql/quoting.js";

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
const ER_NO_REFERENCED_ROW = 1216;
const ER_ROW_IS_REFERENCED = 1217;
const ER_ROW_IS_REFERENCED_2 = 1451;
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
  // Rails' `statement_limit` database.yml key — max prepared
  // statements cached per session before LRU eviction (default 1000).
  // Mirrors the same surface we expose on PostgreSQLAdapter; driver-
  // specific subclasses (Mysql2Adapter, TrilogyAdapter) decide how to
  // actually wire the per-connection pool.
  protected _statementLimit = 1000;

  /**
   * Maximum prepared statements cached per MySQL connection.
   *
   * Mirrors: `database.yml`'s `statement_limit` — read by Rails as
   * `config[:statement_limit]` in AbstractMysqlAdapter#initialize.
   */
  get statementLimit(): number {
    return this._statementLimit;
  }

  set statementLimit(value: number) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(
        `statementLimit must be a finite non-negative integer; got ${String(value)}`,
      );
    }
    this._statementLimit = value;
    // Driver-specific subclasses override this to resize their active
    // per-connection pool. Base impl is a no-op.
    this._onStatementLimitChanged(value);
  }

  /**
   * Hook for driver-specific subclasses to propagate a statementLimit
   * change to the currently-held connection's StatementPool, if any.
   * Base impl intentionally does nothing.
   */
  protected _onStatementLimitChanged(_value: number): void {}

  get adapterName(): string {
    return "Mysql2";
  }

  /**
   * Quote a value using MySQL-family escape rules (`\0 \n \r \Z \\ ''`
   * via MYSQL_ESCAPE_MAP, booleans as `1/0`, Dates as
   * `'YYYY-MM-DD HH:MM:SS[.microseconds]'`). Defined here so every
   * MySQL-family adapter (Mysql2, Trilogy) inherits MySQL semantics
   * by default without needing to override themselves; without this,
   * Trilogy would fall through to the abstract SQL-92 defaults
   * (booleans → `TRUE/FALSE`, plain `''` string escaping) and
   * diverge from Rails.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting#quote
   */
  override quote(value: unknown): string {
    return mysqlQuote(value);
  }

  /**
   * Cast a value to the primitive form MySQL drivers expect for
   * binds. Same motivation as `quote()` above — inherited by
   * Trilogy so it gets MySQL semantics automatically.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting#type_cast
   */
  override typeCast(value: unknown): unknown {
    return mysqlTypeCast(value);
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

  addSqlCommentBang(sql: string, comment: string): string {
    if (comment) return `${sql} COMMENT ${mysqlQuoteString(comment)}`;
    return sql;
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

  caseSensitiveComparison(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    // TODO: Rails checks column.collation && !column.case_sensitive? and wraps
    // in Arel::Nodes::Bin for case-insensitive collations. Add when schema
    // column introspection supports collation detection.
    return super.caseSensitiveComparison(attribute, value);
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

  /**
   * Boolean MySQL EXPLAIN flags. MySQL 8.0.18+ supports `EXPLAIN
   * ANALYZE`; older versions and MariaDB support at least `EXTENDED`
   * and `PARTITIONS`. Format is handled separately via the
   * `{ format: ... }` hash since it requires a value.
   */
  protected static readonly EXPLAIN_FLAGS = new Set(["analyze", "extended", "partitions"]);

  /**
   * Allowed values for the `format` keyword. MySQL 5.6+ supports
   * `TRADITIONAL` (default) and `JSON`; 8.0.16+ adds `TREE`. Values
   * come from user code, so the allowlist guards the SQL clause.
   */
  protected static readonly EXPLAIN_FORMATS = new Set(["traditional", "json", "tree"]);

  /**
   * Build the printed header prefix used by `Relation#explain` on MySQL
   * (`"EXPLAIN ANALYZE FORMAT=JSON for:"`). Shared by Mysql2 and Trilogy
   * adapters — the clause shape is driver-independent.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements#build_explain_clause
   */
  override buildExplainClause(options: ExplainOption[] = []): string {
    if (options.length === 0) return "EXPLAIN for:";
    return `EXPLAIN ${this._validateExplainOptions(options).join(" ")} for:`;
  }

  protected _validateExplainOptions(options: ExplainOption[]): string[] {
    const ctor = this.constructor as typeof AbstractMysqlAdapter;
    const flags: string[] = [];
    let formatClause: string | undefined;
    for (const o of options) {
      if (typeof o === "string") {
        const key = o.toLowerCase();
        if (!ctor.EXPLAIN_FLAGS.has(key)) {
          throw new Error(`Unknown MySQL EXPLAIN option: ${o}`);
        }
        flags.push(key.toUpperCase());
        continue;
      }
      if (!o || typeof o !== "object" || typeof o.format !== "string") {
        throw new Error(
          `Unknown MySQL EXPLAIN option: ${inspectExplainOption(o)} (expected a string flag or an object with a string 'format')`,
        );
      }
      if (formatClause !== undefined) {
        throw new Error("MySQL EXPLAIN accepts at most one FORMAT option");
      }
      const fmt = o.format.toLowerCase();
      if (!ctor.EXPLAIN_FORMATS.has(fmt)) {
        throw new Error(
          `Unknown MySQL EXPLAIN format: ${o.format}. Allowed: traditional, json, tree.`,
        );
      }
      // MySQL uses `FORMAT=X` (no space) rather than PG's `FORMAT X`.
      // FORMAT must come last in MySQL syntax; flags-first normalization
      // prevents `EXPLAIN FORMAT=JSON ANALYZE ...` (invalid).
      formatClause = `FORMAT=${fmt.toUpperCase()}`;
    }
    return formatClause === undefined ? flags : [...flags, formatClause];
  }

  /**
   * Compose the actual `EXPLAIN ...` SQL clause that prefixes the query —
   * distinct from `buildExplainClause`, which builds the printed header.
   */
  protected _explainStatementClause(options: ExplainOption[]): string {
    if (options.length === 0) return "EXPLAIN";
    return `EXPLAIN ${this._validateExplainOptions(options).join(" ")}`;
  }

  /**
   * Map MySQL/MariaDB driver errors to ActiveRecord exception classes by
   * errno. Matches Rails'
   * `ConnectionAdapters::AbstractMysqlAdapter#translate_exception`.
   */
  protected _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    if (!(e instanceof Error)) return new StatementInvalid(String(e), { sql, binds, cause: e });
    const errno = (e as { errno?: number }).errno;
    const msg = e.message;
    const cause = e;
    switch (errno) {
      case ER_DUP_ENTRY:
        return new RecordNotUnique(msg, { sql, binds, cause });
      case ER_NO_REFERENCED_ROW:
      case ER_ROW_IS_REFERENCED:
      case ER_ROW_IS_REFERENCED_2:
      case ER_NO_REFERENCED_ROW_2:
        return new InvalidForeignKey(msg, { sql, binds, cause });
      case ER_NOT_NULL_VIOLATION:
      case ER_DO_NOT_HAVE_DEFAULT:
        return new NotNullViolation(msg, { sql, binds, cause });
      case ER_DATA_TOO_LONG:
        return new ValueTooLong(msg, { sql, binds, cause });
      default:
        // Driver errors expose a positive MySQL errno and usually a
        // sqlState. Node/system errors (ECONNREFUSED etc.) also carry
        // an `errno`, often negative, so gate on a positive numeric
        // errno to avoid re-tagging network failures as
        // StatementInvalid (which would attach misleading sql/binds).
        return typeof errno === "number" && errno > 0 && e instanceof StatementInvalid === false
          ? new StatementInvalid(msg, { sql, binds, cause })
          : e;
    }
  }
}

/**
 * Shape of a cached MySQL prepared statement. `sql` is the key the
 * mysql2 driver uses for its own internal client-side cache — passing
 * it back to `connection.unprepare(sql)` closes the server-side
 * statement (COM_STMT_CLOSE). `key` is the Rails-style `a<n>` identifier
 * we use only for logging / diagnostics.
 *
 * Mirrors: the Statement struct in Rails'
 * `ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements`.
 */
export interface MysqlPreparedStatement {
  sql: string;
  key: string;
}

/**
 * MySQL-family StatementPool. Adds Rails-parity `nextKey()` on top of
 * the base LRU cache. Driver-specific subclasses (Mysql2Adapter's
 * inline subclass) override `dealloc` to send COM_STMT_CLOSE via
 * `connection.unprepare`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter::StatementPool
 */
// Named to avoid collision with the base StatementPool import — consumers
// can import this under the AbstractMysqlAdapter namespace.
export class StatementPool extends ConnectionStatementPool<MysqlPreparedStatement> {
  private _counter = 0;

  /**
   * Allocate a fresh prepared-statement key. Mirrors Rails' per-pool
   * `@counter += 1` on `AbstractMysqlAdapter::StatementPool`.
   */
  nextKey(): string {
    return `a${++this._counter}`;
  }
}
