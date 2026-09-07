import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { anybits, fetch, hasKey } from "@blazetrails/ruby-compat";
import type {
  SqliteBinds,
  SqliteConnection,
  SqliteDriver,
  SqliteOpenConfig,
  SqliteStatement,
} from "../sqlite-adapter.js";
import { SQLite3Constants } from "../sqlite-adapter.js";
import { Visitors } from "@blazetrails/arel";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { AddReferenceOptions } from "./abstract/schema-definitions.js";
import type { InsertBuilder } from "../insert-all.js";
import type { SQLite3AdapterOptions, SQLite3Config } from "./pool-config.js";
import { AbstractAdapter, Version } from "./abstract-adapter.js";
import { ActiveRecord } from "../ar-config.js";
import { isRubyTruthy } from "../ruby-truthy.js";
import { isInMemoryDatabase } from "../sqlite/sqlite-uri.js";
import { SchemaCreation as SQLite3SchemaCreation } from "./sqlite3/schema-creation.js";
import {
  SQLITE3_NATIVE_DATABASE_TYPES,
  type NativeDatabaseTypes,
} from "./abstract/native-database-types.js";
import { TableDefinition as SQLite3TableDefinition } from "./sqlite3/schema-definitions.js";
import {
  dataSourceSql as sqliteDataSourceSql,
  extractValueFromDefault as sqliteExtractValueFromDefault,
  indexes as sqliteIndexes,
  newColumnFromField,
  validTableDefinitionOptions as sqliteValidTableDefinitionOptions,
  validateIndexLengthBang as sqliteValidateIndexLengthBang,
  addForeignKey as sqliteAddForeignKey,
  removeForeignKey as sqliteRemoveForeignKey,
  checkConstraints as sqliteCheckConstraints,
  addCheckConstraint as sqliteAddCheckConstraint,
  removeCheckConstraint as sqliteRemoveCheckConstraint,
  virtualTableExists as sqliteVirtualTableExists,
} from "./sqlite3/schema-statements.js";
import { dirtiesQueryCache } from "./abstract/query-cache.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";
import {
  StatementInvalid,
  RecordNotUnique,
  InvalidForeignKey,
  NotNullViolation,
  NoDatabaseError,
  ConnectionNotEstablished,
  DatabaseConnectionError,
  StatementTimeout,
} from "../errors.js";
import { ArgumentError, BinaryData } from "@blazetrails/activemodel";
import { deprecator } from "../deprecator.js";
import { TypeMap } from "../type/type-map.js";
import { DateTime as ARDateTimeType } from "../type/date-time.js";
import { IntegerType, FloatType } from "@blazetrails/activemodel";
import { isBlank, runLoadHooks, trailsRoot } from "@blazetrails/activesupport";
import { File, FileUtils } from "@blazetrails/ruby-compat";
import {
  returningColumnValues as sqliteReturningColumnValues,
  buildTruncateStatement as sqliteBuildTruncateStatement,
  executeBatch as sqliteExecuteBatch,
  castResult as sqliteCastResult,
  affectedRows as sqliteAffectedRows,
  performQuery as sqlitePerformQuery,
  highPrecisionCurrentTimestamp as sqliteHighPrecisionCurrentTimestamp,
  beginDbTransaction as sqliteBeginDbTransaction,
  beginDeferredTransaction as sqliteBeginDeferredTransaction,
  beginIsolatedDbTransaction as sqliteBeginIsolatedDbTransaction,
  commitDbTransaction as sqliteCommitDbTransaction,
  execRollbackDbTransaction as sqliteExecRollbackDbTransaction,
  resetIsolationLevel as sqliteResetIsolationLevel,
  execute as sqliteExecute,
  defaultInsertValue as sqliteDefaultInsertValue,
  explain as sqliteExplain,
  isWriteQuery as sqliteIsWriteQuery,
} from "./sqlite3/database-statements.js";
import { Result } from "../result.js";
import {
  quote as sqliteQuote,
  typeCast as sqliteTypeCast,
  quoteString as sqliteQuoteString,
  quoteTableName,
  quoteColumnName,
  quoteTableNameForAssignment as sqliteQuoteTableNameForAssignment,
  quotedTrue as sqliteQuotedTrue,
  unquotedTrue as sqliteUnquotedTrue,
  quotedFalse as sqliteQuotedFalse,
  unquotedFalse as sqliteUnquotedFalse,
  quotedBinary as sqliteQuotedBinary,
  quotedTime as sqliteQuotedTime,
} from "./sqlite3/quoting.js";
import { isSqlLiteral, type QuotingDispatchHost } from "./abstract/quoting.js";
import {
  CheckConstraintDefinition,
  ForeignKeyDefinition,
  type AddForeignKeyOptions,
  type ColumnType,
  type ColumnOptions,
  type RemoveForeignKeyOptions,
  type IndexDefinition,
} from "./abstract/schema-definitions.js";
import { Column } from "./column.js";
import { Column as Sqlite3Column } from "./sqlite3/column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { SchemaDumper as Sqlite3SchemaDumper } from "./sqlite3/schema-dumper.js";

function _driverBind(this: QuotingDispatchHost, value: unknown): unknown {
  let bindsAsFloat = false;
  if (value && typeof value === "object" && "valueForDatabase" in value) {
    const attr = value as { valueForDatabase: unknown; type?: unknown };
    bindsAsFloat = attr.type instanceof FloatType;
    value = attr.valueForDatabase;
  }
  return sqliteTypeCast.call(this, value, bindsAsFloat);
}

function isStructuredDefault(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== "object" || isSqlLiteral(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function _isSqliteMissingDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  return (
    e.code === "SQLITE_CANTOPEN" ||
    (typeof e.message === "string" && /unable to open database file/i.test(e.message))
  );
}

let sqlite3TypeMap: TypeMap | undefined;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SQLite3Adapter extends AbstractAdapter implements DatabaseAdapter {
  static override readonly ADAPTER_NAME = "SQLite";

  get schemaCreation(): SQLite3SchemaCreation {
    return new SQLite3SchemaCreation(this);
  }

  /** @internal */
  createTableDefinition(
    name: string,
    options: Record<string, unknown> = {},
  ): SQLite3TableDefinition {
    return new SQLite3TableDefinition(this, name, options);
  }

  static strictStringsByDefault: boolean = false;

  static columnNameMatcher(): RegExp {
    const id = String.raw`(?:\w+|"(?:[^"]|"")*")`;
    const col = String.raw`(?:${id}\.)?${id}`;
    const fn2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
    const fn1 = String.raw`\w+\(\s*(?:\*|${col}|${fn2})?\s*\)`;
    const expr = String.raw`(?:${col}|${fn1})`;
    const aliased = String.raw`${expr}(?:(?:\s+AS)?\s+${id})?`;
    return new RegExp(`^${aliased}(?:\\s*,\\s*${aliased})*$`, "i");
  }

  static columnNameWithOrderMatcher(): RegExp {
    const id = String.raw`(?:\w+|"(?:[^"]|"")*")`;
    const col = String.raw`(?:${id}\.)?${id}`;
    const fn2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
    const fn1 = String.raw`\w+\(\s*(?:\*|${col}|${fn2})?\s*\)`;
    const expr = String.raw`(?:${col}|${fn1})`;
    const ordered = String.raw`${expr}(?:\s+COLLATE\s+(?:\w+|"\w+"))?(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?`;
    return new RegExp(`^${ordered}(?:\\s*,\\s*${ordered})*$`, "i");
  }

  static override quoteColumnName(name: unknown): string {
    return quoteColumnName(name);
  }

  static override quoteTableName(name: unknown): string {
    return quoteTableName(name);
  }

  /** @internal */
  override arelVisitor(): Visitors.ToSql {
    return new Visitors.SQLite(this);
  }

  /** @internal */
  bindParamsLength(): number {
    return 999;
  }

  /** @internal */
  get _rawConnection(): SqliteConnection {
    return this._connection as unknown as SqliteConnection;
  }
  /** @internal */
  set _rawConnection(value: SqliteConnection) {
    this._connection = value as unknown as AbstractAdapter | null;
  }
  private _asyncConnectPending = false;
  private _connectingPromise: Promise<void> | null = null;
  private _closingDriver: Promise<void> | null = null;
  override async active(): Promise<boolean> {
    await this.whenClosed();
    return this._rawConnection?.isOpen() ?? false;
  }
  /** @internal */
  protected async sqliteConnection(): Promise<SqliteConnection> {
    await this.ensureConnected();
    return this._rawConnection;
  }

  private _readonly: boolean;
  private _strict: boolean;
  /** @internal */
  _statementLock: Promise<void> | null = null;
  /** @internal */
  _lastAffectedRows = 0;
  _lastInsertRowid: number | bigint = 0;
  private _memoryDatabase: boolean;
  private _filename: string;
  /** @internal */
  private _statementLimit = 1000;
  override _statements = this.buildStatementPool();

  /** @internal */
  get _strictStrings(): boolean {
    return this._strict;
  }

  /** @missingRailsCall merge — CONVERGEABLE retire-sqlite3-positional-constructor-overload */
  constructor(config: SQLite3Config);
  /** @deprecated */
  constructor(filename?: string | ":memory:", options?: SQLite3AdapterOptions);
  constructor(
    filenameOrConfig: string | ":memory:" | SQLite3Config = ":memory:",
    options: SQLite3AdapterOptions = {},
  ) {
    let filename: string;
    if (typeof filenameOrConfig === "object") {
      const { database, ...rest } = filenameOrConfig;
      if (database === undefined || database === "") {
        throw new ArgumentError("No database file specified. Missing argument: database");
      }
      filename = database;
      options = rest;
    } else {
      filename = filenameOrConfig;
    }
    const strict = hasKey(options, "strict")
      ? options.strict!
      : SQLite3Adapter.strictStringsByDefault;
    super({ ...options, strict });
    this._memoryDatabase = isInMemoryDatabase(filename);
    if (!this._memoryDatabase && !filename.startsWith("file:")) {
      filename = this.prepareDatabasePath(filename);
    }
    this._filename = filename;
    this._readonly = options.readonly ?? false;
    this._strict = strict;
    if (options.statementLimit !== undefined) {
      this._statementLimit = options.statementLimit;
      this._statements = this.buildStatementPool();
    }
    this._asyncConnectPending = this.driverIsAsync();
  }

  /** @internal */
  private prepareDatabasePath(filename: string): string {
    const expanded = File.expandPath(filename, trailsRoot() ?? undefined);
    const dirname = File.dirname(expanded);
    if (!File.isDirectory(dirname)) {
      try {
        FileUtils.mkdirP(dirname);
      } catch (e) {
        throw new NoDatabaseError(`Could not create database directory '${dirname}'`, { cause: e });
      }
    }
    return expanded;
  }

  /** @internal */
  declare performQuery: typeof sqlitePerformQuery;

  declare highPrecisionCurrentTimestamp: typeof sqliteHighPrecisionCurrentTimestamp;

  /** @internal */
  affectedRows(result?: unknown): number {
    return sqliteAffectedRows.call(this, result);
  }

  async _freshStatement(sql: string): Promise<SqliteStatement> {
    await this.ensureConnected();
    const stmt = await this._rawConnection.prepare(sql);
    this._maybeEnableReadBigInts(sql, stmt);
    return stmt;
  }

  async _cachedStatement(sql: string): Promise<SqliteStatement> {
    await this.ensureConnected();
    if (!this.preparedStatements) {
      const stmt = await this._rawConnection.prepare(sql);
      this._maybeEnableReadBigInts(sql, stmt);
      return stmt;
    }
    let stmt = this._statements.get(sql);
    if (!stmt) {
      stmt = await this._rawConnection.prepare(sql);
      this._maybeEnableReadBigInts(sql, stmt);
      void this._statements.set(sql, stmt);
    }
    return stmt;
  }

  private _maybeEnableReadBigInts(sql: string, stmt: SqliteStatement): void {
    if (this.isWriteQuery(sql) || !stmt.reader) return;
    const cols = stmt.columns();
    if (cols.some((c) => c.type !== null && /bigint/i.test(c.type))) {
      stmt.setReadBigInts(true);
    }
  }

  _narrowSpilledBigInts(stmt: SqliteStatement, rows: Record<string, unknown>[]): void {
    const wide = new Set(
      stmt
        .columns()
        .filter((c) => c.type !== null && /bigint/i.test(c.type))
        .map((c) => c.name),
    );
    if (wide.size === 0) return;
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const value = row[key];
        if (
          typeof value === "bigint" &&
          !wide.has(key) &&
          value >= BigInt(Number.MIN_SAFE_INTEGER) &&
          value <= BigInt(Number.MAX_SAFE_INTEGER)
        ) {
          row[key] = Number(value);
        }
      }
    }
  }

  async executeMutation(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
  ): Promise<number> {
    sql = this.preprocessQuery(sql);
    await this.ensureConnected();
    await this.materializeTransactions();
    const driverBinds = binds.map(_driverBind, this) as SqliteBinds;
    try {
      return await this.log(
        sql,
        name,
        binds,
        this.typeCastedBinds(binds) ?? [],
        false,
        async (payload) => {
          try {
            const counters = { affectedRows: 0, insertRowid: 0 as number | bigint };
            await this.performQuery(this._rawConnection, sql, binds, driverBinds, {
              prepare: false,
              notificationPayload: payload,
              counters,
            });
            const { affectedRows, insertRowid } = counters;
            payload.row_count = affectedRows;

            if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
              return Number(insertRowid);
            }

            return affectedRows;
          } catch (e: any) {
            throw this.translateExceptionClass(e, sql, binds);
          }
        },
      );
    } finally {
      this.dirtyCurrentTransaction();
    }
  }

  /** @internal */
  _previousReadUncommitted: unknown = null;

  override async internalExecute(
    sql: string,
    name: string = "SQL",
    binds: unknown[] = [],
    {
      materializeTransactions = true,
      prepare = false,
      allowRetry = false,
    }: {
      materializeTransactions?: boolean;
      prepare?: boolean;
      allowRetry?: boolean;
    } = {},
  ): Promise<unknown> {
    sql = this.preprocessQuery(sql);
    return this.rawExecute(sql, name, binds, prepare, false, allowRetry, materializeTransactions);
  }

  async createSavepoint(name: string): Promise<void> {
    await this.internalExecute(`SAVEPOINT "${name}"`, "TRANSACTION");
  }

  async releaseSavepoint(name: string): Promise<void> {
    await this.internalExecute(`RELEASE SAVEPOINT "${name}"`, "TRANSACTION");
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    await this.internalExecute(`ROLLBACK TO SAVEPOINT "${name}"`, "TRANSACTION");
  }

  override quote(value: unknown): string {
    return sqliteQuote.call(this, value);
  }

  quotedTime(value: Parameters<typeof sqliteQuotedTime>[0]): string {
    return sqliteQuotedTime(value);
  }

  override typeCast(value: unknown): unknown {
    return sqliteTypeCast.call(this, value);
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  override typeCastedBinds(binds: unknown[] | null | undefined): unknown[] | undefined {
    return binds?.map(_driverBind, this);
  }

  override quoteString(s: string): string {
    return sqliteQuoteString(s);
  }

  override quoteTableNameForAssignment(table: string, attr: string): string {
    return sqliteQuoteTableNameForAssignment(table, attr);
  }

  override quoteDefaultExpression(value: unknown, column: unknown): string {
    if (typeof value === "function") {
      const result = (value as () => unknown)() as string;
      return /^\w+\(.*\)$/.test(result) ? `(${result})` : result;
    }
    return super.quoteDefaultExpression(value, column);
  }

  private serializeDefaultForColumn(value: unknown, sqlType: string | null | undefined): unknown {
    if (!sqlType || !isStructuredDefault(value)) return value;
    const castType = this.lookupCastType(sqlType) as { serialize?(v: unknown): unknown };
    return typeof castType.serialize === "function" ? castType.serialize(value) : value;
  }

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
    if (value instanceof BinaryData || value instanceof Uint8Array) {
      return sqliteQuotedBinary(value);
    }
    if (value instanceof ArrayBuffer) {
      return sqliteQuotedBinary(new Uint8Array(value));
    }
    throw new TypeError(
      `quotedBinary expects a Uint8Array, ArrayBuffer, Buffer, or BinaryData; got ${
        value === null ? "null" : typeof value
      }`,
    );
  }

  async close(): Promise<void> {
    if (this._closingDriver) {
      const closing = this._closingDriver;
      this._closingDriver = null;
      await closing;
    } else {
      await this._rawConnection?.close();
    }
  }

  /** @noRailsEquivalent PERMANENT */
  whenClosed(): Promise<void> {
    return this._closingDriver ?? Promise.resolve();
  }

  get isOpen(): boolean {
    return this._rawConnection?.isOpen() ?? false;
  }

  get raw(): unknown {
    return this._rawConnection?.raw;
  }

  fetchTypeMetadata(sqlType: string): SqlTypeMetadata {
    const raw = sqlType || "";
    const castType = this.lookupCastType(raw);
    return new SqlTypeMetadata({
      sqlType: raw,
      type: castType.type(),
      limit: castType.limit,
      precision: castType.precision,
      scale: castType.scale,
    });
  }

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

  async supportsExpressionIndex(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.9.0") >= 0;
  }

  override supportsForeignKeys(): boolean {
    return true;
  }

  override async supportsCheckConstraints(): Promise<boolean> {
    return true;
  }

  override supportsViews(): boolean {
    return true;
  }

  override supportsDatetimeWithPrecision(): boolean {
    return true;
  }

  override async supportsJson(): Promise<boolean> {
    return true;
  }

  override async supportsCommonTableExpressions(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.8.3") >= 0;
  }

  async supportsInsertReturning(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.35.0") >= 0;
  }

  /** @internal */
  override returningColumnValues(result: Result): unknown[] | undefined {
    return sqliteReturningColumnValues(result);
  }

  /** @internal */
  override async executeBatch(
    statements: string[],
    name?: string | null,
    kwargs?: { allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<void> {
    return sqliteExecuteBatch.call(this, statements, name, kwargs);
  }

  /** @internal */
  override buildTruncateStatement(tableName: string): string {
    return sqliteBuildTruncateStatement.call(this, tableName);
  }

  /** @internal */
  castResult(result: Result): Result {
    return sqliteCastResult(result);
  }

  async supportsInsertOnConflict(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.24.0") >= 0;
  }

  override async supportsInsertOnDuplicateSkip(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }

  override async supportsInsertOnDuplicateUpdate(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }

  override async supportsInsertConflictTarget(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }

  override supportsConcurrentConnections(): boolean {
    return !this._memoryDatabase;
  }

  override async supportsVirtualColumns(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.31.0") >= 0;
  }

  override async supportsIndexSortOrder(): Promise<boolean> {
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

  override isConnected(): boolean {
    return this._rawConnection?.isOpen() ?? false;
  }

  isActive(): boolean {
    return this._rawConnection?.isOpen() ?? false;
  }

  override disconnectBang(): void {
    const ahead = this._statementLock;
    if (ahead) {
      this._chainClose(ahead.then(() => this._disconnect()));
    } else {
      this._disconnect();
    }
  }

  /** @internal */
  private _disconnect(): void {
    const conn = this._rawConnection;
    super.disconnectBang();
    if (conn?.isOpen()) {
      const closing = conn.close();
      if (closing) this._chainClose(closing);
    }
  }

  /** @internal */
  private _chainClose(closing: Promise<void>): void {
    const settled = closing.catch(() => {});
    this._closingDriver = this._closingDriver ? this._closingDriver.then(() => settled) : settled;
  }

  /** @internal */
  override async reconnect(): Promise<void> {
    if (await this.active()) {
      try {
        await this._rawConnection.exec("ROLLBACK");
      } catch {}
    } else {
      this.connect();
      if (this._asyncConnectPending) {
        this._asyncConnectPending = false;
        await this.connectAsync();
      }
    }
  }

  nativeDatabaseTypes(): NativeDatabaseTypes {
    return SQLITE3_NATIVE_DATABASE_TYPES;
  }

  get encoding(): string {
    if (this._encoding !== null) return this._encoding;
    return SQLite3Adapter.parseEncoding(this._rawConnection?.pragma("encoding"));
  }

  private _encoding: string | null = null;

  /** @internal */
  private static parseEncoding(result: unknown): string {
    const rows = result as Array<{ encoding: string }> | undefined;
    return rows?.[0]?.encoding ?? "UTF-8";
  }

  isSharedCache(): boolean {
    if (!this.resolveDriverFactory().capabilities.sharedCache) return false;
    return anybits(fetch(this._config, "flags", 0), SQLite3Constants.Open.SHAREDCACHE);
  }

  /** @missingRailsCall query_value — CONVERGEABLE sqlite-get-database-version-uses-query-value */
  override getDatabaseVersion(): Version | Promise<Version> {
    if (this._rawConnection == null && !this._asyncConnectPending) this.connect();
    const driver = this._rawConnection as SqliteConnection | undefined;
    if (!driver) return new Version("0.0.0");
    const toVersion = (row: unknown) => new Version((row as { v?: string })?.v ?? "0.0.0");
    // eslint-disable-next-line blazetrails/sqlite-driver-await -- both arms handled below: an in-process driver answers directly, an async-only one with a Promise.
    const stmt = driver.prepare("SELECT sqlite_version(*) AS v");
    if (stmt instanceof Promise) {
      return stmt.then(async (s) => toVersion(await s.get()));
    }
    const row = stmt.get();
    if (row instanceof Promise) return row.then(toVersion);
    return toVersion(row);
  }

  override async checkVersion(): Promise<void> {
    if ((await this.databaseVersion).compare("3.8.0") < 0) {
      throw new Error(
        `Your version of SQLite (${await this.databaseVersion}) is too old. Active Record supports SQLite >= 3.8.`,
      );
    }
  }

  static override async databaseExists(config: { database?: string }): Promise<boolean> {
    if (!config.database || config.database === ":memory:") return true;
    try {
      return File.isExist(config.database);
    } catch {
      return false;
    }
  }

  override async databaseExists(): Promise<boolean> {
    return this._memoryDatabase || File.isExist(this._filename);
  }

  /** @missingRailsCall include? — CONVERGEABLE retire-sqlite3-positional-constructor-overload */
  static newClient(
    this: new (filename?: string, options?: SQLite3AdapterOptions) => SQLite3Adapter,
    config: { database?: string; readonly?: boolean },
  ): SQLite3Adapter {
    return new this(config.database ?? ":memory:", { readonly: config.readonly });
  }

  static override dbconsole(
    config: DatabaseConfig,
    options: { mode?: string; header?: boolean } = {},
  ): string[] {
    const args: string[] = [];
    if (isRubyTruthy(options.mode)) args.push(`-${options.mode}`);
    if (options.header) args.push("-header");
    args.push(File.expandPath(config.database!, trailsRoot() ?? undefined));
    return this.findCmdAndExec(ActiveRecord.databaseCli["sqlite"], ...args);
  }

  async primaryKeys(tableName: string): Promise<string[]> {
    const pks = (await this.tableStructure(tableName)).filter((f) => Number(f["pk"]) > 0);
    return pks.sort((a, b) => Number(a["pk"]) - Number(b["pk"])).map((f) => String(f["name"]));
  }

  async removeIndex(
    tableName: string,
    columnName?:
      | string
      | string[]
      | { name?: string; column?: string | string[]; ifExists?: boolean },
    options: { name?: string; column?: string | string[]; ifExists?: boolean } = {},
  ): Promise<void> {
    let column: string | string[] | undefined;
    if (typeof columnName === "string" || Array.isArray(columnName)) {
      column = columnName;
    } else {
      column = undefined;
      options = { ...columnName, ...options };
    }

    if (options.ifExists && !(await this.indexExists(tableName, column, options))) return;

    const indexName = await this.indexNameForRemove(tableName, column, options);

    await this.execQuery(`DROP INDEX ${quoteColumnName(indexName)}`);
  }

  createSchemaDumper(options: Record<string, unknown> = {}): Sqlite3SchemaDumper {
    return Sqlite3SchemaDumper.create(this, options);
  }

  async virtualTableExists(tableName: string): Promise<boolean> {
    return sqliteVirtualTableExists(this, tableName);
  }

  static readonly VIRTUAL_TABLE_REGEX = /USING\s+(\w+)\s*\((.+)\)/i;

  async virtualTables(): Promise<Array<[string, [string, string]]>> {
    const query = "SELECT name, sql FROM sqlite_master WHERE sql LIKE 'CREATE VIRTUAL %';";

    const rows = (await this.execQuery(query, "SCHEMA")).castValues() as unknown[][];
    const memo = new Map<string, [string, string]>();
    for (const row of rows) {
      const [tableName, sql] = row as [string, string];
      const [, moduleName, args] = SQLite3Adapter.VIRTUAL_TABLE_REGEX.exec(sql) ?? [];
      memo.set(tableName, [moduleName, args]);
    }
    return [...memo];
  }

  override async createVirtualTable(
    tableName: string,
    moduleName: string,
    values: string[],
  ): Promise<void> {
    await this.execQuery(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName} USING ${moduleName} (${values.join(", ")})`,
    );
  }

  async dropVirtualTable(
    tableName: string,
    _moduleName?: string,
    _values?: string[],
  ): Promise<void> {
    await this.dropTable(tableName);
  }

  async renameTable(tableName: string, newName: string): Promise<void> {
    this.validateTableLengthBang(newName);
    await this.schemaCache.clearDataSourceCacheBang(tableName);
    await this.schemaCache.clearDataSourceCacheBang(newName);
    await this.execQuery(
      `ALTER TABLE ${quoteTableName(tableName)} RENAME TO ${quoteTableName(newName)}`,
    );
    await this.renameTableIndexes(tableName, newName);
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    if (isInvalidAlterTableType(type, options ?? {})) {
      await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
        definition.column(columnName, type as ColumnType, (options ?? {}) as ColumnOptions);
      });
      return;
    }
    await super.addColumn(tableName, columnName, type as ColumnType, options as ColumnOptions);
  }

  async removeColumn(tableName: string, columnName: string, _type?: string): Promise<void> {
    if ((columnName as string | undefined) === undefined) {
      throw new ArgumentError("wrong number of arguments (given 1, expected 2..3)");
    }
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.removeColumn(columnName);
      deleteForeignKeysForColumns(definition, [columnName]);
    });
  }

  async removeColumns(tableName: string, ...columnNames: string[]): Promise<void> {
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      for (const columnName of columnNames) {
        definition.removeColumn(columnName);
      }
      deleteForeignKeysForColumns(definition, columnNames);
    });
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    const newDefault = this.extractNewDefaultValue(defaultOrChanges);
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.get(columnName)!.options.default = newDefault;
    });
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void> {
    this.validateChangeColumnNullArgumentBang(null_);
    if (!null_ && default_ !== undefined) {
      const existing = (await this.columns(tableName)).find((c) => c.name === columnName);
      const serialized = this.serializeDefaultForColumn(default_, existing?.sqlType ?? null);
      const quotedDefault = this.quoteDefault(serialized);
      await this.internalExecQuery(
        `UPDATE ${quoteTableName(tableName)} SET ${quoteColumnName(columnName)} = ${quotedDefault} WHERE ${quoteColumnName(columnName)} IS NULL`,
      );
    }
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.get(columnName)!.options.null = null_;
    });
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.changeColumn(columnName, type as ColumnType, (options ?? {}) as ColumnOptions);
    });
  }

  async renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void> {
    const column = await this.columnFor(tableName, columnName);
    await this.alterTable(tableName, undefined, undefined, {
      rename: { [column.name]: newColumnName },
    });
    await this.renameColumnIndexes(tableName, column.name, newColumnName);
  }

  async addTimestamps(tableName: string, options?: Record<string, unknown>): Promise<void> {
    const opts: Record<string, unknown> = { ...options };
    if (opts.null == null) opts.null = false;
    if (!("precision" in opts)) opts.precision = 6;

    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.column("created_at", "datetime", opts);
      definition.column("updated_at", "datetime", opts);
    });
  }

  override async addReference(
    tableName: string,
    refName: string,
    options: AddReferenceOptions = {},
  ): Promise<void> {
    return super.addReference(tableName, refName, { type: "integer", ...options });
  }

  override async addBelongsTo(
    tableName: string,
    refName: string,
    options: AddReferenceOptions = {},
  ): Promise<void> {
    return this.addReference(tableName, refName, options);
  }

  private static readonly FK_REGEX =
    /.*FOREIGN KEY\s+\("([^"]+)"\)\s+REFERENCES\s+"(\w+)"\s+\("(\w+)"\)/;
  private static readonly DEFERRABLE_REGEX = /DEFERRABLE INITIALLY (\w+)/;

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    const rows = (
      await this.internalExecQuery(`PRAGMA foreign_key_list(${this.quote(tableName)})`, "SCHEMA")
    ).toArray();
    const fkStrings = (await this.tableStructureSql(tableName)).filter(
      (columnString) =>
        columnString.startsWith("CONSTRAINT") && columnString.includes("FOREIGN KEY"),
    );
    const fkDefs: Record<string, "immediate" | "deferred" | false> = {};
    for (const fkString of fkStrings) {
      const fk = SQLite3Adapter.FK_REGEX.exec(fkString);
      if (!fk) continue;
      const [, from, table, to] = fk;
      const mode = SQLite3Adapter.DEFERRABLE_REGEX.exec(fkString)?.[1];
      fkDefs[`${table},${from},${to}`] =
        mode === undefined ? false : mode.toLowerCase() === "deferred" ? "deferred" : "immediate";
    }
    const groupedFk: Array<Array<Record<string, unknown>>> = [];
    const groupsById: Record<string, Array<Record<string, unknown>>> = {};
    for (const row of rows) {
      const id = String(row.id);
      let group = groupsById[id];
      if (!group) {
        group = groupsById[id] = [];
        groupedFk.push(group);
      }
      group.push(row);
    }

    const results: ForeignKeyDefinition[] = [];
    for (const group of groupedFk) {
      group.sort((a, b) => (a.seq as number) - (b.seq as number));
      const first = group[0];
      const toTable = first.table as string;
      const onDelete = this.extractForeignKeyAction(first.on_delete as string);
      const onUpdate = this.extractForeignKeyAction(first.on_update as string);
      const fromCols = group.map((r) => r.from as string);
      const toCols = group.map((r) => r.to as string);
      const columnKey = fromCols.join(",");
      const primaryKeyKey = toCols.join(",");
      const options: Partial<AddForeignKeyOptions> = {
        onDelete,
        onUpdate,
        deferrable: fkDefs[`${toTable},${columnKey},${primaryKeyKey}`],
      };

      if (group.length === 1) {
        options.column = fromCols[0];
        options.primaryKey = toCols[0];
      } else {
        options.column = fromCols;
        options.primaryKey = toCols;
      }

      results.push(new ForeignKeyDefinition(tableName, toTable, options));
    }
    return results;
  }

  override async buildInsertSql(insert: InsertBuilder): Promise<string> {
    let sql = `INSERT ${await insert.into()}`;

    if (insert.skipDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO NOTHING`;
    } else if (insert.updateDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO UPDATE SET `;
      const raw = insert.rawUpdateSql();
      if (raw) {
        sql += raw.value;
      } else {
        sql += insert.touchModelTimestampsUnless((column) => `${column} IS excluded.${column}`);
        sql += insert
          .updatableColumns()
          .map((column) => `${column}=excluded.${column}`)
          .join(",");
      }
    }

    const ret = insert.returning();
    if (ret) sql += ` RETURNING ${ret}`;
    return sql;
  }

  override async disableReferentialIntegrity(fn: () => Promise<void>): Promise<void> {
    await this.ensureConnected();
    const oldForeignKeys = await this.queryValue("PRAGMA foreign_keys");
    const oldDeferForeignKeys = await this.queryValue("PRAGMA defer_foreign_keys");
    try {
      await this.execute("PRAGMA defer_foreign_keys = ON");
      await this.execute("PRAGMA foreign_keys = OFF");
      await fn();
    } finally {
      await this.execute(`PRAGMA defer_foreign_keys = ${String(oldDeferForeignKeys)}`);
      await this.execute(`PRAGMA foreign_keys = ${String(oldForeignKeys)}`);
    }
  }

  override async checkAllForeignKeysValidBang(): Promise<void> {
    await this.ensureConnected();
    const sql = "PRAGMA foreign_key_check";
    const result = (await this.execute(sql))!;

    if (!isBlank(result)) {
      const tables = result.map((row) => row["table"]);
      throw new StatementInvalid(`Foreign key violations found: ${tables.join(", ")}`, {
        sql,
        connectionPool: this.pool,
      });
    }
  }

  private quoteDefault(value: unknown): string {
    if (value === null) return "NULL";
    if (typeof value === "string") return `'${sqliteQuoteString(value)}'`;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "function") return String(value());
    // boundary: defensive Date branch in SQLite adapter literal quoting.
    if (value instanceof globalThis.Date) return `'${sqliteQuoteString(value.toISOString())}'`;
    if (typeof (value as any)?.toSql === "function") return String((value as any).toSql());
    return `'${sqliteQuoteString(String(value))}'`;
  }

  async tables(): Promise<string[]> {
    const rows = (
      await this.internalExecQuery(
        "SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND name NOT IN ('sqlite_sequence', 'sqlite_schema') AND type IN ('table')",
        "SCHEMA",
      )
    ).toArray() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  async views(): Promise<string[]> {
    const rows = (
      await this.internalExecQuery(
        "SELECT name FROM sqlite_master WHERE type='view' ORDER BY name",
        "SCHEMA",
      )
    ).toArray() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /** @internal */
  dataSourceSql(options: { type?: string }): string;
  /** @internal */
  dataSourceSql(
    nameOrOptions?: string | null | { type?: string },
    options: { type?: string } = {},
  ): string {
    const kwargsOnly = nameOrOptions != null && typeof nameOrOptions === "object";
    const name = kwargsOnly ? null : nameOrOptions;
    const opts = kwargsOnly ? nameOrOptions : options;
    return sqliteDataSourceSql(name ?? undefined, { type: opts.type });
  }

  async tableExists(name: string): Promise<boolean> {
    if (name == null) return false;
    const rows = (
      await this.internalExecQuery(
        `SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND name NOT IN ('sqlite_sequence', 'sqlite_schema') AND name = '${sqliteQuoteString(name)}' AND type IN ('table')`,
        "SCHEMA",
      )
    ).toArray() as Array<{ name: string }>;
    return rows.length > 0;
  }

  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const rows = (
      await this.internalExecQuery(`PRAGMA table_info(${quoteTableName(tableName)})`, "SCHEMA")
    ).toArray() as Array<{ name: string; pk: number }>;
    const pks = rows.filter((r) => r.pk > 0).sort((a, b) => a.pk - b.pk);
    if (pks.length === 0) return null;
    if (pks.length === 1) return pks[0].name;
    return pks.map((r) => r.name);
  }

  /** @internal */
  private newColumnFromField(
    tableName: string,
    field: Record<string, unknown>,
    definitions: Record<string, unknown>[],
  ): Column {
    return newColumnFromField(this, tableName, field, definitions);
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    return sqliteIndexes(this, tableName);
  }

  /** @internal */
  validTableDefinitionOptions(): string[] {
    return sqliteValidTableDefinitionOptions.call(this);
  }

  /** @internal */
  override validateIndexLengthBang(tableName: string, newName: string, internal = false): void {
    sqliteValidateIndexLengthBang.call(this, tableName, newName, internal);
  }

  async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    return sqliteCheckConstraints.call(this, tableName);
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    return sqliteAddForeignKey.call(this, fromTable, toTable, options);
  }

  async removeForeignKey(
    fromTable: string,
    toTable?: string | RemoveForeignKeyOptions,
    options: RemoveForeignKeyOptions = {},
  ): Promise<void> {
    return sqliteRemoveForeignKey.call(this, fromTable, toTable, options);
  }

  async addCheckConstraint(
    tableName: string,
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): Promise<void> {
    return sqliteAddCheckConstraint.call(this, tableName, expression, options);
  }

  async removeCheckConstraint(
    tableName: string,
    expression?:
      | string
      | { name?: string; expression?: string; validate?: boolean; ifExists?: boolean },
    options: {
      name?: string;
      expression?: string;
      validate?: boolean;
      ifExists?: boolean;
    } = {},
  ): Promise<void> {
    return sqliteRemoveCheckConstraint.call(this, tableName, expression, options);
  }

  /** @internal */
  async alterTable(
    tableName: string,
    foreignKeys?: ForeignKeyDefinition[],
    checkConstraints?: CheckConstraintDefinition[],
    options: { rename?: Record<string, string> } = {},
    block?: (definition: SQLite3TableDefinition) => void,
  ): Promise<void> {
    await this.ensureConnected();
    const rename = options.rename ?? {};

    const alteredTableName = `a${tableName}`;

    const fks = foreignKeys ?? (await this.foreignKeys(tableName));
    const checks = checkConstraints ?? (await this.checkConstraints(tableName));

    const caller = (definition: SQLite3TableDefinition): void => {
      for (const fk of fks) {
        const column = typeof fk.column === "string" ? (rename[fk.column] ?? fk.column) : fk.column;
        const toTable = this.stripTableNamePrefixAndSuffix(fk.toTable);
        definition.foreignKey(toTable, {
          column,
          primaryKey: fk.primaryKey,
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
          deferrable: fk.deferrable,
          validate: "validate" in fk.options ? fk.options.validate : undefined,
        });
      }
      definition.checkConstraints.push(...checks);
      block?.(definition);
    };

    await this.transaction(async () => {
      await this.disableReferentialIntegrity(async () => {
        await this.moveTable(tableName, alteredTableName, { ...options, temporary: true });
        await this.moveTable(alteredTableName, tableName, {}, caller);
      });
    });

    this.schemaCache.clearBang();
  }

  /** @internal */
  private async tableInfo(tableName: string): Promise<Record<string, unknown>[]> {
    const pragma = (await this.supportsVirtualColumns()) ? "table_xinfo" : "table_info";
    return (
      await this.internalExecQuery(`PRAGMA ${pragma}(${quoteTableName(tableName)})`, "SCHEMA")
    ).toArray();
  }

  private static readonly UNQUOTED_OPEN_PARENS_REGEX = /\((?![^'"]*['"][^'"]*$)/;
  private static readonly FINAL_CLOSE_PARENS_REGEX = /\);*$/;

  /**
   * @internal
   * @missingRailsCall last — PERMANENT
   * @missingRailsCall union — PERMANENT
   */
  private async tableStructureSql(tableName: string, columnNames?: string[]): Promise<string[]> {
    if (!columnNames) {
      const columnInfo = await this.tableInfo(tableName);
      columnNames = columnInfo.map((column) => String(column["name"]));
    }
    const sql = `SELECT sql FROM
  (SELECT * FROM sqlite_master UNION ALL
   SELECT * FROM sqlite_temp_master)
WHERE type = 'table' AND name = ${this.quote(tableName)}
`;
    const result = (await this.queryValue(sql, "SCHEMA")) as string | null;

    if (!result) return [];

    const openParens = SQLite3Adapter.UNQUOTED_OPEN_PARENS_REGEX.exec(result);
    const partitioned = openParens ? result.slice(openParens.index + openParens[0].length) : "";
    const union =
      columnNames.length > 0
        ? columnNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
        : "(?!)";
    return partitioned
      .replace(SQLite3Adapter.FINAL_CLOSE_PARENS_REGEX, "")
      .split(new RegExp(`,(?=\\s(?:CONSTRAINT|"(?:${union})"))`, "i"))
      .map((columnString) => columnString.trim());
  }

  /** @internal */
  private async tableStructureWithCollation(
    tableName: string,
    basicStructure: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const COLLATE_REGEX = /.*"(\w+)".*collate\s+"(\w+)".*/i;
    const AI_REGEX = /.*"(\w+)".+PRIMARY KEY AUTOINCREMENT/i;
    const GENERATED_REGEX = /.*"(\w+)".+GENERATED ALWAYS AS \((.+)\) (?:STORED|VIRTUAL)/i;
    const columnStrings = await this.tableStructureSql(
      tableName,
      basicStructure.map((column) => String(column["name"])),
    );
    if (!columnStrings.length) return basicStructure.map((c) => ({ ...c }));
    const collationHash: Record<string, string> = {};
    const autoIncrements: Record<string, boolean> = {};
    const generatedColumns: Record<string, string> = {};
    for (const columnString of columnStrings) {
      const cm = COLLATE_REGEX.exec(columnString);
      if (cm) collationHash[cm[1]] = cm[2];
      const aim = AI_REGEX.exec(columnString);
      if (aim) autoIncrements[aim[1]] = true;
      const gm = GENERATED_REGEX.exec(columnString);
      if (gm) generatedColumns[gm[1]] = gm[2];
    }
    return basicStructure.map((col) => {
      const name = String(col["name"]);
      const out: Record<string, unknown> = { ...col };
      if (collationHash[name] !== undefined) out["collation"] = collationHash[name];
      if (autoIncrements[name]) out["auto_increment"] = true;
      if (generatedColumns[name] !== undefined) out["dflt_value"] = generatedColumns[name];
      return out;
    });
  }

  /** @internal */
  private async tableStructure(tableName: string): Promise<Record<string, unknown>[]> {
    const structure = await this.tableInfo(tableName);
    if (!structure.length) {
      throw new StatementInvalid(`Could not find table '${tableName}'`, {
        connectionPool: this.pool,
      });
    }
    return await this.tableStructureWithCollation(tableName, structure);
  }

  /** @internal */
  private async columnDefinitions(tableName: string): Promise<Record<string, unknown>[]> {
    return this.tableStructure(tableName);
  }

  /** @internal */
  private async moveTable(
    from: string,
    to: string,
    options: { rename?: Record<string, string>; temporary?: boolean } = {},
    block?: (definition: SQLite3TableDefinition) => void,
  ): Promise<void> {
    await this.copyTable(from, to, options, block);
    await this.dropTable(from);
  }

  /** @internal */
  private async copyTable(
    from: string,
    to: string,
    options: {
      rename?: Record<string, string>;
      temporary?: boolean;
      force?: boolean | "cascade";
    } = {},
    block?: (definition: SQLite3TableDefinition) => void,
  ): Promise<void> {
    const fromPrimaryKey = await this.primaryKey(from);
    const rename = options.rename ?? {};

    let definition!: SQLite3TableDefinition;
    await this.createTable(to, { ...options, id: false }, async (td) => {
      definition = td as SQLite3TableDefinition;
      if (Array.isArray(fromPrimaryKey)) definition.primaryKeys(fromPrimaryKey);

      for (const column of (await this.columns(from)) as Sqlite3Column[]) {
        const columnName = rename[column.name] ?? column.name;

        const columnOptions: Record<string, unknown> = {
          limit: column.limit,
          precision: column.precision,
          scale: column.scale,
          null: column.null,
          collation: column.collation,
          primaryKey: columnName === fromPrimaryKey,
        };

        if (column.isVirtual()) {
          columnOptions.as = column.defaultFunction;
          columnOptions.stored = column.isVirtualStored();
          columnOptions.type = column.type;
        } else if (column.hasDefault) {
          const type = await this.lookupCastTypeFromColumn(column);
          let defaultValue: unknown = type.deserialize(column.default);
          if (defaultValue == null) defaultValue = () => column.defaultFunction;

          if (!column.isAutoIncrement()) {
            columnOptions.default = defaultValue;
          }
        }

        const columnType = column.isVirtual()
          ? "virtual"
          : column.isBigint()
            ? "bigint"
            : column.type;
        definition.column(columnName, columnType as ColumnType, columnOptions);
      }

      block?.(definition);
    });

    await this.copyTableIndexes(from, to, rename);

    const columnsToCopy = definition.columns
      .filter((col) => !hasKey(col.options as Record<string, unknown>, "as"))
      .map((col) => col.name);
    await this.copyTableContents(from, to, columnsToCopy, rename);
  }

  /** @internal */
  private async copyTableIndexes(
    from: string,
    to: string,
    rename: Record<string, string> = {},
  ): Promise<void> {
    const idxRows = await this.indexes(from);
    for (const idx of idxRows) {
      let name = idx.name;
      if (to === `a${from}`) name = `t${name}`;
      else if (from === `a${to}`) name = name.slice(1);
      let cols: string[] | string;
      if (Array.isArray(idx.columns)) {
        const toCols = (await this.columns(to)).map((c) => c.name);
        cols = idx.columns.map((c) => rename[c] ?? c).filter((c) => toCols.includes(c));
      } else {
        cols = idx.columns;
      }
      if (!cols.length) continue;
      const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const newName = name.replace(new RegExp(`(^|_)(${escapedFrom})_`, "g"), `$1${to}_`);
      const options: {
        name: string;
        internal: boolean;
        unique?: boolean;
        where?: string;
        order?: string | Record<string, string>;
      } = { name: newName, internal: true };
      if (idx.unique) options.unique = true;
      if (idx.where) options.where = idx.where;
      if (idx.orders) options.order = idx.orders;
      await this.addIndex(to, cols, options);
    }
  }

  /** @internal */
  private async copyTableContents(
    from: string,
    to: string,
    columns: string[],
    rename: Record<string, string> = {},
  ): Promise<void> {
    const columnMappings: Record<string, string> = Object.fromEntries(
      columns.map((name) => [name, name]),
    );
    for (const [srcCol, destCol] of Object.entries(rename)) columnMappings[destCol] = srcCol;
    const fromColumns = (await this.columns(from)).map((c) => c.name);
    columns = columns.filter((col) => fromColumns.includes(columnMappings[col]));
    const fromColumnsToCopy = columns.map((col) => columnMappings[col]);
    const quotedColumns = columns.map((col) => quoteColumnName(col)).join(", ");
    const quotedFromColumns = fromColumnsToCopy.map((col) => quoteColumnName(col)).join(", ");
    await this.internalExecQuery(
      `INSERT INTO ${quoteTableName(to)} (${quotedColumns}) SELECT ${quotedFromColumns} FROM ${quoteTableName(from)}`,
    );
  }

  /** @internal */
  override translateException(
    exception: unknown,
    { message, sql, binds }: { message: string; sql: string; binds: unknown[] },
  ): unknown {
    const exceptionMessage = exception instanceof Error ? exception.message : String(exception);
    if (
      /(column(s)? .* (is|are) not unique|UNIQUE constraint failed: .*)/i.test(exceptionMessage)
    ) {
      return new RecordNotUnique(message, { sql, binds, connectionPool: this.pool });
    } else if (/(.* may not be NULL|NOT NULL constraint failed: .*)/i.test(exceptionMessage)) {
      return new NotNullViolation(message, { sql, binds, connectionPool: this.pool });
    } else if (/FOREIGN KEY constraint failed/i.test(exceptionMessage)) {
      return new InvalidForeignKey(message, { sql, binds, connectionPool: this.pool });
    } else if (/called on a closed database/i.test(exceptionMessage)) {
      return new ConnectionNotEstablished(exception as Error, { connectionPool: this.pool });
    } else if ((exception as { code?: string })?.code === "SQLITE_BUSY") {
      return new StatementTimeout(message, { sql, binds, connectionPool: this.pool });
    } else {
      return super.translateException(exception, { message, sql, binds });
    }
  }

  /** @internal */
  override buildStatementPool(): StatementPool {
    return new StatementPool(
      SQLite3Adapter.typeCastConfigToInteger(this._statementLimit) as number,
    );
  }

  /** @internal */
  protected defaultSqliteDriver(): SqliteDriver | undefined {
    return undefined;
  }

  /** @internal */
  private resolveDriverFactory(): SqliteDriver {
    const driverOpt = (this._config as SQLite3AdapterOptions).driver;
    if (driverOpt != null) {
      if (typeof driverOpt.name !== "string" || typeof driverOpt.open !== "function") {
        throw new TypeError(
          "config.driver must be a SqliteDriver " +
            "(object with `name: string` and `open(config)` function).",
        );
      }
      return driverOpt;
    }
    const def = this.defaultSqliteDriver();
    if (!def) {
      throw new Error(
        "No SQLite driver configured. Use a concrete adapter subclass " +
          "(e.g. BetterSQLite3Adapter) or pass a `driver` in the adapter config.",
      );
    }
    return def;
  }

  /**
   * @missingRailsCall new_client — CONVERGEABLE sqlite3-connection-parameters-never-built
   * @internal
   */
  private connect(): void {
    const openConfig = this.openConfig();
    try {
      const factory = this.resolveDriverFactory();
      if (!factory.openSync) {
        this._asyncConnectPending = true;
        return;
      }
      const syncConn = factory.openSync(openConfig);
      this._encoding = SQLite3Adapter.parseEncoding(syncConn.pragma("encoding"));
      this._rawConnection = syncConn as SqliteConnection;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (_isSqliteMissingDbError(e)) {
        throw new NoDatabaseError(`Unable to open database '${this._filename}': ${msg}`, {
          cause: e,
        });
      }
      throw new DatabaseConnectionError(`Unable to open database '${this._filename}': ${msg}`, {
        cause: e,
      });
    }
  }

  private openConfig(): SqliteOpenConfig {
    const cfg = this._config as SQLite3AdapterOptions & Partial<SqliteOpenConfig>;
    return {
      database: this._filename,
      readOnly: this._readonly,
      strict: this._strict,
      timeout: this.castTimeout(),
      noMutex: cfg.noMutex,
      driverOptions: cfg.driverOptions,
    };
  }

  /** @internal */
  private async connectAsync(): Promise<void> {
    const openConfig = this.openConfig();
    try {
      const factory = this.resolveDriverFactory();
      const conn = await factory.open(openConfig);
      this._encoding = SQLite3Adapter.parseEncoding(await conn.pragma("encoding"));
      this._rawConnection = conn;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (_isSqliteMissingDbError(e)) {
        throw new NoDatabaseError(`Unable to open database '${this._filename}': ${msg}`, {
          cause: e,
        });
      }
      throw new DatabaseConnectionError(`Unable to open database '${this._filename}': ${msg}`, {
        cause: e,
      });
    }
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async completeAsyncConnect(): Promise<void> {
    if (!this._asyncConnectPending) return;
    if (!this._connectingPromise) {
      this._connectingPromise = this._doAsyncConnect().finally(() => {
        this._connectingPromise = null;
      });
    }
    return this._connectingPromise;
  }

  /** @internal */
  private async ensureConnected(): Promise<void> {
    if (this._asyncConnectPending) await this.completeAsyncConnect();
    else if (!this.isActive() && this.isReconnectCanRestoreState()) await this.verifyBang();
  }

  /** @internal */
  private async _doAsyncConnect(): Promise<void> {
    await this.connectAsync();
    await this.configureConnection();
    this._asyncConnectPending = false;
  }

  /** @noRailsEquivalent PERMANENT */
  static async openAsync(
    this: new (filename?: string, options?: SQLite3AdapterOptions) => SQLite3Adapter,
    filename: string | ":memory:" = ":memory:",
    options: SQLite3AdapterOptions = {},
  ): Promise<SQLite3Adapter> {
    const adapter = new this(filename, options);
    await adapter.connectBang();
    return adapter;
  }

  /** @internal */
  private driverIsAsync(): boolean {
    return !this.resolveDriverFactory().openSync;
  }

  /** @internal */
  private castTimeout(): number | undefined {
    const cfg = this._config as SQLite3AdapterOptions;
    if (isRubyTruthy(cfg.timeout) && isRubyTruthy(cfg.retries)) {
      throw new ArgumentError("Cannot specify both timeout and retries arguments");
    }
    if (!isRubyTruthy(cfg.timeout)) return undefined;
    const timeout = SQLite3Adapter.typeCastConfigToInteger(cfg.timeout);
    if (typeof timeout !== "number" || !Number.isInteger(timeout)) {
      throw new TypeError(`timeout must be integer, not ${String(timeout)}`);
    }
    return timeout;
  }

  /**
   * @missingRailsArgs fetch — PERMANENT
   * @internal
   */
  override configureConnection(): void | Promise<void> {
    this.castTimeout();
    const cfg = this._config as SQLite3AdapterOptions;
    if (isRubyTruthy(cfg.retries) && !isRubyTruthy(cfg.timeout)) {
      deprecator().warn(
        "The retries option is deprecated and will be removed in Rails 8.1. Use timeout instead.\n",
      );
    }
    const checked = super.configureConnection();

    const stmts: [string, string][] = [];
    if (!this._readonly) {
      const defaults: [string, string][] = [
        ["foreign_keys", "ON"],
        ["journal_mode", "WAL"],
        ["synchronous", "NORMAL"],
        ["mmap_size", "134217728"],
        ["journal_size_limit", "67108864"],
        ["cache_size", "2000"],
      ];
      for (const [p, v] of defaults) stmts.push([`${p} = ${v}`, `SQLite default pragma '${p}'`]);
    }
    const dqsValue = this._strict ? "OFF" : "ON";
    stmts.push(
      [`dqs_ddl = ${dqsValue}`, "SQLite DQS pragma 'dqs_ddl'"],
      [`dqs_dml = ${dqsValue}`, "SQLite DQS pragma 'dqs_dml'"],
    );
    const pragmas = fetch<Record<string, string | number | boolean>>(
      cfg as unknown as Record<string, unknown>,
      "pragmas",
      {},
    );
    const SAFE = /^\w+$/;
    for (const [pragma, value] of Object.entries(pragmas)) {
      if (!SAFE.test(pragma)) {
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
            : SAFE.test(value)
              ? value
              : null;
      if (scalar === null) {
        console.warn(`Skipping SQLite pragma '${pragma}': value contains unsafe characters`);
        continue;
      }
      stmts.push([`${pragma} = ${scalar}`, `SQLite pragma '${pragma}'`]);
    }
    const warn = (label: string, e: unknown) =>
      console.warn(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    if (this.driverIsAsync()) {
      return (async () => {
        await checked;
        for (const [sql, label] of stmts) {
          try {
            await this._rawConnection.pragma(sql);
          } catch (e) {
            warn(label, e);
          }
        }
      })();
    }
    for (const [sql, label] of stmts) {
      try {
        this._rawConnection.pragma(sql);
      } catch (e) {
        warn(label, e);
      }
    }
    return checked;
  }

  /** @internal */
  static override initializeTypeMap(m: TypeMap): void {
    super.initializeTypeMap(m);
    this.registerClassWithLimit(m, /int/i, SQLite3Integer);
    this.registerClassWithPrecision(m, /datetime/i, ARDateTimeType);
    m.aliasType(/timestamp/i, "datetime");
  }

  static override get TYPE_MAP(): TypeMap {
    return (sqlite3TypeMap ??= (() => {
      const m = new TypeMap();
      SQLite3Adapter.initializeTypeMap(m);
      return m;
    })());
  }

  static override readonly EXTENDED_TYPE_MAPS = new Map<string, unknown>();

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  static override extendedTypeMap(options: { defaultTimezone?: string }): TypeMap {
    const m = super.extendedTypeMap(options);
    this.registerClassWithPrecision(m, /^[^(]*datetime/i, ARDateTimeType, {
      timezone: options.defaultTimezone,
    });
    m.aliasType(/^[^(]*timestamp/i, "datetime");
    return m;
  }
}

export class SQLite3Integer extends IntegerType {
  protected override _limit(): number {
    return this.limit ?? 8;
  }
}

export class StatementPool extends GenericStatementPool<SqliteStatement> {
  override reset(): void | Promise<void> {
    return this.clear();
  }

  /** @internal */
  protected override dealloc(stmt: SqliteStatement): void | Promise<void> {
    if (!stmt.closed) return stmt.close();
  }
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
function deleteForeignKeysForColumns(
  definition: SQLite3TableDefinition,
  columnNames: string[],
): void {
  for (let i = definition.foreignKeys.length - 1; i >= 0; i--) {
    const fkColumn = definition.foreignKeys[i].column;
    if (!Array.isArray(fkColumn) && columnNames.includes(fkColumn)) {
      definition.foreignKeys.splice(i, 1);
    }
  }
}

/** @internal */
function isInvalidAlterTableType(type: string, options: Record<string, unknown>): boolean {
  return (
    type === "primary_key" ||
    Boolean(options["primaryKey"]) ||
    (options["null"] === false && options["default"] == null) ||
    (type === "virtual" && Boolean(options["stored"]))
  );
}

dirtiesQueryCache(SQLite3Adapter, "rollbackToSavepoint");
SQLite3Adapter.prototype.beginDbTransaction = sqliteBeginDbTransaction;
SQLite3Adapter.prototype.beginDeferredTransaction = sqliteBeginDeferredTransaction;
SQLite3Adapter.prototype.beginIsolatedDbTransaction = sqliteBeginIsolatedDbTransaction;
SQLite3Adapter.prototype.commitDbTransaction = sqliteCommitDbTransaction;
SQLite3Adapter.prototype.execRollbackDbTransaction = sqliteExecRollbackDbTransaction;
SQLite3Adapter.prototype.resetIsolationLevel = sqliteResetIsolationLevel;
SQLite3Adapter.prototype.execute = sqliteExecute;
SQLite3Adapter.prototype.defaultInsertValue = sqliteDefaultInsertValue;
SQLite3Adapter.prototype.explain = sqliteExplain;
SQLite3Adapter.prototype.isWriteQuery = sqliteIsWriteQuery;

dirtiesQueryCache(SQLite3Adapter, "execute");

SQLite3Adapter.prototype.performQuery = sqlitePerformQuery;
SQLite3Adapter.prototype.highPrecisionCurrentTimestamp = sqliteHighPrecisionCurrentTimestamp;

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/** @internal */
export interface SQLite3Adapter {
  get databaseVersion(): Version | Promise<Version>;
  beginDbTransaction: typeof sqliteBeginDbTransaction;
  beginDeferredTransaction: typeof sqliteBeginDeferredTransaction;
  beginIsolatedDbTransaction: typeof sqliteBeginIsolatedDbTransaction;
  commitDbTransaction: typeof sqliteCommitDbTransaction;
  execRollbackDbTransaction: typeof sqliteExecRollbackDbTransaction;
  resetIsolationLevel: typeof sqliteResetIsolationLevel;
  execute: typeof sqliteExecute;
  defaultInsertValue: typeof sqliteDefaultInsertValue;
  explain: typeof sqliteExplain;
  isWriteQuery: typeof sqliteIsWriteQuery;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

runLoadHooks("active_record_sqlite3adapter", SQLite3Adapter);
