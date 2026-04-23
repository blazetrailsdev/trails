import Database from "better-sqlite3";
import { Visitors } from "@blazetrails/arel";
import type { DatabaseAdapter, ExplainOption, TrailsAdapterOptions } from "../adapter.js";
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
  DatabaseConnectionError,
} from "../errors.js";
import { TypeMap } from "../type/type-map.js";
import { Date as DateType } from "../type/date.js";
import { DateTime as DateTimeType } from "../type/date-time.js";
import { Time as TimeType } from "../type/time.js";
import { Text as TextType } from "../type/text.js";
import { Json as JsonType } from "../type/json.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";
import {
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  BigIntegerType,
  DecimalType,
} from "@blazetrails/activemodel";
import { getFs, Notifications } from "@blazetrails/activesupport";
import { typeCastedBinds } from "./abstract/database-statements.js";
import {
  quote as sqliteQuote,
  typeCast as sqliteTypeCast,
  quoteString,
  quoteTableName,
  quoteColumnName,
} from "./sqlite3/quoting.js";
import {
  CheckConstraintDefinition,
  ForeignKeyDefinition,
  type AddForeignKeyOptions,
} from "./abstract/schema-definitions.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";

/**
 * SQLite adapter — connects ActiveRecord to a real SQLite database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter
 */
export class SQLite3Adapter extends AbstractAdapter implements DatabaseAdapter {
  override get adapterName(): string {
    return "SQLite";
  }

  override get arelVisitor(): Visitors.ToSql {
    return new Visitors.SQLite();
  }

  private db: Database.Database;
  override get active(): boolean {
    return this.db?.open ?? false;
  }
  private _inTransaction = false;
  private _savepointCounter = 0;
  private _readonly: boolean;
  private _preventWrites = false;
  private _nativeTypeMap: TypeMap;
  private _memoryDatabase: boolean;
  private _filename: string;
  private _statementPool = new GenericStatementPool<Database.Statement>();

  private static _isMemoryFilename(filename: string): boolean {
    if (filename === ":memory:") return true;
    if (!filename.startsWith("file:")) return false;
    return filename.startsWith("file::memory:") || filename.includes("mode=memory");
  }

  // Rails' `statement_limit` database.yml key. SQLite has a single
  // connection (no pool), so the adapter owns exactly one pool and the
  // setter resizes it directly.
  private _statementLimit = 1000;

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

  constructor(
    filename: string | ":memory:" = ":memory:",
    options: TrailsAdapterOptions & { readonly?: boolean } = {},
  ) {
    super();
    this._filename = filename;
    this._memoryDatabase = SQLite3Adapter._isMemoryFilename(filename);
    this._readonly = options.readonly ?? false;
    // Rails: `SQLite3Adapter#default_prepared_statements` inherits the
    // abstract adapter's `true`. Mirror that default and let options
    // override per connection.
    this.preparedStatements = options.preparedStatements ?? true;
    // Apply adapter-level options FIRST so invalid values fail before
    // the native driver opens a file handle that would otherwise leak.
    if (options.statementLimit !== undefined) this.statementLimit = options.statementLimit;
    try {
      this.db = new Database(filename, { readonly: this._readonly });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new DatabaseConnectionError(`Unable to open database '${filename}': ${msg}`, {
        cause: e,
      });
    }
    if (!this._readonly) {
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
    }
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
        const stmt = this._cachedStatement(sql);
        const rows = stmt.all(...binds) as Record<string, unknown>[];
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

  private _cachedStatement(sql: string): Database.Statement {
    // When preparedStatements is off, skip the pool and prepare per call —
    // matches Rails' `statement_pool` behavior gated on
    // `prepared_statements`. better-sqlite3 still uses its own statement
    // handle internally, but we no longer cache across executes.
    if (!this.preparedStatements) {
      return this.db.prepare(sql);
    }
    let stmt = this._statementPool.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this._statementPool.set(sql, stmt);
    }
    return stmt;
  }

  /**
   * Get or set a PRAGMA value.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#pragma
   */
  pragma(name: string): unknown {
    return this.db.pragma(name);
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
        const stmt = this._cachedStatement(sql);
        const result = stmt.run(...binds);
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
  async beginDeferredTransaction(): Promise<void> {
    return this.beginDbTransaction();
  }

  async beginDbTransaction(): Promise<void> {
    if (!this._inTransaction) {
      this.db.exec("BEGIN");
      this._inTransaction = true;
    }
  }

  async beginTransaction(): Promise<void> {
    this.db.exec("BEGIN");
    this._inTransaction = true;
  }

  /**
   * Commit the current transaction.
   */
  async commitDbTransaction(): Promise<void> {
    this.db.exec("COMMIT");
    this._inTransaction = false;
  }

  async commit(): Promise<void> {
    return this.commitDbTransaction();
  }

  async rollbackDbTransaction(): Promise<void> {
    this.db.exec("ROLLBACK");
    this._inTransaction = false;
  }

  async rollback(): Promise<void> {
    return this.rollbackDbTransaction();
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    this.db.exec(`SAVEPOINT "${name}"`);
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    this.db.exec(`RELEASE SAVEPOINT "${name}"`);
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    this.db.exec(`ROLLBACK TO SAVEPOINT "${name}"`);
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
    const rows = this.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds) as Record<
      string,
      unknown
    >[];
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
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check if the database is open.
   */
  get isOpen(): boolean {
    return this.db.open;
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
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Get the underlying better-sqlite3 Database instance.
   * Escape hatch for advanced usage.
   */
  get raw(): Database.Database {
    return this.db;
  }

  /**
   * Resolve a SQL column type string to an ActiveRecord Type instance.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#lookup_cast_type
   */
  lookupCastType(sqlType: string): import("@blazetrails/activemodel").Type {
    // Strip precision/scale metadata and normalize for lookup.
    // e.g. "DECIMAL(10, 0)" → "decimal", "VARCHAR(255)" → "varchar"
    const normalized = sqlType
      .toLowerCase()
      .replace(/\(.*\)/, "")
      .trim();
    return this._nativeTypeMap.lookup(normalized);
  }

  get nativeTypeMap(): TypeMap {
    return this._nativeTypeMap;
  }

  private static _buildTypeMap(): TypeMap {
    const map = new TypeMap();
    map.registerType("string", new StringType());
    map.registerType("text", new TextType());
    map.registerType("integer", new IntegerType());
    map.registerType("float", new FloatType());
    map.registerType("decimal", new DecimalType());
    map.registerType("boolean", new BooleanType());
    map.registerType("date", new DateType());
    map.registerType("datetime", new DateTimeType());
    map.registerType("time", new TimeType());
    map.registerType("blob", new BinaryType());
    map.registerType("binary", new BinaryType());
    map.registerType("json", new JsonType());
    map.registerType("bigint", new BigIntegerType());
    map.registerType("numeric", new DecimalWithoutScale());
    // SQLite type affinity — regex matches for flexible type names
    map.registerType(/int/i, undefined, (lookupKey) => {
      if (/bigint/i.test(lookupKey)) return new BigIntegerType();
      return new IntegerType();
    });
    map.registerType(/char|clob/i, undefined, () => new StringType());
    map.registerType(/blob/i, undefined, () => new BinaryType());
    map.registerType(/real|floa|doub/i, undefined, () => new FloatType());
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
    return this.db.open;
  }

  isActive(): boolean {
    return this.db.open;
  }

  override clearCacheBang(): void {
    super.clearCacheBang();
    this._statementPool.clear();
  }

  override disconnectBang(): void {
    super.disconnectBang();
    if (this.db.open) {
      this.db.close();
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
    const result = this.db.pragma("encoding") as Array<{ encoding: string }>;
    return result[0]?.encoding ?? "UTF-8";
  }

  isSharedCache(): boolean {
    const SQLITE_OPEN_SHAREDCACHE = 0x00020000;
    const flags = this._config.flags;
    if (typeof flags === "number") {
      return (flags & SQLITE_OPEN_SHAREDCACHE) !== 0;
    }
    const qIdx = this._filename.indexOf("?");
    if (qIdx === -1) return false;
    return this._filename.slice(qIdx).includes("cache=shared");
  }

  private _databaseVersion: Version | null = null;

  override getDatabaseVersion(): Version {
    if (!this._databaseVersion) {
      const row = this.db.prepare("SELECT sqlite_version() AS v").get() as any;
      this._databaseVersion = new Version(row?.v ?? "0.0.0");
    }
    return this._databaseVersion;
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

  async virtualTables(): Promise<string[]> {
    const rows = await this.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%VIRTUAL%'",
      [],
      "SCHEMA",
    );
    return rows.map((r) => String(r.name));
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
    const deferrableByKey = this._parseFkDeferrable(tableName);
    // Use explicit CONSTRAINT names from DDL when available (PRAGMA doesn't expose them).
    const namesByColumn = this._parseForeignKeyNames(tableName);

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
  private _parseFkDeferrable(tableName: string): Map<string, "immediate" | "deferred"> {
    const createSql = this._getCreateTableSql(tableName);
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
    const oldForeignKeys = (this.db.pragma("foreign_keys") as any[])[0]?.foreign_keys;
    const oldDefer = (this.db.pragma("defer_foreign_keys") as any[])[0]?.defer_foreign_keys;
    try {
      this.db.pragma("defer_foreign_keys = ON");
      this.db.pragma("foreign_keys = OFF");
      await fn();
    } finally {
      this.db.pragma(`defer_foreign_keys = ${oldDefer ?? 0}`);
      this.db.pragma(`foreign_keys = ${oldForeignKeys ?? 1}`);
    }
  }

  override async checkAllForeignKeysValidBang(): Promise<void> {
    const violations = this.db.pragma("foreign_key_check") as Array<Record<string, unknown>>;
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

  private _getCreateTableSql(tableName: string): string | null {
    const { schema, bare } = this._splitTableName(tableName);
    let sql: string;
    if (schema) {
      sql =
        schema.toLowerCase() === "temp"
          ? `SELECT sql FROM sqlite_temp_master WHERE type='table' AND name=${quoteString(bare)}`
          : `SELECT sql FROM ${quoteColumnName(schema)}.sqlite_master WHERE type='table' AND name=${quoteString(bare)}`;
    } else {
      sql = `SELECT sql FROM sqlite_temp_master WHERE type='table' AND name=${quoteString(bare)}
             UNION ALL
             SELECT sql FROM sqlite_master WHERE type='table' AND name=${quoteString(bare)}`;
    }
    const row = this.db.prepare(sql).get() as { sql: string } | undefined;
    return row?.sql ?? null;
  }

  /**
   * Parse FK constraint names from CREATE TABLE SQL. PRAGMA
   * foreign_key_list doesn't expose names, but the DDL does when
   * CONSTRAINT <name> was used. Returns a map keyed by the
   * comma-joined column list (e.g. "a,b" for composites).
   */
  private _parseForeignKeyNames(tableName: string): Map<string, string> {
    const createSql = this._getCreateTableSql(tableName);
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
    if (typeof value === "string") return quoteString(value);
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "function") return String(value());
    if (value instanceof globalThis.Date) return quoteString(value.toISOString());
    // SqlLiteral or objects with toSql
    if (typeof (value as any)?.toSql === "function") return String((value as any).toSql());
    return quoteString(String(value));
  }

  // --- Schema introspection (drives SchemaCache.addAll) ---

  /**
   * List user tables. Excludes SQLite's internal `sqlite_*` tables and
   * matches Rails' SQLite3::SchemaStatements#tables filter.
   */
  async tables(): Promise<string[]> {
    const rows = (await this.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
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
    const { sqliteMaster, bare } = this._sqliteMasterFor(name);
    const rows = (await this.execute(
      `SELECT 1 AS one FROM ${sqliteMaster} WHERE type='table' AND name=${quoteString(bare)}`,
      [],
      "SCHEMA",
    )) as Array<{ one: number }>;
    return rows.length > 0;
  }

  async dataSourceExists(name: string): Promise<boolean> {
    const { sqliteMaster, bare } = this._sqliteMasterFor(name);
    const rows = (await this.execute(
      `SELECT 1 AS one FROM ${sqliteMaster} WHERE type IN ('table','view') AND name=${quoteString(bare)}`,
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
    return rows.map((r) => {
      const sqlType = r.type || "";
      const meta = new SqlTypeMetadata({
        sqlType,
        type: sqlType.toLowerCase(),
        limit: null,
        precision: null,
        scale: null,
      });
      return new Column(r.name, r.dflt_value, meta, r.notnull === 0, {
        primaryKey: r.pk > 0,
      });
    });
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
    const result: Array<{ name: string; columns: string[]; unique: boolean }> = [];
    for (const idx of userIndexes) {
      // index_info takes the bare index name; the schema qualifier, if
      // any, comes before the PRAGMA keyword — same shape as above.
      const cols = (await this.execute(
        `PRAGMA ${pragmaPrefix}index_info(${quoteColumnName(idx.name)})`,
        [],
        "SCHEMA",
      )) as Array<{ name: string; seqno: number }>;
      result.push({
        name: idx.name,
        columns: cols.sort((a, b) => a.seqno - b.seqno).map((c) => c.name),
        unique: idx.unique === 1,
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
    const row = this._getCreateTableSql(tableName);
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
    const fkNames = this._parseForeignKeyNames(fromTable);
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
    const tableInfo = this.db
      .prepare(`PRAGMA ${pragmaPrefix}table_info(${quoteColumnName(bareTable)})`)
      .all() as Array<Record<string, unknown>>;

    const columns: Record<string, Record<string, unknown>> = {};
    for (const col of tableInfo) {
      columns[col.name as string] = { ...col };
    }

    modify(columns);

    // Collect existing indexes to recreate after table rebuild
    const indexList = this.db
      .prepare(`PRAGMA ${pragmaPrefix}index_list(${quoteColumnName(bareTable)})`)
      .all() as Array<Record<string, unknown>>;
    const indexDefs: string[] = [];
    for (const idx of indexList) {
      const idxName = idx.name as string;
      // Skip auto-created indexes (sqlite_autoindex_*)
      if (idxName.startsWith("sqlite_autoindex_")) continue;
      const createSql = this.db
        .prepare(
          `SELECT sql FROM ${pragmaPrefix}sqlite_master WHERE type='index' AND name=${quoteString(idxName)}`,
        )
        .get() as { sql: string } | undefined;
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

    const colDefs = colNames.map((name) => {
      const col = columns[name];
      let def = `${quoteColumnName(name)} ${col.type ?? "TEXT"}`;
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
    const fkNames = this._parseForeignKeyNames(tableName);

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
        this.db.exec(`CREATE TABLE ${qTmp} (${colDefs.join(", ")})`);
        if (originalColNames.length > 0) {
          const selectCols = originalColNames.map((n) => quoteColumnName(n)).join(", ");
          this.db.exec(`INSERT INTO ${qTmp} (${selectCols}) SELECT ${selectCols} FROM ${qTable}`);
        }
        this.db.exec(`DROP TABLE ${qTable}`);
        this.db.exec(`ALTER TABLE ${qTmp} RENAME TO ${quoteColumnName(bareTable)}`);
      });

      // Recreate indexes inside the transaction so failures roll back
      // the entire rebuild rather than leaving a partially-migrated table.
      for (const sql of indexDefs) {
        try {
          this.db.exec(sql);
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

  private _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as any)?.code as string | undefined;
    const cause = e;

    if (code?.includes("CONSTRAINT_UNIQUE") || msg.includes("UNIQUE constraint failed")) {
      return new RecordNotUnique(msg, { sql, binds, cause });
    }
    if (code?.includes("CONSTRAINT_FOREIGNKEY") || msg.includes("FOREIGN KEY constraint failed")) {
      return new InvalidForeignKey(msg, { sql, binds, cause });
    }
    if (code?.includes("CONSTRAINT_NOTNULL") || msg.includes("NOT NULL constraint failed")) {
      return new NotNullViolation(msg, { sql, binds, cause });
    }
    if (msg.includes("String or BLOB exceeded size limit")) {
      return new ValueTooLong(msg, { sql, binds, cause });
    }
    if (code === "SQLITE_CANTOPEN" || msg.includes("unable to open database file")) {
      return new NoDatabaseError(msg, { sql, binds, cause });
    }
    return new StatementInvalid(msg, { sql, binds, cause });
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::StatementPool
 *
 * SQLite3-specific statement pool backed by the generic StatementPool.
 */
export class StatementPool extends GenericStatementPool<Database.Statement> {}

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
