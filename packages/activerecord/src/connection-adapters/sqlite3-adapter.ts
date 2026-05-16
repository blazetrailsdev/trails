import type {
  SqliteBinds,
  SqliteConnection,
  SqliteDriver,
  SqliteStatement,
} from "@blazetrails/activesupport/sqlite-adapter";
import { getSqlite } from "@blazetrails/activesupport/sqlite-adapter";
import { Visitors } from "@blazetrails/arel";
import type {
  AdapterName,
  DatabaseAdapter,
  ExplainOption,
  SQLite3AdapterOptions,
} from "../adapter.js";
import { AbstractAdapter, Version } from "./abstract-adapter.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";
import {
  ReadOnlyError,
  StatementInvalid,
  RecordNotUnique,
  InvalidForeignKey,
  NotNullViolation,
  ValueTooLong,
  NoDatabaseError,
  ConnectionNotEstablished,
  DatabaseConnectionError,
  TransactionIsolationError,
} from "../errors.js";
import { TypeMap } from "../type/type-map.js";
import { Date as DateType } from "../type/date.js";
import { DateTime as ARDateTimeType } from "../type/date-time.js";
import { Time as TimeType } from "../type/time.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import type { DateTimeCastResult } from "@blazetrails/activemodel";
import { defaultSqlTimezone } from "./abstract/quoting.js";
import { Text as TextType } from "../type/text.js";
import { Json as JsonType } from "../type/json.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";
import {
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  DecimalType,
} from "@blazetrails/activemodel";
import { getFs, Notifications } from "@blazetrails/activesupport";
import { typeCastedBinds } from "./abstract/database-statements.js";
import { isWriteQuerySql } from "./sql-classification.js";
import {
  quote as sqliteQuote,
  typeCast as sqliteTypeCast,
  // Note: the standalone `quoteString` exported by sqlite3/quoting.ts
  // returns a fully-quoted SQL literal (`'foo'`), not the escape-only
  // form Rails' `quote_string` returns. The instance override below
  // implements escape-only inline; the standalone is kept under an
  // alias here for the few legacy call sites in this file that want
  // the literal form.
  quoteString as sqliteQuoteStringLiteral,
  quoteTableName,
  quoteColumnName,
  quoteIdentifier as sqliteQuoteIdentifier,
  quoteTableNameForAssignment as sqliteQuoteTableNameForAssignment,
  quotedTrue as sqliteQuotedTrue,
  unquotedTrue as sqliteUnquotedTrue,
  quotedFalse as sqliteQuotedFalse,
  unquotedFalse as sqliteUnquotedFalse,
  quotedBinary as sqliteQuotedBinary,
  extractValueFromDefault as sqliteExtractValueFromDefault,
} from "./sqlite3/quoting.js";
import {
  CheckConstraintDefinition,
  ForeignKeyDefinition,
  type AddForeignKeyOptions,
} from "./abstract/schema-definitions.js";
import { Column } from "./column.js";
import { Column as Sqlite3Column } from "./sqlite3/column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import type { SchemaSource } from "../schema-dumper.js";
import { SchemaDumper as Sqlite3SchemaDumper } from "./sqlite3/schema-dumper.js";

/**
 * SQLite-specific DateTime type.
 *
 * better-sqlite3 returns datetime columns as TEXT. The base
 * DateTimeType#cast returns Temporal.PlainDateTime for offset-less datetime
 * strings. This subclass converts any PlainDateTime result to
 * Temporal.Instant so callers get a timezone-aware value.
 *
 * Stored datetime strings are interpreted according to
 * ActiveRecord.default_timezone (defaulting to UTC), matching the timezone
 * selection used when formatting instants for SQLite.
 */
export class SQLiteDateTimeType extends ARDateTimeType {
  override cast(value: unknown): DateTimeCastResult | null {
    const result = super.cast(value);
    if (result instanceof Temporal.PlainDateTime) {
      return result.toZonedDateTime(defaultSqlTimezone()).toInstant();
    }
    return result;
  }
}

/**
 * SQLite adapter — connects ActiveRecord to a real SQLite database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter
 */

function _isSqliteMissingDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  return (
    e.code === "SQLITE_CANTOPEN" ||
    (typeof e.message === "string" && /unable to open database file/i.test(e.message))
  );
}

export class SQLite3Adapter extends AbstractAdapter implements DatabaseAdapter {
  override get adapterName(): AdapterName {
    return "sqlite";
  }

  /** Returns true for raw SQLite driver errors that indicate a missing or unopenable database file (SQLITE_CANTOPEN). */
  isNoDatabaseError(error: unknown): boolean {
    return _isSqliteMissingDbError(error);
  }

  /**
   * When true, new connections inherit `strict: true` unless the caller
   * explicitly passes `strict: false`. Mirrors Rails' class_attribute.
   */
  static strictStringsByDefault: boolean = false;

  static columnNameMatcher(): RegExp {
    // Mirrors Rails SQLite3 column_name_matcher. Uses "..." quoted identifiers
    // (SQLite double-quote escaping: "" inside quotes). Strict 0-or-1 function
    // arg matching Rails \w+\((?:|\g<2>)\) — multi-arg functions are rejected.
    const id = String.raw`(?:\w+|"(?:[^"]|"")*")`;
    const col = String.raw`(?:${id}\.)?${id}`;
    const fn2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
    const fn1 = String.raw`\w+\(\s*(?:\*|${col}|${fn2})?\s*\)`;
    const expr = String.raw`(?:${col}|${fn1})`;
    const aliased = String.raw`${expr}(?:(?:\s+AS)?\s+${id})?`;
    return new RegExp(`^${aliased}(?:\\s*,\\s*${aliased})*$`, "i");
  }

  static columnNameWithOrderMatcher(): RegExp {
    // Mirrors Rails SQLite3 column_name_with_order_matcher. Adds COLLATE and
    // ASC/DESC; includes NULLS FIRST/LAST for reverseOrder() compatibility.
    const id = String.raw`(?:\w+|"(?:[^"]|"")*")`;
    const col = String.raw`(?:${id}\.)?${id}`;
    const fn2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
    const fn1 = String.raw`\w+\(\s*(?:\*|${col}|${fn2})?\s*\)`;
    const expr = String.raw`(?:${col}|${fn1})`;
    const ordered = String.raw`${expr}(?:\s+COLLATE\s+\w+)?(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?`;
    return new RegExp(`^${ordered}(?:\\s*,\\s*${ordered})*$`, "i");
  }

  /** @internal */
  override get arelVisitor(): Visitors.ToSql {
    return new Visitors.SQLite(this);
  }

  private driver!: SqliteConnection;
  override get active(): boolean {
    return this.driver?.isOpen() ?? false;
  }
  private _inTransaction = false;
  private _savepointCounter = 0;
  private _readonly: boolean;
  private _strict: boolean;
  private _preventWrites = false;
  private _nativeTypeMap: TypeMap;
  private _memoryDatabase: boolean;
  private _filename: string;
  // _statementLimit must be declared before _statementPool so buildStatementPool()
  // reads the correct default when the field initializer runs.
  private _statementLimit = 1000;
  private _statementPool = this.buildStatementPool();

  private static _isMemoryFilename(filename: string): boolean {
    if (filename === ":memory:") return true;
    if (!filename.startsWith("file:")) return false;
    if (filename.startsWith("file::memory:")) return true;
    // Parse query string so a path containing the text "mode=memory" isn't
    // misclassified (e.g. file:/tmp/mode=memory.db). Mirrors SQLiteDatabaseTasks.
    const q = filename.indexOf("?");
    if (q === -1) return false;
    return new URLSearchParams(filename.slice(q + 1)).get("mode") === "memory";
  }

  /**
   * Whether this connection was opened with strict-strings mode (DQS disabled).
   * Reflects the resolved value of the `strict` constructor option, which
   * defaults to `SQLite3Adapter.strictStringsByDefault`.
   * @internal
   */
  get strictStrings(): boolean {
    return this._strict;
  }

  /**
   * Maximum prepared statements cached on the single SQLite connection.
   *
   * Mirrors: `database.yml`'s `statement_limit` — read by Rails as
   * `config[:statement_limit]` in `SQLite3Adapter#initialize`.
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
    this._statementPool.setMaxSize(value);
  }

  constructor(filename: string | ":memory:" = ":memory:", options: SQLite3AdapterOptions = {}) {
    super();
    this._config = { ...options };
    this._filename = filename;
    this._memoryDatabase = SQLite3Adapter._isMemoryFilename(filename);
    this._readonly = options.readonly ?? false;
    this._strict = options.strict ?? SQLite3Adapter.strictStringsByDefault;
    (this._config as SQLite3AdapterOptions).strict = this._strict;
    // Rails: `SQLite3Adapter#default_prepared_statements` inherits the
    // abstract adapter's `true`. Mirror that default and let options
    // override per connection.
    this.preparedStatements = options.preparedStatements ?? true;
    // Apply adapter-level options FIRST so invalid values fail before
    // the native driver opens a file handle that would otherwise leak.
    if (options.statementLimit !== undefined) this.statementLimit = options.statementLimit;
    this.connect();
    this.configureConnection();
    this._nativeTypeMap = SQLite3Adapter._buildTypeMap();
  }

  /**
   * Execute a SELECT query and return rows. Wrapped in a
   * `sql.active_record` instrumentation event — mirrors Rails'
   * `AbstractAdapter#log`, so LogSubscriber / ExplainSubscriber /
   * QueryCache / custom subscribers all observe the same query stream.
   */
  async execute(
    sql: string,
    binds: unknown[] = [],
    name: string = "SQL",
  ): Promise<Record<string, unknown>[]> {
    await this.materializeTransactions();

    const payload: Record<string, unknown> = {
      sql,
      name,
      binds,
      type_casted_binds: typeCastedBinds(binds),
      connection: this,
      row_count: 0,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        const stmt = await this._cachedStatement(sql);
        const rows = (await stmt.all(binds as SqliteBinds)) as Record<string, unknown>[];
        payload.row_count = rows.length;
        return rows;
      } catch (e: any) {
        const translated = this._translateException(e, sql, binds);
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      }
    });
  }

  private async _cachedStatement(sql: string): Promise<SqliteStatement> {
    // When preparedStatements is off, skip the pool and prepare per call —
    // matches Rails' `statement_pool` behavior gated on
    // `prepared_statements`. better-sqlite3 still uses its own statement
    // handle internally, but we no longer cache across executes.
    if (!this.preparedStatements) {
      const stmt = await this.driver.prepare(sql);
      this._maybeEnableReadBigInts(sql, stmt);
      return stmt;
    }
    let stmt = this._statementPool.get(sql);
    if (!stmt) {
      stmt = await this.driver.prepare(sql);
      this._maybeEnableReadBigInts(sql, stmt);
      this._statementPool.set(sql, stmt);
    }
    return stmt;
  }

  // Enable readBigInts on row-returning statements that expose bigint-declared
  // columns so the driver returns JS bigint rather than a lossy number.
  // Non-bigint integer columns in the same row also return bigint when enabled —
  // IntegerType.cast handles bigint → number for those.
  // stmt.reader gates out PRAGMA/EXPLAIN and other non-row statements.
  private _maybeEnableReadBigInts(sql: string, stmt: SqliteStatement): void {
    if (isWriteQuerySql(sql) || !stmt.reader) return;
    const cols = stmt.columns();
    if (cols.some((c) => c.type !== null && /bigint/i.test(c.type))) {
      stmt.setReadBigInts(true);
    }
  }

  /**
   * Get or set a PRAGMA value.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#pragma
   */
  async pragma(name: string): Promise<unknown> {
    return await this.driver.pragma(name);
  }

  /**
   * Prevent or allow write operations.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#preventing_writes?
   */
  get preventingWrites(): boolean {
    return this._preventWrites;
  }

  /**
   * Execute a block with writes prevented.
   */
  async withPreventedWrites<R>(fn: () => R | Promise<R>): Promise<R> {
    this._preventWrites = true;
    try {
      return await fn();
    } finally {
      this._preventWrites = false;
    }
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   * Wrapped in a `sql.active_record` notification — see `execute`.
   */
  async executeMutation(sql: string, binds: unknown[] = [], name: string = "SQL"): Promise<number> {
    await this.materializeTransactions();
    if (this._preventWrites) {
      throw new ReadOnlyError("Write query attempted while preventing writes");
    }
    const payload: Record<string, unknown> = {
      sql,
      name,
      binds,
      type_casted_binds: typeCastedBinds(binds),
      connection: this,
      row_count: 0,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        const stmt = await this._cachedStatement(sql);
        const result = await stmt.run(binds as SqliteBinds);
        this.dirtyCurrentTransaction();
        payload.row_count = typeof result.changes === "number" ? result.changes : 0;

        // For INSERT, return the last inserted rowid
        if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
          return Number(result.lastInsertRowid);
        }

        // For UPDATE/DELETE, return affected rows
        return result.changes;
      } catch (e: any) {
        const translated = this._translateException(e, sql, binds);
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      }
    });
  }

  /**
   * Begin a transaction.
   */
  private _previousReadUncommitted: unknown = null;

  // Mirrors: SQLite3::DatabaseStatements#begin_deferred_transaction
  async beginDeferredTransaction(isolation?: string | null): Promise<void> {
    if (isolation) return this._internalBeginTransaction("DEFERRED", isolation);
    await this.driver.exec("BEGIN DEFERRED TRANSACTION");
    this._inTransaction = true;
  }

  // Mirrors: SQLite3::DatabaseStatements#begin_isolated_db_transaction
  async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    return this._internalBeginTransaction("DEFERRED", isolation);
  }

  // Mirrors: SQLite3::DatabaseStatements#internal_begin_transaction
  private async _internalBeginTransaction(mode: string, isolation: string | null): Promise<void> {
    if (isolation) {
      if (isolation !== "read_uncommitted") {
        throw new TransactionIsolationError(
          "SQLite3 only supports the `read_uncommitted` transaction isolation level",
        );
      }
      if (!this.isSharedCache()) {
        throw new TransactionIsolationError(
          "You need to enable the shared-cache mode in SQLite mode before attempting to change the transaction isolation level",
        );
      }
    }
    await this.driver.exec(`BEGIN ${mode} TRANSACTION`);
    this._inTransaction = true;
    if (isolation) {
      const ruStmt = await this.driver.prepare("PRAGMA read_uncommitted");
      const row = (await ruStmt.get()) as { read_uncommitted: number } | undefined;
      this._previousReadUncommitted = row?.read_uncommitted ?? 0;
      await this.driver.exec("PRAGMA read_uncommitted=ON");
    }
  }

  // Mirrors: SQLite3::DatabaseStatements#reset_isolation_level
  async resetIsolationLevel(): Promise<void> {
    if (this._previousReadUncommitted !== null) {
      await this.driver.exec(`PRAGMA read_uncommitted=${this._previousReadUncommitted}`);
      this._previousReadUncommitted = null;
    }
  }

  async beginDbTransaction(): Promise<void> {
    if (!this._inTransaction) {
      await this.driver.exec("BEGIN IMMEDIATE TRANSACTION");
      this._inTransaction = true;
    }
  }

  async beginTransaction(): Promise<void> {
    // Force materialization (_lazy: false) so _inTransaction is set immediately.
    await this._transactionManager.beginTransaction({ _lazy: false });
  }

  /**
   * Commit the current transaction.
   */
  async commitDbTransaction(): Promise<void> {
    await this.driver.exec("COMMIT TRANSACTION");
    this._inTransaction = false;
  }

  async commit(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.commitTransaction();
    }
    return this.commitDbTransaction();
  }

  async rollbackDbTransaction(): Promise<void> {
    try {
      await this.driver.exec("ROLLBACK TRANSACTION");
    } catch (e) {
      // Mirrors Rails: rescue ConnectionNotEstablished, ConnectionFailed.
      // A closed/dropped connection is an implicit rollback; re-throw anything else.
      const translated = this._translateException(e, "ROLLBACK TRANSACTION", []);
      if (!(translated instanceof ConnectionNotEstablished)) throw translated;
    }
    this._inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.rollbackTransaction();
    }
    return this.rollbackDbTransaction();
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    await this.driver.exec(`SAVEPOINT "${name}"`);
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    await this.driver.exec(`RELEASE SAVEPOINT "${name}"`);
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    await this.driver.exec(`ROLLBACK TO SAVEPOINT "${name}"`);
  }

  /**
   * Return the query execution plan.
   *
   * Binds are forwarded to the prepared `EXPLAIN QUERY PLAN`
   * statement (`.all(...binds)`) so a collected prepared-statement
   * query with `?` placeholders EXPLAINs without SQLite complaining
   * about missing parameter values. Options are accepted for
   * signature parity with `Relation#explain` but ignored — SQLite
   * has no equivalent to PG's `:analyze` / `:verbose` toggles.
   */
  async explain(
    sql: string,
    binds: unknown[] = [],
    _options: ExplainOption[] = [],
  ): Promise<string> {
    const explainStmt = await this.driver.prepare(`EXPLAIN QUERY PLAN ${sql}`);
    const rows = (await explainStmt.all(binds as SqliteBinds)) as Record<string, unknown>[];
    return rows.map((r) => `${r.id}|${r.parent}|${r.notused}|${r.detail}`).join("\n");
  }

  /**
   * Build the printed header prefix used by `Relation#explain`.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#build_explain_clause
   */
  override buildExplainClause(_options: ExplainOption[] = []): string {
    return "EXPLAIN QUERY PLAN for:";
  }

  /**
   * Quote a value for inclusion in a SQL literal. SQLite uses plain
   * `'' ` string escaping (no backslash escapes), `1/0` for booleans,
   * and `x'hex'` for binary.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Quoting#quote
   */
  override quote(value: unknown): string {
    return sqliteQuote(value);
  }

  override typeCast(value: unknown): unknown {
    return sqliteTypeCast(value);
  }

  /**
   * SQLite-specific quoting overrides — route every Quoting interface
   * method to the per-adapter module so call sites can dispatch via
   * `connection.quoteX(...)` and get the dialect-correct form
   * (double-quote identifiers, `"1"`/`"0"` bools, hex binary literals).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Quoting overrides.
   */
  override quoteString(s: string): string {
    // Mirrors: SQLite3::Quoting#quote_string — escape-only (no
    // surrounding quotes). The standalone sqlite3/quoting.ts
    // `quoteString` wraps for historical reasons; this override
    // matches the Rails contract: just `'` → `''`.
    return s.replace(/'/g, "''");
  }

  override quoteIdentifier(name: string): string {
    return sqliteQuoteIdentifier(name);
  }

  override quoteTableName(name: string): string {
    return quoteTableName(name);
  }

  override quoteColumnName(name: string): string {
    return quoteColumnName(name);
  }

  override quoteTableNameForAssignment(table: string, attr: string): string {
    return sqliteQuoteTableNameForAssignment(table, attr);
  }

  // `quoteDefaultExpression` deliberately not overridden here. The
  // SQLite standalone (`sqlite3/quoting.ts:114`) returns an unprefixed
  // expression (`NULL` / `(NOW())`) — Rails-correct — but the abstract
  // and PG adapters return a `" DEFAULT ..."`-prefixed clause. Until
  // that contract divergence is reconciled across adapters (Phase 2
  // call-site work), inheriting the abstract default keeps DDL output
  // consistent across adapters in this PR.

  override quotedTrue(): string {
    return sqliteQuotedTrue();
  }

  override quotedFalse(): string {
    return sqliteQuotedFalse();
  }

  override unquotedTrue(): number {
    return sqliteUnquotedTrue();
  }

  override unquotedFalse(): number {
    return sqliteUnquotedFalse();
  }

  override quotedBinary(value: unknown): string {
    // Mirrors: SQLite3::Quoting#quoted_binary (`sqlite3/quoting.rb:79`)
    // — Rails calls `value.hex` and would NoMethodError on non-Binary
    // values. The TS standalone iterates the value as a byte source,
    // so non-binary inputs (strings, plain arrays) silently produce
    // garbage hex. Validate at the interface boundary.
    if (value instanceof Uint8Array) {
      return sqliteQuotedBinary(value);
    }
    if (value instanceof ArrayBuffer) {
      return sqliteQuotedBinary(new Uint8Array(value));
    }
    throw new TypeError(
      `quotedBinary expects a Uint8Array, ArrayBuffer, or Buffer; got ${
        value === null ? "null" : typeof value
      }`,
    );
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    await this.driver.close();
  }

  /**
   * Check if the database is open.
   */
  get isOpen(): boolean {
    return this.driver.isOpen();
  }

  /**
   * Check if we're in a transaction.
   */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    await this.driver.exec(sql);
  }

  /**
   * Driver-specific escape hatch — returns whatever the registered SqliteDriver
   * exposes as `connection.raw`. With better-sqlite3, that's the `Database`
   * instance; with node:sqlite, sqlite-wasm, expo-sqlite, etc., it's whichever
   * handle that driver documents. Consumers cast at the use site.
   */
  get raw(): unknown {
    return this.driver.raw;
  }

  /**
   * Resolve a SQL column type string to an ActiveRecord Type instance.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#lookup_cast_type
   */
  lookupCastType(sqlType: string): import("@blazetrails/activemodel").Type {
    // Pass the full sql type to the map so regex registrations (e.g. /decimal/i)
    // can inspect precision/scale. Fall back to the bare normalized key when
    // no full-string match is found.
    const lower = sqlType.toLowerCase().trim();
    const full = this._nativeTypeMap.fetch(lower);
    if (full.type() !== "value") return full;
    const normalized = lower.replace(/\(.*\)/, "").trim();
    return this._nativeTypeMap.lookup(normalized);
  }

  lookupCastTypeFromColumn(column: {
    sqlType?: string | null;
    precision?: number | null;
  }): import("@blazetrails/activemodel").Type {
    const base = this.lookupCastType(column.sqlType ?? "");
    if (column.precision != null) {
      if (base instanceof SQLiteDateTimeType)
        return new SQLiteDateTimeType({ precision: column.precision });
      if (base instanceof TimeType) return new TimeType({ precision: column.precision });
    }
    return base;
  }

  get nativeTypeMap(): TypeMap {
    return this._nativeTypeMap;
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::SQLite3Integer
  // INTEGER in SQLite can store up to 8 bytes; default _limit to 8 when none given.
  private static _buildTypeMap(): TypeMap {
    const map = new TypeMap();
    SQLite3Adapter.initializeTypeMap(map);
    return map;
  }

  // --- Capability overrides (Rails: SQLite3Adapter returns true for these) ---

  override supportsDdlTransactions(): boolean {
    return true;
  }

  override supportsSavepoints(): boolean {
    return true;
  }

  override supportsTransactionIsolation(): boolean {
    return true;
  }

  override supportsPartialIndex(): boolean {
    return true;
  }

  supportsExpressionIndex(): boolean {
    return this.databaseVersion.gte("3.9.0");
  }

  override supportsForeignKeys(): boolean {
    return true;
  }

  override supportsCheckConstraints(): boolean {
    return true;
  }

  override supportsViews(): boolean {
    return true;
  }

  override supportsDatetimeWithPrecision(): boolean {
    return true;
  }

  override supportsJson(): boolean {
    return true;
  }

  override supportsCommonTableExpressions(): boolean {
    return this.databaseVersion.gte("3.8.3");
  }

  supportsInsertReturning(): boolean {
    return this.databaseVersion.gte("3.35.0");
  }

  supportsInsertOnConflict(): boolean {
    return this.databaseVersion.gte("3.24.0");
  }

  override supportsConcurrentConnections(): boolean {
    return !this._memoryDatabase;
  }

  override supportsVirtualColumns(): boolean {
    return this.databaseVersion.gte("3.31.0");
  }

  override supportsIndexSortOrder(): boolean {
    return true;
  }

  override supportsExplain(): boolean {
    return true;
  }

  override supportsLazyTransactions(): boolean {
    return true;
  }

  override supportsDeferrableConstraints(): boolean {
    return true;
  }

  isRequiresReloading(): boolean {
    return false;
  }

  // --- Connection lifecycle ---

  override isConnected(): boolean {
    return this.driver.isOpen();
  }

  isActive(): boolean {
    return this.driver.isOpen();
  }

  override clearCacheBang(): void {
    super.clearCacheBang();
    this._statementPool.clear();
  }

  override disconnectBang(): void {
    super.disconnectBang();
    if (this.driver.isOpen()) {
      // driver.close() returns void | Promise<void>; for inProcessSync drivers
      // (better-sqlite3) this is sync. Async-driver teardown needs pool-infra
      // changes — tracked in #1269.
      this.driver.close();
    }
  }

  // --- Database info ---

  get nativeDatabaseTypes(): Record<string, { name: string; limit?: number }> {
    return {
      primary_key: { name: "integer" },
      string: { name: "varchar", limit: 255 },
      text: { name: "text" },
      integer: { name: "integer" },
      float: { name: "float" },
      decimal: { name: "decimal" },
      datetime: { name: "datetime" },
      time: { name: "time" },
      date: { name: "date" },
      binary: { name: "blob" },
      blob: { name: "blob" },
      boolean: { name: "boolean" },
      json: { name: "json" },
    };
  }

  get encoding(): string {
    const result = this.driver.pragma("encoding") as Array<{ encoding: string }>;
    return result[0]?.encoding ?? "UTF-8";
  }

  isSharedCache(): boolean {
    const qIdx = this._filename.indexOf("?");
    if (qIdx === -1) return false;
    return this._filename.slice(qIdx).includes("cache=shared");
  }

  private _databaseVersion: Version | null = null;

  override getDatabaseVersion(): Version {
    // Always pre-warmed by connect() — _databaseVersion is non-null after construction.
    return this._databaseVersion ?? new Version("0.0.0");
  }

  override get databaseVersion(): Version {
    return this.getDatabaseVersion();
  }

  override checkVersion(): void {
    if (this.databaseVersion.lt("3.8.0")) {
      throw new Error(
        `Your version of SQLite (${this.databaseVersion}) is too old. Active Record supports SQLite >= 3.8.0.`,
      );
    }
  }

  static isDatabaseExists(config: { database?: string }): boolean {
    if (!config.database || config.database === ":memory:") return true;
    try {
      return getFs().existsSync(config.database);
    } catch {
      return false;
    }
  }

  static newClient(config: { database?: string; readonly?: boolean }): SQLite3Adapter {
    return new SQLite3Adapter(config.database ?? ":memory:", { readonly: config.readonly });
  }

  static override dbconsole(config?: { database?: string }): void {
    const db = config?.database ?? ":memory:";
    console.log(`sqlite3 ${db}`);
  }

  // --- Schema operations ---

  async primaryKeys(tableName: string): Promise<string[]> {
    const { schema, bare } = this._splitTableName(tableName);
    const prefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = await this.execute(
      `PRAGMA ${prefix}table_info(${quoteColumnName(bare)})`,
      [],
      "SCHEMA",
    );
    return rows
      .filter((r) => Number(r.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((r) => String(r.name));
  }

  private _splitTableName(tableName: string): { schema: string; bare: string } {
    const dot = tableName.lastIndexOf(".");
    return dot === -1
      ? { schema: "", bare: tableName }
      : { schema: tableName.slice(0, dot), bare: tableName.slice(dot + 1) };
  }

  async removeIndex(
    tableName: string,
    columnOrOptions?: string | string[] | { name?: string; column?: string | string[] },
  ): Promise<void> {
    let indexName: string;
    if (typeof columnOrOptions === "string") {
      indexName = `index_${tableName}_on_${columnOrOptions}`;
    } else if (Array.isArray(columnOrOptions)) {
      indexName = `index_${tableName}_on_${columnOrOptions.join("_and_")}`;
    } else if (columnOrOptions?.name) {
      indexName = columnOrOptions.name;
    } else if (columnOrOptions?.column) {
      const cols = Array.isArray(columnOrOptions.column)
        ? columnOrOptions.column.join("_and_")
        : columnOrOptions.column;
      indexName = `index_${tableName}_on_${cols}`;
    } else {
      throw new Error("No index name or column specified");
    }
    await this.executeMutation(`DROP INDEX IF EXISTS ${quoteColumnName(indexName)}`);
  }

  createSchemaDumper(source: SchemaSource, _options: unknown = {}): Sqlite3SchemaDumper {
    return new Sqlite3SchemaDumper(source);
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#virtual_table_exists?
  async virtualTableExists(tableName: string): Promise<boolean> {
    try {
      const rows = await this.execute(
        `SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND type = 'virtual' AND name = ?`,
        [tableName],
        "SCHEMA",
      );
      return rows.length > 0;
    } catch {
      const rows = await this.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%VIRTUAL%' AND name = ?`,
        [tableName],
        "SCHEMA",
      );
      return rows.length > 0;
    }
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#virtual_tables
  // Returns { tableName => [moduleName, argsString] }
  async virtualTables(): Promise<Record<string, [string, string]>> {
    const rows = (await this.execute(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql LIKE '%VIRTUAL%'",
      [],
      "SCHEMA",
    )) as Array<{ name: string; sql: string }>;
    const result: Record<string, [string, string]> = {};
    for (const r of rows) {
      const m = /USING\s+(\w+)\s*\((.*)\)\s*$/is.exec(r.sql);
      if (m) result[r.name] = [m[1], m[2]];
    }
    return result;
  }

  override async createVirtualTable(
    tableName: string,
    optionsOrModuleName?: unknown,
    values?: unknown,
  ): Promise<void> {
    // Support both (name, options) and (name, moduleName, values) signatures
    const opts =
      optionsOrModuleName !== null &&
      typeof optionsOrModuleName === "object" &&
      !Array.isArray(optionsOrModuleName)
        ? (optionsOrModuleName as Record<string, unknown>)
        : undefined;

    const moduleName = opts?.moduleName ?? (opts ? undefined : optionsOrModuleName);
    const virtualValues = opts?.values ?? values;

    const mod = String(moduleName ?? "");
    const safeIdent = /^[A-Za-z_][A-Za-z0-9_]*$/;
    if (!safeIdent.test(mod)) {
      throw new Error("moduleName must be a valid SQLite identifier");
    }
    // Virtual table module arguments are passed through as-is (e.g. FTS
    // tokenize='porter', content='posts'). Only the module name is validated
    // as an identifier since it occupies a SQL keyword position.
    const args = Array.isArray(virtualValues) ? virtualValues.map(String) : [];
    const rawArgs = args.join(", ");
    await this.executeMutation(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${quoteTableName(tableName)} USING ${mod}(${rawArgs})`,
    );
  }

  async dropVirtualTable(
    tableName: string,
    _moduleName?: string,
    _values?: string[],
  ): Promise<void> {
    await this.executeMutation(`DROP TABLE IF EXISTS ${quoteTableName(tableName)}`);
  }

  async renameTable(tableName: string, newName: string): Promise<void> {
    this.schemaCache.clear();
    await this.executeMutation(
      `ALTER TABLE ${quoteTableName(tableName)} RENAME TO ${quoteTableName(newName)}`,
    );
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    const sqlType = this.typeToSql(type, options);
    let sql = `ALTER TABLE ${quoteTableName(tableName)} ADD COLUMN ${quoteColumnName(columnName)} ${sqlType}`;
    if (options?.collation) sql += ` COLLATE ${quoteColumnName(String(options.collation))}`;
    if (options?.null === false) sql += " NOT NULL";
    if (options?.default !== undefined) {
      sql += ` DEFAULT ${this.quoteDefault(options.default)}`;
    }
    await this.executeMutation(sql);
  }

  async removeColumn(tableName: string, columnName: string, _type?: string): Promise<void> {
    await this.alterTable(tableName, (columns) => {
      delete columns[columnName];
    });
  }

  async removeColumns(tableName: string, ...columnNames: string[]): Promise<void> {
    await this.alterTable(tableName, (columns) => {
      for (const col of columnNames) {
        delete columns[col];
      }
    });
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    const newDefault =
      typeof defaultOrChanges === "object" && defaultOrChanges !== null
        ? (defaultOrChanges as any).to
        : defaultOrChanges;
    await this.alterTable(tableName, (columns) => {
      if (columns[columnName]) {
        columns[columnName].dflt_value = newDefault === null ? null : this.quoteDefault(newDefault);
      }
    });
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    defaultValue?: unknown,
  ): Promise<void> {
    if (!allowNull && defaultValue !== undefined) {
      const quotedDefault = this.quoteDefault(defaultValue);
      await this.executeMutation(
        `UPDATE ${quoteTableName(tableName)} SET ${quoteColumnName(columnName)} = ${quotedDefault} WHERE ${quoteColumnName(columnName)} IS NULL`,
      );
    }
    await this.alterTable(tableName, (columns) => {
      if (columns[columnName]) {
        columns[columnName].notnull = allowNull ? 0 : 1;
      }
    });
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    const sqlType = this.typeToSql(type, options);
    await this.alterTable(tableName, (columns) => {
      if (columns[columnName]) {
        columns[columnName].type = sqlType;
        if (options?.null !== undefined) columns[columnName].notnull = options.null ? 0 : 1;
        if (options?.default !== undefined)
          columns[columnName].dflt_value =
            options.default === null ? null : this.quoteDefault(options.default);
        if (options?.collation !== undefined) columns[columnName].collation = options.collation;
      }
    });
  }

  async renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void> {
    await this.executeMutation(
      `ALTER TABLE ${quoteTableName(tableName)} RENAME COLUMN ${quoteColumnName(columnName)} TO ${quoteColumnName(newColumnName)}`,
    );
  }

  async addTimestamps(tableName: string, options?: Record<string, unknown>): Promise<void> {
    const opts = {
      null: false,
      ...options,
    };
    await this.addColumn(tableName, "created_at", "datetime", opts);
    await this.addColumn(tableName, "updated_at", "datetime", opts);
  }

  async addReference(
    tableName: string,
    refName: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    const type = (options?.type as string) ?? "integer";
    await this.addColumn(tableName, `${refName}_id`, type, options);
  }

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    const { schema, bare } = this._splitTableName(tableName);
    const prefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = await this.execute(
      `PRAGMA ${prefix}foreign_key_list(${quoteColumnName(bare)})`,
      [],
      "SCHEMA",
    );
    const grouped = new Map<number, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const id = row.id as number;
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id)!.push(row);
    }

    // Rails reads deferrable from the CREATE TABLE SQL since PRAGMA doesn't expose it.
    const deferrableByKey = await this._parseFkDeferrable(tableName);
    // Use explicit CONSTRAINT names from DDL when available (PRAGMA doesn't expose them).
    const namesByColumn = await this._parseForeignKeyNames(tableName);

    const results: ForeignKeyDefinition[] = [];
    for (const group of grouped.values()) {
      group.sort((a, b) => (a.seq as number) - (b.seq as number));
      const first = group[0];
      const toTable = first.table as string;
      const onDelete = this._extractFkAction(first.on_delete as string);
      const onUpdate = this._extractFkAction(first.on_update as string);
      const column =
        group.length === 1 ? (first.from as string) : group.map((r) => r.from as string).join(",");
      const primaryKey =
        group.length === 1 ? (first.to as string) : group.map((r) => r.to as string).join(",");
      const nameKey = column.replace(/,/g, "_");
      const name = namesByColumn.get(column) ?? `fk_${bare}_${nameKey}`;
      const deferrable = deferrableByKey.get(`${toTable},${column},${primaryKey}`);
      results.push(
        new ForeignKeyDefinition(
          tableName,
          toTable,
          column,
          primaryKey,
          name,
          onDelete,
          onUpdate,
          deferrable,
        ),
      );
    }
    return results;
  }

  // Mirrors Rails' SQLite3Adapter FK deferrable extraction — reads DEFERRABLE
  // from CREATE TABLE SQL since PRAGMA foreign_key_list doesn't expose it.
  private async _parseFkDeferrable(
    tableName: string,
  ): Promise<Map<string, "immediate" | "deferred">> {
    const createSql = await this._getCreateTableSql(tableName);
    const result = new Map<string, "immediate" | "deferred">();
    if (!createSql) return result;
    const fkRegex =
      /FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s*"?([^"(,\s]+)"?\s*\(([^)]+)\)[^,)]*DEFERRABLE\s+INITIALLY\s+(\w+)/gi;
    let match;
    while ((match = fkRegex.exec(createSql)) !== null) {
      const [, fromCols, toTbl, toCols, mode] = match;
      const fromKey = fromCols
        .split(",")
        .map((c) => c.trim().replace(/^"|"$/g, ""))
        .join(",");
      const toKey = toCols
        .split(",")
        .map((c) => c.trim().replace(/^"|"$/g, ""))
        .join(",");
      const key = `${toTbl},${fromKey},${toKey}`;
      result.set(key, mode.toLowerCase() === "deferred" ? "deferred" : "immediate");
    }
    return result;
  }

  private _extractFkAction(
    action: string | null | undefined,
  ): "cascade" | "nullify" | "restrict" | undefined {
    switch ((action ?? "").toUpperCase()) {
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

  override buildInsertSql(insert: {
    into?: string;
    values_list?: string;
    skip_duplicates?: boolean;
    conflict_target?: string;
    update?: string;
    returning?: string;
  }): string | null {
    if (!insert.into) {
      if (insert.skip_duplicates) return "OR IGNORE";
      if (insert.update) return "ON CONFLICT DO UPDATE SET";
      return null;
    }

    let sql = `INSERT ${insert.into} ${insert.values_list ?? ""}`;
    if (insert.skip_duplicates) {
      sql += ` ON CONFLICT ${insert.conflict_target ?? ""} DO NOTHING`;
    } else if (insert.update) {
      sql += ` ON CONFLICT ${insert.conflict_target ?? ""} DO UPDATE SET ${insert.update}`;
    }
    if (insert.returning) {
      sql += ` RETURNING ${insert.returning}`;
    }
    return sql;
  }

  override async disableReferentialIntegrity(fn: () => Promise<void>): Promise<void> {
    const oldForeignKeys = ((await this.driver.pragma("foreign_keys")) as any[])[0]?.foreign_keys;
    const oldDefer = ((await this.driver.pragma("defer_foreign_keys")) as any[])[0]
      ?.defer_foreign_keys;
    try {
      await this.driver.pragma("defer_foreign_keys = ON");
      await this.driver.pragma("foreign_keys = OFF");
      await fn();
    } finally {
      await this.driver.pragma(`defer_foreign_keys = ${oldDefer ?? 0}`);
      await this.driver.pragma(`foreign_keys = ${oldForeignKeys ?? 1}`);
    }
  }

  override async checkAllForeignKeysValidBang(): Promise<void> {
    const violations = (await this.driver.pragma("foreign_key_check")) as Array<
      Record<string, unknown>
    >;
    if (violations.length > 0) {
      const tables = violations.map((r) => r.table).join(", ");
      throw new StatementInvalid(`Foreign key violations found: ${tables}`, {
        sql: "PRAGMA foreign_key_check",
        binds: [],
      });
    }
  }

  private typeToSql(type: string, options?: Record<string, unknown>): string {
    const raw = this.nativeDatabaseTypes[type]?.name ?? type.toUpperCase();
    // Validate: only allow safe SQL type identifiers (letters, digits, underscores, spaces)
    if (!/^[A-Za-z_][A-Za-z0-9_ ]*$/.test(raw)) {
      throw new Error(`Invalid SQL type: ${raw}`);
    }
    const base = raw;
    const precision =
      typeof options?.precision === "number" ? Math.floor(options.precision) : undefined;
    const scale = typeof options?.scale === "number" ? Math.floor(options.scale) : undefined;
    const limit = typeof options?.limit === "number" ? Math.floor(options.limit) : undefined;
    if (precision !== undefined && scale !== undefined) return `${base}(${precision},${scale})`;
    if (precision !== undefined) return `${base}(${precision})`;
    if (limit !== undefined) return `${base}(${limit})`;
    return base;
  }

  private async _getCreateTableSql(tableName: string): Promise<string | null> {
    const { schema, bare } = this._splitTableName(tableName);
    let sql: string;
    if (schema) {
      sql =
        schema.toLowerCase() === "temp"
          ? `SELECT sql FROM sqlite_temp_master WHERE type='table' AND name=${sqliteQuoteStringLiteral(bare)}`
          : `SELECT sql FROM ${quoteColumnName(schema)}.sqlite_master WHERE type='table' AND name=${sqliteQuoteStringLiteral(bare)}`;
    } else {
      sql = `SELECT sql FROM sqlite_temp_master WHERE type='table' AND name=${sqliteQuoteStringLiteral(bare)}
             UNION ALL
             SELECT sql FROM sqlite_master WHERE type='table' AND name=${sqliteQuoteStringLiteral(bare)}`;
    }
    const stmt = await this.driver.prepare(sql);
    const row = (await stmt.get()) as { sql: string } | undefined;
    return row?.sql ?? null;
  }

  /**
   * Parse FK constraint names from CREATE TABLE SQL. PRAGMA
   * foreign_key_list doesn't expose names, but the DDL does when
   * CONSTRAINT <name> was used. Returns a map keyed by the
   * comma-joined column list (e.g. "a,b" for composites).
   */
  private async _parseForeignKeyNames(tableName: string): Promise<Map<string, string>> {
    const createSql = await this._getCreateTableSql(tableName);
    const names = new Map<string, string>();
    if (!createSql) return names;
    const regex = /CONSTRAINT\s+(?:"((?:[^"]|"")*)"|(\w+))\s+FOREIGN\s+KEY\s*\(([^)]+)\)/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(createSql)) !== null) {
      const name = match[1] ? match[1].replace(/""/g, '"') : match[2];
      const colList = match[3]
        .split(",")
        .map((c) => c.trim().replace(/^"|"$/g, ""))
        .join(",");
      names.set(colList, name);
    }
    return names;
  }

  private quoteDefault(value: unknown): string {
    if (value === null) return "NULL";
    if (typeof value === "string") return sqliteQuoteStringLiteral(value);
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "function") return String(value());
    // boundary: defensive Date branch in SQLite adapter literal quoting.
    if (value instanceof globalThis.Date) return sqliteQuoteStringLiteral(value.toISOString());
    // SqlLiteral or objects with toSql
    if (typeof (value as any)?.toSql === "function") return String((value as any).toSql());
    return sqliteQuoteStringLiteral(String(value));
  }

  // --- Schema introspection (drives SchemaCache.addAll) ---

  /**
   * List user tables. Excludes SQLite's internal `sqlite_*` tables and
   * matches Rails' SQLite3::SchemaStatements#tables filter.
   */
  async tables(): Promise<string[]> {
    const rows = (await this.execute(
      "SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND name NOT IN ('sqlite_sequence', 'sqlite_schema') AND type IN ('table')",
      [],
      "SCHEMA",
    )) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  async views(): Promise<string[]> {
    const rows = (await this.execute(
      "SELECT name FROM sqlite_master WHERE type='view' ORDER BY name",
      [],
      "SCHEMA",
    )) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  /**
   * Tables + views, deduped. Mirrors AbstractAdapter#data_sources.
   */
  async dataSources(): Promise<string[]> {
    return [...new Set([...(await this.tables()), ...(await this.views())])];
  }

  /**
   * Resolve the sqlite_master reference for a possibly-schema-qualified
   * name. SQLite stores each attached DB's schema in its own
   * `<schema>.sqlite_master`; `aux.widgets` is row `name='widgets'` in
   * `aux.sqlite_master`, never `name='aux.widgets'` in the main catalog.
   */
  private _sqliteMasterFor(name: string): { sqliteMaster: string; bare: string } {
    const { schema, bare } = this._splitTableName(name);
    return {
      sqliteMaster: schema ? `${quoteColumnName(schema)}.sqlite_master` : "sqlite_master",
      bare,
    };
  }

  async tableExists(name: string): Promise<boolean> {
    if (name.includes(".")) {
      // Schema-qualified name (e.g. "aux.widgets") — query the attached schema's catalog.
      const { sqliteMaster, bare } = this._sqliteMasterFor(name);
      const rows = (await this.execute(
        `SELECT 1 AS one FROM ${sqliteMaster} WHERE type='table' AND name=${sqliteQuoteStringLiteral(bare)}`,
        [],
        "SCHEMA",
      )) as Array<{ one: number }>;
      return rows.length > 0;
    }
    const rows = (await this.execute(
      `SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND name NOT IN ('sqlite_sequence', 'sqlite_schema') AND name = ${sqliteQuoteStringLiteral(name)} AND type IN ('table')`,
      [],
      "SCHEMA",
    )) as Array<{ name: string }>;
    return rows.length > 0;
  }

  async dataSourceExists(name: string): Promise<boolean> {
    const { sqliteMaster, bare } = this._sqliteMasterFor(name);
    const rows = (await this.execute(
      `SELECT 1 AS one FROM ${sqliteMaster} WHERE type IN ('table','view') AND name=${sqliteQuoteStringLiteral(bare)}`,
      [],
      "SCHEMA",
    )) as Array<{ one: number }>;
    return rows.length > 0;
  }

  /**
   * Return the primary key for the named table: a single string for
   * scalar PKs, an array for composite PKs, or null for rowid-only
   * tables (no explicit PK column). Matches Rails' SchemaCache which
   * stores `string | string[] | null` for primary_keys entries.
   *
   * Uses the `PRAGMA schema.table_info(table)` form for schema-qualified
   * names (e.g. `temp.widgets`). The `PRAGMA table_info("schema"."table")`
   * form does NOT work — SQLite treats the whole quoted string as a
   * single table name and returns no rows.
   */
  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const { schema, bare } = this._splitTableName(tableName);
    const pragmaPrefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = (await this.execute(
      `PRAGMA ${pragmaPrefix}table_info(${quoteColumnName(bare)})`,
      [],
      "SCHEMA",
    )) as Array<{ name: string; pk: number }>;
    const pks = rows.filter((r) => r.pk > 0).sort((a, b) => a.pk - b.pk);
    if (pks.length === 0) return null;
    if (pks.length === 1) return pks[0].name;
    return pks.map((r) => r.name);
  }

  /**
   * Return Column objects for the named table. Only the fields the
   * schema cache actually serializes are populated — name, default,
   * null, sqlTypeMetadata, primaryKey.
   */
  async columns(tableName: string): Promise<Column[]> {
    const { schema, bare } = this._splitTableName(tableName);
    const pragmaPrefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = (await this.execute(
      `PRAGMA ${pragmaPrefix}table_info(${quoteColumnName(bare)})`,
      [],
      "SCHEMA",
    )) as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    const collationMap = await this._parseCollationsFromTableSql(tableName);

    return rows.map((r) => {
      const sqlType = r.type || "";
      const precMatch = /^(datetime|timestamp|time)\((\d+)\)$/i.exec(sqlType);
      const precision = precMatch ? parseInt(precMatch[2], 10) : null;
      const baseSqlType = precMatch ? sqlType.slice(0, sqlType.indexOf("(")) : sqlType;
      const meta = new SqlTypeMetadata({
        sqlType: baseSqlType,
        type: baseSqlType.toLowerCase(),
        limit: null,
        precision,
        scale: null,
      });
      const defaultValue = sqliteExtractValueFromDefault(r.dflt_value);
      return new Sqlite3Column(r.name, defaultValue, meta, r.notnull === 0, {
        primaryKey: r.pk > 0,
        collation: collationMap.get(r.name) ?? null,
      });
    });
  }

  // Mirrors: SQLite3Adapter#table_structure_with_collation
  private async _parseCollationsFromTableSql(tableName: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const createSql = await this._getCreateTableSql(tableName);
    if (!createSql) return result;

    const COLLATE_REGEX = /.*"(\w+)".*\bCOLLATE\s+"(\w+)".*/i;
    const body = createSql.replace(/\);*\s*$/, "").replace(/^[^(]*\(/, "");
    const parts = body.split(/,(?=\s*(?:"|\bCONSTRAINT\b))/i);
    for (const part of parts) {
      const m = COLLATE_REGEX.exec(part);
      if (m) result.set(m[1], m[2]);
    }
    return result;
  }

  async indexes(tableName: string): Promise<unknown[]> {
    const { schema, bare } = this._splitTableName(tableName);
    const pragmaPrefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = (await this.execute(
      `PRAGMA ${pragmaPrefix}index_list(${quoteColumnName(bare)})`,
      [],
      "SCHEMA",
    )) as Array<{ name: string; unique: number; origin: string }>;
    // Skip auto-indexes that SQLite generates for PRIMARY KEY / UNIQUE
    // constraints — Rails' schema cache records user-defined indexes
    // only, and the auto ones are redundant with the CREATE TABLE sql.
    const userIndexes = rows.filter((r) => r.origin === "c");
    const sqliteMaster = schema ? `${quoteColumnName(schema)}.sqlite_master` : "sqlite_master";
    const result: Array<{ name: string; columns: string[]; unique: boolean; where?: string }> = [];
    for (const idx of userIndexes) {
      // index_info takes the bare index name; the schema qualifier, if
      // any, comes before the PRAGMA keyword — same shape as above.
      const cols = (await this.execute(
        `PRAGMA ${pragmaPrefix}index_info(${quoteColumnName(idx.name)})`,
        [],
        "SCHEMA",
      )) as Array<{ name: string; seqno: number }>;
      const idxSqlStmt = await this.driver.prepare(
        `SELECT sql FROM ${sqliteMaster} WHERE type='index' AND name=${sqliteQuoteStringLiteral(idx.name)}`,
      );
      const idxSqlRow = (await idxSqlStmt.get()) as { sql: string } | undefined;
      const whereMatch = idxSqlRow?.sql ? /\bWHERE\b\s+(.+)$/i.exec(idxSqlRow.sql) : null;
      result.push({
        name: idx.name,
        columns: cols.sort((a, b) => a.seqno - b.seqno).map((c) => c.name),
        unique: idx.unique === 1,
        ...(whereMatch ? { where: whereMatch[1].trim() } : {}),
      });
    }
    return result;
  }

  // --- FK / Check constraint operations (SQLite requires table rebuild) ---

  /**
   * Parse CHECK constraints from the CREATE TABLE SQL.
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#check_constraints
   */
  async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    const row = await this._getCreateTableSql(tableName);
    if (!row) return [];

    const results: CheckConstraintDefinition[] = [];
    const regex =
      /CONSTRAINT\s+(?:"((?:[^"]|"")*)"|(\w+))\s+CHECK\s*\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(row)) !== null) {
      const name = match[1] ? match[1].replace(/""/g, '"') : match[2];
      results.push(new CheckConstraintDefinition(tableName, match[3].trim(), name));
    }
    return results;
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#add_foreign_key
   */
  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    await this.alterTable(
      fromTable,
      () => {},
      undefined,
      undefined,
      (definition) => {
        definition.foreignKey(toTable, options);
      },
    );
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#remove_foreign_key
   */
  async removeForeignKey(
    fromTable: string,
    toTableOrOptions?:
      | string
      | { column?: string; name?: string; toTable?: string; ifExists?: boolean },
  ): Promise<void> {
    let explicitToTable: string | undefined;
    let column: string | undefined;
    let name: string | undefined;
    let ifExists = false;

    if (typeof toTableOrOptions === "string") {
      explicitToTable = toTableOrOptions;
    } else if (toTableOrOptions) {
      column = toTableOrOptions.column;
      name = toTableOrOptions.name;
      explicitToTable = toTableOrOptions.toTable;
      ifExists = toTableOrOptions.ifExists === true;
    }

    if (!explicitToTable && !column && !name) {
      throw new Error("removeForeignKey requires a target table or options");
    }

    const existingFks = await this.foreignKeys(fromTable);
    const fkNames = await this._parseForeignKeyNames(fromTable);
    const { bare: bareFrom } = this._splitTableName(fromTable);

    const fkToRemove = existingFks.find((fk) => {
      const fkCols = Array.isArray(fk.column) ? fk.column : [fk.column];
      const fkKey = fkCols.join(",");
      if (name) {
        const parsedName = fkNames.get(fkKey) ?? `fk_${bareFrom}_${fkCols.join("_")}`;
        return parsedName === name;
      }
      if (column) return fkCols.includes(column);
      if (explicitToTable) return fk.toTable === explicitToTable;
      return false;
    });

    if (!fkToRemove) {
      if (ifExists) return;
      throw new Error(
        `Table '${fromTable}' has no foreign key for ${explicitToTable || JSON.stringify(toTableOrOptions)}`,
      );
    }

    const remainingFks = existingFks.filter((fk) => fk !== fkToRemove);
    await this.alterTable(fromTable, () => {}, remainingFks);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#add_check_constraint
   */
  async addCheckConstraint(
    tableName: string,
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): Promise<void> {
    if (options.validate === false) {
      throw new Error("validate: false is only supported on PostgreSQL");
    }
    const { name } = options;
    await this.alterTable(
      tableName,
      () => {},
      undefined,
      undefined,
      (definition) => {
        definition.checkConstraint(expression, { name });
      },
    );
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#remove_check_constraint
   */
  async removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | { name?: string; ifExists?: boolean },
  ): Promise<void> {
    if (
      expressionOrOptions === undefined ||
      (typeof expressionOrOptions === "object" && !expressionOrOptions?.name)
    ) {
      throw new Error("removeCheckConstraint requires either an expression or { name } option");
    }

    const ifExists =
      typeof expressionOrOptions === "object" && expressionOrOptions?.ifExists === true;
    const existingChecks = await this.checkConstraints(tableName);
    let nameToRemove: string | undefined;

    if (typeof expressionOrOptions === "string") {
      const normalized = expressionOrOptions.trim();
      const found = existingChecks.find((c) => c.expression === normalized);
      nameToRemove = found?.name;
    } else if (expressionOrOptions?.name) {
      nameToRemove = expressionOrOptions.name;
    }

    if (!nameToRemove) {
      if (ifExists) return;
      throw new Error(
        `Table '${tableName}' has no check constraint matching ${JSON.stringify(expressionOrOptions)}`,
      );
    }

    const remainingChecks = existingChecks.filter((c) => c.name !== nameToRemove);
    await this.alterTable(tableName, () => {}, undefined, remainingChecks);
  }

  // --- Private: alter_table copy strategy (Rails: SQLite3Adapter#alter_table) ---

  private async alterTable(
    tableName: string,
    modify: (columns: Record<string, Record<string, unknown>>) => void,
    overrideForeignKeys?: ForeignKeyDefinition[],
    overrideCheckConstraints?: CheckConstraintDefinition[],
    extraDefinition?: (def: import("./abstract/schema-definitions.js").TableDefinition) => void,
  ): Promise<void> {
    const { schema, bare: bareTable } = this._splitTableName(tableName);
    const pragmaPrefix = schema ? `${quoteColumnName(schema)}.` : "";
    const qTable = quoteTableName(tableName);
    const tableInfoStmt = await this.driver.prepare(
      `PRAGMA ${pragmaPrefix}table_info(${quoteColumnName(bareTable)})`,
    );
    const tableInfo = (await tableInfoStmt.all()) as Array<Record<string, unknown>>;

    const columns: Record<string, Record<string, unknown>> = {};
    for (const col of tableInfo) {
      columns[col.name as string] = { ...col };
    }

    modify(columns);

    // Collect existing indexes to recreate after table rebuild
    const indexListStmt = await this.driver.prepare(
      `PRAGMA ${pragmaPrefix}index_list(${quoteColumnName(bareTable)})`,
    );
    const indexList = (await indexListStmt.all()) as Array<Record<string, unknown>>;
    const indexDefs: string[] = [];
    for (const idx of indexList) {
      const idxName = idx.name as string;
      // Skip auto-created indexes (sqlite_autoindex_*)
      if (idxName.startsWith("sqlite_autoindex_")) continue;
      const idxSqlStmt = await this.driver.prepare(
        `SELECT sql FROM ${pragmaPrefix}sqlite_master WHERE type='index' AND name=${sqliteQuoteStringLiteral(idxName)}`,
      );
      const createSql = (await idxSqlStmt.get()) as { sql: string } | undefined;
      if (createSql?.sql) {
        indexDefs.push(createSql.sql);
      }
    }

    const prefix = schema ? `${schema}.` : "";
    const tmpTable = `${prefix}_alter_tmp_${bareTable}`;
    const qTmp = quoteTableName(tmpTable);
    const colNames = Object.keys(columns);

    // Detect composite primary keys
    const pkColumns = colNames
      .map((name) => ({ name, pk: Number(columns[name].pk) || 0 }))
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    const compositePk = pkColumns.length > 1;

    const existingCollations = await this._parseCollationsFromTableSql(tableName);
    const colDefs = colNames.map((name) => {
      const col = columns[name];
      let def = `${quoteColumnName(name)} ${col.type ?? "TEXT"}`;
      const collation = col.collation === undefined ? existingCollations.get(name) : col.collation;
      if (collation) def += ` COLLATE ${quoteColumnName(String(collation))}`;
      if (!compositePk && col.pk) def += " PRIMARY KEY";
      if (col.notnull) def += " NOT NULL";
      if (col.dflt_value !== null && col.dflt_value !== undefined) {
        def += ` DEFAULT ${col.dflt_value}`;
      }
      return def;
    });
    if (compositePk) {
      colDefs.push(`PRIMARY KEY(${pkColumns.map((n) => quoteColumnName(n)).join(", ")})`);
    }

    // Preserve foreign keys and check constraints across the rebuild.
    // Rails: alter_table(table_name, foreign_keys(...), check_constraints(...))
    const fks = overrideForeignKeys ?? (await this.foreignKeys(tableName));
    const checks = overrideCheckConstraints ?? (await this.checkConstraints(tableName));

    // PRAGMA foreign_key_list doesn't expose constraint names, but the
    // CREATE TABLE DDL does. Parse names so they survive the rebuild.
    const fkNames = await this._parseForeignKeyNames(tableName);

    for (const fk of fks) {
      const cols = fk.column.includes(",")
        ? fk.column.split(",").map((c) => c.trim())
        : [fk.column];
      if (!cols.every((c) => colNames.includes(c))) continue;
      const pks = fk.primaryKey.includes(",")
        ? fk.primaryKey.split(",").map((c) => c.trim())
        : [fk.primaryKey];
      const colList = cols.map((c) => quoteColumnName(c)).join(", ");
      const pkList = pks.map((c) => quoteColumnName(c)).join(", ");
      let fkSql = "";
      const fkKey = cols.join(",");
      const fkName = fkNames.get(fkKey) ?? `fk_${bareTable}_${cols.join("_")}`;
      fkSql += `CONSTRAINT ${quoteColumnName(fkName)} `;
      fkSql += `FOREIGN KEY(${colList}) REFERENCES ${quoteTableName(fk.toTable)}(${pkList})`;
      if (fk.onDelete) fkSql += ` ON DELETE ${normalizeReferentialAction(fk.onDelete)}`;
      if (fk.onUpdate) fkSql += ` ON UPDATE ${normalizeReferentialAction(fk.onUpdate)}`;
      colDefs.push(fkSql);
    }

    const removedColumns = tableInfo
      .map((c) => c.name as string)
      .filter((n) => !colNames.includes(n));
    for (const chk of checks) {
      // Skip check constraints that reference columns no longer in the table
      // (mirrors the FK handling above which skips FKs for removed columns)
      const referencesRemovedCol = removedColumns.some((col) =>
        new RegExp(`\\b${col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(chk.expression),
      );
      if (referencesRemovedCol) continue;
      colDefs.push(`CONSTRAINT ${quoteColumnName(chk.name)} CHECK (${chk.expression})`);
    }

    // Apply any extra definitions (e.g. new FK/check from add operations)
    if (extraDefinition) {
      const { TableDefinition } = await import("./abstract/schema-definitions.js");
      const tmpDef = new TableDefinition(bareTable);
      extraDefinition(tmpDef);
      for (const fkDef of tmpDef.foreignKeys) {
        let fkSql = "";
        if (fkDef.name) fkSql += `CONSTRAINT ${quoteColumnName(fkDef.name)} `;
        fkSql += `FOREIGN KEY(${quoteColumnName(fkDef.column)}) REFERENCES ${quoteTableName(fkDef.toTable)}(${quoteColumnName(fkDef.primaryKey)})`;
        if (fkDef.onDelete) fkSql += ` ON DELETE ${normalizeReferentialAction(fkDef.onDelete)}`;
        if (fkDef.onUpdate) fkSql += ` ON UPDATE ${normalizeReferentialAction(fkDef.onUpdate)}`;
        colDefs.push(fkSql);
      }
      for (const chkDef of tmpDef.checkConstraints) {
        colDefs.push(`CONSTRAINT ${quoteColumnName(chkDef.name)} CHECK (${chkDef.expression})`);
      }
    }

    const originalColNames = tableInfo
      .map((c) => c.name as string)
      .filter((n) => colNames.includes(n));

    // Rails: transaction { disable_referential_integrity { move_table(...) } }
    // Use savepoint if already inside a transaction (e.g. migration),
    // since SQLite doesn't allow nested BEGIN.
    const alreadyInTransaction = this._inTransaction;
    const savepointName = `alter_table_${bareTable.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    if (alreadyInTransaction) {
      await this.createSavepoint(savepointName);
    } else {
      await this.beginTransaction();
    }
    try {
      await this.disableReferentialIntegrity(async () => {
        await this.driver.exec(`CREATE TABLE ${qTmp} (${colDefs.join(", ")})`);
        if (originalColNames.length > 0) {
          const selectCols = originalColNames.map((n) => quoteColumnName(n)).join(", ");
          await this.driver.exec(
            `INSERT INTO ${qTmp} (${selectCols}) SELECT ${selectCols} FROM ${qTable}`,
          );
        }
        await this.driver.exec(`DROP TABLE ${qTable}`);
        await this.driver.exec(`ALTER TABLE ${qTmp} RENAME TO ${quoteColumnName(bareTable)}`);
      });

      // Recreate indexes inside the transaction so failures roll back
      // the entire rebuild rather than leaving a partially-migrated table.
      for (const sql of indexDefs) {
        try {
          await this.driver.exec(sql);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (!msg.includes("no such column") && !msg.includes("already exists")) {
            throw err;
          }
        }
      }

      if (alreadyInTransaction) {
        await this.releaseSavepoint(savepointName);
      } else {
        await this.commit();
      }
    } catch (err) {
      if (alreadyInTransaction) {
        await this.rollbackToSavepoint(savepointName);
        await this.releaseSavepoint(savepointName);
      } else {
        await this.rollback();
      }
      throw err;
    }

    this.schemaCache.clear();
  }

  // --- Rails: table-rebuild helpers (move_table / copy_table family) ---

  /** @internal */
  private async tableInfo(tableName: string): Promise<Record<string, unknown>[]> {
    const pragma = this.supportsVirtualColumns() ? "table_xinfo" : "table_info";
    return this.execute(`PRAGMA ${pragma}(${quoteTableName(tableName)})`, [], "SCHEMA");
  }

  /** @internal */
  private async tableStructureSql(tableName: string, columnNames?: string[]): Promise<string[]> {
    const querySql = `SELECT sql FROM (SELECT * FROM sqlite_master UNION ALL SELECT * FROM sqlite_temp_master) WHERE type = 'table' AND name = ${sqliteQuoteStringLiteral(tableName)}`;
    const structStmt = await this.driver.prepare(querySql);
    const row = (await structStmt.get()) as { sql: string } | undefined;
    if (!row?.sql) return [];
    const body = row.sql.replace(/\);\s*$/, "").replace(/^[^(]*\(/, "");
    const names = columnNames ?? [];
    let splitter: RegExp;
    if (names.length > 0) {
      const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
      splitter = new RegExp(`,(?=\\s(?:CONSTRAINT|"(?:${escaped})"))`, "i");
    } else {
      splitter = /,(?=\s(?:CONSTRAINT|"))/;
    }
    return body.split(splitter).map((s) => s.trim());
  }

  /** @internal */
  private async tableStructureWithCollation(
    tableName: string,
    basicStructure: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const COLLATE_REGEX = /.*"(\w+)".*collate\s+"(\w+)".*/i;
    const AI_REGEX = /.*"(\w+)".+PRIMARY KEY AUTOINCREMENT/i;
    const GENERATED_REGEX = /.*"(\w+)".+GENERATED ALWAYS AS \((.+)\) (?:STORED|VIRTUAL)/i;
    const colNames = basicStructure.map((c) => String(c["name"]));
    const strings = await this.tableStructureSql(tableName, colNames);
    if (!strings.length) return basicStructure.map((c) => ({ ...c }));
    const collations: Record<string, string> = {};
    const autoIncrements: Record<string, boolean> = {};
    const generated: Record<string, string> = {};
    for (const s of strings) {
      const cm = COLLATE_REGEX.exec(s);
      if (cm) collations[cm[1]] = cm[2];
      const aim = AI_REGEX.exec(s);
      if (aim) autoIncrements[aim[1]] = true;
      const gm = GENERATED_REGEX.exec(s);
      if (gm) generated[gm[1]] = gm[2];
    }
    return basicStructure.map((col) => {
      const name = String(col["name"]);
      const out: Record<string, unknown> = { ...col };
      if (collations[name] !== undefined) out["collation"] = collations[name];
      if (autoIncrements[name]) out["auto_increment"] = true;
      if (generated[name] !== undefined) out["dflt_value"] = generated[name];
      return out;
    });
  }

  /** @internal */
  private async tableStructure(tableName: string): Promise<Record<string, unknown>[]> {
    const structure = await this.tableInfo(tableName);
    if (!structure.length) {
      throw new StatementInvalid(`Could not find table '${tableName}'`, { sql: "", binds: [] });
    }
    return await this.tableStructureWithCollation(tableName, structure);
  }

  /** @internal */
  private async moveTable(
    from: string,
    to: string,
    options: { rename?: Record<string, string>; temporary?: boolean } = {},
    block?: (colDefs: string[]) => void,
  ): Promise<void> {
    await this.copyTable(from, to, options, block);
    await this.driver.exec(`DROP TABLE ${quoteTableName(from)}`);
  }

  /** @internal */
  private async copyTable(
    from: string,
    to: string,
    options: { rename?: Record<string, string>; temporary?: boolean } = {},
    block?: (colDefs: string[]) => void,
  ): Promise<void> {
    const fromPk = await this.primaryKey(from);
    const fromCols = await this.columns(from);
    const rename = options.rename ?? {};
    const pkCols: string[] = Array.isArray(fromPk) ? fromPk : fromPk ? [fromPk] : [];
    const compositePk = pkCols.length > 1;
    const colDefs: string[] = [];
    const contentCols: string[] = [];
    for (const col of fromCols) {
      const sqlite3Col = col as Sqlite3Column;
      const destName = rename[col.name] ?? col.name;
      const sqlType = col.sqlTypeMetadata?.sqlType ?? "TEXT";
      let def = `${quoteColumnName(destName)} ${sqlType}`;
      if (col.collation) def += ` COLLATE ${quoteColumnName(col.collation)}`;
      if (!compositePk && pkCols.includes(col.name)) def += " PRIMARY KEY";
      if (!col.null) def += " NOT NULL";
      if (!sqlite3Col.autoIncrement && col.default !== null && col.default !== undefined) {
        def += ` DEFAULT ${this.quoteDefault(col.default)}`;
      }
      colDefs.push(def);
      if (!sqlite3Col.isVirtual()) contentCols.push(destName);
    }
    if (compositePk) {
      const renamedPks = pkCols.map((c) => rename[c] ?? c);
      colDefs.push(`PRIMARY KEY(${renamedPks.map((n) => quoteColumnName(n)).join(", ")})`);
    }
    if (block) block(colDefs);
    const prefix = options.temporary ? "CREATE TEMPORARY TABLE" : "CREATE TABLE";
    await this.driver.exec(`${prefix} ${quoteTableName(to)} (${colDefs.join(", ")})`);
    await this.copyTableIndexes(from, to, rename);
    await this.copyTableContents(from, to, contentCols, rename);
  }

  /** @internal */
  private async copyTableIndexes(
    from: string,
    to: string,
    rename: Record<string, string> = {},
  ): Promise<void> {
    const idxRows = (await this.indexes(from)) as Array<{
      name: string;
      columns: string[];
      unique: boolean;
      where?: string;
    }>;
    const { bare: bareFrom } = this._splitTableName(from);
    const { bare: bareTo } = this._splitTableName(to);
    const toCols = (await this.columns(to)).map((c) => c.name);
    for (const idx of idxRows) {
      let name = idx.name;
      if (to === `a${from}`) name = `t${name}`;
      else if (from === `a${to}`) name = name.slice(1);
      const cols = idx.columns.map((c) => rename[c] ?? c).filter((c) => toCols.includes(c));
      if (!cols.length) continue;
      const escapedFrom = bareFrom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const newName = name.replace(new RegExp(`(^|_)(${escapedFrom})_`), `$1${bareTo}_`);
      let sql = `CREATE ${idx.unique ? "UNIQUE " : ""}INDEX ${quoteColumnName(newName)} ON ${quoteTableName(to)} (${cols.map((c) => quoteColumnName(c)).join(", ")})`;
      if (idx.where) sql += ` WHERE ${idx.where}`;
      await this.driver.exec(sql);
    }
  }

  /** @internal */
  private async copyTableContents(
    from: string,
    to: string,
    columns: string[],
    rename: Record<string, string> = {},
  ): Promise<void> {
    // rename maps {srcCol: destCol}; build dest→src for lookup
    const destToSrc: Record<string, string> = Object.fromEntries(columns.map((n) => [n, n]));
    for (const [srcCol, destCol] of Object.entries(rename)) destToSrc[destCol] = srcCol;
    const fromCols = (await this.columns(from)).map((c) => c.name);
    const validCols = columns.filter((col) => fromCols.includes(destToSrc[col]));
    if (!validCols.length) return;
    const fromColsToCopy = validCols.map((col) => destToSrc[col]);
    const quotedDest = validCols.map((c) => quoteColumnName(c)).join(", ");
    const quotedSrc = fromColsToCopy.map((c) => quoteColumnName(c)).join(", ");
    await this.driver.exec(
      `INSERT INTO ${quoteTableName(to)} (${quotedDest}) SELECT ${quotedSrc} FROM ${quoteTableName(from)}`,
    );
  }

  private _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    const msg = e instanceof Error ? e.message : String(e);
    // Wrap non-Error throws so translateException always receives an Error.
    // Preserve the original value as .cause and copy .code so code-based
    // classification in translateException still works for non-Error throws.
    let exc: Error;
    if (e instanceof Error) {
      exc = e;
    } else {
      exc = new Error(msg, { cause: e });
      const code = (e as any)?.code;
      if (code !== undefined) (exc as any).code = code;
    }
    return translateException(exc, msg, sql, binds);
  }

  /** @internal */
  override buildStatementPool(): GenericStatementPool<SqliteStatement> {
    return new GenericStatementPool<SqliteStatement>(this._statementLimit);
  }

  /** @internal */
  private connect(): void {
    try {
      const driverOpt = (this._config as SQLite3AdapterOptions).driver;
      let factory: SqliteDriver;
      if (driverOpt !== null && typeof driverOpt === "object") {
        if (
          typeof (driverOpt as SqliteDriver).name !== "string" ||
          typeof (driverOpt as SqliteDriver).open !== "function"
        ) {
          throw new TypeError(
            "config.driver must be a registered driver name or a SqliteDriver " +
              "(object with `name: string` and `open(config)` function).",
          );
        }
        factory = driverOpt as SqliteDriver;
      } else {
        factory = getSqlite(driverOpt);
      }
      if (!factory.openSync) {
        throw new Error(
          `SQLite driver "${factory.name}" does not support sync open(). ` +
            "Async drivers require an async constructor path (not yet implemented).",
        );
      }
      const syncConn = factory.openSync({ database: this._filename, readOnly: this._readonly });
      // Pre-warm version cache while the connection is a known-sync handle so
      // getDatabaseVersion() never needs to touch this.driver directly. (#1269)
      const vRow = syncConn.prepare("SELECT sqlite_version() AS v").get() as any;
      this._databaseVersion = new Version(vRow?.v ?? "0.0.0");
      this.driver = syncConn as SqliteConnection;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new DatabaseConnectionError(`Unable to open database '${this._filename}': ${msg}`, {
        cause: e,
      });
    }
  }

  /** @internal */
  override configureConnection(): void {
    // Mirrors Rails: AbstractAdapter#configure_connection → check_version.
    super.configureConnection();
    if (!this._readonly) {
      // Apply Rails DEFAULT_PRAGMAS best-effort: an unsupported PRAGMA on a
      // non-standard SQLite build should warn, not abort construction.
      const defaults: [string, string][] = [
        ["foreign_keys", "ON"],
        ["journal_mode", "WAL"],
        ["synchronous", "NORMAL"],
        ["mmap_size", "134217728"],
        ["journal_size_limit", "67108864"],
        ["cache_size", "2000"],
      ];
      for (const [pragma, value] of defaults) {
        try {
          this.driver.pragma(`${pragma} = ${value}`);
        } catch (e) {
          console.warn(
            `SQLite default pragma '${pragma}' failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
    // Best-effort: set DQS for drivers that support it (e.g. node:sqlite with a
    // build that exposes SQLITE_DBCONFIG_DQS_*). better-sqlite3 compiles SQLite
    // with SQLITE_DQS=0 and silently ignores these pragmas (returns []); other
    // drivers may throw on unrecognised pragmas, so we guard with try/catch.
    const dqsValue = this._strict ? "OFF" : "ON";
    for (const dqsPragma of ["dqs_ddl", "dqs_dml"]) {
      try {
        this.driver.pragma(`${dqsPragma} = ${dqsValue}`);
      } catch (e) {
        console.warn(
          `SQLite DQS pragma '${dqsPragma}' failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const pragmas = (this._config as SQLite3AdapterOptions).pragmas;
    if (pragmas) {
      // Validate pragma name is a safe SQLite identifier before interpolating.
      const SAFE_PRAGMA_NAME = /^\w+$/;
      // Restrict values to identifier-like strings (enum pragmas) or scalars.
      const SAFE_PRAGMA_VALUE = /^\w+$/;
      for (const [pragma, value] of Object.entries(pragmas)) {
        if (!SAFE_PRAGMA_NAME.test(pragma)) {
          console.warn(`Skipping invalid SQLite pragma name: ${pragma}`);
          continue;
        }
        const scalar =
          typeof value === "boolean"
            ? value
              ? "1"
              : "0"
            : typeof value === "number"
              ? String(value)
              : SAFE_PRAGMA_VALUE.test(value)
                ? value
                : null;
        if (scalar === null) {
          console.warn(`Skipping SQLite pragma '${pragma}': value contains unsafe characters`);
          continue;
        }
        try {
          this.driver.pragma(`${pragma} = ${scalar}`);
        } catch (e) {
          console.warn(
            `SQLite pragma '${pragma}' failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  /** @internal */
  static override initializeTypeMap(m: TypeMap): void {
    const sqlite3Int = (limit?: number) => new IntegerType({ limit: limit ?? 8 });
    m.registerType("string", new StringType());
    m.registerType("text", new TextType());
    m.registerType("integer", sqlite3Int());
    m.registerType("float", new FloatType());
    m.registerType(/decimal|numeric/i, undefined, (sqlType) => {
      const precisionMatch = /\(\s*(\d+)/.exec(sqlType);
      const precision = precisionMatch ? parseInt(precisionMatch[1], 10) : undefined;
      const scaleMatch = /\(\s*\d+\s*,\s*(\d+)\s*\)/.exec(sqlType);
      const scale = scaleMatch
        ? parseInt(scaleMatch[1], 10)
        : precision !== undefined
          ? 0
          : undefined;
      if (scale === 0) return new DecimalWithoutScale({ precision });
      return new DecimalType({ precision, scale });
    });
    m.registerType("decimal", new DecimalType());
    m.registerType("boolean", new BooleanType());
    // better-sqlite3 returns datetime columns as TEXT; SQLiteDateTimeType converts
    // offset-less strings to Temporal.Instant using the configured default_timezone.
    m.registerType("date", new DateType());
    m.registerType("datetime", new SQLiteDateTimeType());
    m.registerType("timestamp", new SQLiteDateTimeType());
    m.registerType("time", new TimeType());
    m.registerType("blob", new BinaryType());
    m.registerType("binary", new BinaryType());
    m.registerType("json", new JsonType());
    m.registerType("numeric", new DecimalWithoutScale());
    // SQLite type affinity — regex matches for flexible type names
    m.registerType(/int/i, undefined, (k) => (/bigint/i.test(k) ? sqlite3Int(8) : sqlite3Int()));
    // Explicit "bigint" registered after /int/i so it takes priority on exact matches.
    m.registerType("bigint", sqlite3Int(8));
    m.registerType(/char/i, undefined, () => new StringType());
    m.registerType(/clob/i, undefined, () => new TextType());
    m.registerType(/blob/i, undefined, () => new BinaryType());
    m.registerType(/real|floa|doub/i, undefined, () => new FloatType());
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::StatementPool
 *
 * SQLite3-specific statement pool backed by the generic StatementPool.
 */
export class StatementPool extends GenericStatementPool<SqliteStatement> {}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::SQLite3Integer
 *
 * SQLite stores integers as up to 8-byte signed values. This type
 * represents the range of values SQLite can natively handle.
 */
export class SQLite3Integer {
  static readonly MIN = -(2n ** 63n);
  static readonly MAX = 2n ** 63n - 1n;

  static inRange(value: bigint | number): boolean {
    const v = BigInt(value);
    return v >= SQLite3Integer.MIN && v <= SQLite3Integer.MAX;
  }
}

const REFERENTIAL_ACTION_MAP: Record<string, string> = {
  nullify: "SET NULL",
  cascade: "CASCADE",
  restrict: "RESTRICT",
  set_default: "SET DEFAULT",
  no_action: "NO ACTION",
};

function normalizeReferentialAction(action: string): string {
  return REFERENTIAL_ACTION_MAP[action.toLowerCase()] ?? action.toUpperCase();
}

/** @internal */
function bindParamsLength(): number {
  // https://www.sqlite.org/limits.html — default SQLITE_LIMIT_VARIABLE_NUMBER
  return 999;
}

/** @internal */
function extractValueFromDefault(default_: string | null): unknown {
  return sqliteExtractValueFromDefault(default_);
}

/** @internal */
function extractDefaultFunction(defaultValue: unknown, default_: string): string | undefined {
  return hasDefaultFunction(defaultValue, default_) ? default_ : undefined;
}

/** @internal */
function hasDefaultFunction(defaultValue: unknown, default_: string): boolean {
  return (
    defaultValue == null &&
    /\w+\(.*\)|CURRENT_TIME|CURRENT_DATE|CURRENT_TIMESTAMP|\|\|/.test(default_)
  );
}

/** @internal */
function isInvalidAlterTableType(type: string, options: Record<string, unknown>): boolean {
  return (
    type === "primary_key" ||
    Boolean(options["primary_key"]) ||
    (options["null"] === false && options["default"] == null) ||
    (type === "virtual" && Boolean(options["stored"]))
  );
}

/** @internal */
function translateException(
  exception: Error,
  message: string,
  sql: string,
  binds: unknown[],
): Error {
  const msg = exception.message;
  const code = (exception as any)?.code as string | undefined;
  if (
    code?.includes("CONSTRAINT_UNIQUE") ||
    /(column(s)? .* (is|are) not unique|UNIQUE constraint failed: .*)/i.test(msg)
  ) {
    return new RecordNotUnique(message, { sql, binds, cause: exception });
  }
  if (
    code?.includes("CONSTRAINT_NOTNULL") ||
    /(.* may not be NULL|NOT NULL constraint failed: .*)/i.test(msg)
  ) {
    return new NotNullViolation(message, { sql, binds, cause: exception });
  }
  if (code?.includes("CONSTRAINT_FOREIGNKEY") || /FOREIGN KEY constraint failed/i.test(msg)) {
    return new InvalidForeignKey(message, { sql, binds, cause: exception });
  }
  if (msg.includes("String or BLOB exceeded size limit")) {
    return new ValueTooLong(message, { sql, binds, cause: exception });
  }
  if (_isSqliteMissingDbError(exception)) {
    return new NoDatabaseError(message, { sql, binds, cause: exception });
  }
  if (/called on a closed database/i.test(msg)) {
    return new ConnectionNotEstablished(message, { cause: exception });
  }
  return new StatementInvalid(message, { sql, binds, cause: exception });
}
