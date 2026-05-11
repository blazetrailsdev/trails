/**
 * Abstract adapter — base class for all database adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */

import { inspectExplainOption } from "../adapter.js";
import type { DatabaseAdapter, ExplainOption } from "../adapter.js";
import { type Nodes, Visitors, Collectors } from "@blazetrails/arel";
import {
  ReadOnlyError,
  ActiveRecordError,
  StatementInvalid,
  ConnectionNotEstablished,
  ConnectionNotDefined,
  ConnectionFailed,
  TransactionRollbackError,
  Deadlocked,
  LockWaitTimeout,
} from "../errors.js";
import { Notifications } from "@blazetrails/activesupport";
import { Result, type ColumnTypes } from "../result.js";
import { SchemaCache } from "./schema-cache.js";
import { stripSqlComments } from "./sql-classification.js";
import {
  TransactionManager,
  type Transaction,
  type NullTransaction,
} from "./abstract/transaction.js";
import {
  Store,
  queryCacheEnabled as queryCacheEnabledGet,
  cache as cacheMixin,
  enableQueryCacheBang as enableQueryCacheBangMixin,
  uncached as uncachedMixin,
  disableQueryCacheBang as disableQueryCacheBangMixin,
  clearQueryCache as clearQueryCacheMixin,
  checkVersion as checkVersionMixin,
  type QueryCacheHost,
  QueryCache as QueryCacheMixin,
} from "./abstract/query-cache.js";
import {
  DatabaseStatements,
  transaction as dbStatementsTransaction,
} from "./abstract/database-statements.js";
import {
  quote as abstractQuote,
  typeCast as abstractTypeCast,
  quoteString as abstractQuoteString,
  quoteIdentifier as abstractQuoteIdentifier,
  quoteTableName as abstractQuoteTableName,
  quoteColumnName as abstractQuoteColumnName,
  quoteTableNameForAssignment as abstractQuoteTableNameForAssignment,
  quoteDefaultExpression as abstractQuoteDefaultExpression,
  quotedTrue as abstractQuotedTrue,
  quotedFalse as abstractQuotedFalse,
  unquotedTrue as abstractUnquotedTrue,
  unquotedFalse as abstractUnquotedFalse,
  quotedBinary as abstractQuotedBinary,
  castBoundValue as abstractCastBoundValue,
  sanitizeAsSqlComment as abstractSanitizeAsSqlComment,
  Quoting as QuotingMixin,
} from "./abstract/quoting.js";
import type { Quoting } from "./abstract/quoting-interface.js";
import { include } from "@blazetrails/activesupport";
import { SchemaStatements } from "./abstract/schema-statements.js";
import { Savepoints as SavepointsMixin } from "./abstract/savepoints.js";
import {
  maxIdentifierLength,
  tableNameLength,
  tableAliasLength,
  indexNameLength,
  bindParamsLength,
} from "./abstract/database-limits.js";
import type {
  TableDefinition,
  Table,
  ForeignKeyDefinition,
  AddForeignKeyOptions,
  AddIndexOptions,
  ColumnType,
  ColumnOptions,
} from "./abstract/schema-definitions.js";
import type { Column } from "./column.js";
import { TypeMap } from "../type/type-map.js";
import {
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  DecimalType,
} from "@blazetrails/activemodel";
import { Text as TextType } from "../type/text.js";
import { Date as DateType } from "../type/date.js";
import { Time as TimeType } from "../type/time.js";
import { DateTime as DateTimeType } from "../type/date-time.js";
import { Json as JsonType } from "../type/json.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter::Version
 */
export class Version {
  private _version: string;
  private _parts: number[];

  constructor(version: string) {
    this._version = version;
    this._parts = version.split(".").map(Number);
  }

  toString(): string {
    return this._version;
  }

  get major(): number {
    return this._parts[0] ?? 0;
  }

  get minor(): number {
    return this._parts[1] ?? 0;
  }

  get patch(): number {
    return this._parts[2] ?? 0;
  }

  gte(other: Version | string): boolean {
    const otherVersion = typeof other === "string" ? new Version(other) : other;
    for (let i = 0; i < Math.max(this._parts.length, otherVersion._parts.length); i++) {
      const a = this._parts[i] ?? 0;
      const b = otherVersion._parts[i] ?? 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return true;
  }

  lt(other: Version | string): boolean {
    return !this.gte(other);
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 *
 * Rails: `class AbstractAdapter ... include DatabaseStatements`.
 * We do the same with `include(AbstractAdapter, DatabaseStatements)`
 * after the class body (see bottom of file) — no synthetic base.
 */
// Method-signature interface mirrors `DatabaseStatements` (declared via
// include() below). Using method signatures (not property-typed
// functions from `Included<>`) lets concrete adapter subclasses
// override with method syntax without tripping TS2425.
// SchemaStatements methods mixed in via include() at the bottom of this file.
// Rails: `AbstractAdapter` includes `SchemaStatements` so `connection.create_table(...)` works.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AbstractAdapter {
  // --- SchemaStatements (DDL) ---
  // The abstract base signatures are declared here. Concrete adapter subclasses
  // that override with dialect-specific variants (PG's createTable callback-first)
  // carry // @ts-expect-error on those overrides. Callers typed as AbstractAdapter
  // should use the base call forms; PG-specific forms require a concrete type.
  createTable(
    name: string,
    optionsOrFn?:
      | { id?: boolean | "uuid"; force?: boolean | "cascade"; ifNotExists?: boolean }
      | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void>;
  dropTable(
    ...args:
      | [string, ...string[]]
      | [string, ...string[], { ifExists?: boolean; force?: "cascade" }]
  ): Promise<void>;
  renameTable(oldName: string, newName: string): Promise<void>;
  addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions & { ifNotExists?: boolean },
  ): Promise<void>;
  renameColumn(tableName: string, oldName: string, newName: string): Promise<void>;
  changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
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
  addColumns(
    tableName: string,
    ...columns: Array<{ name: string; type: ColumnType; options?: ColumnOptions }>
  ): Promise<void>;
  removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options?: { ifExists?: boolean },
  ): Promise<void>;
  removeColumns(tableName: string, ...columns: string[]): Promise<void>;
  addIndex(tableName: string, columns: string | string[], options?: AddIndexOptions): Promise<void>;
  removeIndex(
    tableName: string,
    options?: { column?: string | string[]; name?: string },
  ): Promise<void>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
  indexName(tableName: string, options: { column?: string | string[] }): string;
  indexExists(
    tableName: string,
    columns: string | string[],
    options?: { name?: string; unique?: boolean },
  ): Promise<boolean>;
  tableExists(tableName: string): Promise<boolean>;
  columnExists(tableName: string, columnName: string): Promise<boolean>;
  tables(): Promise<string[]>;
  views(): Promise<string[]>;
  viewExists(viewName: string): Promise<boolean>;
  columns(tableName: string): Promise<Column[]>;
  primaryKey(tableName: string): Promise<string | string[] | null>;
  indexes(tableName: string): Promise<unknown[]>;
  foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]>;
  addForeignKey(fromTable: string, toTable: string, options?: AddForeignKeyOptions): Promise<void>;
  removeForeignKey(
    fromTable: string,
    toTableOrOptions?:
      | string
      | { column?: string; name?: string; toTable?: string; ifExists?: boolean },
  ): Promise<void>;
  addReference(
    tableName: string,
    refName: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeReference(
    tableName: string,
    refName: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  addTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  removeTimestamps(tableName: string): Promise<void>;
  addCheckConstraint(
    tableName: string,
    expression: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  isCheckConstraintExists(
    tableName: string,
    options: { name?: string; expression?: string },
  ): Promise<boolean>;
  removeConstraint(tableName: string, constraintName: string): Promise<void>;
  createJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string } | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void>;
  dropJoinTable(table1: string, table2: string, options?: Record<string, unknown>): Promise<void>;
  changeTable(tableName: string, fn?: (t: Table) => void | Promise<void>): Promise<void>;
  tableAliasFor(tableName: string): string;
  dataSources(): Promise<string[]>;
  isDataSourceExists(name: string): Promise<boolean>;
  // --- DatabaseStatements ---
  selectAll(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  selectOne(
    sql: string,
    name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown> | undefined>;
  selectValue(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
  selectValues(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[]>;
  selectRows(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[][]>;
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  execInsert(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  isWriteQuery(sql: string): boolean;
  emptyInsertStatementValue(pk?: string | null): string;
  cacheableQuery(
    klass: {
      query?(sql: string): unknown;
      partialQuery?(parts: unknown): unknown;
      partialQueryCollector?(): unknown;
    },
    arel: unknown,
  ): [unknown, unknown[]];
  insert(
    arel: unknown,
    name?: string | null,
    pk?: string | null,
    idValue?: unknown,
    sequenceName?: string | null,
    binds?: unknown[],
    opts?: { returning?: string[] | null },
  ): Promise<unknown>;
  update(arel: unknown, name?: string | null, binds?: unknown[]): Promise<number>;
  delete(arel: unknown, name?: string | null, binds?: unknown[]): Promise<number>;
  /** @internal */
  rawExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    prepare?: boolean,
    async?: boolean,
    allowRetry?: boolean,
    materializeTransactions?: boolean,
    batch?: boolean,
  ): Promise<unknown>;
  /** @internal */
  internalExecute(
    sql: string,
    name?: string,
    binds?: unknown[],
    prepare?: boolean,
    async?: boolean,
    allowRetry?: boolean,
    materializeTransactions?: boolean,
  ): Promise<unknown>;
  /** @internal */
  executeBatch(statements: string[], name?: string | null): Promise<void>;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AbstractAdapter implements Quoting {
  static readonly Version = Version;

  protected _connection: DatabaseAdapter | null = null;
  private _owner: string | null = null;
  private _inUse = false;
  private _preparedStatements = false;
  private _schemaCache: SchemaCache | null = null;
  private _idleSince = Date.now();
  protected _lastActivity = 0;
  protected _verified = false;
  // Mirrors Rails @raw_connection_dirty. Setters land with the per-adapter
  // exec paths (PR 25b) and reconnect-with-restore (Wave 6 follow-up);
  // the default-false here matches Rails' fresh-adapter state.
  protected _rawConnectionDirty = false;
  private _lockQueue: Promise<unknown> = Promise.resolve();
  protected _config: Record<string, unknown> = {};
  _transactionManager: TransactionManager = new TransactionManager(this as any);

  _queryCache: Store | null = null;

  /**
   * Returns true when `error` is a raw driver error indicating the database
   * does not exist. Concrete adapters override this with driver-specific checks.
   * The base implementation always returns false (safe default for custom adapters).
   */
  isNoDatabaseError(_error: unknown): boolean {
    return false;
  }

  pool: unknown = null;
  logger: unknown = null;
  lock: unknown = null;

  /**
   * Default header prefix for `Relation#explain` output. Concrete
   * adapters (PG: `"EXPLAIN (ANALYZE, VERBOSE) for:"`; SQLite:
   * `"EXPLAIN QUERY PLAN for:"`; MySQL: `"EXPLAIN ANALYZE for:"`)
   * override to include adapter-specific flags.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#build_explain_clause
   */
  buildExplainClause(options: ExplainOption[] = []): string {
    if (options.length === 0) return "EXPLAIN for:";
    const parts = options.map((o) => {
      if (typeof o === "string") return o.toUpperCase();
      if (o && typeof o === "object" && typeof o.format === "string") {
        return `FORMAT ${o.format.toUpperCase()}`;
      }
      throw new TypeError(
        `EXPLAIN option hash requires a string 'format'; got ${inspectExplainOption(o)}`,
      );
    });
    return `EXPLAIN (${parts.join(", ")}) for:`;
  }

  /**
   * Quote a value for inclusion in a SQL literal. Concrete adapters
   * override to use their own string-escape rules (SQLite: `'' only`;
   * PG: `E'\\' escape form`; MySQL: escapes `\0 \n \r \Z \\`). The
   * abstract default is SQL-92 with `'' only`, suitable for
   * identifier-quoting tests and for adapters that haven't specialized
   * yet.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote
   */
  quote(value: unknown): string {
    return abstractQuote(value);
  }

  /**
   * Cast a value to the primitive form drivers expect for binds.
   * Returns an **unquoted** primitive suitable for passing as a bind
   * value (distinct from `quote()`, which returns a SQL literal with
   * surrounding quotes attached).
   *
   * Abstract defaults mirror `abstract/quoting.ts`:
   * - booleans pass through as `true` / `false` (adapters override —
   *   SQLite / MySQL collapse to `1` / `0`, PG keeps `true` / `false`)
   * - Date → unquoted `"YYYY-MM-DD HH:MM:SS"` with optional
   *   `.microseconds` when milliseconds > 0 (no surrounding quotes;
   *   matches Rails' `value.to_formatted_s(:db)`)
   * - null → returned unchanged; undefined passes through too at
   *   the abstract level (SQLite overrides to coerce `undefined →
   *   null` for its nullable-column semantics)
   * - strings / numbers / bigints → passed through
   *
   * Used by `Relation#_renderExplainBinds` to mirror Rails'
   * `render_bind(c, attr)` which does
   * `connection.type_cast(attr.value_for_database)`.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#type_cast
   */
  typeCast(value: unknown): unknown {
    return abstractTypeCast(value);
  }

  /**
   * Default identifier and bool-literal quoting — delegates to the
   * abstract quoting module. Concrete adapters override the dialect-
   * specific methods (PG/SQLite double-quote vs. MySQL backtick;
   * SQLite `"1"` bools).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting (mixed into
   * AbstractAdapter).
   */
  quoteString(s: string): string {
    return abstractQuoteString(s);
  }

  quoteIdentifier(name: string): string {
    return abstractQuoteIdentifier(name);
  }

  quoteTableName(name: string): string {
    return abstractQuoteTableName(name);
  }

  quoteColumnName(name: string): string {
    return abstractQuoteColumnName(name);
  }

  quoteTableNameForAssignment(table: string, attr: string): string {
    return abstractQuoteTableNameForAssignment(table, attr);
  }

  quoteDefaultExpression(value: unknown): string {
    return abstractQuoteDefaultExpression(value);
  }

  quotedTrue(): string {
    return abstractQuotedTrue();
  }

  quotedFalse(): string {
    return abstractQuotedFalse();
  }

  unquotedTrue(): boolean | number {
    return abstractUnquotedTrue();
  }

  unquotedFalse(): boolean | number {
    return abstractUnquotedFalse();
  }

  quotedBinary(value: unknown): string {
    return abstractQuotedBinary(value);
  }

  castBoundValue(value: unknown): unknown {
    return abstractCastBoundValue(value);
  }

  sanitizeAsSqlComment(value: unknown): string {
    return abstractSanitizeAsSqlComment(value);
  }

  /**
   * Run an adapter-internal schema/introspection query and return raw
   * rows. Emits `sql.active_record` with `name = "SCHEMA"` so
   * LogSubscriber / RuntimeRegistry / ExplainSubscriber filter it out
   * of normal query output the same way Rails does (LogSubscriber's
   * `IGNORE_PAYLOAD_NAMES` / ExplainSubscriber's `IGNORED_PAYLOADS`).
   *
   * Use for pg_class / pg_attribute / information_schema /
   * sqlite_master / PRAGMA / etc. — anything the adapter runs on its
   * own behalf. Migrations' user-visible DDL stays on regular
   * `executeMutation`.
   *
   * Mirrors: ActiveRecord's `internal_exec_query(sql, "SCHEMA")` usage
   * pattern in SchemaStatements / SchemaCache.
   */
  schemaQuery(sql: string, binds: unknown[] = []): Promise<Record<string, unknown>[]> {
    const execute = (
      this as unknown as {
        execute?: (
          sql: string,
          binds?: unknown[],
          name?: string,
        ) => Promise<Record<string, unknown>[]>;
      }
    ).execute;
    if (typeof execute !== "function") {
      throw new Error("schemaQuery requires the adapter to implement execute()");
    }
    return execute.call(this, sql, binds, "SCHEMA");
  }

  // --- QueryCache mixin (mirrors ActiveRecord::ConnectionAdapters::QueryCache) ---
  // Single source of truth lives in abstract/query-cache.ts; these delegate.

  private _ensureQueryCache(): Store {
    if (!this._queryCache) {
      this._queryCache = new Store();
    }
    return this._queryCache;
  }

  get queryCache(): Store | null {
    return this._queryCache;
  }

  set queryCache(value: Store | null) {
    this._queryCache = value;
  }

  get queryCacheEnabled(): boolean {
    return queryCacheEnabledGet.call(this as unknown as QueryCacheHost);
  }

  async cache<T>(fn: () => T | Promise<T>): Promise<T> {
    this._ensureQueryCache();
    return cacheMixin.call(this as unknown as QueryCacheHost, fn) as Promise<T>;
  }

  enableQueryCacheBang(): void {
    this._ensureQueryCache();
    enableQueryCacheBangMixin.call(this as unknown as QueryCacheHost);
  }

  async uncached<T>(fn: () => T | Promise<T>, options: { dirties?: boolean } = {}): Promise<T> {
    this._ensureQueryCache();
    return uncachedMixin.call(this as unknown as QueryCacheHost, fn, options) as Promise<T>;
  }

  disableQueryCacheBang(): void {
    this._ensureQueryCache();
    disableQueryCacheBangMixin.call(this as unknown as QueryCacheHost);
  }

  clearQueryCache(): void {
    clearQueryCacheMixin.call(this as unknown as QueryCacheHost);
  }

  // --- End QueryCache mixin ---

  get inUse(): boolean {
    return this._inUse;
  }

  get owner(): string | null {
    return this._owner;
  }

  get preparedStatements(): boolean {
    return this._preparedStatements;
  }

  set preparedStatements(value: boolean) {
    if (typeof value !== "boolean") {
      throw new TypeError(
        `preparedStatements must be a boolean; got ${typeof value}: ${String(value)}`,
      );
    }
    this._preparedStatements = value;
  }

  get active(): boolean {
    return this._connection !== null;
  }

  lease(): void {
    this._inUse = true;
  }

  expire(): void {
    this._inUse = false;
    this._owner = null;
    this._idleSince = Date.now();
  }

  get adapterName(): string {
    return "Abstract";
  }

  /**
   * Returns `this` typed as `DatabaseAdapter & SchemaQuoter`. SchemaStatements
   * methods (mixed in via `include()` below) reference `this.adapter` to
   * call quoting and execution helpers on the adapter — when those methods
   * run with `this` bound to an adapter instance, `this.adapter` must
   * resolve to the same object.
   * @internal
   */
  protected get adapter(): import("./abstract/assert-schema-adapter.js").SchemaQuoter &
    DatabaseAdapter {
    return this as unknown as import("./abstract/assert-schema-adapter.js").SchemaQuoter &
      DatabaseAdapter;
  }

  /** @internal */
  protected _qi(name: string): string {
    return this.quoteIdentifier(name);
  }

  /** @internal */
  protected _qt(name: string): string {
    return this.quoteTableName(name);
  }

  // --- Identity & lifecycle ---

  isConnected(): boolean {
    return this._connection !== null;
  }

  reconnectBang(): void {
    // Base implementation clears caches and marks verified.
    // Concrete adapters (SQLite3, PostgreSQL, MySQL) override to
    // actually close and reopen the raw connection.
    this.clearCacheBang();
  }

  disconnectBang(): void {
    this.clearCacheBang();
    this._connection = null;
  }

  verifyBang(): void {
    if (!this.active) {
      this.reconnectBang();
    }
    // Mirrors Rails: `connect_with_retry` calls `verified!` after a
    // successful (re)connect; verifyBang is the abstract-side entry
    // point that drives that flow.
    this.verifiedBang();
  }

  clearCacheBang(): void {
    // Subclasses with statement caches override this
  }

  get role(): string {
    return (this.pool as any)?.role ?? "writing";
  }

  get shard(): string {
    return (this.pool as any)?.shard ?? "default";
  }

  // --- Capability introspection ---

  isValidType(type: string | null | undefined): boolean {
    return type != null && type !== "";
  }

  isReplica(): boolean {
    if (typeof (this.pool as any)?.dbConfig?.replica === "boolean") {
      return (this.pool as any).dbConfig.replica;
    }
    if (this.role === "reading") return true;
    return this._config.replica === true;
  }

  isPreventingWrites(): boolean {
    if (this.isReplica()) return true;
    const pool = this.pool as any;
    if (pool?.preventWrites === true) return true;
    if (pool?.dbConfig?.preventWrites === true) return true;
    if (this._config.preventWrites === true) return true;
    return false;
  }

  get schemaCache(): SchemaCache {
    // Phase 11 made `pool.schemaCache` return a BoundSchemaReflection
    // (the Rails-shaped handle DatabaseTasks.dumpSchemaCache expects).
    // The raw SchemaCache that AbstractAdapter caches incidental
    // introspection into now lives on `pool.poolConfig.schemaCache`,
    // matching Rails' PoolConfig @schema_cache slot. Share it so
    // every connection in the pool hits the same cache, and fall
    // back to a per-adapter slot when no pool is attached (tests,
    // bare adapters).
    const pool = this.pool as { poolConfig?: { schemaCache: SchemaCache | null } } | null;
    const poolConfig = pool?.poolConfig;
    if (poolConfig?.schemaCache) return poolConfig.schemaCache;

    if (!this._schemaCache) {
      this._schemaCache = new SchemaCache();
      if (poolConfig) poolConfig.schemaCache = this._schemaCache;
    }
    return this._schemaCache;
  }

  checkIfWriteQuery(sql: string): void {
    if (this.isPreventingWrites() && this.isWriteQuery(sql)) {
      throw new ReadOnlyError("Write query attempted while preventing writes");
    }
  }

  async unpreparedStatement<T>(fn: () => Promise<T> | T): Promise<T> {
    const was = this._preparedStatements;
    this._preparedStatements = false;
    try {
      return await fn();
    } finally {
      this._preparedStatements = was;
    }
  }

  supportsExplain(): boolean {
    return false;
  }

  supportsExtensions(): boolean {
    return false;
  }

  supportsIndexesInCreate(): boolean {
    return false;
  }

  supportsInsertReturning(): boolean {
    return false;
  }

  /** @internal */
  returnValueAfterInsert(column: Column): boolean {
    return column.isAutoPopulated();
  }

  supportsInsertOnDuplicateSkip(): boolean {
    return false;
  }

  supportsInsertOnDuplicateUpdate(): boolean {
    return false;
  }

  // --- Private helpers ---

  protected stripSqlComments(sql: string): string {
    return stripSqlComments(sql);
  }

  supportsDdlTransactions(): boolean {
    return false;
  }

  supportsBulkAlter(): boolean {
    return false;
  }

  supportsPartialIndex(): boolean {
    return false;
  }

  supportsExpressionIndex(): boolean {
    return false;
  }

  supportsTransactionIsolation(): boolean {
    return false;
  }

  supportsForeignKeys(): boolean {
    return false;
  }

  supportsCheckConstraints(): boolean {
    return false;
  }

  supportsViews(): boolean {
    return false;
  }

  supportsMaterializedViews(): boolean {
    return false;
  }

  supportsJson(): boolean {
    return false;
  }

  supportsComments(): boolean {
    return false;
  }

  supportsSavepoints(): boolean {
    return false;
  }

  supportsLazyTransactions(): boolean {
    return false;
  }

  /** @internal */
  reconnect(): void {
    this.reconnectBang();
  }

  disconnect(): void {
    this.disconnectBang();
  }

  clearCache(): void {
    this.clearCacheBang();
  }

  resetTransaction(): void;
  resetTransaction(options: { restore: true }): Promise<void>;
  resetTransaction(options?: { restore?: boolean }): void | Promise<void> {
    if (options?.restore) {
      if (this._transactionManager?.isRestorable()) {
        return this._transactionManager.restoreTransactions().then(() => {});
      }
      this._transactionManager = new TransactionManager(this as any);
      return Promise.resolve();
    }

    this._transactionManager = new TransactionManager(this as any);
  }

  get transactionManager(): TransactionManager {
    return this._transactionManager;
  }

  currentTransaction(): Transaction | NullTransaction {
    return this._transactionManager.currentTransaction;
  }

  async rollbackTransaction(): Promise<void> {
    return this._transactionManager.rollbackTransaction();
  }

  async commitTransaction(): Promise<void> {
    return this._transactionManager.commitTransaction();
  }

  isTransactionOpen(): boolean {
    return this._transactionManager.currentTransaction.open;
  }

  get openTransactions(): number {
    return this._transactionManager.openTransactions;
  }

  async materializeTransactions(): Promise<void> {
    return this._transactionManager.materializeTransactions();
  }

  dirtyCurrentTransaction(): void {
    this._transactionManager.dirtyCurrentTransaction();
  }

  async disableLazyTransactionsBang(): Promise<void> {
    return this._transactionManager.disableLazyTransactionsBang();
  }

  enableLazyTransactionsBang(): void {
    this._transactionManager.enableLazyTransactionsBang();
  }

  async withinNewTransaction<T>(
    opts: { isolation?: string | null; joinable?: boolean },
    fn: (tx?: unknown) => Promise<T> | T,
  ): Promise<T> {
    return this._transactionManager.withinNewTransaction(opts, fn as any);
  }

  /**
   * Run a block inside a database transaction.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#transaction
   */
  async transaction<T>(
    fnOrOpts?:
      | ((tx?: unknown) => Promise<T> | T)
      | { requiresNew?: boolean; isolation?: string; joinable?: boolean },
    fnOrOpts2?:
      | ((tx?: unknown) => Promise<T> | T)
      | { requiresNew?: boolean; isolation?: string; joinable?: boolean },
  ): Promise<T | undefined> {
    let opts: { requiresNew?: boolean; isolation?: string; joinable?: boolean } = {};
    let block: (tx?: unknown) => Promise<T> | T;
    if (typeof fnOrOpts === "function") {
      block = fnOrOpts;
      // Support both (fn) and (fn, opts) — fixture loading uses the latter
      if (fnOrOpts2 && typeof fnOrOpts2 !== "function") opts = fnOrOpts2;
    } else {
      opts = fnOrOpts ?? {};
      block = fnOrOpts2 as (tx?: unknown) => Promise<T> | T;
    }
    if (typeof block !== "function") {
      throw new TypeError("transaction requires a function block");
    }
    return dbStatementsTransaction.call(this as any, block, opts) as Promise<T | undefined>;
  }

  close(): void {
    this.expire();
  }

  requiresReloading(): boolean {
    return false;
  }

  verifyCalled(): boolean {
    return true;
  }

  get rawConnection(): DatabaseAdapter | null {
    return this._connection;
  }

  // --- Config accessors ---

  get connectionRetries(): number {
    const v = this._config.connectionRetries;
    return typeof v === "number" ? v : 1;
  }

  get verifyTimeout(): number {
    const v = this._config.verifyTimeout;
    return typeof v === "number" ? v : 2;
  }

  get retryDeadline(): number | null {
    const v = this._config.retryDeadline;
    return typeof v === "number" ? v : null;
  }

  get defaultTimezone(): string {
    const v = this._config.defaultTimezone;
    return typeof v === "string" ? v : "utc";
  }

  get connectionDescriptor(): unknown {
    return (this.pool as any)?.connectionDescriptor ?? null;
  }

  get visitor(): unknown {
    return (this.pool as any)?.visitor ?? null;
  }

  /**
   * Returns the Arel visitor for this adapter's SQL dialect.
   * Subclasses override to return MySQL/PostgreSQL visitors.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#arel_visitor
   *
   * @internal
   */
  get arelVisitor(): Visitors.ToSql {
    return new Visitors.ToSql(this);
  }

  private _preparedStatementsDisabledCache = new Set<unknown>();

  get preparedStatementsDisabledCache(): Set<unknown> {
    return this._preparedStatementsDisabledCache;
  }

  // --- Lifecycle ---

  stealBang(): void {
    if (!this._inUse) {
      throw new Error("Cannot steal connection, it is not currently leased.");
    }
    this._owner = null;
    this.lease();
  }

  get secondsIdle(): number {
    if (this._inUse) return 0;
    return (Date.now() - this._idleSince) / 1000;
  }

  get secondsSinceLastActivity(): number | null {
    if (!this._connection || !this._lastActivity) return null;
    return (Date.now() - this._lastActivity) / 1000;
  }

  discardBang(): void {}

  resetBang(): void {
    this.clearCacheBang();
    this.resetTransaction();
  }

  // --- Capability flags (batch 2) ---

  supportsAdvisoryLocks(): boolean {
    return false;
  }

  supportsPartitionedIndexes(): boolean {
    return false;
  }

  supportsIndexSortOrder(): boolean {
    return false;
  }

  supportsConcurrentConnections(): boolean {
    return true;
  }

  supportsCommonTableExpressions(): boolean {
    return false;
  }

  // --- Static utilities ---

  static typeCastConfigToInteger(config: unknown): number | unknown {
    if (typeof config === "number") return config;
    if (typeof config === "string" && /^\d+$/.test(config)) return parseInt(config, 10);
    return config;
  }

  static typeCastConfigToBoolean(config: unknown): boolean | unknown {
    if (config === "false") return false;
    return config;
  }

  isAsyncEnabled(): boolean {
    return false;
  }

  // --- Capability flags (batch 3) ---

  supportsIndexInclude(): boolean {
    return false;
  }

  supportsValidateConstraints(): boolean {
    return false;
  }

  supportsDeferrableConstraints(): boolean {
    return false;
  }

  supportsExclusionConstraints(): boolean {
    return false;
  }

  supportsUniqueConstraints(): boolean {
    return false;
  }

  supportsDatetimeWithPrecision(): boolean {
    return false;
  }

  supportsCommentsInCreate(): boolean {
    return false;
  }

  supportsVirtualColumns(): boolean {
    return false;
  }

  supportsForeignTables(): boolean {
    return false;
  }

  supportsOptimizerHints(): boolean {
    return false;
  }

  supportsInsertConflictTarget(): boolean {
    return false;
  }

  supportsNullsNotDistinct(): boolean {
    return false;
  }

  isReturnValueAfterInsert(_column?: unknown): boolean {
    return false;
  }

  isPrefetchPrimaryKey(_tableName?: string): boolean {
    return false;
  }

  isSavepointErrorsInvalidateTransactions(): boolean {
    return false;
  }

  supportsRestartDbTransaction(): boolean {
    return false;
  }

  isDatabaseExists(): boolean {
    return this._connection !== null;
  }

  lockThread: boolean = false;

  // --- DDL: extensions, enums, virtual tables ---

  async enableExtension(_name: string): Promise<void> {}

  async disableExtension(_name: string): Promise<void> {}

  async createEnum(_name: string, _values: string[]): Promise<void> {}

  async dropEnum(_name: string): Promise<void> {}

  async createRange(
    _name: string,
    _options: { subtype: string; subtypeDiff?: string },
  ): Promise<void> {}

  async dropRange(_name: string, _options?: { ifExists?: boolean }): Promise<void> {}

  async renameEnum(_oldName: string, _newName: string): Promise<void> {}

  async addEnumValue(_enumName: string, _value: string): Promise<void> {}

  // Rails' `def rename_enum_value(...)` uses a splat so concrete adapters
  // can define their own signature (PG takes `(type_name, **options)`).
  // Keep the TS signature permissive to match.
  async renameEnumValue(..._args: unknown[]): Promise<void> {}

  async createVirtualTable(_name: string, _options?: unknown): Promise<void> {}

  async dropVirtualTable(_name: string): Promise<void> {}

  // --- Advisory locks ---

  isAdvisoryLocksEnabled(): boolean {
    return false;
  }

  async getAdvisoryLock(_lockId: number | bigint | string): Promise<boolean> {
    return false;
  }

  async releaseAdvisoryLock(_lockId: number | bigint | string): Promise<boolean> {
    return false;
  }

  // --- Extensions & algorithms ---

  extensions(): string[] | Promise<string[]> {
    return [];
  }

  indexAlgorithms(): Record<string, string> {
    return {};
  }

  // --- Referential integrity & FK validation ---

  async disableReferentialIntegrity(fn: () => Promise<void>): Promise<void> {
    await fn();
  }

  async checkAllForeignKeysValidBang(): Promise<void> {}

  // --- Connection lifecycle ---

  throwAwayBang(): void {
    this.disconnectBang();
  }

  connectBang(): void {
    // Concrete adapters override to establish the raw connection.
  }

  cleanBang(): void {
    this.clearCacheBang();
  }

  // --- Comparison helpers ---

  defaultUniquenessComparison(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    return attribute.eq(value);
  }

  caseSensitiveComparison(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    return attribute.eq(value);
  }

  /** @internal */
  caseInsensitiveComparison(
    attribute: Nodes.Attribute,
    value: unknown,
  ): Nodes.Node | Promise<Nodes.Node> {
    // Default: canPerformCaseInsensitiveComparisonFor returns true, so always LOWER.
    // Adapters that need async column inspection (e.g. PG) override this whole method.
    return attribute.lower().eq((attribute.relation as any).lower(value));
  }

  /** @internal */
  canPerformCaseInsensitiveComparisonFor(_column: unknown): boolean | Promise<boolean> {
    return true;
  }

  isDefaultIndexType(_index: unknown): boolean {
    return true;
  }

  // --- Insert SQL ---

  buildInsertSql(
    _insertManager: unknown,
    _onDuplicate?: unknown,
    _returning?: unknown,
  ): string | null {
    return null;
  }

  // --- Version introspection ---

  // Rails' `get_database_version` returns whatever the adapter uses to
  // represent a server version. PG returns the `server_version` integer;
  // SQLite returns a `Version`. Other adapters may be async (PG's
  // implementation queries `SHOW server_version_num`).
  getDatabaseVersion(): Version | number | Promise<Version | number> {
    return new Version("0.0.0");
  }

  // Rails' `database_version` is a sync accessor (`pool.server_version(self)`
  // caches the result). Overrides may narrow to `Version` or `number`.
  get databaseVersion(): Version | number {
    const v = this.getDatabaseVersion();
    if (v instanceof Promise) {
      throw new Error(
        "databaseVersion is only available synchronously after getDatabaseVersion() has resolved; await getDatabaseVersion() first",
      );
    }
    return v;
  }

  checkVersion(): void {
    checkVersionMixin.call(this as any);
  }

  async schemaVersion(): Promise<number> {
    return 0;
  }

  // --- Timezone validation ---

  static validateDefaultTimezone(timezone: string): string {
    const valid = ["utc", "local"];
    if (!valid.includes(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}. Must be one of: ${valid.join(", ")}`);
    }
    return timezone;
  }

  // --- Query classification ---

  buildReadQueryRegexp(): RegExp {
    return /^\s*(SELECT|EXPLAIN|PRAGMA|SHOW|SET|RESET|DESCRIBE|DESC)\b/i;
  }

  // --- Console ---

  static findCmdAndExec(_commands: string[]): void {}

  static dbconsole(_config?: unknown): void {}

  // --- Type registration (Rails: class << self private) ---

  /** @internal */
  static initializeTypeMap(this: typeof AbstractAdapter, m: TypeMap): void {
    this.registerClassWithLimit(m, /boolean/i, BooleanType);
    this.registerClassWithLimit(m, /char/i, StringType);
    this.registerClassWithLimit(m, /binary/i, BinaryType);
    this.registerClassWithLimit(m, /text/i, TextType);
    this.registerClassWithPrecision(m, /date/i, DateType);
    this.registerClassWithPrecision(m, /time/i, TimeType);
    this.registerClassWithPrecision(m, /datetime/i, DateTimeType);
    this.registerClassWithLimit(m, /float/i, FloatType);
    this.registerClassWithLimit(m, /int/i, IntegerType);

    const aliasTo = (targetKey: string) => (sqlType: string) => {
      const meta = /\(.*\)/.exec(sqlType)?.[0] ?? "";
      return m.lookup(`${targetKey}${meta}`);
    };
    m.registerType(/blob/i, undefined, aliasTo("binary"));
    m.registerType(/clob/i, undefined, aliasTo("text"));
    m.registerType(/timestamp/i, undefined, aliasTo("datetime"));
    m.registerType(/numeric/i, undefined, aliasTo("decimal"));
    m.registerType(/number/i, undefined, aliasTo("decimal"));
    m.registerType(/double/i, undefined, aliasTo("float"));

    m.registerType(/^json/i, new JsonType());

    m.registerType(/decimal/i, undefined, (sqlType: string) => {
      const scale = this.extractScale(sqlType);
      const precision = this.extractPrecision(sqlType);
      if (scale === 0) return new DecimalWithoutScale({ precision });
      return new DecimalType({ precision, scale });
    });
  }

  /** @internal */
  static registerClassWithLimit(
    this: typeof AbstractAdapter,
    mapping: TypeMap,
    key: string | RegExp,
    klass: new (options?: { limit?: number }) => object,
  ): void {
    mapping.registerType(key, undefined, (sqlType: string) => {
      return new klass({ limit: this.extractLimit(sqlType) }) as ReturnType<typeof mapping.lookup>;
    });
  }

  /** @internal */
  static registerClassWithPrecision(
    this: typeof AbstractAdapter,
    mapping: TypeMap,
    key: string | RegExp,
    klass: new (options?: { precision?: number }) => object,
    extraOptions: Record<string, unknown> = {},
  ): void {
    mapping.registerType(key, undefined, (sqlType: string) => {
      return new klass({
        precision: this.extractPrecision(sqlType),
        ...extraOptions,
      }) as ReturnType<typeof mapping.lookup>;
    });
  }

  /** @internal */
  static extractScale(sqlType: string): number | undefined {
    if (/\(\d+\)/.test(sqlType)) return 0;
    const match = /\(\d+,(\d+)\)/.exec(sqlType);
    return match ? Number.parseInt(match[1], 10) : undefined;
  }

  /** @internal */
  static extractPrecision(sqlType: string): number | undefined {
    const match = /\((\d+)(,\d+)?\)/.exec(sqlType);
    return match ? Number.parseInt(match[1], 10) : undefined;
  }

  /** @internal */
  static extractLimit(sqlType: string): number | undefined {
    const match = /\((.*)\)/.exec(sqlType);
    if (!match) return undefined;
    const n = Number.parseInt(match[1], 10);
    return Number.isNaN(n) ? 0 : n;
  }

  private _extendedTypeMap?: Map<string, unknown>;
  get extendedTypeMap(): Map<string, unknown> {
    return (this._extendedTypeMap ??= new Map());
  }

  // --- Connection lifecycle privates (Rails abstract_adapter.rb 946–1234) ---

  /** @internal Mirrors: AbstractAdapter#reconnect_can_restore_state? */
  isReconnectCanRestoreState(): boolean {
    return this._transactionManager.isRestorable() && !this._rawConnectionDirty;
  }

  /** @internal Mirrors: AbstractAdapter#with_raw_connection */
  async withRawConnection<T>(
    optsOrCallback:
      | { allowRetry?: boolean; materializeTransactions?: boolean }
      | ((raw: DatabaseAdapter | null) => Promise<T> | T),
    callback?: (raw: DatabaseAdapter | null) => Promise<T> | T,
  ): Promise<T> {
    const isFn = typeof optsOrCallback === "function";
    const opts = (isFn ? {} : optsOrCallback) ?? {};
    const block = isFn ? optsOrCallback : callback;
    if (typeof block !== "function") {
      throw new TypeError("withRawConnection requires a callback");
    }
    const allowRetry = opts.allowRetry ?? false;
    const materializeTransactions = opts.materializeTransactions ?? true;

    const run = async (): Promise<T> => {
      if (this._connection === null && this.isReconnectCanRestoreState()) this.connectBang();
      if (materializeTransactions) await this.materializeTransactions();

      let retriesAvailable = allowRetry ? this.connectionRetries : 0;
      const deadline = this.retryDeadline !== null ? Date.now() + this.retryDeadline * 1000 : null;
      let reconnectable = this.isReconnectCanRestoreState();
      const last = this.secondsSinceLastActivity;
      const recent = last !== null && last < this.verifyTimeout;
      if (!this._verified && !recent && reconnectable && !allowRetry) this.verifyBang();

      for (;;) {
        try {
          return await block(this._connection);
        } catch (e) {
          const err = e as Error;
          this.invalidateTransaction(err);
          const expired = deadline !== null && deadline < Date.now();
          if (!expired && retriesAvailable > 0) {
            retriesAvailable -= 1;
            if (this.isRetryableQueryError(err)) {
              await this.backoff(this.connectionRetries - retriesAvailable);
              continue;
            }
            if (reconnectable && this.isRetryableConnectionError(err)) {
              this.reconnectBang();
              reconnectable = false;
              continue;
            }
          }
          if (!this.isRetryableQueryError(err)) {
            this._lastActivity = 0;
            this._verified = false;
          }
          throw err;
        } finally {
          if (materializeTransactions) this.dirtyCurrentTransaction();
        }
      }
    };

    const prev = this._lockQueue;
    const next = prev.then(run, run);
    this._lockQueue = next.catch(() => undefined);
    return next as Promise<T>;
  }

  /** @internal Mirrors: AbstractAdapter#verified! */
  verifiedBang(): void {
    this._lastActivity = Date.now();
    this._verified = true;
  }

  /** @internal Mirrors: AbstractAdapter#retryable_connection_error? */
  isRetryableConnectionError(exception: unknown): boolean {
    if (
      exception instanceof ConnectionNotEstablished &&
      !(exception instanceof ConnectionNotDefined)
    ) {
      return true;
    }
    return exception instanceof ConnectionFailed;
  }

  /** @internal Mirrors: AbstractAdapter#invalidate_transaction */
  invalidateTransaction(exception: unknown): void {
    if (!(exception instanceof TransactionRollbackError)) return;
    if (!this.isSavepointErrorsInvalidateTransactions()) return;
    const tx = this.currentTransaction() as { invalidateBang?: () => void };
    tx.invalidateBang?.();
  }

  /** @internal Mirrors: AbstractAdapter#retryable_query_error? */
  isRetryableQueryError(exception: unknown): boolean {
    const tx = this.currentTransaction() as { isInvalidated?: () => boolean };
    if (tx.isInvalidated?.()) return false;
    return exception instanceof Deadlocked || exception instanceof LockWaitTimeout;
  }

  /** @internal Mirrors: AbstractAdapter#backoff (100ms × counter) */
  backoff(counter: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100 * counter));
  }

  /** @internal Mirrors: AbstractAdapter#any_raw_connection */
  anyRawConnection(): DatabaseAdapter | null | Promise<DatabaseAdapter | null> {
    return this._connection ?? this.validRawConnection();
  }

  /** @internal Mirrors: AbstractAdapter#valid_raw_connection */
  validRawConnection(): DatabaseAdapter | null | Promise<DatabaseAdapter | null> {
    if (this._verified && this._connection) return this._connection;
    return this.withRawConnection(
      { allowRetry: false, materializeTransactions: false },
      (conn) => conn,
    );
  }

  /** @internal Mirrors: AbstractAdapter#extended_type_map_key */
  extendedTypeMapKey(): Record<string, unknown> | null {
    // Rails parity: `if @default_timezone` — Ruby treats "" as truthy,
    // so check for the type rather than JS truthiness.
    const tz = this._config.defaultTimezone;
    return typeof tz === "string" ? { defaultTimezone: tz } : null;
  }

  /** @internal Mirrors: AbstractAdapter#type_map */
  get typeMap(): unknown {
    const ctor = this.constructor as {
      EXTENDED_TYPE_MAPS?: Map<string, unknown>;
      TYPE_MAP?: unknown;
      extendedTypeMap?: (key: Record<string, unknown>) => unknown;
    };
    const key = this.extendedTypeMapKey();
    if (!key) return ctor.TYPE_MAP ?? this.extendedTypeMap;
    const build = () => ctor.extendedTypeMap?.(key) ?? this.extendedTypeMap;
    const cache = ctor.EXTENDED_TYPE_MAPS;
    if (!cache) return build();
    const ck = JSON.stringify(key);
    let m = cache.get(ck);
    if (!m) cache.set(ck, (m = build()));
    return m;
  }

  /** @internal Mirrors: AbstractAdapter#configure_connection */
  configureConnection(..._args: unknown[]): void | Promise<void> {
    this.checkVersion();
  }

  /** @internal Mirrors: AbstractAdapter#translate_exception_class */
  translateExceptionClass(nativeError: unknown, sql: unknown, binds: unknown): unknown {
    if (nativeError instanceof ActiveRecordError) return nativeError;
    const name = (nativeError as any)?.constructor?.name ?? "Error";
    const msg = (nativeError as any)?.message ?? "";
    const message = `${name}: ${msg}`;
    const arError = this.translateException(nativeError, {
      message,
      sql: sql as string,
      binds: binds as unknown[],
    });
    if (arError !== nativeError && arError instanceof Error && nativeError instanceof Error) {
      arError.stack = nativeError.stack;
    }
    return arError;
  }

  /** Mirrors: AbstractAdapter#log */
  async log<T>(
    sql: string,
    name: string | null | undefined = "SQL",
    binds: unknown[] = [],
    typeCastedBinds: unknown[] = [],
    isAsync = false,
    block?: () => Promise<T>,
  ): Promise<T | void> {
    try {
      const tx = this.currentTransaction();
      const userTx = (tx as any).userTransaction ?? null;
      return await Notifications.instrumentAsync(
        "sql.active_record",
        {
          sql,
          name: name ?? "SQL",
          binds,
          type_casted_binds: typeCastedBinds,
          async: isAsync,
          connection: this,
          transaction: userTx,
          row_count: 0,
        },
        block,
      );
    } catch (ex) {
      if (ex instanceof StatementInvalid) {
        throw ex.setQuery(sql, binds);
      }
      throw ex;
    }
  }

  /** @internal Mirrors: AbstractAdapter#instrumenter */
  get instrumenter(): typeof Notifications {
    return Notifications;
  }

  /** @internal Mirrors: AbstractAdapter#translate_exception */
  translateException(
    exception: unknown,
    opts: { message: string; sql: string; binds: unknown[] },
  ): unknown {
    if (exception instanceof ActiveRecordError) return exception;
    return new StatementInvalid(opts.message, {
      sql: opts.sql,
      binds: opts.binds,
      connectionPool: this.pool,
    });
  }

  /** @internal Mirrors: AbstractAdapter#column_for */
  async columnFor(tableName: string, columnName: string): Promise<import("./column.js").Column> {
    const cols = await (this as any).columns(tableName);
    const col = (cols as import("./column.js").Column[]).find((c) => c.name === columnName);
    if (!col) throw new ActiveRecordError(`No such column: ${tableName}.${columnName}`);
    return col;
  }

  /** @internal Mirrors: AbstractAdapter#column_for_attribute */
  async columnForAttribute(attribute: {
    relation: { name: string };
    name: string;
  }): Promise<import("./column.js").Column | undefined> {
    const hash = await (this.schemaCache as any).columnsHash(this.pool, attribute.relation.name);
    return hash?.[attribute.name];
  }

  /** @internal Mirrors: AbstractAdapter#collector */
  collector(): Collectors.Composite | Collectors.SubstituteBinds {
    if (this.preparedStatements) {
      return new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
    }
    return new Collectors.SubstituteBinds(this as any, new Collectors.SQLString());
  }

  /** @internal Mirrors: AbstractAdapter#build_statement_pool */
  buildStatementPool(..._args: unknown[]): unknown {
    return undefined;
  }

  /** @internal Mirrors: AbstractAdapter#build_result */
  buildResult(
    columns: string[],
    rows: unknown[][],
    columnTypes: ColumnTypes | null = null,
  ): Result {
    return new Result(columns, rows, columnTypes);
  }

  /** @internal Mirrors: AbstractAdapter#attempt_configure_connection */
  async attemptConfigureConnection(): Promise<void> {
    try {
      await this.configureConnection();
    } catch (e) {
      this.disconnectBang();
      throw e;
    }
  }

  /** @internal Mirrors: AbstractAdapter#default_prepared_statements */
  defaultPreparedStatements(): boolean {
    return true;
  }

  /** @internal Mirrors: AbstractAdapter#warning_ignored? */
  isWarningIgnored(warning: {
    message?: string;
    code?: string | number;
    [k: string]: unknown;
  }): boolean {
    const matchers: (string | RegExp)[] = (this.constructor as any).dbWarningsIgnore ?? [];
    const msg = warning.message ?? "";
    return matchers.some(
      (m) =>
        (typeof m === "string" ? msg.includes(m) : m.test(msg)) ||
        (warning.code !== undefined &&
          (typeof m === "string"
            ? String(warning.code).includes(m)
            : m.test(String(warning.code)))),
    );
  }

  /** @internal Mirrors: AbstractAdapter#lookup_cast_type_from_column */
  lookupCastTypeFromColumn(column: { sqlType: string | null }): unknown {
    const sqlType = column.sqlType;
    if (!sqlType) return null;
    if (typeof (this as any).lookupCastType === "function") {
      return (this as any).lookupCastType(sqlType);
    }
    return sqlType;
  }
}

// Rails: `include DatabaseStatements` inside the class body.
include(AbstractAdapter, DatabaseStatements);
// Rails: `include SchemaStatements` inside the class body.
include(AbstractAdapter, SchemaStatements);
// Rails: `include Quoting` inside the class body.
include(AbstractAdapter, QuotingMixin);
// Rails: `include QueryCache` inside the class body.
include(AbstractAdapter, QueryCacheMixin);
// Rails: `include Savepoints` inside the class body.
include(AbstractAdapter, SavepointsMixin);
// Rails: `include DatabaseLimits` inside the class body.
include(AbstractAdapter, {
  maxIdentifierLength,
  tableNameLength,
  tableAliasLength,
  indexNameLength,
  bindParamsLength,
});
