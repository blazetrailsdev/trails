import mysql from "mysql2/promise";
import { Notifications } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import type { DatabaseAdapter, ExplainOption, MysqlAdapterOptions } from "../adapter.js";
import {
  AbstractMysqlAdapter,
  StatementPool as MysqlStatementPool,
  type MysqlPreparedStatement,
} from "./abstract-mysql-adapter.js";
import { Version } from "./abstract-adapter.js";
import {
  AdapterTimeout,
  ConnectionFailed,
  ConnectionNotEstablished,
  MismatchedForeignKey,
  NoDatabaseError,
  NotImplementedError,
  SQLWarning,
} from "../errors.js";
import { Result } from "../result.js";
import { CreateIndexDefinition, ForeignKeyDefinition } from "./abstract/schema-definitions.js";
import type { AddIndexOptions } from "./abstract/schema-definitions.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { ExplainPrettyPrinter } from "./mysql/explain-pretty-printer.js";
import { typeCastedBinds } from "./abstract/database-statements.js";
import { getDefaultTimezone } from "../type/internal/timezone.js";
import { temporalTypeCast, TEMPORAL_POOL_OPTIONS } from "./mysql/temporal-type-cast.js";
import type { SchemaSource } from "../schema-dumper.js";
import { SchemaDumper as MysqlSchemaDumper } from "./mysql/schema-dumper.js";
import { SchemaStatements } from "./abstract/schema-statements.js";
import { SchemaCreation as MysqlSchemaCreation } from "./mysql/schema-creation.js";

/**
 * MySQL-specific SchemaStatements subclass. Extends the base `dropTable` to support
 * the `temporary: true` option, which emits `DROP TEMPORARY TABLE` — a MySQL/MariaDB
 * extension required to drop temporary tables without affecting base tables.
 *
 * Returned by `Mysql2Adapter#schemaStatements()` so Migration#schema picks it up.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements (partial)
 */
class MysqlSchemaStatements extends SchemaStatements {
  private _mysqlSchemaCreation?: MysqlSchemaCreation;
  override get schemaCreation(): MysqlSchemaCreation {
    return (this._mysqlSchemaCreation ??= new MysqlSchemaCreation());
  }

  /**
   * `Migration#addIndex` routes through `this.schema.addIndex(...)`, so
   * we override here. Mirrors Rails' `AbstractMysqlAdapter#add_index` /
   * `#build_create_index_definition` pair: pre-flight via
   * `indexExists()` and emit `CREATE INDEX` without `IF NOT EXISTS`
   * (MySQL doesn't support the keyword; MariaDB does but Rails
   * standardizes on the pre-flight for portability). Without this, the
   * second `addIndex(..., { ifNotExists: true })` call trips
   * `ER_DUP_KEYNAME` on MariaDB because `MysqlSchemaCreation`
   * correctly omits the keyword.
   *
   * Mirrors: AbstractMysqlAdapter#add_index +
   * AbstractMysqlAdapter#build_create_index_definition
   */
  override async addIndex(
    tableName: string,
    columnName: string | string[],
    options: AddIndexOptions = {},
  ): Promise<void> {
    const [idx, algorithmClause, ifNotExists] = this.addIndexOptions(
      tableName,
      columnName,
      options as Record<string, unknown>,
    );
    if (ifNotExists && (await this.indexExists(tableName, idx.columns, { name: idx.name }))) {
      return;
    }
    const createDef = new CreateIndexDefinition(idx, false, algorithmClause);
    await this.adapter.executeMutation(this.schemaCreation.accept(createDef));
  }

  override async dropTable(
    ...args:
      | [string, ...string[]]
      | [string, ...string[], { ifExists?: boolean; force?: "cascade"; temporary?: boolean }]
  ): Promise<void> {
    const last = args[args.length - 1];
    const hasOpts = last !== null && last !== undefined && typeof last === "object";
    const opts = (hasOpts ? last : {}) as { temporary?: boolean };
    if (opts.temporary) {
      return (this.adapter as Mysql2Adapter).dropTable(...(args as any));
    }

    return super.dropTable(...(args as any));
  }
}

/**
 * Mysql2-flavored StatementPool. Evicted entries send COM_STMT_CLOSE
 * via `connection.unprepare(sql)` so the mysql2 driver's internal
 * cache (and the server's) stay in step with our `statement_limit`.
 *
 * Mirrors: Mysql2Adapter::StatementPool in activerecord. Errors are
 * intentionally swallowed — Rails' equivalent rescues Mysql2::Error.
 */
class Mysql2StatementPool extends MysqlStatementPool {
  private _conn: mysql.PoolConnection | null;

  constructor(conn: mysql.PoolConnection, maxSize: number) {
    super(maxSize);
    this._conn = conn;
  }

  protected override dealloc(stmt: MysqlPreparedStatement): void {
    const conn = this._conn;
    if (!conn) return;
    // `unprepare` is synchronous in node-mysql2 (it only touches the
    // client-side cache and queues COM_STMT_CLOSE on the socket), but
    // wrap in try/catch in case the client was already destroyed —
    // eviction can't throw or it escapes the base class's loop.
    try {
      (conn as unknown as { unprepare: (sql: string) => void }).unprepare(stmt.sql);
    } catch {
      // swallow — matches Rails' Mysql2::Error rescue on stmt close
    }
  }

  detach(): void {
    this._conn = null;
  }
}

/**
 * MySQL adapter — connects ActiveRecord to a real MySQL/MariaDB database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2Adapter
 *
 * Accepts either a connection URI (`mysql://...`) or a merged config
 * hash — `mysql2` pool-options keys for the driver, plus Rails' adapter-
 * level keys (`statementLimit`, `preparedStatements`) stripped into the
 * adapter before `mysql.createPool` is called. Matches Rails' database.yml
 * shape where driver params and adapter knobs share one hash.
 * Uses a connection pool internally for concurrent access.
 */
export class Mysql2Adapter extends AbstractMysqlAdapter implements DatabaseAdapter {
  // Cached liveness state — updated by activeAsync() pings and reset by
  // disconnectBang()/reconnectBang(). The sync `active` getter can't issue a
  // real network ping, so we track the last known result here.
  private _activeState = true;

  override get active(): boolean {
    return this._driverPool != null && this._activeState;
  }

  /**
   * Async liveness probe — checks socket health via a real `ping` call on a
   * pool connection. Updates the cached `_activeState` so the sync `active`
   * getter reflects the result. Mirrors Rails' `active?` which calls
   * `mysql_ping` on the raw connection.
   */
  async activeAsync(): Promise<boolean> {
    if (!this._driverPool) {
      this._activeState = false;
      return false;
    }
    let conn: mysql.PoolConnection | undefined;
    try {
      // Reuse the held transaction connection when available — probes the same
      // session and avoids blocking on pool exhaustion (e.g. connectionLimit: 1
      // with an active transaction holds the only slot).
      conn = this._conn ?? (await this._driverPool.getConnection());
      await conn.ping();
      this._activeState = true;
      return true;
    } catch {
      this._activeState = false;
      return false;
    } finally {
      // Only release if we checked out a fresh connection, not the transaction one.
      if (conn && conn !== this._conn) conn.release();
    }
  }

  // Mirrors Rails' Mysql2Adapter#connected? — null raw connection means
  // disconnected. (Rails also checks `@raw_connection.closed?`; our
  // driver pool exposes no such predicate, so we rely on close() nulling
  // the pool.)
  override isConnected(): boolean {
    return this._driverPool != null;
  }

  private _driverPool: mysql.Pool | null = null;
  private _endingPool: Promise<void> | null = null;
  // Set by close() to distinguish permanent teardown from disconnectBang(),
  // which is reconnectable. _checkoutConn() refuses to lazy-reconnect after close().
  private _permanentlyClosed = false;
  // Set by the _fakeConnection constructor path — prevents _checkoutConn() from
  // lazily creating a real pool when _driverPool is null.
  private _isFakeConnection = false;
  // Normalized config passed to newClient — stored for reconnect.
  private _poolConfig: mysql.PoolOptions & MysqlAdapterOptions;
  private _conn: mysql.PoolConnection | null = null;
  private _inTransaction = false;
  // Per-mysql.PoolConnection StatementPool. Mirrors the PG adapter's
  // WeakMap approach — prepared statements are session-scoped, so the
  // pool stays attached to the physical connection across the pool's
  // checkin/checkout cycle. WeakMap lets mysql2.Pool reap connections
  // without us leaking entries.
  private _statementPools = new WeakMap<mysql.PoolConnection, Mysql2StatementPool>();

  /**
   * The timezone applied to result rows for the most recent query. Mirrors
   * the Ruby mysql2 driver's `query_options[:database_timezone]`, which
   * Rails' `Mysql2Adapter#perform_query` re-syncs to
   * `ActiveRecord.default_timezone` before each query so a runtime change to
   * the global default takes effect on the next statement (no reconnect).
   *
   * Updated by {@link _syncDatabaseTimezone} from the perform-query path.
   */
  databaseTimezone: "utc" | "local" = "utc";

  /**
   * Refresh {@link databaseTimezone} from the global default. Called from
   * the perform-query path so a `withTimezoneConfig({ default: "local" })`
   * block is observable on the very next query — matching Rails'
   * `raw_connection.query_options[:database_timezone] = default_timezone`
   * line in `Mysql2Adapter#perform_query`.
   */
  private _syncDatabaseTimezone(): void {
    this.databaseTimezone = getDefaultTimezone();
  }

  protected override _onStatementLimitChanged(value: number): void {
    if (this._conn) this._statementPools.get(this._conn)?.setMaxSize(value);
  }

  /**
   * Mirrors `Mysql2Adapter#translate_exception`. Promotes a driver-level
   * read-timeout (a node-mysql2 error with no MySQL errno) to
   * `AdapterTimeout`. Everything else falls through to the
   * AbstractMysqlAdapter mapping, which handles the statement-timeout
   * codes (`ER_QUERY_TIMEOUT` / `ER_FILSORT_ABORT`).
   */
  protected override _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    if (isMysql2DriverTimeout(e)) {
      const msg = e instanceof Error ? e.message : String(e);
      return new AdapterTimeout(msg, { sql, binds, cause: e });
    }
    if (isMysql2ConnectionError(e)) {
      // Mirrors `Mysql2Adapter#translate_exception`'s
      // `Mysql2::Error::ConnectionError` branch: a "MySQL client is not
      // connected" message is promoted to ConnectionNotEstablished;
      // everything else in this family is ConnectionFailed.
      const msg = (e as Error).message;
      if (AbstractMysqlAdapter.CLIENT_NOT_CONNECTED_RE.test(msg)) {
        return new ConnectionNotEstablished(msg, { cause: e });
      }
      return new ConnectionFailed(msg, { sql, binds, cause: e });
    }
    return super._translateException(e, sql, binds);
  }

  /**
   * Look up (or lazily create) the statement pool for `conn`. Matches
   * the PG adapter's `_poolFor`.
   */
  private _poolFor(conn: mysql.PoolConnection): Mysql2StatementPool {
    let pool = this._statementPools.get(conn);
    if (!pool) {
      pool = new Mysql2StatementPool(conn, this._statementLimit);
      this._statementPools.set(conn, pool);
    }
    return pool;
  }

  /**
   * Gate named-prepared-statement routing through our pool. Mirrors
   * Rails' `prepared_statements && !binds.empty?` plus the extra
   * `statement_limit > 0` check that disables caching (and therefore
   * the whole prepared-statement path) when the operator sets
   * `statement_limit = 0`.
   */
  private _shouldPrepare(conn: mysql.PoolConnection, binds: unknown[]): boolean {
    if (!this.preparedStatements || binds.length === 0) return false;
    const poolLimit = this._statementPools.get(conn)?.maxSize ?? this._statementLimit;
    return poolLimit > 0;
  }

  /**
   * Track a SQL string in the per-connection pool BEFORE handing it
   * to `conn.execute()`. If the insert evicts an older entry, our
   * pool's `dealloc` sends COM_STMT_CLOSE via `unprepare` so the
   * mysql2 driver's internal cache and the server both release the
   * prepared statement. No-op when caching is disabled.
   */
  private _trackPrepared(conn: mysql.PoolConnection, sql: string): void {
    const pool = this._poolFor(conn);
    if (pool.maxSize === 0) return;
    // Use `get` (not `has`) so an already-cached entry is moved to
    // the MRU end of the LRU. Otherwise a hot statement executed
    // repeatedly would keep its original insertion position and get
    // evicted the moment any other distinct query came along.
    if (pool.get(sql)) return;
    pool.set(sql, { sql, key: pool.nextKey() });
  }

  /**
   * Test-only accessor for the statement pool attached to the
   * currently-held transaction connection. Returns undefined outside
   * a transaction — matches the PG adapter's equivalent hook.
   * @internal
   */
  _statementPoolForTest(): Mysql2StatementPool | undefined {
    return this._conn ? this._statementPools.get(this._conn) : undefined;
  }

  /**
   * Clear cached prepared statements on the currently-held transaction
   * connection. Mirrors Rails' `Mysql2Adapter#clear_cache!` which
   * calls `close` on each cached statement on the adapter's sole
   * connection. Non-active per-connection pools are intentionally
   * left attached: resetting the WeakMap would orphan our sql→name
   * map while the server-side PREPAREs still exist, and a later
   * checkout of that same mysql.PoolConnection would restart the
   * counter and collide with still-PREPAREd statements.
   */
  override clearCacheBang(): void {
    super.clearCacheBang();
    if (this._conn) {
      this._statementPools.get(this._conn)?.clear();
    }
  }
  // Cached capability flag — information_schema.statistics.expression
  // is MySQL 8.0.13+. Pre-8 MySQL and MariaDB (through at least 10.x)
  // don't expose it, so we detect once and remember. `undefined` =
  // not yet probed, `true`/`false` = result.
  private _statisticsHasExpression: boolean | undefined;
  private _fullVersionString: string | null = null;
  private _database: string | undefined;

  /**
   * Returns true when the database named in `config` is reachable; false when
   * the server responds with ER_BAD_DB_ERROR (1049). Mirrors Rails'
   * `AbstractAdapter.database_exists?(config)` → `new(config).database_exists?`.
   */
  static async databaseExists(
    config: string | (mysql.PoolOptions & MysqlAdapterOptions),
  ): Promise<boolean> {
    const adapter = new Mysql2Adapter(config);
    try {
      // Any query that requires a real database will trigger ER_BAD_DB_ERROR
      // if the DB doesn't exist — _checkoutConn() already translates it to NoDatabaseError.
      const conn = await adapter._checkoutConn();
      conn.release();
      return true;
    } catch (e) {
      if (e instanceof NoDatabaseError) return false;
      throw e;
    } finally {
      await adapter.close();
    }
  }

  constructor(config: string | (mysql.PoolOptions & MysqlAdapterOptions)) {
    super();
    if (typeof config === "string") {
      let waitTimeout: number | undefined;
      let uri = config;
      try {
        const url = new URL(config);
        this._database =
          decodeURIComponent(url.pathname.replace(/^\/+/, "").replace(/\/+$/, "")) || undefined;
        const wt = url.searchParams.get("wait_timeout");
        if (wt !== null) {
          const n = parseInt(wt, 10);
          if (Number.isInteger(n)) waitTimeout = n;
          // Strip from URI so mysql2 doesn't warn about an unknown connection option.
          url.searchParams.delete("wait_timeout");
          uri = url.toString();
        }
      } catch {
        // malformed URI — leave _database undefined
      }
      // Mirrors Rails Mysql2Adapter#initialize: always ensure FOUND_ROWS is set.
      this._poolConfig = { uri, waitTimeout, flags: ["FOUND_ROWS"] };
      this._driverPool = Mysql2Adapter.newClient(this._poolConfig, this._buildInitSql());
      return;
    }
    // See PostgreSQLAdapter#constructor: Rails' database.yml merges
    // driver + adapter config, and AbstractAdapter#initialize reads
    // `:statement_limit` / `:prepared_statements` off that single
    // hash. Validate & apply the adapter-level keys FIRST so an
    // invalid value fails before `mysql.createPool` runs — otherwise
    // a throw would leave a live pool with no cleanup path.
    const {
      statementLimit,
      preparedStatements,
      strict,
      waitTimeout,
      variables,
      _fakeConnection: fake,
      ...mysqlConfig
    } = config as mysql.PoolOptions & MysqlAdapterOptions;
    if (statementLimit !== undefined) this.statementLimit = statementLimit;
    if (preparedStatements !== undefined) this.preparedStatements = preparedStatements;
    this._database =
      (mysqlConfig.database as string | undefined) ??
      (() => {
        try {
          const uri = (mysqlConfig as { uri?: string }).uri;
          return uri
            ? decodeURIComponent(new URL(uri).pathname.replace(/^\/+/, "").replace(/\/+$/, "")) ||
                undefined
            : undefined;
        } catch {
          return undefined;
        }
      })();
    // Mirrors Rails Mysql2Adapter#initialize: ensure FOUND_ROWS is always set so MySQL reports
    // matched rows (not just changed rows) for UPDATE/DELETE. Rails also handles numeric bitmask
    // flags (flags |= Mysql2::Client::FOUND_ROWS), but mysql2's TypeScript type only accepts
    // Array<string>, so we handle the array form exclusively here.
    const inputFlags = mysqlConfig.flags;
    const resolvedFlags: string[] = Array.isArray(inputFlags)
      ? inputFlags.includes("FOUND_ROWS")
        ? inputFlags
        : [...inputFlags, "FOUND_ROWS"]
      : ["FOUND_ROWS"];
    this._poolConfig = {
      ...mysqlConfig,
      flags: resolvedFlags,
      strict,
      waitTimeout,
      variables,
    };
    // _fakeConnection: true skips pool creation — used in unit tests that need
    // an Mysql2Adapter instance without a live DB (mirrors Rails' fake_connection
    // constructor path: `new Mysql2Adapter(fake_conn, logger, nil, config)`).
    if (fake) {
      this._isFakeConnection = true;
    } else {
      this._driverPool = Mysql2Adapter.newClient(this._poolConfig, this._buildInitSql());
    }
  }

  /**
   * Execute a query and return an ActiveRecord::Result. Accepts a `prepare`
   * option that, when true, forces server-side prepared-statement execution
   * on this query even if `preparedStatements` is globally off. DML statements
   * (INSERT/UPDATE/DELETE) are tolerated — they return an empty Result.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements#perform_query
   * (the `prepare:` keyword routing) + Rails' exec_query tolerating no-result DML.
   */
  override async execQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean },
  ): Promise<Result> {
    await this.materializeTransactions();
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds ?? []);
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name: name ?? "SQL",
      binds: driverBinds,
      type_casted_binds: typeCastedBinds(driverBinds),
      connection: this,
      row_count: 0,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      let conn: mysql.PoolConnection | undefined;
      try {
        conn = await this.getConn();
        const prepare = options?.prepare ?? this._shouldPrepare(conn, binds ?? []);
        if (prepare) this._trackPrepared(conn, driverSql);
        const [rawResult] = prepare
          ? await conn.execute(driverSql, driverBinds as any[])
          : await conn.query(driverSql, driverBinds);
        // DML results in a ResultSetHeader (no rows array); SELECT results
        // in an array of row objects. Return empty Result for DML to avoid
        // throwing on INSERT/UPDATE/DELETE passed to execQuery.
        if (!Array.isArray(rawResult)) {
          this.dirtyCurrentTransaction();
          payload.row_count = (rawResult as mysql.ResultSetHeader).affectedRows ?? 0;
          await this._handleWarningsOn(conn, driverSql);
          return new Result([], []);
        }
        payload.row_count = rawResult.length;
        await this._handleWarningsOn(conn, driverSql);
        return Result.fromRowHashes(rawResult as Record<string, unknown>[]);
      } catch (e: any) {
        if (e instanceof SQLWarning) {
          payload.exception = e;
          payload.exception_object = e;
          throw e;
        }
        const { error: translated, connReleased } = await this._translateAndEnrich(
          e,
          driverSql,
          driverBinds,
          conn,
        );
        if (connReleased) conn = undefined;
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      } finally {
        if (conn) this.releaseConn(conn);
      }
    });
  }

  /** Returns true for raw mysql2 errors that indicate the database doesn't exist (ER_BAD_DB_ERROR). */
  isNoDatabaseError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const e = error as { code?: unknown; errno?: unknown };
    return e.code === "ER_BAD_DB_ERROR" || e.errno === 1049;
  }

  /** Checkout a fresh connection from the pool, translating ER_BAD_DB_ERROR. */
  private async _checkoutConn(): Promise<mysql.PoolConnection> {
    // Lazy reconnect after disconnectBang() — mirrors Rails' reconnect on next
    // execute after disconnect! (abstract_adapter.rb #with_raw_connection).
    // close() sets _permanentlyClosed so we don't silently reopen after teardown.
    // _isFakeConnection skips reconnect — fake adapters have no pool by design.
    if (!this._driverPool) {
      if (this._permanentlyClosed) throw new Error("Mysql2Adapter: connection is closed");
      if (this._isFakeConnection) throw new Error("Mysql2Adapter: fake connection has no pool");
      this._driverPool = Mysql2Adapter.newClient(this._poolConfig, this._buildInitSql());
      this._activeState = true;
    }
    try {
      return await this._driverPool.getConnection();
    } catch (error) {
      if (this.isNoDatabaseError(error)) {
        throw NoDatabaseError.dbError(this._database ?? "unknown");
      }
      throw error;
    }
  }

  /**
   * Get the active connection — either the transaction connection or a fresh
   * one from the pool.
   */
  private async getConn(): Promise<mysql.PoolConnection> {
    if (this._conn) return this._conn;
    return this._checkoutConn();
  }

  /**
   * Release a connection back to the pool (only if not in a transaction).
   */
  private releaseConn(conn: mysql.PoolConnection): void {
    if (conn !== this._conn) {
      conn.release();
    }
  }

  /**
   * Convert double-quoted identifiers to backtick-quoted for MySQL/MariaDB.
   *
   * CONVENTION: Arel-generated DML and SQL builders (Relation, InsertAll, etc.)
   * use standard double-quoted identifiers ("table"."column"). This method
   * converts them to backticks at execution time, so MySQL-specific quoting is
   * handled in one place rather than threaded through every SQL builder.
   * Adapter-specific DDL or raw SQL fragments may still use backticks or
   * quoteIdentifier(..., "mysql") directly where appropriate.
   */
  private mysqlQuote(sql: string): string {
    // Replace "identifier" with `identifier`, but not inside single-quoted strings.
    // Split on single-quoted strings, only transform non-string parts.
    const parts = sql.split(/('(?:[^'\\]|\\.)*')/);
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i].replace(/"/g, "`");
    }
    let result = parts.join("");

    // MySQL requires LIMIT when using OFFSET; add a large LIMIT if missing
    if (/\bOFFSET\b/i.test(result) && !/\bLIMIT\b/i.test(result)) {
      result = result.replace(/\bOFFSET\b/i, "LIMIT 18446744073709551615 OFFSET");
    }

    return result;
  }

  /**
   * Translate a driver exception and, if it's a MismatchedForeignKey,
   * enrich it with the referenced column's type via an async columns() call.
   *
   * Returns the translated (and possibly enriched) error plus a flag
   * indicating whether the caller's `conn` was released during enrichment
   * (to prevent double-release in `finally`).
   */
  private async _translateAndEnrich(
    e: unknown,
    sql: string,
    binds: unknown[],
    conn: mysql.PoolConnection | undefined,
  ): Promise<{ error: Error; connReleased: boolean }> {
    let translated = this._translateException(e, sql, binds);
    let connReleased = false;
    if (translated instanceof MismatchedForeignKey) {
      // Release connection before enrichment — _enrichMismatchedForeignKey
      // calls columns() which needs its own pool connection. Holding the
      // current connection while waiting for another would deadlock on
      // small pools (e.g. connectionLimit: 1).
      if (conn) {
        this.releaseConn(conn);
        connReleased = true;
      }
      translated = await this._enrichMismatchedForeignKey(translated);
    }
    return { error: translated, connReleased };
  }

  /**
   * Convert boolean values in binds to integers for MySQL compatibility.
   */
  private mysqlBinds(binds: unknown[]): unknown[] {
    return binds.map((v) => (v === true ? 1 : v === false ? 0 : v));
  }

  /**
   * Execute a SELECT query and return rows. Wrapped in a
   * `sql.active_record` notification — mirrors Rails'
   * `AbstractAdapter#log` so LogSubscriber / ExplainSubscriber /
   * QueryCache observe the same query stream.
   */
  async execute(
    sql: string,
    binds: unknown[] = [],
    name: string = "SQL",
  ): Promise<Record<string, unknown>[]> {
    await this.materializeTransactions();
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds);
    // payload records the exact values sent to mysql2 so LogSubscriber /
    // ExplainSubscriber / QueryCache all observe what actually ran.
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name,
      binds: driverBinds,
      type_casted_binds: typeCastedBinds(driverBinds),
      connection: this,
      row_count: 0,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      let conn: mysql.PoolConnection | undefined;
      try {
        conn = await this.getConn();
        // Use server-side prepared statements when enabled and binds
        // are present — matches PR #589's preparedStatements toggle.
        // Track the SQL in our per-connection pool first so LRU
        // eviction sends COM_STMT_CLOSE (via unprepare) when we
        // exceed `statement_limit`.
        const prepare = this._shouldPrepare(conn, binds);
        if (prepare) this._trackPrepared(conn, driverSql);
        const [rows] = prepare
          ? await conn.execute(driverSql, driverBinds as any[])
          : await conn.query(driverSql, driverBinds);
        const r = rows as Record<string, unknown>[];
        payload.row_count = Array.isArray(r) ? r.length : 0;
        await this._handleWarningsOn(conn, driverSql);
        return r;
      } catch (e: any) {
        if (e instanceof SQLWarning) {
          payload.exception = e;
          payload.exception_object = e;
          throw e;
        }
        // getConn() itself can throw (pool exhausted / connection
        // refused / closed pool); catching here lets subscribers see
        // acquisition failures as `payload.exception` too. Query-level
        // driver errors (ER_DUP_ENTRY etc.) are translated to Rails'
        // typed exception classes via _translateAndEnrich.
        const { error: translated, connReleased } = await this._translateAndEnrich(
          e,
          driverSql,
          driverBinds,
          conn,
        );
        if (connReleased) conn = undefined;
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      } finally {
        if (conn) this.releaseConn(conn);
      }
    });
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   * Wrapped in a `sql.active_record` notification — see `execute`.
   */
  async executeMutation(sql: string, binds: unknown[] = [], name: string = "SQL"): Promise<number> {
    await this.materializeTransactions();
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds);
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name,
      binds: driverBinds,
      type_casted_binds: typeCastedBinds(driverBinds),
      connection: this,
      row_count: 0,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      let conn: mysql.PoolConnection | undefined;
      try {
        conn = await this.getConn();
        const prepare = this._shouldPrepare(conn, binds);
        if (prepare) this._trackPrepared(conn, driverSql);
        const [result] = prepare
          ? await conn.execute(driverSql, driverBinds as any[])
          : await conn.query(driverSql, driverBinds);
        this.dirtyCurrentTransaction();
        const info = result as mysql.ResultSetHeader;
        payload.row_count = info.affectedRows ?? 0;
        await this._handleWarningsOn(conn, driverSql);

        // For INSERT, return the last inserted ID (or affected rows for multi-row)
        if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
          if (info.affectedRows > 1) {
            return info.affectedRows;
          }
          return info.insertId;
        }

        // For UPDATE/DELETE, return affected rows
        return info.affectedRows;
      } catch (e: any) {
        if (e instanceof SQLWarning) {
          payload.exception = e;
          payload.exception_object = e;
          throw e;
        }
        // Guard acquisition failures (pool exhausted / refused /
        // closed) so subscribers still see `payload.exception`. Driver
        // errors (ER_DUP_ENTRY etc.) are translated to Rails' typed
        // exception classes via _translateAndEnrich.
        const { error: translated, connReleased } = await this._translateAndEnrich(
          e,
          driverSql,
          driverBinds,
          conn,
        );
        if (connReleased) conn = undefined;
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      } finally {
        if (conn) this.releaseConn(conn);
      }
    });
  }

  /**
   * Begin a transaction. Acquires a dedicated connection from the pool.
   */
  async beginTransaction(): Promise<void> {
    // Force materialization (_lazy: false) so _inTransaction is set immediately.
    await this._transactionManager.beginTransaction({ _lazy: false });
  }

  async beginDbTransaction(): Promise<void> {
    this._conn = await this._checkoutConn();
    await this._conn.query("BEGIN");
    this._inTransaction = true;
  }

  async beginDeferredTransaction(): Promise<void> {
    return this.beginDbTransaction();
  }

  /**
   * Commit the current transaction and release the connection.
   */
  async commit(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.commitTransaction();
    }
    if (!this._conn) throw new Error("No active transaction");
    await this._conn.query("COMMIT");
    this._conn.release();
    this._conn = null;
    this._inTransaction = false;
  }

  async commitDbTransaction(): Promise<void> {
    return this.commit();
  }

  /**
   * Rollback the current transaction and release the connection.
   */
  async rollback(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.rollbackTransaction();
    }
    return this.rollbackDbTransaction();
  }

  async rollbackDbTransaction(): Promise<void> {
    if (!this._conn) throw new Error("No active transaction");
    await this._conn.query("ROLLBACK");
    this._conn.release();
    this._conn = null;
    this._inTransaction = false;
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`RELEASE SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`ROLLBACK TO SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Return the query execution plan. Accepts Rails-style options (e.g.
   * `["analyze"]` → `EXPLAIN ANALYZE <sql>` on MySQL 8.0.18+). Binds
   * flow through in the same driver form `execute()` uses
   * (`mysqlBinds(binds)` — booleans → 1/0), so a collected
   * prepared-statement SQL with `?` placeholders re-EXPLAINs
   * correctly.
   */
  async explain(
    sql: string,
    binds: unknown[] = [],
    options: ExplainOption[] = [],
  ): Promise<string> {
    // Rails' MySQL::DatabaseStatements#explain runs through internal_exec_query
    // and therefore through perform_query, which re-syncs the database timezone.
    this._syncDatabaseTimezone();
    const conn = await this.getConn();
    try {
      const clause = this._explainStatementClause(options);
      const start = Date.now();
      // Forward binds in the same driver form execute() uses
      // (booleans → 1/0). Without this, an EXPLAIN over a bind-
      // carrying prepared-statement query would fail with a mysql
      // parameter-count error.
      const [rows] = await conn.query(`${clause} ${this.mysqlQuote(sql)}`, this.mysqlBinds(binds));
      const elapsed = (Date.now() - start) / 1000;
      const printer = new ExplainPrettyPrinter();
      const typedRows = rows as Array<Record<string, unknown>>;
      const columns = typedRows.length > 0 ? Object.keys(typedRows[0]) : [];
      const result = { columns, rows: typedRows.map((r) => columns.map((c) => r[c])) };
      return printer.pp(result, elapsed);
    } finally {
      this.releaseConn(conn);
    }
  }

  // `quote()` and `typeCast()` are inherited from AbstractMysqlAdapter,
  // which delegates to `mysql/quoting.ts`. No Mysql2-specific override
  // needed — they'd be duplicates.
  //
  // `buildExplainClause` / `_validateExplainOptions` / `_explainStatementClause`
  // and the EXPLAIN_FLAGS / EXPLAIN_FORMATS allowlists live on
  // AbstractMysqlAdapter so TrilogyAdapter inherits the same MySQL
  // clause shape.

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    this._syncDatabaseTimezone();
    const conn = await this.getConn();
    try {
      await conn.query(this.mysqlQuote(sql));
    } finally {
      this.releaseConn(conn);
    }
  }

  createSchemaDumper(source: SchemaSource, _options: unknown = {}): MysqlSchemaDumper {
    const dumper = new MysqlSchemaDumper(source);
    dumper.connection = this;
    return dumper;
  }

  override schemaStatements(host?: DatabaseAdapter): MysqlSchemaStatements {
    return new MysqlSchemaStatements((host ?? this) as DatabaseAdapter);
  }

  // ── Schema DDL ──

  /**
   * Mirrors Rails' MySQL `drop_table` which emits `DROP TEMPORARY TABLE`
   * when `temporary: true` is passed. The abstract base omits this keyword.
   */
  override async dropTable(
    ...args:
      | [string, ...string[]]
      | [string, ...string[], { ifExists?: boolean; force?: "cascade"; temporary?: boolean }]
  ): Promise<void> {
    const last = args[args.length - 1];
    const hasOpts = last !== null && last !== undefined && typeof last === "object";
    const tableNames = (hasOpts ? args.slice(0, -1) : args) as string[];
    const options = (hasOpts ? last : {}) as {
      ifExists?: boolean;
      force?: "cascade";
      temporary?: boolean;
    };
    if (tableNames.length === 0) {
      throw new ArgumentError("dropTable requires at least one table name");
    }
    const temporary = options.temporary ? " TEMPORARY" : "";
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    const quoted = tableNames.map((n) => this.quoteTableName(n)).join(", ");
    for (const name of tableNames) {
      this.schemaCache?.clearDataSourceCacheBang(this.pool, name);
    }
    await this.executeMutation(`DROP${temporary} TABLE${ifExists} ${quoted}${cascade}`);
  }

  // ── Schema introspection ──
  // Mirrors Rails' MySQL SchemaStatements (connection_adapters/mysql/
  // schema_statements.rb + abstract_mysql_adapter.rb). All queries
  // scope to the current database via information_schema.

  /**
   * List all BASE TABLEs in the current database, matching Rails'
   * `data_source_sql(type: "BASE TABLE")` shape.
   */
  async tables(): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = database() AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
    );
    return rows.map((r) => (r.name ?? r.NAME ?? r.TABLE_NAME) as string);
  }

  /**
   * List all VIEWs in the current database, matching Rails'
   * `data_source_sql(type: "VIEW")`.
   */
  async views(): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = database() AND table_type = 'VIEW'
         ORDER BY table_name`,
    );
    return rows.map((r) => (r.name ?? r.NAME ?? r.TABLE_NAME) as string);
  }

  /**
   * Tables + views, deduped. Matches Rails'
   * `AbstractAdapter#data_sources` — the name SchemaCache.addAll calls
   * through. information_schema.tables already returns distinct rows
   * within a schema, but the Set pass is defensive + keeps the
   * contract explicit for future callers.
   */
  async dataSources(): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = database()
         ORDER BY table_name`,
    );
    return [...new Set(rows.map((r) => (r.name ?? r.NAME ?? r.TABLE_NAME) as string))];
  }

  async tableExists(name: string): Promise<boolean> {
    return this.informationSchemaExists(name, "BASE TABLE");
  }

  async viewExists(name: string): Promise<boolean> {
    return this.informationSchemaExists(name, "VIEW");
  }

  async dataSourceExists(name: string): Promise<boolean> {
    return this.informationSchemaExists(name, null);
  }

  private async informationSchemaExists(
    name: string,
    type: "BASE TABLE" | "VIEW" | null,
  ): Promise<boolean> {
    const { schema, table } = this.parseMysqlName(name);
    const schemaBind = schema ?? null;
    // Use `schema_placeholder OR database()` via COALESCE so the same
    // query shape serves qualified + unqualified callers.
    const typeClause = type ? "AND table_type = ?" : "";
    const params: unknown[] = [schemaBind, table];
    if (type) params.push(type);
    const rows = await this.schemaQuery(
      `SELECT 1 AS one FROM information_schema.tables
         WHERE table_schema = COALESCE(?, database())
         AND table_name = ?
         ${typeClause}
         LIMIT 1`,
      params,
    );
    return rows.length > 0;
  }

  /**
   * Return the primary key: scalar string for single-column PKs,
   * array for composite PKs, null for no-PK tables. Uses the same
   * `information_schema.statistics` + `seq_in_index` shape Rails
   * emits in `abstract_mysql_adapter#primary_keys`.
   */
  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const { schema, table } = this.parseMysqlName(tableName);
    const rows = (await this.schemaQuery(
      `SELECT column_name AS name FROM information_schema.statistics
         WHERE index_name = 'PRIMARY'
         AND table_schema = COALESCE(?, database())
         AND table_name = ?
         ORDER BY seq_in_index`,
      [schema ?? null, table],
    )) as Array<{ name?: string; NAME?: string; COLUMN_NAME?: string }>;
    const names = rows.map((r) => (r.name ?? r.NAME ?? r.COLUMN_NAME) as string);
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    return names;
  }

  /**
   * Return Column metadata for the named table. Reads from
   * `information_schema.columns` — matches Rails' column introspection
   * shape. Populates the fields SchemaCache serializes (name, default,
   * null, sqlTypeMetadata, primaryKey).
   */
  async columns(tableName: string): Promise<Column[]> {
    const { schema, table } = this.parseMysqlName(tableName);
    const rows = (await this.schemaQuery(
      `SELECT column_name AS name,
              column_default AS default_value,
              is_nullable AS nullable,
              data_type AS type,
              column_type AS full_type,
              character_maximum_length AS char_len,
              numeric_precision AS num_precision,
              numeric_scale AS num_scale,
              column_key AS col_key,
              collation_name AS collation,
              column_comment AS comment
         FROM information_schema.columns
         WHERE table_schema = COALESCE(?, database())
         AND table_name = ?
         ORDER BY ordinal_position`,
      [schema ?? null, table],
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const name = String((r.name ?? r.NAME ?? r.COLUMN_NAME) as string);
      const sqlType = String((r.full_type ?? r.FULL_TYPE ?? r.COLUMN_TYPE ?? "") as string);
      const baseType = String((r.type ?? r.TYPE ?? r.DATA_TYPE ?? "") as string).toLowerCase();
      const charLen = r.char_len ?? r.CHAR_LEN ?? r.CHARACTER_MAXIMUM_LENGTH;
      const numPrec = r.num_precision ?? r.NUM_PRECISION ?? r.NUMERIC_PRECISION;
      const numScale = r.num_scale ?? r.NUM_SCALE ?? r.NUMERIC_SCALE;
      // character_maximum_length covers string types; for numeric types (float, int, etc.)
      // it is NULL, so fall back to the type-map limit keyed on DATA_TYPE (not COLUMN_TYPE).
      // On MariaDB, FLOAT COLUMN_TYPE is normalized to "double" which gives limit=53; using
      // DATA_TYPE ("float") correctly yields limit=24 matching Rails' native_database_types.
      const charLimitVal = charLen != null ? Number(charLen) : null;
      // lookupCastType always returns a Type (falls back to ValueType with name "value").
      // We preserve baseType for unregistered types so callers see the raw DATA_TYPE
      // rather than the opaque "value" sentinel.
      const castType = this.lookupCastType(baseType);
      const typeMapLimit = charLimitVal == null ? (castType.limit ?? null) : null;
      // Map DATA_TYPE ("varchar") to the Rails semantic type ("string") via the type map.
      // MysqlDateTimeType.name is "datetime" for both "datetime" and "timestamp" DATA_TYPEs.
      const castName = castType.name;
      const semanticType = (castName === "value" ? baseType : castName).toLowerCase();
      const meta = new SqlTypeMetadata({
        sqlType,
        type: semanticType,
        limit: charLimitVal ?? typeMapLimit,
        precision: numPrec != null ? Number(numPrec) : null,
        scale: numScale != null ? Number(numScale) : null,
      });
      const nullable =
        String((r.nullable ?? r.NULLABLE ?? r.IS_NULLABLE ?? "YES") as string).toUpperCase() !==
        "NO";
      const colKey = String((r.col_key ?? r.COL_KEY ?? r.COLUMN_KEY ?? "") as string);
      return new Column(name, r.default_value ?? r.DEFAULT_VALUE ?? null, meta, nullable, {
        collation: (r.collation ?? r.COLLATION ?? null) as string | null,
        comment: (r.comment ?? r.COMMENT ?? null) as string | null,
        primaryKey: colKey === "PRI",
      });
    });
  }

  /**
   * Return user-defined indexes for the given table. Uses
   * `information_schema.statistics` (cross-schema-capable) and surfaces
   * `using` / `type` fields the way Rails' MySQL `indexes` does via
   * `Index_type`: btree/hash map to `using`, fulltext/spatial map to `type`.
   * Functional-index expressions are surfaced on MySQL 8.0.13+ (detected
   * via statisticsHasExpressionColumn).
   */
  async indexes(
    tableName: string,
  ): Promise<
    Array<{ name: string; columns: string[]; unique: boolean; using?: string; type?: string }>
  > {
    const { schema, table } = this.parseMysqlName(tableName);
    const hasExpr = await this.statisticsHasExpressionColumn();
    const exprSelect = hasExpr ? "expression AS expr" : "NULL AS expr";
    const rows = (await this.schemaQuery(
      `SELECT index_name AS name,
              column_name AS col,
              ${exprSelect},
              non_unique AS non_unique,
              index_type AS idx_type
         FROM information_schema.statistics
         WHERE table_schema = COALESCE(?, database())
         AND table_name = ?
         AND index_name <> 'PRIMARY'
         ORDER BY index_name, seq_in_index`,
      [schema ?? null, table],
    )) as Array<Record<string, unknown>>;

    const byIndex = new Map<
      string,
      { columns: string[]; unique: boolean; using?: string; type?: string }
    >();
    for (const r of rows) {
      const name = String((r.name ?? r.NAME ?? r.INDEX_NAME) as string);
      // MySQL 8+ functional indexes store NULL in column_name and the
      // raw SQL expression in `expression`. Rails wraps those in parens
      // for its IndexDefinition; we do the same so the entry is
      // unambiguous and doesn't serialize as the literal string "null"
      // (what String(null) would produce).
      const rawCol = r.col ?? r.COL ?? r.COLUMN_NAME;
      const rawExpr = r.expr ?? r.EXPR ?? r.EXPRESSION;
      let column: string | null;
      if (rawCol != null) {
        column = String(rawCol);
      } else if (rawExpr != null) {
        const expr = String(rawExpr);
        column = expr.startsWith("(") ? expr : `(${expr})`;
      } else {
        column = null;
      }
      if (column == null) continue;
      const nonUnique = Number(r.non_unique ?? r.NON_UNIQUE ?? 0);
      if (!byIndex.has(name)) {
        const idxType = String(r.idx_type ?? r.IDX_TYPE ?? r.INDEX_TYPE ?? "BTREE").toUpperCase();
        let using: string | undefined;
        let type: string | undefined;
        if (idxType === "FULLTEXT" || idxType === "SPATIAL") {
          type = idxType.toLowerCase();
        } else {
          using = idxType.toLowerCase();
        }
        byIndex.set(name, { columns: [], unique: nonUnique === 0, using, type });
      }
      byIndex.get(name)!.columns.push(column);
    }
    return Array.from(byIndex.entries()).map(([name, { columns, unique, using, type }]) => ({
      name,
      columns,
      unique,
      ...(using !== undefined ? { using } : {}),
      ...(type !== undefined ? { type } : {}),
    }));
  }

  /**
   * Check whether `information_schema.statistics` exposes an
   * `expression` column. Added in MySQL 8.0.13; absent on earlier
   * MySQL and on MariaDB (through 10.x). Probed once per adapter
   * instance and memoized — the result can't change mid-connection.
   */
  private async statisticsHasExpressionColumn(): Promise<boolean> {
    if (this._statisticsHasExpression !== undefined) {
      return this._statisticsHasExpression;
    }
    try {
      const rows = (await this.schemaQuery(
        `SELECT 1 AS one FROM information_schema.columns
           WHERE table_schema = 'information_schema'
           AND table_name = 'STATISTICS'
           AND column_name = 'EXPRESSION'
           LIMIT 1`,
      )) as Array<unknown>;
      this._statisticsHasExpression = rows.length > 0;
    } catch {
      // Defensive: if the probe itself fails, assume no — we'll just
      // miss functional index expressions, which matches pre-8 MySQL
      // semantics anyway.
      this._statisticsHasExpression = false;
    }
    return this._statisticsHasExpression;
  }

  /**
   * Split a `schema.table` or `` `schema`.`table` `` into `{schema, table}`.
   *
   * Whole-string parser (not regex-tokenize): walks the input once and
   * requires exactly one part or two parts joined by a single dot,
   * respecting `` ` `` quoting and doubled-backtick escapes. Rejects
   * empty segments (`.widgets`, `a..b`, `db.widgets.`), extra parts
   * (`a.b.c`), and unterminated quoted tokens. This is intentionally
   * stricter than the PG helper in
   * `packages/activerecord/src/connection-adapters/postgresql/utils.ts`
   * (which tolerates empty segments and trailing parts) so a typo in
   * a MySQL introspection call surfaces instead of silently pointing
   * at the wrong table.
   */
  private parseMysqlName(name: string): { schema?: string; table: string } {
    const input = name.trim();
    const invalid = (): never => {
      throw new Error(`Invalid MySQL identifier "${name}": expected "table" or "schema.table".`);
    };
    const unquote = (s: string): string =>
      s.startsWith("`") && s.endsWith("`") ? s.slice(1, -1).replace(/``/g, "`") : s;

    // Parse a single identifier token starting at `start`. Returns the
    // raw token (with backticks kept, to preserve quote distinctness)
    // and the index of the next unconsumed character. Throws on empty
    // or unterminated tokens.
    const parsePart = (start: number): { part: string; nextIndex: number } => {
      if (start >= input.length) invalid();
      if (input[start] === "`") {
        let part = "`";
        let i = start + 1;
        while (i < input.length) {
          if (input[i] === "`") {
            if (input[i + 1] === "`") {
              part += "``";
              i += 2;
              continue;
            }
            part += "`";
            return { part, nextIndex: i + 1 };
          }
          part += input[i];
          i += 1;
        }
        invalid(); // unterminated
      }
      let i = start;
      // Stop at `.`, the start of a quoted token, or any whitespace.
      // MySQL only permits whitespace inside *backtick-quoted*
      // identifiers; an unquoted "db .widgets" would therefore be
      // invalid. Treating whitespace as a token boundary (rather than
      // part of the name) lets the extra-content check downstream
      // reject the input cleanly.
      while (i < input.length && input[i] !== "." && input[i] !== "`" && !/\s/.test(input[i])) {
        i += 1;
      }
      if (i === start) invalid(); // empty
      return { part: input.slice(start, i), nextIndex: i };
    };

    if (input.length === 0) invalid();

    // unquote + re-validate non-empty: a quoted token like "``" lexes
    // fine in parsePart (backticks match, body is empty) but unquotes
    // to "", which would break COALESCE(?, database()) and make the
    // introspection call silently scan the wrong catalog. Centralize
    // the empty-check here so both bare and quoted forms are covered.
    const checkNonEmpty = (part: string): string => {
      const s = unquote(part);
      if (s.length === 0) invalid();
      return s;
    };

    const first = parsePart(0);
    if (first.nextIndex === input.length) {
      return { table: checkNonEmpty(first.part) };
    }
    if (input[first.nextIndex] !== ".") invalid();
    const second = parsePart(first.nextIndex + 1);
    if (second.nextIndex !== input.length) invalid(); // extra content
    return { schema: checkNonEmpty(first.part), table: checkNonEmpty(second.part) };
  }

  supportsAdvisoryLocks(): boolean {
    return true;
  }

  // Advisory locks are connection-scoped — pin a dedicated connection
  // so acquire and release use the same session.
  private _advisoryLockConn: mysql.PoolConnection | null = null;

  async getAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const conn = await this._checkoutConn();
    try {
      const [rows] = await conn.query("SELECT GET_LOCK(?, 0) AS locked", [String(lockId)]);
      const locked = (rows as Record<string, unknown>[])[0]?.locked === 1;
      if (locked) {
        this._advisoryLockConn = conn;
      } else {
        conn.release();
      }
      return locked;
    } catch (error) {
      conn.release();
      throw error;
    }
  }

  async releaseAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const conn = this._advisoryLockConn;
    if (!conn) return false;
    try {
      const [rows] = await conn.query("SELECT RELEASE_LOCK(?) AS unlocked", [String(lockId)]);
      return (rows as Record<string, unknown>[])[0]?.unlocked === 1;
    } finally {
      this._advisoryLockConn = null;
      conn.release();
    }
  }

  /**
   * Close and reopen the connection pool from the stored config.
   * Mirrors Rails' Mysql2Adapter#reconnect! (disconnect! + connect).
   * Pool creation via newClient is synchronous; fresh connections are
   * established lazily on first use, so this method stays synchronous.
   */
  override reconnectBang(): void {
    if (this._permanentlyClosed) throw new Error("Mysql2Adapter: connection is closed");
    this.disconnectBang();
    this._driverPool = Mysql2Adapter.newClient(this._poolConfig, this._buildInitSql());
    this._activeState = true;
  }

  /**
   * Releases advisory-lock and transaction connections, nulls `_driverPool` so
   * `active` returns false right away, then schedules pool.end() asynchronously.
   * Mirrors Rails' Mysql2Adapter#disconnect! (super + raw_connection.close + nil).
   */
  override disconnectBang(): void {
    this._activeState = false;
    super.disconnectBang();
    if (this._advisoryLockConn) {
      this._advisoryLockConn.release();
      this._advisoryLockConn = null;
    }
    if (this._conn) {
      this._statementPools.get(this._conn)?.detach();
      this._conn.release();
      this._conn = null;
    }
    this._inTransaction = false;
    this._statementPools = new WeakMap<mysql.PoolConnection, Mysql2StatementPool>();
    const pool = this._driverPool;
    this._driverPool = null;
    if (pool) {
      // Chain onto any in-flight teardown from a prior disconnect/reconnect so
      // repeated reconnects don't lose earlier pool.end() promises.
      const ending = pool.end().catch(() => {});
      this._endingPool = this._endingPool ? this._endingPool.then(() => ending) : ending;
    }
  }

  /**
   * Close the connection pool permanently. Unlike disconnectBang(), this is not
   * reconnectable — subsequent execute() calls will throw.
   */
  async close(): Promise<void> {
    this._permanentlyClosed = true;
    if (this._advisoryLockConn) {
      this._advisoryLockConn.release();
      this._advisoryLockConn = null;
    }
    if (this._conn) {
      this._statementPools.get(this._conn)?.detach();
      this._conn.release();
      this._conn = null;
    }
    // Drop adapter-held references; pools become unreachable once
    // mysql2 releases the underlying connections. Matches PG's
    // close() — we never detach on commit/rollback because prepared
    // statements are session-scoped, not transaction-scoped.
    this._statementPools = new WeakMap<mysql.PoolConnection, Mysql2StatementPool>();
    if (this._driverPool) {
      await this._driverPool.end();
      this._driverPool = null;
    }
    // Await any in-flight pool.end() from disconnectBang()/reconnectBang() so
    // callers (e.g. afterEach) can be sure all sockets are drained.
    if (this._endingPool) {
      await this._endingPool;
      this._endingPool = null;
    }
  }

  /**
   * Check if we're in a transaction.
   */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  override emptyInsertStatementValue(): string {
    return "VALUES ()";
  }

  /**
   * @internal — test-only: returns the flags value from the pool config, mirroring
   * Rails' `connection.raw_connection.query_options[:flags]` for flag-passing assertions.
   */
  _testOnlyPoolFlags(): string[] | undefined {
    return this._poolConfig.flags;
  }

  /**
   * Get the underlying mysql2 Pool instance.
   * Escape hatch for advanced usage.
   */
  get raw(): mysql.Pool {
    if (!this._driverPool) throw new Error("Mysql2Adapter: connection is closed");
    return this._driverPool;
  }

  override async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    const rows = (await this.schemaQuery(
      `SELECT fk.referenced_table_name AS to_table,
              fk.referenced_column_name AS primary_key,
              fk.column_name AS \`column\`,
              fk.constraint_name AS name,
              fk.ordinal_position AS position,
              rc.update_rule AS on_update,
              rc.delete_rule AS on_delete
       FROM information_schema.referential_constraints rc
       JOIN information_schema.key_column_usage fk
         USING (constraint_schema, constraint_name)
       WHERE fk.referenced_column_name IS NOT NULL
         AND fk.table_schema = DATABASE()
         AND fk.table_name = ${this.quote(tableName)}
         AND rc.constraint_schema = DATABASE()
         AND rc.table_name = ${this.quote(tableName)}
       ORDER BY fk.constraint_name, fk.ordinal_position`,
    )) as Array<Record<string, unknown>>;

    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const name = row.name as string;
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push(row);
    }
    const results: ForeignKeyDefinition[] = [];
    for (const group of grouped.values()) {
      group.sort((a, b) => (a.position as number) - (b.position as number));
      const first = group[0];
      const toTable = first.to_table as string;
      const fkName = first.name as string;
      const onDelete = this._mysqlFkAction(first.on_delete as string);
      const onUpdate = this._mysqlFkAction(first.on_update as string);
      const column =
        group.length === 1
          ? (first.column as string)
          : group.map((r) => r.column as string).join(",");
      const primaryKey =
        group.length === 1
          ? (first.primary_key as string)
          : group.map((r) => r.primary_key as string).join(",");
      results.push(
        new ForeignKeyDefinition(
          tableName,
          toTable,
          column,
          primaryKey,
          fkName,
          onDelete,
          onUpdate,
        ),
      );
    }
    return results;
  }

  /** @internal */
  private connect(): void {
    // Pool is the connection in the Node.js mysql2 model; the pool is
    // created eagerly in the constructor via newClient. Rails' connect
    // sets @raw_connection — we have no equivalent single-socket handle.
  }

  /** @internal */
  override configureConnection(): void {
    // In Rails this sets @raw_connection.query_options[:as] = :array and
    // database_timezone on the single raw connection. In our pool model
    // we have no single raw connection to configure here; mysql2's typeCast
    // handles temporal fields and results are returned as objects (not arrays).
    super.configureConnection();
  }

  /**
   * Fetch the raw version string from the server (e.g. "8.0.28").
   * Populates _databaseVersion and _mariadb as a side effect.
   * @internal
   */
  async getFullVersion(): Promise<string> {
    if (this._fullVersionString) return this._fullVersionString;
    const conn = await this.getConn();
    try {
      const [[row]] = (await conn.query("SELECT VERSION() AS v")) as [
        Array<{ v: string }>,
        unknown,
      ];
      const ver = row?.v ?? "0.0.0";
      this._fullVersionString = ver;
      this._mariadb = /mariadb/i.test(ver);
      this._databaseVersion = new Version(this.versionString(ver));
      return ver;
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Return the full raw version string, lazily fetching it if needed.
   * Mirrors Rails' full_version → database_version.full_version_string,
   * which always returns the real server version without a separate warm-up.
   * @internal
   */
  async fullVersion(): Promise<string> {
    if (!this._fullVersionString) await this.getFullVersion();
    return this._fullVersionString ?? "0.0.0";
  }

  /** @internal */
  override defaultPreparedStatements(): boolean {
    return false;
  }

  /** @internal */
  static newClient(config: mysql.PoolOptions & MysqlAdapterOptions, initSql: string): mysql.Pool {
    // With supportBigNumbers:true, mysql2 returns a decimal string for BIGINT
    // values with ≥15 digits (i.e. ≥ 10^14) where parseInt would lose precision,
    // and a JS number for smaller values. Both are handled by BigIntegerType.cast().
    // Note: the threshold is mysql2's internal digit count (≥15), not
    // Number.MAX_SAFE_INTEGER (2^53-1 ≈ 9×10^15, 16 digits). Callers may
    // override via explicit false in config.
    // Compose our Temporal typeCast with any user-supplied typeCast so callers
    // can still intercept non-temporal fields (e.g. custom ENUM handling) without
    // losing Temporal parsing on temporal columns.

    const {
      typeCast: userTypeCast,
      strict: _strict,
      waitTimeout: _wt,
      variables: _vars,
      ...poolOptions
    } = config;

    const composedTypeCast =
      typeof userTypeCast === "function"
        ? (field: unknown, next: () => unknown) =>
            temporalTypeCast(field as Parameters<typeof temporalTypeCast>[0], () =>
              (userTypeCast as (f: unknown, n: () => unknown) => unknown)(field, next),
            )
        : TEMPORAL_POOL_OPTIONS.typeCast;
    const pool = mysql.createPool({
      supportBigNumbers: true,
      ...poolOptions,
      typeCast: composedTypeCast,
    });

    // mysql.Pool (promise wrapper) re-emits 'connection' from the underlying pool
    // via inheritEvents — this is the public typed API on mysql.Pool, no internal
    // property access needed. The callback receives the raw PoolConnection (non-
    // promise) so we use the callback-style query directly.
    pool.on("connection", (conn) => {
      const rawConn = conn as unknown as {
        query: (sql: string, cb: (err: Error | null) => void) => void;
        destroy: () => void;
      };
      rawConn.query(initSql, (err) => {
        if (err) {
          rawConn.destroy();
          pool.emit("error", err);
        }
      });
    });
    return pool;
  }

  /**
   * Query `SHOW COUNT(*) WARNINGS` to learn how many warnings the most
   * recent statement on `conn` produced. SHOW statements do not reset the
   * warning list (unlike a normal SELECT), so the subsequent SHOW WARNINGS
   * still returns the rows.
   *
   * Exposed as a protected method so tests can stub it via `vi.spyOn` to
   * exercise the "warning_count does not match returned warnings" branch.
   * @internal
   */
  protected async _warningCount(conn: mysql.PoolConnection): Promise<number> {
    // Optimization: when the mysql2 npm driver exposes the protocol's
    // last `serverStatus` packet, the bottom 16 bits of the per-connection
    // `warningCount` are populated for the most recent statement (mirrors
    // Rails reading `@raw_connection.warning_count` directly instead of
    // round-tripping `SHOW COUNT(*) WARNINGS`). Fall back to the SHOW
    // query when the field is absent or non-numeric.
    const raw = (conn as unknown as { warningCount?: unknown; _warningCount?: unknown })
      .warningCount;
    if (typeof raw === "number") return raw;
    const [rows] = await conn.query("SHOW COUNT(*) WARNINGS");
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) return 0;
    const v = Object.values(row)[0];
    return typeof v === "number" ? v : Number(v) || 0;
  }

  /**
   * Read pending warnings for `conn`, filter via {@link isWarningIgnored},
   * and dispatch per the configured `dbWarningsAction`. Runs after every
   * successful query in {@link execute}/{@link executeMutation} while the
   * pool connection is still held — warnings are connection-scoped.
   *
   * Mirrors: AbstractMysqlAdapter#handle_warnings.
   * @internal
   */
  protected async _handleWarningsOn(
    conn: mysql.PoolConnection | undefined,
    sql: string,
  ): Promise<void> {
    if (!conn) return;
    const ctor = this.constructor as typeof Mysql2Adapter;
    const action = ctor.dbWarningsAction;
    if (!action || action === "ignore") return;
    const count = await this._warningCount(conn);
    if (count === 0) return;
    const [rawRows] = await conn.query("SHOW WARNINGS");
    let rows = rawRows as Array<{ Level?: string; Code?: number | string; Message?: string }>;
    if (rows.length === 0) {
      rows = [
        {
          Level: "Warning",
          Code: undefined,
          Message: `Query had warning_count=${count} but ‘SHOW WARNINGS’ did not return the warnings. Check MySQL logs or database configuration.`,
        },
      ];
    }
    for (const row of rows) {
      const level = row.Level ?? null;
      const code = row.Code == null ? null : String(row.Code);
      const message = row.Message ?? "";
      const warning = new SQLWarning(message, code, level, sql, this.pool);
      if (this.isWarningIgnored({ level: level ?? undefined, code: code ?? undefined, message }))
        continue;
      if (action === "raise") throw warning;
      if (action === "log") {
        const logger = this.logger as { warn?: (msg: string) => void } | null;
        const codeSuffix = code ? ` (${code})` : "";
        const line = `[ActiveRecord::SQLWarning] ${message}${codeSuffix}`;
        if (logger?.warn) logger.warn(line);
        else console.warn(line);
      }
      // TODO(report): wire Rails.error.report(warning, handled: true) when ErrorReporter
      // is exposed as a global singleton — same gap as PostgreSQLAdapter._flushWarnings.
      if (typeof action === "function") action(warning);
    }
  }

  // Mirrors AbstractMysqlAdapter#configure_connection.
  // Builds and returns the full SET statement (including the SET keyword and time_zone)
  // for wait_timeout, sql_mode (per strict flag), and arbitrary session variables.
  // Called before createPool so a validation throw doesn't leak a live pool.
  /** @internal */
  private _buildInitSql(): string {
    const { strict, waitTimeout, variables: configVars } = this._poolConfig;
    const vars: Record<string, string | number | boolean | null | ":default" | "default"> = {
      ...(configVars ?? {}),
    };

    // Validate variable names before interpolating into SQL — matches the pattern used
    // by PostgreSQLAdapter and SQLite3Adapter to catch misconfigured keys early.
    const SAFE_VAR_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    for (const k of Object.keys(vars)) {
      if (!SAFE_VAR_NAME.test(k)) {
        throw new Error(`Invalid MySQL session variable name: ${JSON.stringify(k)}`);
      }
    }

    const wt = typeof waitTimeout === "string" ? parseInt(waitTimeout, 10) : waitTimeout;
    vars["wait_timeout"] = Number.isInteger(wt) ? (wt as number) : 2147483;

    const DEFAULTS = new Set([":default", "default"]);

    let sqlMode: string | undefined;
    const varSqlMode = vars["sql_mode"];
    if (varSqlMode !== undefined && varSqlMode !== null) {
      // Mirrors Rails: `if sql_mode = variables.delete("sql_mode")` — nil is falsy in Ruby,
      // so null falls through to the strict-mode branch below.
      delete vars["sql_mode"];
      sqlMode = this.quote(String(varSqlMode));
    } else if (!DEFAULTS.has(strict as string)) {
      if (strict !== false) {
        sqlMode = "CONCAT(@@sql_mode, ',STRICT_ALL_TABLES')";
      } else {
        sqlMode = "REPLACE(@@sql_mode, 'STRICT_TRANS_TABLES', '')";
        sqlMode = `REPLACE(${sqlMode}, 'STRICT_ALL_TABLES', '')`;
        sqlMode = `REPLACE(${sqlMode}, 'TRADITIONAL', '')`;
      }
      sqlMode = `CONCAT(${sqlMode}, ',NO_AUTO_VALUE_ON_ZERO')`;
    } else {
      // strict: "default" — sync session to global, counteracting mysql2 Node.js
      // CLIENT_IGNORE_SPACE flag which otherwise adds IGNORE_SPACE to session sql_mode.
      sqlMode = "@@GLOBAL.sql_mode";
    }

    const sqlModeClause = sqlMode ? `@@SESSION.sql_mode = ${sqlMode}` : "";

    // mysql2 uses `charset`; Rails database.yml uses `encoding`. Support both, preferring charset.
    // `variables: { encoding:, collation: }` from database.yml is also accepted and removed from
    // the SET-variable list (before varClauses is computed) so it doesn't also get emitted as
    // `@@SESSION.encoding = …` alongside the SET NAMES prepend.
    const varEncoding = vars["encoding"];
    if (varEncoding !== undefined) delete vars["encoding"];
    const varCollation = vars["collation"];
    if (varCollation !== undefined) delete vars["collation"];

    const varClauses = Object.entries(vars)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => {
        if (DEFAULTS.has(String(v))) return `@@SESSION.${k} = DEFAULT`;
        if (typeof v === "number") return `@@SESSION.${k} = ${v}`;
        if (typeof v === "boolean") return `@@SESSION.${k} = '${v ? 1 : 0}'`;
        return `@@SESSION.${k} = ${this.quote(String(v))}`;
      });

    const sessionClauses = [sqlModeClause, ...varClauses].filter(Boolean).join(", ");

    // Mirrors Rails: `if @config[:encoding]` → `SET NAMES encoding [COLLATE collation], ...`
    // mysql2's `charset` pool option corresponds to Rails' database.yml `encoding:`.
    const SAFE_CHARSET_RE = /^[A-Za-z0-9_]+$/;
    const charset =
      (this._poolConfig.charset as string | undefined) ??
      (this._poolConfig as { encoding?: string }).encoding ??
      (typeof varEncoding === "string" ? varEncoding : undefined);
    const charsetCollation =
      (this._poolConfig as { collation?: string }).collation ??
      (typeof varCollation === "string" ? varCollation : undefined);
    if (charset && !SAFE_CHARSET_RE.test(charset)) {
      throw new Error(`Invalid MySQL charset: ${JSON.stringify(charset)}`);
    }
    if (charsetCollation && !SAFE_CHARSET_RE.test(charsetCollation)) {
      throw new Error(`Invalid MySQL collation: ${JSON.stringify(charsetCollation)}`);
    }
    let namesPart = "";
    if (charset) {
      namesPart = `NAMES ${charset}`;
      if (charsetCollation) namesPart += ` COLLATE ${charsetCollation}`;
      namesPart += ", ";
    }

    return `SET ${namesPart}time_zone = '+00:00', ${sessionClauses}`;
  }
}

/**
 * Detect a node-mysql2 driver-level timeout (no positive MySQL errno).
 * Mirrors Rails' `exception.is_a?(Mysql2::Error::TimeoutError) && !exception.error_number`
 * — the node driver surfaces these as `code === 'PROTOCOL_SEQUENCE_TIMEOUT'`
 * or `code === 'ETIMEDOUT'`. A non-positive `errno` (e.g. libuv's
 * negative `-ETIMEDOUT`) counts as "no MySQL errno", matching Rails'
 * `!error_number` predicate which is true for nil and unset values.
 *
 * @internal
 */
function isMysql2DriverTimeout(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const errno = (e as { errno?: number }).errno;
  if (typeof errno === "number" && errno > 0) return false;
  const code = (e as { code?: string }).code;
  return code === "PROTOCOL_SEQUENCE_TIMEOUT" || code === "ETIMEDOUT";
}

/**
 * Detect a node-mysql2 error that mirrors Ruby's
 * `Mysql2::Error::ConnectionError` family — driver-level connection-loss
 * conditions surfaced without a positive MySQL errno. These include
 * socket-level failures (`ECONNRESET` / `ECONNREFUSED` / `EPIPE` /
 * `ENOTFOUND` / `EHOSTUNREACH` / `ENETUNREACH`),
 * mysql2 protocol errors after the connection died
 * (`PROTOCOL_CONNECTION_LOST`, `PROTOCOL_ENQUEUE_AFTER_QUIT`,
 * `PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR`, `PROTOCOL_ENQUEUE_HANDSHAKE_TWICE`),
 * and the pool-closed sentinel (`POOL_CLOSED`).
 *
 * @internal
 */
function isMysql2ConnectionError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const errno = (e as { errno?: number }).errno;
  if (typeof errno === "number" && errno > 0) return false;
  const code = (e as { code?: string }).code;
  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "PROTOCOL_ENQUEUE_AFTER_QUIT" ||
    code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR" ||
    code === "PROTOCOL_ENQUEUE_HANDSHAKE_TWICE" ||
    code === "POOL_CLOSED" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    code === "EPIPE"
  );
}

/** @internal */
function reconnect(): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/mysql2_adapter.rb cluster=mysql-mysql2-adapter
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Mysql2Adapter#reconnect is not implemented",
  );
}

/** @internal */
function initializeTypeMap(m: any): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/mysql2_adapter.rb cluster=mysql-mysql2-adapter
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Mysql2Adapter#initialize_type_map is not implemented",
  );
}
