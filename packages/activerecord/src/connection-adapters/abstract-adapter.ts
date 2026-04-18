/**
 * Abstract adapter — base class for all database adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */

import { inspectExplainOption } from "../adapter.js";
import type { DatabaseAdapter, ExplainOption } from "../adapter.js";
import { type Nodes, Visitors } from "@blazetrails/arel";
import { ReadOnlyError } from "../errors.js";
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
  type QueryCacheHost,
} from "./abstract/query-cache.js";
import { DatabaseStatementsMixin } from "./database-statements-mixin.js";
import { quote as abstractQuote, typeCast as abstractTypeCast } from "./abstract/quoting.js";

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

// Rails: `class AbstractAdapter ... include DatabaseStatements`. We achieve
// the same shape by mixing DatabaseStatements into the base chain here.
const AbstractAdapterBase = DatabaseStatementsMixin(class {});

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */
export class AbstractAdapter extends AbstractAdapterBase {
  static readonly Version = Version;

  private _connection: DatabaseAdapter | null = null;
  private _owner: string | null = null;
  private _inUse = false;
  private _preparedStatements = false;
  private _schemaCache: SchemaCache | null = null;
  private _idleSince = Date.now();
  protected _lastActivity = 0;
  protected _config: Record<string, unknown> = {};
  _transactionManager: TransactionManager = new TransactionManager(this as any);

  _queryCache: Store | null = null;

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
   */
  get arelVisitor(): Visitors.ToSql {
    return new Visitors.ToSql();
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

  async getAdvisoryLock(_lockId: number | string): Promise<boolean> {
    return false;
  }

  async releaseAdvisoryLock(_lockId: number | string): Promise<boolean> {
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

  defaultUniquenessComparison(_attribute: unknown, _value: unknown): unknown {
    return null;
  }

  caseSensitiveComparison(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    return attribute.eq(value);
  }

  caseInsensitiveComparison(_attribute: unknown, _value: unknown): unknown {
    return null;
  }

  canPerformCaseInsensitiveComparisonFor(_column: unknown): boolean {
    return false;
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

  checkVersion(): void {}

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

  // --- Type registration ---

  static registerClassWithPrecision(_typeMap: unknown, _name: string, _klass: unknown): void {}

  get extendedTypeMap(): Map<string, unknown> {
    return new Map();
  }
}
