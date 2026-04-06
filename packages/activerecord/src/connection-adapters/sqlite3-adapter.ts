import Database from "better-sqlite3";
import type { DatabaseAdapter } from "../adapter.js";
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
import { getFs } from "@blazetrails/activesupport";
import { quoteString, quoteTableName, quoteColumnName } from "./sqlite3/quoting.js";

/**
 * SQLite adapter — connects ActiveRecord to a real SQLite database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter
 */
export class SQLite3Adapter extends AbstractAdapter implements DatabaseAdapter {
  override get adapterName(): string {
    return "SQLite";
  }

  private db: Database.Database;
  private _inTransaction = false;
  private _savepointCounter = 0;
  private _readonly: boolean;
  private _preventWrites = false;
  private _nativeTypeMap: TypeMap;
  private _memoryDatabase: boolean;
  private _filename: string;

  private static _isMemoryFilename(filename: string): boolean {
    if (filename === ":memory:") return true;
    if (!filename.startsWith("file:")) return false;
    return filename.startsWith("file::memory:") || filename.includes("mode=memory");
  }

  constructor(filename: string | ":memory:" = ":memory:", options?: { readonly?: boolean }) {
    super();
    this._filename = filename;
    this._memoryDatabase = SQLite3Adapter._isMemoryFilename(filename);
    this._readonly = options?.readonly ?? false;
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
   * Execute a SELECT query and return rows.
   */
  async execute(sql: string, binds: unknown[] = []): Promise<Record<string, unknown>[]> {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...binds) as Record<string, unknown>[];
    } catch (e) {
      throw this._translateException(e, sql, binds);
    }
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
   */
  async executeMutation(sql: string, binds: unknown[] = []): Promise<number> {
    if (this._preventWrites) {
      throw new ReadOnlyError("Write query attempted while preventing writes");
    }
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...binds);

      // For INSERT, return the last inserted rowid
      if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
        return Number(result.lastInsertRowid);
      }

      // For UPDATE/DELETE, return affected rows
      return result.changes;
    } catch (e) {
      throw this._translateException(e, sql, binds);
    }
  }

  /**
   * Begin a transaction.
   */
  async beginTransaction(): Promise<void> {
    this.db.exec("BEGIN");
    this._inTransaction = true;
  }

  /**
   * Commit the current transaction.
   */
  async commit(): Promise<void> {
    this.db.exec("COMMIT");
    this._inTransaction = false;
  }

  /**
   * Rollback the current transaction.
   */
  async rollback(): Promise<void> {
    this.db.exec("ROLLBACK");
    this._inTransaction = false;
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
   */
  async explain(sql: string): Promise<string> {
    const rows = this.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Record<string, unknown>[];
    return rows.map((r) => `${r.id}|${r.parent}|${r.notused}|${r.detail}`).join("\n");
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
    const rows = await this.execute(`PRAGMA ${prefix}table_info(${quoteColumnName(bare)})`);
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

  async foreignKeys(tableName: string): Promise<
    Array<{
      column: string | string[];
      primaryKey: string | string[];
      toTable: string;
      onDelete: string | null;
      onUpdate: string | null;
    }>
  > {
    const { schema, bare } = this._splitTableName(tableName);
    const prefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = await this.execute(`PRAGMA ${prefix}foreign_key_list(${quoteColumnName(bare)})`);
    const grouped = new Map<number, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const id = row.id as number;
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id)!.push(row);
    }

    const results: Array<{
      column: string | string[];
      primaryKey: string | string[];
      toTable: string;
      onDelete: string | null;
      onUpdate: string | null;
    }> = [];

    for (const group of grouped.values()) {
      group.sort((a, b) => (a.seq as number) - (b.seq as number));
      const first = group[0];
      const onDelete = first.on_delete === "NO ACTION" ? null : (first.on_delete as string);
      const onUpdate = first.on_update === "NO ACTION" ? null : (first.on_update as string);

      if (group.length === 1) {
        results.push({
          column: first.from as string,
          primaryKey: first.to as string,
          toTable: first.table as string,
          onDelete,
          onUpdate,
        });
      } else {
        results.push({
          column: group.map((r) => r.from as string),
          primaryKey: group.map((r) => r.to as string),
          toTable: first.table as string,
          onDelete,
          onUpdate,
        });
      }
    }
    return results;
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

  // --- Private: alter_table copy strategy (Rails: SQLite3Adapter#alter_table) ---

  private async alterTable(
    tableName: string,
    modify: (columns: Record<string, Record<string, unknown>>) => void,
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

    const originalColNames = tableInfo
      .map((c) => c.name as string)
      .filter((n) => colNames.includes(n));

    this.db.exec(`CREATE TABLE ${qTmp} (${colDefs.join(", ")})`);
    if (originalColNames.length > 0) {
      const selectCols = originalColNames.map((n) => quoteColumnName(n)).join(", ");
      this.db.exec(`INSERT INTO ${qTmp} (${selectCols}) SELECT ${selectCols} FROM ${qTable}`);
    }
    this.db.exec(`DROP TABLE ${qTable}`);
    // RENAME TO requires unqualified name
    this.db.exec(`ALTER TABLE ${qTmp} RENAME TO ${quoteColumnName(bareTable)}`);

    // Recreate indexes, adjusting table name references
    for (const sql of indexDefs) {
      // Index SQL references the original table name — no adjustment needed
      // since we renamed tmpTable back to tableName
      try {
        this.db.exec(sql);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("no such column") && !msg.includes("already exists")) {
          throw err;
        }
      }
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
