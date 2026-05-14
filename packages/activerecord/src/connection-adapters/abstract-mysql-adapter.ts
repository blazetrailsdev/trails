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
import type { AdapterName, ExplainOption } from "../adapter.js";
import { AbstractAdapter, Version } from "./abstract-adapter.js";
import type { Column } from "./column.js";
import {
  DatabaseVersionError,
  InvalidForeignKey,
  MismatchedForeignKey,
  NotNullViolation,
  RecordNotUnique,
  SQLWarning,
  StatementInvalid,
  ValueTooLong,
  sqlTypeToMigrationKeyword,
} from "../errors.js";
import { sql as arelSql, type Nodes, Visitors } from "@blazetrails/arel";
import { StatementPool as ConnectionStatementPool } from "./statement-pool.js";
import {
  SchemaCreation as MysqlSchemaCreation,
  type MysqlAddColumnOptions,
} from "./mysql/schema-creation.js";
import {
  quote as mysqlQuote,
  typeCast as mysqlTypeCast,
  castBoundValue as mysqlCastBoundValue,
  quotedBinary as mysqlQuotedBinary,
  unquoteIdentifier as mysqlUnquoteIdentifier,
  columnNameMatcher as mysqlColumnNameMatcher,
  columnNameWithOrderMatcher as mysqlColumnNameWithOrderMatcher,
  quoteIdentifier as mysqlQuoteIdentifier,
  quoteTableName as mysqlQuoteTableName,
  quoteColumnName as mysqlQuoteColumnName,
  quotedTrue as mysqlQuotedTrue,
  quotedFalse as mysqlQuotedFalse,
  unquotedTrue as mysqlUnquotedTrue,
  unquotedFalse as mysqlUnquotedFalse,
} from "./mysql/quoting.js";
import {
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  ColumnDefinition,
  CreateIndexDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
} from "./abstract/schema-definitions.js";
import type { ColumnType, ColumnOptions } from "./abstract/schema-definitions.js";
import { TableDefinition as MysqlTableDefinition } from "./mysql/schema-definitions.js";
import { TypeMap } from "../type/type-map.js";
import {
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  DecimalType,
} from "@blazetrails/activemodel";
import { UnsignedInteger } from "../type/unsigned-integer.js";
import { Date as DateType } from "../type/date.js";
import { DateTime as MysqlDateTimeType } from "./mysql/date-time.js";
import { Time as TimeType } from "../type/time.js";
import { Text as TextType } from "../type/text.js";
import { Json as JsonType } from "../type/json.js";

const NATIVE_DATABASE_TYPES: Record<string, { name: string; limit?: number }> = {
  primary_key: { name: "bigint auto_increment PRIMARY KEY" },
  string: { name: "varchar", limit: 255 },
  text: { name: "text" },
  integer: { name: "int" },
  bigint: { name: "bigint" },
  float: { name: "float", limit: 24 },
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
const ER_CANNOT_ADD_FOREIGN = 1215;
const ER_CANNOT_CREATE_TABLE = 1005;
const ER_FK_INCOMPATIBLE_COLUMNS = 3780;
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

// Function defaults emitted without DEFAULT_GENERATED in Extra (e.g. CURRENT_TIMESTAMP on
// datetime columns). Used by renameColumnForAlter to emit them unquoted in the CHANGE clause.
const RENAME_FUNC_DEFAULT_RE =
  /^(CURRENT_TIMESTAMP(\([0-6]?\))?|NOW(\([0-6]?\))?|CURRENT_DATE|CURRENT_TIME(\([0-6]?\))?|UUID\(\))$/i;

// eslint-disable-next-line no-control-regex
const QUOTE_STRING_RE = /['\\\x00\n\r\x1a]/g;
const QUOTE_STRING_MAP: Record<string, string> = {
  "'": "\\'",
  "\\": "\\\\",
  "\0": "\\0",
  "\n": "\\n",
  "\r": "\\r",
  "\x1a": "\\Z",
};

export class AbstractMysqlAdapter extends AbstractAdapter {
  static readonly Version = Version;

  /**
   * Behaviour when MySQL emits a warning. Mirrors `ActiveRecord.db_warnings_action`.
   * One of "ignore" | "log" | "raise" | "report" | (warning) => void.
   */
  static dbWarningsAction: "ignore" | "log" | "raise" | "report" | ((w: SQLWarning) => void) =
    "ignore";

  /** Allow-list of warning messages or codes to skip. Mirrors `ActiveRecord.db_warnings_ignore`. */
  static dbWarningsIgnore: (string | RegExp)[] = [];

  /**
   * Return Column objects for a table. Concrete adapters (Mysql2Adapter,
   * TrilogyAdapter) override this. The default throws so that unimplemented
   * adapters fail loudly if FK enrichment is ever triggered.
   */
  async columns(_tableName: string): Promise<Column[]> {
    throw new Error(`${this.constructor.name} must implement columns()`);
  }

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

  get adapterName(): AdapterName {
    return "mysql";
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

  /**
   * MySQL dialect overrides — backtick identifiers and integer bool
   * coercion. Matches Rails:
   *
   * - `quote_column_name` / `quote_table_name` / `quote_identifier` — backticks
   *   (`mysql/quoting.rb:48-53`).
   * - `unquoted_true` / `unquoted_false` → `1` / `0`
   *   (`mysql/quoting.rb:72-77`).
   *
   * Note on `quotedTrue`/`quotedFalse`: Rails MySQL does NOT override
   * these — it inherits `"TRUE"`/`"FALSE"` from `abstract/quoting.rb:166`.
   * Trails MySQL's per-module standalone returns `"1"`/`"0"` (a
   * pre-existing trails-vs-Rails divergence; not addressed here). We
   * assign them here so `quote(true)` and `quotedTrue()` agree (both
   * `"1"` via the per-module standalone). Without the assignment the
   * adapter would inherit AbstractAdapter#quotedTrue (`"TRUE"`) while
   * `quote()` returns `"1"`, breaking call sites that switch between
   * the two through the Quoting interface.
   */
  override quoteIdentifier = mysqlQuoteIdentifier;
  override quoteTableName = mysqlQuoteTableName;
  override quoteColumnName = mysqlQuoteColumnName;
  override quotedTrue = mysqlQuotedTrue;
  override quotedFalse = mysqlQuotedFalse;
  override unquotedTrue = mysqlUnquotedTrue;
  override unquotedFalse = mysqlUnquotedFalse;

  /** @internal */
  override get arelVisitor(): Visitors.ToSql {
    return new Visitors.MySQL(this);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_table_name_for_assignment
   * (`abstract/quoting.rb:153-155`) — Rails MySQL inherits from
   * abstract. Dispatching `quote_table_name("#{table}.#{attr}")`
   * resolves polymorphically to `MySQL::Quoting#quote_table_name` which
   * splits on `.` and backticks each part. The TS port doesn't get
   * polymorphic dispatch from the abstract standalone (it would call
   * the abstract module's `quoteTableName` and emit double quotes), so
   * we override on the MySQL adapter to route through `this.quoteTableName`.
   */
  override quoteTableNameForAssignment(table: string, attr: string): string {
    return this.quoteTableName(`${table}.${attr}`);
  }

  isMariadb(): boolean {
    return this._mariadb;
  }

  /**
   * Sync accessor for the cached database version. Mirrors the PostgreSQLAdapter
   * pattern: throws a clear error when called before `getDatabaseVersion()` has
   * been awaited. Overrides AbstractAdapter#databaseVersion which throws whenever
   * it sees a Promise return from getDatabaseVersion().
   */
  override get databaseVersion(): Version {
    if (!this._databaseVersion) {
      throw new Error(
        "databaseVersion is not available yet — await getDatabaseVersion() after connecting",
      );
    }
    return this._databaseVersion;
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

  returnValueAfterInsert(column: Column): boolean {
    return this.supportsInsertReturning()
      ? column.isAutoPopulated()
      : column.isAutoIncrementedByDb();
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

  supportsCommentsInCreate(): boolean {
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
    const rows = await this.schemaQuery(
      `SELECT table_comment FROM information_schema.tables` +
        ` WHERE table_schema = database() AND table_name = ${this.quote(tableName)}`,
    );
    const val = rows[0]?.["table_comment"] as string | null | undefined;
    return val || null;
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

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    await this.getDatabaseVersion();
    this.schemaStatements().validateIndexLengthBang(tableName, newName);
    if (!this.supportsRenameIndex()) {
      throw new Error(
        "renameIndex requires MySQL >= 5.7.6 or MariaDB >= 10.5.2; upgrade your server to use this feature",
      );
    }
    await this._execMutation(
      `ALTER TABLE ${this.quoteTableName(tableName)} RENAME INDEX ` +
        `${this.quoteIdentifier(oldName)} TO ${this.quoteIdentifier(newName)}`,
    );
  }

  /**
   * Execute a DDL/DML statement on the concrete adapter.
   * AbstractMysqlAdapter itself does not hold a connection; this delegates to
   * the concrete subclass (Mysql2Adapter, TrilogyAdapter) which implements
   * executeMutation on DatabaseAdapter.
   * @internal
   */
  protected async _execMutation(sql: string): Promise<void> {
    const exec = (this as unknown as { executeMutation?: (sql: string) => Promise<number> })
      .executeMutation;
    if (typeof exec !== "function") {
      throw new Error(
        `${this.constructor.name} must implement executeMutation() to use DDL helpers`,
      );
    }
    await exec.call(this, sql);
  }

  /**
   * Mirrors: AbstractMysqlAdapter#change_column_default
   *   execute "ALTER TABLE #{quote_table_name(table_name)}
   *            #{change_column_default_for_alter(table_name, column_name, default_or_changes)}"
   */
  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    const fragment = await this.changeColumnDefaultForAlter(
      tableName,
      columnName,
      defaultOrChanges,
    );
    await this._execMutation(`ALTER TABLE ${this.quoteTableName(tableName)} ${fragment}`);
  }

  /**
   * MySQL routes the abstract base's `change_column_default_for_alter` through
   * `build_change_column_default_definition` + schema_creation, so the
   * dumper-friendly visitor handles `DROP DEFAULT` vs `SET DEFAULT <expr>`.
   *
   *   def change_column_default_for_alter(table_name, column_name, default_or_changes)
   *     cd = build_change_column_default_definition(table_name, column_name, default_or_changes)
   *     schema_creation.accept(cd)
   *   end
   *
   * @internal
   */
  async changeColumnDefaultForAlter(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<string> {
    const cd = await this.buildChangeColumnDefaultDefinition(
      tableName,
      columnName,
      defaultOrChanges,
    );
    return new MysqlSchemaCreation().accept(cd);
  }

  /**
   * Mirrors: AbstractMysqlAdapter#build_change_column_default_definition.
   *
   *   column = column_for(table_name, column_name)
   *   return unless column
   *   default = extract_new_default_value(default_or_changes)
   *   ChangeColumnDefaultDefinition.new(column, default)
   *
   * Rails' `column_for` itself raises ActiveRecordError when the column is
   * missing (the `return unless column` guard is defensive against an
   * unreachable nil branch), so we let columnFor's throw propagate the
   * same way rather than silently returning null.
   */
  async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition> {
    const column = await this.columnFor(tableName, columnName);
    const extracted = this.schemaStatements().extractNewDefaultValue(defaultOrChanges);
    // Normalize JS-only `undefined` → `null` so the schema-creation
    // visitor's SET branch produces `SET DEFAULT NULL` rather than the
    // bare `SET` that quoteDefaultExpression(undefined) → "" would emit.
    // Rails has no nil/undefined split, so this is TS-specific defense.
    const newDefault = extracted === undefined ? null : extracted;
    // Match the PG adapter's shape: build ColumnDefinition with the
    // semantic type and set sqlType separately so dumper/visitor paths
    // see both. visitChangeColumnDefaultDefinition reads name +
    // options.null, but preserve type metadata for any downstream visitor.
    const colDef = new ColumnDefinition(
      column.name,
      (column.type ?? "string") as ColumnType,
      { null: column.null } as ColumnOptions,
    );
    colDef.sqlType = column.sqlType ?? undefined;
    return new ChangeColumnDefaultDefinition(colDef, newDefault);
  }

  /**
   * Mirrors AbstractMysqlAdapter#change_column_null.
   * Validates `null_`, backfills NULLs from `default_` when flipping to
   * NOT NULL, then routes through change_column with `null:` set.
   */
  async changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void> {
    this.schemaStatements().validateChangeColumnNullArgumentBang(null_);
    if (!null_ && default_ != null) {
      const colId = this.quoteIdentifier(columnName);
      await this._execMutation(
        `UPDATE ${this.quoteTableName(tableName)} SET ${colId}=${this.quote(default_)} WHERE ${colId} IS NULL`,
      );
    }
    await this.changeColumn(tableName, columnName, "", { null: null_ });
  }

  /**
   * Mirrors AbstractMysqlAdapter#change_column_comment.
   * MySQL has no dedicated ALTER COMMENT syntax; mirrors Rails by routing
   * through change_column with the resolved comment.
   */
  async changeColumnComment(
    tableName: string,
    columnName: string,
    // Mirrors Rails: comment is either a plain value (string|nil) or the
    // { from:, to: } change-descriptor hash. Both keys are required for
    // the unwrap branch — `{ to: "x" }` alone falls through as-is in
    // Rails too, so the type explicitly requires both.
    commentOrChanges: string | null | { from: unknown; to: string | null },
  ): Promise<void> {
    const extracted = this.schemaStatements().extractNewCommentValue(commentOrChanges);
    // Normalize JS-only `undefined` → `null` so changeColumn doesn't
    // misinterpret an explicit clear (`{from, to: undefined}` shape) as
    // "no comment key present" and silently keep the existing comment.
    // Rails has no nil/undefined split — defensive normalization, no
    // Rails analogue.
    const comment = extracted === undefined ? null : extracted;
    await this.changeColumn(tableName, columnName, "", { comment });
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const sql = `ALTER TABLE ${this.quoteTableName(tableName)} ${await this.changeColumnForAlter(tableName, columnName, type, options)}`;
    await this._execMutation(sql);
  }

  async buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): Promise<ChangeColumnDefinition> {
    const column = await this.columnFor(tableName, columnName);
    const resolvedType = type || column.sqlType || "";

    const opts = { ...options };

    if (!Object.prototype.hasOwnProperty.call(opts, "default")) {
      opts["default"] = column.defaultFunction ? () => column.defaultFunction : column.default;
    }
    if (!Object.prototype.hasOwnProperty.call(opts, "null")) {
      opts["null"] = column.null;
    }
    if (!Object.prototype.hasOwnProperty.call(opts, "comment")) {
      opts["comment"] = column.comment ?? undefined;
    }

    if (opts["collation"] === null) {
      delete opts["collation"];
    } else if (
      !Object.prototype.hasOwnProperty.call(opts, "collation") &&
      this.isTextType(resolvedType)
    ) {
      opts["collation"] = column.collation ?? undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(opts, "autoIncrement")) {
      opts["autoIncrement"] = (column as any).autoIncrement ?? false;
    }

    const td = new MysqlTableDefinition(tableName, { id: false });
    const colDef = td.newColumnDefinition(column.name, resolvedType as any, opts as any);
    return new ChangeColumnDefinition(colDef, column.name);
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
    const ss = this.schemaStatements();
    const [idx, algorithmClause, ifNotExists] = ss.addIndexOptions(tableName, columnName, options);
    if (ifNotExists && (await ss.indexExists(tableName, idx.columns, { name: idx.name }))) {
      return;
    }
    const createDef = new CreateIndexDefinition(idx, false, algorithmClause);
    await this._execMutation(new MysqlSchemaCreation().accept(createDef));
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
    if (comment) return `${sql} COMMENT ${this.quote(comment)}`;
    return sql;
  }

  /** @internal Mirrors: AbstractMysqlAdapter#text_type? */
  isTextType(type: string): boolean {
    const t = this.nativeTypeMap.lookup(type.toLowerCase().trim());
    return t instanceof StringType || t instanceof TextType;
  }

  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
    return arelSql("CURRENT_TIMESTAMP(6)");
  }

  castBoundValue(value: unknown): unknown {
    return mysqlCastBoundValue(value);
  }

  quotedBinary(value: unknown): string {
    return mysqlQuotedBinary(value as Buffer | Uint8Array | string);
  }

  unquoteIdentifier(identifier: string | null | undefined): string | null {
    return mysqlUnquoteIdentifier(identifier);
  }

  static columnNameMatcher(): RegExp {
    return mysqlColumnNameMatcher();
  }

  static columnNameWithOrderMatcher(): RegExp {
    return mysqlColumnNameWithOrderMatcher();
  }

  static quoteColumnName(name: string): string {
    return mysqlQuoteColumnName(name);
  }

  static quoteTableName(name: string): string {
    return mysqlQuoteTableName(name);
  }

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    void tableName;
    return [];
  }

  protected _mysqlFkAction(
    rule: string | null | undefined,
  ): "cascade" | "nullify" | "restrict" | undefined {
    switch ((rule ?? "").toUpperCase()) {
      case "CASCADE":
        return "cascade";
      case "SET NULL":
        return "nullify";
      case "RESTRICT":
        return "restrict";
      default:
        return undefined;
    }
  }

  async checkConstraints(tableName: string): Promise<unknown[]> {
    void tableName;
    return [];
  }

  async tableOptions(tableName: string): Promise<Record<string, string>> {
    const createInfo = await this.createTableInfo(tableName);
    if (!createInfo) return {};
    // Check only the options tail (after column defs) so per-column COMMENT clauses
    // don't trigger an extra tableComment() round-trip.
    const tail = createInfo.replace(/[\s\S]*\n\) ?/, "");
    const comment = /COMMENT='/.test(tail) ? await this.tableComment(tableName) : null;
    return parseTableOptions(createInfo, comment);
  }

  /**
   * Query a MySQL session variable by name.
   * Mirrors: AbstractMysqlAdapter#show_variable — `SELECT @@name` with logging name
   * "SCHEMA". Returns null for unknown variables (Rails rescues StatementInvalid).
   * The identifier is validated against MySQL variable-name characters before interpolation.
   */
  async showVariable(name: string): Promise<string | null> {
    if (!/^\w+$/.test(name)) return null;
    try {
      const rows = await this.schemaQuery(`SELECT @@${name}`);
      if (rows.length === 0) return null;
      const row = rows[0];
      const val = row[Object.keys(row)[0]];
      return val == null ? null : String(val);
    } catch (e) {
      // Mirrors Rails: rescue ActiveRecord::StatementInvalid — unknown variables
      // throw a SQL error which we translate to StatementInvalid. Re-raise
      // anything else (connection failures, protocol errors) so callers see outages.
      if (e instanceof StatementInvalid) return null;
      throw e;
    }
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

  /** @internal */
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

  /**
   * Escape-only string quoting per the Quoting interface contract
   * (`abstract/quoting-interface.ts`). Mirrors Rails MySQL
   * `quote_string` (`abstract_mysql_adapter.rb`): backslash-escapes
   * `'` and the control chars MySQL's wire protocol requires (`\0 \n
   * \r \Z \\`). Distinct from `quote()`, which wraps with surrounding
   * `'...'` for SQL-literal contexts.
   */
  override quoteString(s: string): string {
    return s.replace(QUOTE_STRING_RE, (ch) => QUOTE_STRING_MAP[ch] ?? ch);
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

  static buildTypeMap(
    this: typeof AbstractMysqlAdapter,
    options: { emulateBooleans?: boolean } = {},
  ): TypeMap {
    const map = new TypeMap();
    this.initializeTypeMap(map);
    if (options.emulateBooleans) {
      map.registerType(/^tinyint\(1\)/i, undefined, () => new BooleanType());
    }
    return map;
  }

  private _typeMap: TypeMap | null = null;
  private _emulateBooleans = true;

  get emulateBooleans(): boolean {
    return this._emulateBooleans;
  }

  set emulateBooleans(value: boolean) {
    this._emulateBooleans = value;
    this._typeMap = null; // invalidate cache
  }

  get nativeTypeMap(): TypeMap {
    if (!this._typeMap) {
      this._typeMap = (this.constructor as typeof AbstractMysqlAdapter).buildTypeMap({
        emulateBooleans: this._emulateBooleans,
      });
    }
    return this._typeMap;
  }

  lookupCastType(sqlType: string): import("@blazetrails/activemodel").Type {
    return this.nativeTypeMap.lookup(sqlType.toLowerCase().trim());
  }

  lookupCastTypeFromColumn(column: {
    sqlType?: string | null;
  }): import("@blazetrails/activemodel").Type | null {
    const sqlType = column.sqlType?.trim();
    if (!sqlType) return null;
    return this.lookupCastType(sqlType);
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
   * @internal
   * Build a MismatchedForeignKey from a MySQL FK constraint error.
   * Parses the FK SQL to identify the mismatched columns, then looks up
   * the referenced column's type to produce a helpful suggestion.
   *
   * Mirrors: AbstractMysqlAdapter#mismatched_foreign_key (abstract_mysql_adapter.rb:1001)
   */
  protected mismatchedForeignKey(
    message: string,
    sql: string,
    binds: unknown[],
    cause: unknown,
  ): MismatchedForeignKey {
    const details = this.mismatchedForeignKeyDetails(message, sql);
    return new MismatchedForeignKey({ message, sql, binds, cause, ...details });
  }

  /**
   * @internal
   * Parse a CREATE TABLE / ALTER TABLE SQL statement to extract the FK
   * details needed for a helpful MismatchedForeignKey error message.
   *
   * Mirrors: AbstractMysqlAdapter#mismatched_foreign_key_details (abstract_mysql_adapter.rb:978)
   */
  protected mismatchedForeignKeyDetails(
    message: string,
    sql: string,
  ): Partial<ConstructorParameters<typeof MismatchedForeignKey>[0]> {
    // Extract the referencing column name from MySQL's error message when
    // available (MySQL 8+ includes it: "Referencing column 'x' and referenced")
    const fkFromMsg = /Referencing column '(\w+)' and referenced/i.exec(message)?.[1];
    const fkPat = fkFromMsg ?? "\\w+";

    const match = new RegExp(
      String.raw`(?:CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+)(?:\`?\w+\`?\.)?` +
        String.raw`\`?(?<table>\w+)\`?.+?` +
        String.raw`FOREIGN\s+KEY\s*\(\`?(?<foreign_key>${fkPat})\`?\)\s*` +
        String.raw`REFERENCES\s*\`?(?<target_table>\w+)\`?\s*\(\`?(?<primary_key>\w+)\`?\)`,
      "ims",
    ).exec(sql);

    if (!match?.groups) return {};

    const {
      table,
      foreign_key: foreignKey,
      target_table: targetTable,
      primary_key: primaryKey,
    } = match.groups;

    // Return the parsed names; _enrichMismatchedForeignKey does the async
    // column type lookup so the full human-readable message can be built.
    return { table, foreignKey, targetTable, primaryKey };
  }

  /**
   * Async enrichment for MismatchedForeignKey errors — looks up the
   * referenced column's SQL type and rebuilds the error with a full
   * human-readable message including the column type suggestion.
   *
   * Called after `_translateException` when a MismatchedForeignKey without
   * type info is returned. Returns the original error if enrichment fails.
   */
  protected async _enrichMismatchedForeignKey(
    err: MismatchedForeignKey,
  ): Promise<MismatchedForeignKey> {
    const { table, foreignKey, targetTable, primaryKey } = err.fkDetails;
    if (!targetTable || !primaryKey || err.fkDetails.primaryKeySqlType) return err;

    try {
      const cols = await this.columns(targetTable);
      const col = cols.find((c) => c.name === primaryKey);
      if (!col) return err;

      const sqlType = col.sqlTypeMetadata?.sqlType ?? col.sqlTypeMetadata?.type ?? "";
      const primaryKeyType = sqlTypeToMigrationKeyword(sqlType);

      return new MismatchedForeignKey({
        message: err.cause instanceof Error ? err.cause.message : undefined,
        sql: err.sql ?? undefined,
        binds: err.binds ?? undefined,
        cause: err.cause,
        table,
        foreignKey,
        targetTable,
        primaryKey,
        primaryKeySqlType: sqlType,
        primaryKeyType,
      });
    } catch {
      return err;
    }
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
      case ER_CANNOT_ADD_FOREIGN:
      case ER_FK_INCOMPATIBLE_COLUMNS:
        return this.mismatchedForeignKey(msg, sql, binds, cause);
      case ER_CANNOT_CREATE_TABLE:
        if (msg.includes("errno: 150") || msg.includes("errno 150")) {
          return this.mismatchedForeignKey(msg, sql, binds, cause);
        }
        return new StatementInvalid(msg, { sql, binds, cause });
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

  /** @internal */
  translateException(exception: unknown, opts: { sql: string; binds: unknown[] }): Error {
    return this._translateException(exception, opts.sql, opts.binds);
  }

  /** @internal */
  protected stripWhitespaceCharacters(expression: string): string {
    return expression.replace(/\\n/g, "").replace(/x0A/g, "").replace(/\s+/g, " ").trim();
  }

  /** @internal */
  override extendedTypeMapKey(): { defaultTimezone?: string; emulateBooleans: boolean } | null {
    // Mirrors Rails AbstractMysqlAdapter#extended_type_map_key (lines 762–768):
    // pair defaultTimezone with emulateBooleans when set; otherwise fall
    // back to the booleans-only key.
    const tz = this._config.defaultTimezone;
    if (typeof tz === "string") {
      return { defaultTimezone: tz, emulateBooleans: this._emulateBooleans };
    }
    if (this._emulateBooleans) return { emulateBooleans: true };
    return null;
  }

  /** @internal */
  protected async handleWarnings(sql: string): Promise<void> {
    await this._handleWarnings(sql);
  }

  /** @internal */
  protected _handleWarnings(_sql: string): Promise<void> {
    return Promise.resolve();
  }

  /** @internal Mirrors: AbstractMysqlAdapter#warning_ignored? */
  override isWarningIgnored(warning: { level?: string; [k: string]: unknown }): boolean {
    if (warning.level === "Note") return true;
    return super.isWarningIgnored(warning);
  }

  /** @internal */
  supportsInsertRawAliasSyntax(): boolean {
    if (this._mariadb) return false;
    return this._databaseVersion?.gte("8.0.19") === true;
  }

  /** @internal */
  supportsRenameIndex(): boolean {
    if (this._mariadb) return this._databaseVersion?.gte("10.5.2") === true;
    return this._databaseVersion?.gte("5.7.6") === true;
  }

  /** @internal */
  supportsRenameColumn(): boolean {
    if (this._mariadb) return this._databaseVersion?.gte("10.5.2") === true;
    return this._databaseVersion?.gte("8.0.3") === true;
  }

  /**
   * Fetch the raw version string from the MySQL server (e.g. "8.0.28-ubuntu").
   * Concrete adapters (Mysql2Adapter, TrilogyAdapter) override this to query
   * the live connection. Base implementation throws — callers must call
   * `getDatabaseVersion()` only after a subclass has wired this.
   * @internal
   */
  async getFullVersion(): Promise<string> {
    throw new Error(`${this.constructor.name} must implement getFullVersion()`);
  }

  /**
   * Parse the server version from the full version string and return it.
   * Caches the result in `_databaseVersion` so the sync `databaseVersion` getter
   * works after this method has been awaited once.
   *
   * Mirrors: AbstractMysqlAdapter#get_database_version — calls get_full_version,
   * strips MariaDB prefix via version_string, returns Version.
   */
  override async getDatabaseVersion(): Promise<Version> {
    if (this._databaseVersion) return this._databaseVersion;
    const fullVersion = await this.getFullVersion();
    // getFullVersion() may have set _databaseVersion as a side effect
    // (e.g. Mysql2Adapter#getFullVersion populates it while fetching); re-check
    // to avoid double-parsing the version string in those subclasses.
    if (this._databaseVersion) return this._databaseVersion;
    const version = new Version(this.versionString(fullVersion));
    this._databaseVersion = version;
    return version;
  }

  /** @internal */
  protected versionString(fullVersionString: string | null | undefined): string {
    if (fullVersionString == null) {
      throw new DatabaseVersionError("Unable to parse MySQL version from nil");
    }
    if (fullVersionString.length === 0) {
      throw new DatabaseVersionError(`Unable to parse MySQL version from ""`);
    }
    const matches = fullVersionString.match(/^(?:5\.5\.5-)?(\d+\.\d+\.\d+)/);
    if (matches) return matches[1];
    throw new DatabaseVersionError(
      `Unable to parse MySQL version from ${JSON.stringify(fullVersionString)}`,
    );
  }

  /** @internal */
  static override initializeTypeMap(this: typeof AbstractMysqlAdapter, m: TypeMap): void {
    // Base types (mirrors AbstractAdapter#initialize_type_map via super)
    m.registerType(/^boolean/i, undefined, () => new BooleanType());
    m.registerType(/^char/i, undefined, () => new StringType());
    m.registerType(/^varchar/i, undefined, () => new StringType());
    m.registerType(/^enum/i, undefined, () => new StringType());
    m.registerType(/^set/i, undefined, () => new StringType());
    m.registerType(/^binary/i, undefined, () => new BinaryType());
    m.registerType(/^varbinary/i, undefined, () => new BinaryType());
    m.registerType(/^date$/i, new DateType());
    m.registerType(/^time\b/i, undefined, () => new TimeType());
    m.registerType(/^datetime/i, undefined, () => new MysqlDateTimeType());
    m.registerType(/decimal/i, undefined, () => new DecimalType());
    m.registerType(/numeric/i, undefined, () => new DecimalType());
    m.registerType("json", new JsonType());

    // MySQL-specific overrides (mirrors MySQL's initialize_type_map additions)
    m.registerType(/tinytext/i, undefined, () => new TextType());
    m.registerType(/tinyblob/i, undefined, () => new BinaryType());
    m.registerType(/text/i, undefined, () => new TextType());
    m.registerType(/blob/i, undefined, () => new BinaryType());
    m.registerType(/mediumtext/i, undefined, () => new TextType());
    m.registerType(/mediumblob/i, undefined, () => new BinaryType());
    m.registerType(/longtext/i, undefined, () => new TextType());
    m.registerType(/longblob/i, undefined, () => new BinaryType());
    m.registerType(/^float/i, undefined, () => new FloatType({ limit: 24 }));
    m.registerType(/^double/i, undefined, () => new FloatType({ limit: 53 }));
    this.registerIntegerType(m, /^bigint/i, { limit: 8 });
    this.registerIntegerType(m, /^int/i, { limit: 4 });
    this.registerIntegerType(m, /^mediumint/i, { limit: 3 });
    this.registerIntegerType(m, /^smallint/i, { limit: 2 });
    this.registerIntegerType(m, /^tinyint/i, { limit: 1 });
    m.registerType(/^year/i, undefined, () => new IntegerType());
    m.registerType(/^bit/i, undefined, () => new BinaryType());
    m.registerType(/^timestamp/i, undefined, () => new MysqlDateTimeType());
  }

  /** @internal */
  protected static registerIntegerType(
    mapping: TypeMap,
    key: RegExp | string,
    options: { limit: number },
  ): void {
    mapping.registerType(key, undefined, (sqlType: string) => {
      if (/\bunsigned\b/i.test(sqlType)) return new UnsignedInteger(options);
      return new IntegerType(options);
    });
  }

  /** @internal */
  async changeColumnForAlter(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): Promise<string> {
    const cd = await this.buildChangeColumnDefinition(tableName, columnName, type, options);
    return new MysqlSchemaCreation().accept(cd);
  }

  /** @internal */
  async renameColumnForAlter(
    tableName: string,
    columnName: string,
    newColumnName: string,
  ): Promise<string> {
    // Ensure version is cached before branching — supportsRenameColumn() returns false when
    // _databaseVersion is unset, so we'd always fall through to the CHANGE path on uninitialized
    // connections. getDatabaseVersion() memoizes after the first DB round-trip.
    await this.getDatabaseVersion();
    if (this.supportsRenameColumn()) {
      return `RENAME COLUMN ${this.quoteIdentifier(columnName)} TO ${this.quoteIdentifier(newColumnName)}`;
    }
    // Fallback for MySQL <8.0.3 / MariaDB <10.5.2: mirrors Rails' rename_column_for_alter fallback.
    // columnDefinitions (SHOW FULL FIELDS) fires a "SCHEMA" notification and returns the full
    // column definition including Collation, Extra (auto_increment), and Comment — more complete
    // than SHOW COLUMNS which omits those fields.
    const cols = await this.columnDefinitions(tableName);
    const col = cols.find((c) => (c["Field"] as string) === columnName);
    if (!col) throw new Error(`Column not found: ${columnName} in ${tableName}`);
    // Guard against silently dropping Extra attributes we cannot reconstruct (e.g. generated
    // columns). Allowed values: AUTO_INCREMENT (via ColumnOptions.autoIncrement), ON UPDATE <expr>
    // (via MysqlAddColumnOptions.onUpdate, including the MySQL 8 compound form
    // "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"), and DEFAULT_GENERATED alone (function
    // default — reconstructed via RENAME_FUNC_DEFAULT_RE / paren-wrap lambda in colDefault below).
    // Anything else triggers an explicit throw so callers know to upgrade MySQL.
    const extraRaw = ((col["Extra"] as string | undefined) ?? "").trim();
    const extra = extraRaw.toLowerCase();
    const onUpdateMatch = extraRaw.match(/on update (.+)$/i);
    if (extra && extra !== "auto_increment" && extra !== "default_generated" && !onUpdateMatch) {
      throw new Error(
        `renameColumnForAlter fallback: cannot safely CHANGE column "${columnName}" in table "${tableName}" ` +
          `— Extra="${col["Extra"]}" is not preserved by this path. ` +
          `Upgrade to MySQL ≥8.0.3 or MariaDB ≥10.5.2 to use RENAME COLUMN instead.`,
      );
    }
    const rawDefault = col["Default"] !== null ? (col["Default"] as string) : undefined;
    // SHOW FULL FIELDS returns function defaults as plain strings (e.g. "CURRENT_TIMESTAMP", "NOW()").
    // Rails' column.default is nil for function defaults; pass as a lambda so
    // quoteDefaultExpression emits it unquoted: DEFAULT NOW(), not DEFAULT 'NOW()'.
    // Mirrors newColumnFromField: CURRENT_TIMESTAMP datetime cols and DEFAULT_GENERATED cols
    // always go through the function-default path; everything else only when RENAME_FUNC_DEFAULT_RE matches.
    // RENAME_FUNC_DEFAULT_RE only applies to the non-DEFAULT_GENERATED path (e.g. CURRENT_TIMESTAMP
    // on datetime columns, which MySQL emits without DEFAULT_GENERATED in Extra).
    let colDefault: (() => string) | string | undefined;
    if (typeof rawDefault === "string") {
      if (extra === "default_generated") {
        // Mirrors newColumnFromField (mysql/schema-statements.ts): DEFAULT_GENERATED expressions
        // must be wrapped in parens so MySQL accepts them in ALTER TABLE … CHANGE.
        const expr = rawDefault.startsWith("(") ? rawDefault : `(${rawDefault})`;
        colDefault = () => expr;
      } else if (RENAME_FUNC_DEFAULT_RE.test(rawDefault)) {
        // Well-known keyword defaults on non-DEFAULT_GENERATED columns (e.g. CURRENT_TIMESTAMP
        // on datetime): emit as-is, no parens.
        colDefault = () => rawDefault;
      } else {
        colDefault = rawDefault;
      }
    } else {
      colDefault = rawDefault;
    }
    const colOpts: MysqlAddColumnOptions = {
      // SHOW FULL FIELDS returns NULL for Default both when there is no default and when
      // DEFAULT NULL. Treat null as "no explicit default" (undefined) to avoid emitting
      // DEFAULT NULL on NOT NULL columns — mirrors Rails column_for + new_column_definition.
      default: colDefault,
      null: (col["Null"] as string) === "YES",
      collation: (col["Collation"] as string | undefined) || undefined,
      comment: (col["Comment"] as string | undefined) || undefined,
      autoIncrement: extra === "auto_increment" || undefined,
      onUpdate: onUpdateMatch ? onUpdateMatch[1] : undefined,
    };
    const colDef = new ColumnDefinition(newColumnName, col["Type"] as string, colOpts);
    const cd = new ChangeColumnDefinition(colDef, columnName);
    return new MysqlSchemaCreation().accept(cd);
  }

  /** @internal */
  addIndexForAlter(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): string {
    const columnNames = Array.isArray(columnName) ? columnName : [columnName];
    const indexName =
      (options.name as string | undefined) ?? `index_${tableName}_on_${columnNames.join("_and_")}`;
    const algorithmKey = (options.algorithm as string | undefined)?.toLowerCase();
    let algorithmSql: string | undefined;
    if (algorithmKey) {
      const algorithms = this.indexAlgorithms() as Record<string, string>;
      if (!(algorithmKey in algorithms)) {
        const valid = Object.keys(algorithms);
        throw new Error(
          `Algorithm must be one of the following: ${valid.map((a) => `'${a}'`).join(", ")}`,
        );
      }
      // "default" maps to "ALGORITHM = DEFAULT" in the table but means no algorithm clause
      algorithmSql = algorithmKey === "default" ? undefined : algorithms[algorithmKey];
    }
    const comment = options.comment as string | undefined;
    const idx = new IndexDefinition(tableName, indexName, !!options.unique, columnNames, {
      where: options.where as string | undefined,
      using: options.using as string | undefined,
      type: options.type as string | undefined,
      lengths: (options.length ?? {}) as Record<string, number>,
      orders: (options.order ?? {}) as Record<string, string>,
      include: options.include as string[] | undefined,
      comment,
    });
    // Mirrors visit_IndexDefinition(o, create=false): no ON clause, no CREATE prefix.
    // Lengths applied per MySQL's add_index_length: col(N) for prefix indexes.
    // Comment appended via addSqlCommentBang pattern. Algorithm with ", " separator.
    const lengths = idx.lengths as Record<string, number> | number | undefined;
    const indexType = idx.type?.toUpperCase() ?? (idx.unique ? "UNIQUE" : undefined);
    const parts: string[] = [];
    if (indexType) parts.push(indexType);
    parts.push("INDEX");
    parts.push(this.quoteIdentifier(idx.name));
    if (idx.using) parts.push(`USING ${idx.using}`);
    const quotedCols = columnNames
      .map((c) => {
        const len =
          typeof lengths === "number"
            ? lengths
            : typeof lengths === "object"
              ? lengths[c]
              : undefined;
        return len ? `${this.quoteColumnName(c)}(${len})` : this.quoteColumnName(c);
      })
      .join(", ");
    parts.push(`(${quotedCols})`);
    let idxSql = parts.join(" ");
    if (comment) idxSql += ` COMMENT ${this.quote(comment)}`;
    return algorithmSql ? `ADD ${idxSql}, ${algorithmSql}` : `ADD ${idxSql}`;
  }

  /** @internal */
  removeIndexForAlter(
    tableName: string,
    columnName?: string | string[],
    options: Record<string, unknown> = {},
  ): string {
    const indexName =
      (options.name as string | undefined) ??
      (columnName
        ? `index_${tableName}_on_${Array.isArray(columnName) ? columnName.join("_and_") : columnName}`
        : undefined);
    if (!indexName) throw new Error("removeIndexForAlter: no name or column provided");
    return `DROP INDEX ${this.quoteColumnName(indexName)}`;
  }

  /** @internal */
  async columnDefinitions(tableName: string): Promise<Record<string, unknown>[]> {
    return this.schemaQuery(`SHOW FULL FIELDS FROM ${this.quoteTableName(tableName)}`);
  }

  /** @internal */
  async createTableInfo(tableName: string): Promise<string | null> {
    const rows = await this.schemaQuery(`SHOW CREATE TABLE ${this.quoteTableName(tableName)}`);
    return (rows[0]?.["Create Table"] as string | null | undefined) ?? null;
  }

  /** @internal */
  buildStatementPool(): StatementPool {
    return new StatementPool(this.statementLimit);
  }

  /** @internal */
  protected extractPrecision(sqlType: string): number | null {
    const match = /\((\d+)(?:,\d+)?\)/.exec(sqlType);
    const parsed = match ? parseInt(match[1], 10) : null;
    if (/^(?:date)?time(?:stamp)?\b/i.test(sqlType)) {
      return parsed ?? 0;
    }
    return parsed;
  }
}

/**
 * Parse the trailing table-options string from `SHOW CREATE TABLE` output.
 * Exported for unit testing. Mirrors Rails AbstractMysqlAdapter#table_options.
 *
 * @param createInfo - Raw output of `SHOW CREATE TABLE`
 * @param tableComment - Pre-fetched table comment (pass null if no COMMENT= in createInfo)
 * @internal
 */
export function parseTableOptions(
  createInfo: string,
  tableComment: string | null,
): Record<string, string> {
  // Strip column definitions — everything up to and including the closing `)`.
  // Also strip MySQL partition hints (`/*!50100 ... */` appended after options).
  // Mirrors Rails: .sub(/\A.*\n\) ?/m, "").sub(/\n\/\*!.*\*\/\n\z/m, "").strip
  let raw = createInfo
    .replace(/[\s\S]*\n\) ?/, "")
    .replace(/\n\/\*![\s\S]*\*\/\n?$/, "")
    .trim();
  if (!raw) return {};

  const opts: Record<string, string> = {};

  // Extract DEFAULT CHARSET and optional COLLATE, then remove from raw.
  const charsetMatch = / DEFAULT CHARSET=(?<charset>\w+)(?: COLLATE=(?<collation>\w+))?/.exec(raw);
  if (charsetMatch) {
    raw = raw.slice(0, charsetMatch.index) + raw.slice(charsetMatch.index + charsetMatch[0].length);
    opts["charset"] = charsetMatch.groups!["charset"]!;
    if (charsetMatch.groups!["collation"]) opts["collation"] = charsetMatch.groups!["collation"]!;
  }

  // Strip AUTO_INCREMENT — mirrors Rails: sub!(/(ENGINE=\w+)(?: AUTO_INCREMENT=\d+)/, '\1')
  raw = raw.replace(/(ENGINE=\w+)(?: AUTO_INCREMENT=\d+)/, "$1");

  // Strip COMMENT= and use the pre-fetched comment value for accuracy.
  if (/ COMMENT='/.test(raw)) {
    raw = raw.replace(/ COMMENT='.+'/, "");
    if (tableComment != null) opts["comment"] = tableComment;
  }

  if (raw !== "ENGINE=InnoDB") opts["options"] = raw;
  return opts;
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
