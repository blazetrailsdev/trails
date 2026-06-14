import mysql from "mysql2/promise";
import { Notifications } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import type { DatabaseAdapter } from "../adapter.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import type { MysqlAdapterOptions } from "./pool-config.js";
import {
  AbstractMysqlAdapter,
  StatementPool as MysqlStatementPool,
  type MysqlPreparedStatement,
} from "./abstract-mysql-adapter.js";
import {
  AbstractAdapter,
  Version,
  RAW_CONNECTION_DEPRECATION_MESSAGE,
} from "./abstract-adapter.js";
import { deprecator } from "../deprecator.js";
import { dirtiesQueryCache } from "./abstract/query-cache.js";
import {
  ActiveRecordError,
  AdapterTimeout,
  ConnectionFailed,
  ConnectionNotEstablished,
  DatabaseConnectionError,
  MismatchedForeignKey,
  NoDatabaseError,
  NotImplementedError,
  SQLWarning,
} from "../errors.js";
import { Result } from "../result.js";
import { ForeignKeyDefinition } from "./abstract/schema-definitions.js";
import { Column } from "./column.js";
import { ExplainPrettyPrinter } from "./mysql/explain-pretty-printer.js";
import { typeCastedBinds, transactionIsolationLevels } from "./abstract/database-statements.js";
import { getDefaultTimezone } from "../type/internal/timezone.js";
import { temporalTypeCast, TEMPORAL_POOL_OPTIONS } from "./mysql/temporal-type-cast.js";
import type { SchemaSource } from "../schema-dumper.js";
import { SchemaDumper as MysqlSchemaDumper } from "./mysql/schema-dumper.js";
import {
  columns as mysqlColumns,
  foreignKeys as mysqlForeignKeys,
  indexes as mysqlIndexes,
  statisticsHasExpressionColumn as mysqlStatisticsHasExpressionColumn,
  parseMysqlName as mysqlParseName,
  MysqlSchemaStatements,
} from "./mysql/schema-statements.js";

/**
 * Mysql2-flavored StatementPool. Evicted entries send COM_STMT_CLOSE
 * via `connection.unprepare(sql)` so the mysql2 driver's internal
 * cache (and the server's) stay in step with our `statement_limit`.
 *
 * Mirrors: Mysql2Adapter::StatementPool in activerecord. Errors are
 * intentionally swallowed — Rails' equivalent rescues Mysql2::Error.
 */
class Mysql2StatementPool extends MysqlStatementPool {
  private _conn: mysql.Connection | null;

  constructor(conn: mysql.Connection, maxSize: number) {
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
 * hash — `mysql2` connection-options keys for the driver, plus Rails'
 * adapter-level keys (`statementLimit`, `preparedStatements`) stripped
 * into the adapter before `mysql.createConnection` is called. Matches
 * Rails' database.yml shape where driver params and adapter knobs share
 * one hash.
 *
 * Holds one persistent `mysql.Connection` per adapter instance (the
 * same single-connection model as Rails' `@raw_connection`). Concurrent
 * callers within a pinned trails-context serialize through that single
 * connection — no inner pool layer.
 */
export class Mysql2Adapter extends AbstractMysqlAdapter implements DatabaseAdapter {
  // Cached liveness state — true until a failure is observed (ping fail,
  // disconnect, permanent close). Does not require _client to be non-null:
  // a freshly-constructed adapter has no connection yet but is considered
  // active (matching Rails, where @raw_connection is set before the adapter
  // is handed to callers). Set false by disconnectBang(); restored to true
  // by reconnectBang() and by successful activeAsync().
  private _activeState = true;

  override get active(): boolean {
    return !this._permanentlyClosed && !this._isFakeConnection && this._activeState;
  }

  /**
   * Async liveness probe — checks socket health via a real `ping` call on the
   * persistent connection, lazily establishing it if needed. Updates the cached
   * `_activeState` so the sync `active` getter reflects the result. Mirrors
   * Rails' `active?` which calls `mysql_ping` on the raw connection.
   */
  async activeAsync(): Promise<boolean> {
    if (this._permanentlyClosed || this._isFakeConnection) {
      this._activeState = false;
      return false;
    }
    try {
      const conn = await this._ensureClient();
      await conn.ping();
      this._activeState = true;
      return true;
    } catch {
      this._activeState = false;
      return false;
    }
  }

  // Mirrors Rails' Mysql2Adapter#connected? — false only after a known
  // disconnect/close or for fake adapters. A freshly-constructed adapter
  // with no _client yet is still "connected" in the sense that it will
  // connect on the next query (matching Rails, which always has @raw_connection
  // non-nil before the adapter reaches callers).
  override isConnected(): boolean {
    return !this._permanentlyClosed && !this._isFakeConnection && this._activeState;
  }

  // Single persistent connection — mirrors Rails' @raw_connection.
  private _client: mysql.Connection | null = null;
  // Serializes concurrent lazy-connect calls so only one createConnection
  // is in flight at a time. NOT nulled by disconnectBang() so close() can
  // still await it for clean teardown.
  private _connectingPromise: Promise<mysql.Connection> | null = null;
  // Generation of the current _connectingPromise. Incremented by
  // disconnectBang()/close(); _ensureClient() starts a fresh attempt when the
  // stored generation no longer matches, without dropping the old promise
  // reference so close() can await it.
  private _connectGeneration = 0;
  private _connectingPromiseGen = -1;
  // Tracks the in-flight _client.end() from disconnectBang() so close() can
  // await full socket teardown even though _client was already nulled.
  private _endingClient: Promise<void> | null = null;
  // Set by close() to distinguish permanent teardown from disconnectBang(),
  // which is reconnectable. _ensureClient() refuses to lazy-reconnect after close().
  private _permanentlyClosed = false;
  // Set by the _fakeConnection constructor path — prevents _ensureClient() from
  // lazily creating a real connection when _client is null.
  private _isFakeConnection = false;
  // Normalized config stored for reconnect.
  private _poolConfig: mysql.PoolOptions & MysqlAdapterOptions;
  private _inTransaction = false;
  // Per-adapter StatementPool. Single connection → single pool.
  // Cleared on disconnect/reconnect; re-created on first query after reconnect.
  private _stmtPool: Mysql2StatementPool | null = null;

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
    this._stmtPool?.setMaxSize(value);
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
      if (AbstractMysqlAdapter.isClientNotConnected(e)) {
        return new ConnectionNotEstablished(msg, { cause: e });
      }
      return new ConnectionFailed(msg, { sql, binds, cause: e });
    }
    return super._translateException(e, sql, binds);
  }

  /**
   * Look up (or lazily create) the statement pool for the persistent
   * connection.
   */
  private _getStmtPool(conn: mysql.Connection): Mysql2StatementPool {
    if (!this._stmtPool) {
      this._stmtPool = new Mysql2StatementPool(conn, this._statementLimit);
    }
    return this._stmtPool;
  }

  /**
   * Gate named-prepared-statement routing through our pool. Mirrors
   * Rails' `prepared_statements && !binds.empty?` plus the extra
   * `statement_limit > 0` check that disables caching (and therefore
   * the whole prepared-statement path) when the operator sets
   * `statement_limit = 0`.
   */
  private _shouldPrepare(binds: unknown[]): boolean {
    if (!this.preparedStatements || binds.length === 0) return false;
    const poolLimit = this._stmtPool?.maxSize ?? this._statementLimit;
    return poolLimit > 0;
  }

  /**
   * Track a SQL string in the statement pool BEFORE handing it to
   * `conn.execute()`. If the insert evicts an older entry, our pool's
   * `dealloc` sends COM_STMT_CLOSE via `unprepare` so the mysql2
   * driver's internal cache and the server both release the prepared
   * statement. No-op when caching is disabled.
   */
  private _trackPrepared(conn: mysql.Connection, sql: string): void {
    const pool = this._getStmtPool(conn);
    if (pool.maxSize === 0) return;
    // Use `get` (not `has`) so an already-cached entry is moved to
    // the MRU end of the LRU. Otherwise a hot statement executed
    // repeatedly would keep its original insertion position and get
    // evicted the moment any other distinct query came along.
    if (pool.get(sql)) return;
    pool.set(sql, { sql, key: pool.nextKey() });
  }

  /**
   * Test-only accessor for the statement pool on the persistent
   * connection. Matches the PG adapter's equivalent hook.
   * @internal
   */
  _statementPoolForTest(): Mysql2StatementPool | undefined {
    return this._stmtPool ?? undefined;
  }

  /**
   * Clear cached prepared statements on the persistent connection.
   * Mirrors Rails' `Mysql2Adapter#clear_cache!` which calls `close` on
   * each cached statement on the adapter's sole connection.
   */
  override clearCacheBang(): void {
    super.clearCacheBang();
    this._stmtPool?.clear();
  }
  // Cached capability flag — information_schema.statistics.expression
  // is MySQL 8.0.13+. Pre-8 MySQL and MariaDB (through at least 10.x)
  // don't expose it, so we detect once and remember. `undefined` =
  // not yet probed, `true`/`false` = result.
  /** @internal Host field for {@link mysqlStatisticsHasExpressionColumn}'s memo. */
  _statisticsHasExpression: boolean | undefined;
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
      // if the DB doesn't exist — _ensureClient() already translates it to NoDatabaseError.
      await adapter._ensureClient();
      return true;
    } catch (e) {
      if (e instanceof NoDatabaseError) return false;
      throw e;
    } finally {
      await adapter.close();
    }
  }

  constructor(config: string | (mysql.PoolOptions & MysqlAdapterOptions));
  /**
   * @deprecated Raw-connection overload (abstract_adapter.rb:141): pass a
   * pre-opened `mysql.Connection`. Emits a deprecation warning; the connection
   * is stashed for promotion. Prefer the config-hash / URI-string form.
   */
  constructor(rawConnection: mysql.Connection, deprecatedConfig?: Record<string, unknown> | null);
  constructor(
    config: string | (mysql.PoolOptions & MysqlAdapterOptions) | mysql.Connection,
    deprecatedConfig?: Record<string, unknown> | null,
  ) {
    super();
    // Deprecated raw-connection overload (abstract_adapter.rb:141): a
    // pre-opened mysql2 connection passed positionally is stashed in
    // `_unconfiguredConnection`, mirroring Rails' `initialize`, which likewise
    // only stashes (`@unconfigured_connection`) — usability comes later via
    // `verify!`. Mysql2Adapter inherits the base `verifyBang`
    // (abstract-adapter.ts), which promotes the stash into `_connection`, but
    // MySQL2 runs queries through a separate `_ensureClient()` pool — the
    // promoted connection isn't wired into that path. We hold the adapter inert
    // (fake-connection guard) so it does NOT open a fresh pool from the empty
    // `_poolConfig`; wiring the stashed connection into `_ensureClient` so the
    // overload can serve queries is a tracked follow-up (a larger restructure).
    // For now the overload constructs + warns + stashes but is not yet usable
    // for queries on MySQL2.
    if (Mysql2Adapter._isDeprecatedRawConnectionArg(config)) {
      deprecator().warn(RAW_CONNECTION_DEPRECATION_MESSAGE);
      this._acceptDeprecatedRawConnection(config, deprecatedConfig);
      this._poolConfig = { flags: ["FOUND_ROWS"] };
      this._isFakeConnection = true;
      this._activeState = false;
      return;
    }
    // Mirrors abstract_adapter.rb:135 — a config hash must be the only argument.
    // A `nil`/`null` trailing arg is treated as absent (Rails' falsy guard),
    // so only a non-null extra argument triggers the raise.
    if (deprecatedConfig != null) {
      throw new ArgumentError(
        "when initializing an Active Record adapter with a config hash, that should be the only argument",
      );
    }
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
      return;
    }
    // See PostgreSQLAdapter#constructor: Rails' database.yml merges
    // driver + adapter config, and AbstractAdapter#initialize reads
    // `:statement_limit` / `:prepared_statements` off that single
    // hash. Validate & apply the adapter-level keys FIRST so an
    // invalid value fails before creating a connection — otherwise
    // a throw would leave a live connection with no cleanup path.
    const {
      statementLimit,
      preparedStatements,
      advisoryLocks,
      strict,
      waitTimeout,
      variables,
      _fakeConnection: fake,
      ...mysqlConfig
    } = config as mysql.PoolOptions & MysqlAdapterOptions;
    if (statementLimit !== undefined) this.statementLimit = statementLimit;
    if (preparedStatements !== undefined) this.preparedStatements = preparedStatements;
    if (advisoryLocks !== undefined) {
      this._advisoryLocksEnabled = Mysql2Adapter.typeCastConfigToBoolean(advisoryLocks) !== false;
    }
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
    // Validate charset/collation at construction time so a misconfigured value
    // raises immediately rather than on the first query. Rails defers this to
    // connection-open time (no constructor validation in AbstractMysqlAdapter);
    // we validate early as a fail-fast safety measure. _buildInitSql() re-applies
    // the same regex before each new connection as the authoritative guard.
    const _charset =
      (mysqlConfig.charset as string | undefined) ??
      (mysqlConfig as { encoding?: string }).encoding;
    const _collation = (mysqlConfig as { collation?: string }).collation;
    const SAFE_CHARSET_RE = /^[A-Za-z0-9_]+$/;
    if (_charset && !SAFE_CHARSET_RE.test(_charset)) {
      throw new Error(`Invalid MySQL charset: ${JSON.stringify(_charset)}`);
    }
    if (_collation && !SAFE_CHARSET_RE.test(_collation)) {
      throw new Error(`Invalid MySQL collation: ${JSON.stringify(_collation)}`);
    }
    // _fakeConnection: true skips connection creation — used in unit tests that need
    // a Mysql2Adapter instance without a live DB (mirrors Rails' fake_connection
    // constructor path: `new Mysql2Adapter(fake_conn, logger, nil, config)`).
    if (fake) {
      this._isFakeConnection = true;
      this._activeState = false;
    }
    // Connection is created lazily on first _ensureClient() call.
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
    sql = this.preprocessQuery(sql);
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds ?? []);
    const txPublicQuery = this.currentTransaction().userTransaction;
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name: name ?? "SQL",
      binds: driverBinds,
      type_casted_binds: typeCastedBinds(driverBinds),
      connection: this,
      row_count: 0,
      transaction: txPublicQuery.isOpen() ? txPublicQuery : null,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        return await this.withRawConnection(async (conn) => {
          const mysqlConn = conn as unknown as mysql.Connection;
          const prepare = options?.prepare ?? this._shouldPrepare(binds ?? []);
          if (prepare) this._trackPrepared(mysqlConn, driverSql);
          const [rawResult, rawFields] = prepare
            ? await mysqlConn.execute(driverSql, driverBinds as any[])
            : await mysqlConn.query(driverSql, driverBinds);
          // CALL sets _resultIndex > 0 in mysql2, wrapping rows AND fields in
          // parallel nested arrays. Mirror Rails' abandon_results! + cast_result:
          // take the first result set and use rawFields[0] (field-descriptor array,
          // or undefined for DML) — the same as Rails' fields.empty? check at
          // database_statements.rb:116. For a plain non-CALL query rawFields is a
          // flat FieldPacket[], so rawFields[0] is a FieldPacket object (not an
          // array) and neither branch fires.
          let result: mysql.RowDataPacket[] | mysql.ResultSetHeader = rawResult as
            | mysql.RowDataPacket[]
            | mysql.ResultSetHeader;
          // Field descriptors for the result set whose rows we return. Mirrors
          // the `result.fields` Rails' `cast_result` reads: present whenever a
          // SELECT projected columns, even when it matched zero rows.
          let fields = rawFields as mysql.FieldPacket[] | undefined;
          if (Array.isArray(rawFields) && Array.isArray(rawFields[0])) {
            // Multi-result CALL w/ SELECT: rawFields[0] is a FieldPacket[].
            result = (rawResult as unknown[])[0] as mysql.RowDataPacket[];
            fields = rawFields[0] as mysql.FieldPacket[];
          } else if (
            Array.isArray(rawFields) &&
            rawFields[0] === undefined &&
            Array.isArray(rawResult)
          ) {
            // Multi-result CALL w/ DML-only: rawFields[0] is undefined.
            // Unwrap so !Array.isArray(result) below returns empty Result.
            result = (rawResult as unknown[])[0] as mysql.ResultSetHeader;
          }
          // DML results in a ResultSetHeader (no rows array); SELECT results
          // in an array of row objects. Return empty Result for DML to avoid
          // throwing on INSERT/UPDATE/DELETE passed to execQuery.
          if (!Array.isArray(result)) {
            payload.row_count = (result as mysql.ResultSetHeader).affectedRows ?? 0;
            await this._handleWarningsOn(mysqlConn, driverSql);
            return new Result([], []);
          }
          payload.row_count = result.length;
          await this._handleWarningsOn(mysqlConn, driverSql);
          // A zero-row SELECT yields no row hashes for `fromRowHashes` to read
          // columns from, dropping the column set. Mirror Rails' `cast_result`:
          // take the columns from the field descriptors so the Result still
          // reports its columns when the query matched no rows.
          if (result.length === 0) {
            const names = (fields ?? []).map((f) => f.name);
            return names.length === 0 ? Result.empty() : new Result(names, []);
          }
          return Result.fromRowHashes(result as Record<string, unknown>[]);
        });
      } catch (e: any) {
        const translated =
          e instanceof MismatchedForeignKey
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, driverBinds)
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, driverBinds);
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      }
    });
  }

  /** Returns true for raw mysql2 errors that indicate the database doesn't exist (ER_BAD_DB_ERROR). */
  isNoDatabaseError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const e = error as { code?: unknown; errno?: unknown };
    return e.code === "ER_BAD_DB_ERROR" || e.errno === 1049;
  }

  /**
   * Ensure the persistent connection is established. Creates it lazily on
   * first call, serializing concurrent callers through a single Promise.
   * Mirrors Rails' `with_raw_connection` which reconnects after
   * `disconnect!`.
   */
  private async _ensureClient(): Promise<mysql.Connection> {
    if (this._client) return this._client;
    // Return the in-flight promise only if it belongs to the current generation.
    // After disconnectBang() the generation advances, so stale in-flight
    // promises are bypassed and a fresh attempt is started — without nulling
    // the old promise so close() can still await it for clean teardown.
    if (this._connectingPromise && this._connectingPromiseGen === this._connectGeneration) {
      return this._connectingPromise;
    }
    if (this._permanentlyClosed) throw new Error("Mysql2Adapter: connection is closed");
    if (this._isFakeConnection) throw new Error("Mysql2Adapter: fake connection has no client");
    const gen = this._connectGeneration;
    this._connectingPromiseGen = gen;
    this._connectingPromise = Mysql2Adapter.newClient({
      ...this._poolConfig,
      initSql: this._buildInitSql(),
    }).then(
      (conn): mysql.Connection | Promise<mysql.Connection> => {
        if (this._connectGeneration !== gen) {
          // disconnectBang()/close() happened while we were connecting. Clear
          // the promise ref then end the socket as part of this chain so
          // close() awaiting _connectingPromise can drain the socket cleanly
          // (rather than a fire-and-forget that close() can't wait on).
          if (this._connectingPromiseGen === gen) this._connectingPromise = null;
          const discardErr = new ConnectionNotEstablished(
            "Mysql2Adapter: connection was closed during connect",
          );
          return conn.end().then(
            () => {
              throw discardErr;
            },
            () => {
              throw discardErr;
            },
          );
        }
        if (this._connectingPromiseGen === gen) this._connectingPromise = null;
        this._client = conn;
        this._stmtPool = null;
        this._activeState = true;
        return conn;
      },
      (err) => {
        if (this._connectingPromiseGen === gen) this._connectingPromise = null;
        this._activeState = false;
        throw translateConnectError(err, this._database, this._poolConfig);
      },
    );
    return this._connectingPromise;
  }

  /**
   * Get the active connection — always the single persistent connection.
   */
  private async getConn(): Promise<mysql.Connection> {
    return this._ensureClient();
  }

  /**
   * Overrides the abstract acquisition seam so withRawConnection's retry loop
   * acquires a mysql.Connection. Called on every loop iteration so a
   * reconnectBang() + continue picks up the fresh _client automatically.
   * @internal
   */
  protected override async rawConnectionForBlock(): Promise<AbstractAdapter | null> {
    // getConn() is called inside withRawConnection's try/finally, so a
    // connection-acquisition failure still triggers dirtyCurrentTransaction()
    // in the finally. Rails gates the ensure-dirty inside the begin…yield…ensure
    // that wraps the already-resolved @raw_connection (abstract_adapter.rb:1044),
    // not the pre-loop connect! — so this is a minor fidelity gap. It matches the
    // PG adapter's posture and is intentional: over-dirtying on acquisition
    // failure is conservative (may produce an extra savepoint) but cannot produce
    // the reverse wrong behavior (skipping a needed savepoint).
    return (await this.getConn()) as unknown as AbstractAdapter;
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
   */
  private async _translateAndEnrich(e: unknown, sql: string, binds: unknown[]): Promise<Error> {
    let translated = this._translateException(e, sql, binds);
    if (translated instanceof MismatchedForeignKey) {
      translated = await this._enrichMismatchedForeignKey(translated);
    }
    return translated;
  }

  /**
   * Prepare binds for the mysql2 driver. First unwraps any
   * `ActiveModel::Attribute` (e.g. `Relation::QueryAttribute`) to its
   * `valueForDatabase` — mirrors Rails' `type_casted_binds`, which sends
   * `value_for_database` to the driver rather than the Attribute wrapper, and
   * matches the SQLite/PG paths. Then converts booleans to integers for MySQL
   * compatibility. Plain pre-cast values (the common case) pass straight
   * through.
   */
  private mysqlBinds(binds: unknown[]): unknown[] {
    return binds.map((v) => {
      // `valueForDatabase` is a getter on Attribute/QueryAttribute, so reading
      // it yields the unwrapped DB value directly.
      if (v && typeof v === "object" && "valueForDatabase" in v) {
        v = (v as { valueForDatabase: unknown }).valueForDatabase;
      }
      return v === true ? 1 : v === false ? 0 : v;
    });
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
    sql = this.preprocessQuery(sql);
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds);
    // payload records the exact values sent to mysql2 so LogSubscriber /
    // ExplainSubscriber / QueryCache all observe what actually ran.
    const txPublicExec = this.currentTransaction().userTransaction;
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name,
      binds: driverBinds,
      type_casted_binds: typeCastedBinds(driverBinds),
      connection: this,
      row_count: 0,
      transaction: txPublicExec.isOpen() ? txPublicExec : null,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        return await this.withRawConnection(async (conn) => {
          const mysqlConn = conn as unknown as mysql.Connection;
          // Use server-side prepared statements when enabled and binds
          // are present — matches PR #589's preparedStatements toggle.
          // Track the SQL in our statement pool first so LRU eviction
          // sends COM_STMT_CLOSE (via unprepare) when we exceed
          // `statement_limit`.
          const prepare = this._shouldPrepare(binds);
          if (prepare) this._trackPrepared(mysqlConn, driverSql);
          const [rows, rowFields] = prepare
            ? await mysqlConn.execute(driverSql, driverBinds as any[])
            : await mysqlConn.query(driverSql, driverBinds);
          // Unwrap nested result sets from CALL (see execQuery for the full
          // comment). Use rowFields[0] as the fields.empty? discriminator.
          let r: Record<string, unknown>[];
          if (Array.isArray(rowFields) && Array.isArray(rowFields[0])) {
            r = (rows as unknown[])[0] as Record<string, unknown>[];
          } else if (
            Array.isArray(rowFields) &&
            rowFields[0] === undefined &&
            Array.isArray(rows)
          ) {
            r = [];
          } else {
            r = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
          }
          payload.row_count = r.length;
          await this._handleWarningsOn(mysqlConn, driverSql);
          return r;
        });
      } catch (e: any) {
        const translated =
          e instanceof MismatchedForeignKey
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, driverBinds)
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, driverBinds);
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      }
    });
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   * Wrapped in a `sql.active_record` notification — see `execute`.
   */
  async executeMutation(sql: string, binds: unknown[] = [], name: string = "SQL"): Promise<number> {
    sql = this.preprocessQuery(sql);
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds);
    const txPublicMut = this.currentTransaction().userTransaction;
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name,
      binds: driverBinds,
      type_casted_binds: typeCastedBinds(driverBinds),
      connection: this,
      row_count: 0,
      transaction: txPublicMut.isOpen() ? txPublicMut : null,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        return await this.withRawConnection(async (conn) => {
          const mysqlConn = conn as unknown as mysql.Connection;
          const prepare = this._shouldPrepare(binds);
          if (prepare) this._trackPrepared(mysqlConn, driverSql);
          const [result] = prepare
            ? await mysqlConn.execute(driverSql, driverBinds as any[])
            : await mysqlConn.query(driverSql, driverBinds);
          const info = result as mysql.ResultSetHeader;
          payload.row_count = info.affectedRows ?? 0;
          await this._handleWarningsOn(mysqlConn, driverSql);

          // For INSERT, return the last inserted ID (or affected rows for multi-row)
          if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
            if (info.affectedRows > 1) {
              return info.affectedRows;
            }
            return info.insertId;
          }

          // For UPDATE/DELETE, return affected rows
          return info.affectedRows;
        });
      } catch (e: any) {
        const translated =
          e instanceof MismatchedForeignKey
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, driverBinds)
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, driverBinds);
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      }
    });
  }

  /**
   * Begin a transaction. Acquires the persistent connection and issues BEGIN.
   */
  async beginTransaction(): Promise<void> {
    // Force materialization (_lazy: false) so _inTransaction is set immediately.
    await this._transactionManager.beginTransaction({ _lazy: false });
  }

  async beginDbTransaction(): Promise<void> {
    await this._ensureClient();
    await this.internalExecute("BEGIN", "TRANSACTION", { materializeTransactions: false });
    this._inTransaction = true;
  }

  override isSavepointErrorsInvalidateTransactions(): boolean {
    return true;
  }

  /**
   * Mirrors Rails' `AbstractMysqlAdapter#begin_isolated_db_transaction`:
   * issues `SET TRANSACTION ISOLATION LEVEL {level}` then `BEGIN`. `SET
   * TRANSACTION` applies only to the next transaction, so on a `ConnectionFailed`
   * the whole batch must be replayed — hence the loop re-runs both statements
   * after reconnecting (mirrors Rails' `execute_batch(allow_retry: true)`, which
   * routes through `with_raw_connection` and retries the batch once).
   *
   * The reconnect goes through the full `reconnectBang({ restoreTransactions:
   * true })` lifecycle — re-enabling lazy transactions, clearing the statement
   * cache, reconfiguring the session, and restoring the transaction stack —
   * exactly as Rails' `with_raw_connection` calls `reconnect!(restore_transactions:
   * true)` (abstract_adapter.rb:1027). Restoring is safe mid-materialize: this
   * frame isn't marked materialized until `super.materializeBang()` runs *after*
   * this method returns, so `restoreBang()`'s `isMaterialized()` guard makes the
   * restore a no-op here (mirroring Rails' `Transaction#restore!` `materialized?`
   * guard) and the replay below is the single re-issue of the batch.
   */
  override async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    const level = transactionIsolationLevels()[isolation];
    if (!level) throw new Error(`Unknown transaction isolation level: ${isolation}`);
    await this.withRawConnection({ allowRetry: true, materializeTransactions: false }, async () => {
      await this.internalExecute(`SET TRANSACTION ISOLATION LEVEL ${level}`, "TRANSACTION", {
        materializeTransactions: false,
      });
      await this.internalExecute("BEGIN", "TRANSACTION", { materializeTransactions: false });
      this._inTransaction = true;
    });
  }

  async beginDeferredTransaction(): Promise<void> {
    return this.beginDbTransaction();
  }

  /**
   * Commit the current transaction.
   */
  async commit(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.commitTransaction();
    }
    if (!this._inTransaction || !this._client) throw new Error("No active transaction");
    try {
      await this.internalExecute("COMMIT", "TRANSACTION");
    } finally {
      this._inTransaction = false;
    }
  }

  async commitDbTransaction(): Promise<void> {
    return this.commit();
  }

  /**
   * Rollback the current transaction.
   */
  async rollback(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.rollbackTransaction();
    }
    return this.rollbackDbTransaction();
  }

  async rollbackDbTransaction(): Promise<void> {
    if (!this._inTransaction || !this._client) throw new Error("No active transaction");
    try {
      await this.internalExecute("ROLLBACK", "TRANSACTION");
    } finally {
      this._inTransaction = false;
    }
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#internal_execute
  // Overrides the abstract mixin default so TRANSACTION SQL (materializeTransactions=false)
  // skips materializeTransactions() — calling it would trigger re-entrant SAVEPOINT emission.
  override async internalExecute(
    sql: string,
    name: string = "SQL",
    { materializeTransactions = true }: { materializeTransactions?: boolean } = {},
  ): Promise<unknown> {
    sql = this.preprocessQuery(sql);
    if (materializeTransactions) {
      this._syncDatabaseTimezone();
      await this.materializeTransactions();
    }
    const driverSql = this.mysqlQuote(sql);
    const txPublicInt = this.currentTransaction().userTransaction;
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name,
      binds: [],
      type_casted_binds: [],
      connection: this,
      row_count: 0,
      transaction: txPublicInt.isOpen() ? txPublicInt : null,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        const conn = await this.getConn();
        await conn.query(driverSql);
        return 0;
      } catch (e: any) {
        const translated = await this._translateAndEnrich(e, driverSql, []);
        payload.exception = translated;
        payload.exception_object = translated;
        this.invalidateTransaction(translated);
        throw translated;
      }
    });
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    await this.internalExecute(`SAVEPOINT \`${name}\``, "TRANSACTION", {
      materializeTransactions: false,
    });
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    await this.internalExecute(`RELEASE SAVEPOINT \`${name}\``, "TRANSACTION", {
      materializeTransactions: false,
    });
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    await this.internalExecute(`ROLLBACK TO SAVEPOINT \`${name}\``, "TRANSACTION", {
      materializeTransactions: false,
    });
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
  }

  // `quote()` and `typeCast()` are inherited from AbstractMysqlAdapter,
  // which delegates to `mysql/quoting.ts`. No Mysql2-specific override
  // needed — they'd be duplicates.
  //
  // `buildExplainClause` / `_validateExplainOptions` / `_explainStatementClause`
  // and the EXPLAIN_FLAGS / EXPLAIN_FORMATS allowlists live on
  // AbstractMysqlAdapter.

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    this._syncDatabaseTimezone();
    const conn = await this.getConn();
    await conn.query(this.mysqlQuote(sql));
  }

  createSchemaDumper(
    source: SchemaSource,
    options: Record<string, unknown> = {},
  ): MysqlSchemaDumper {
    const dumper = new MysqlSchemaDumper(source, options);
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

  /** Delegates to {@link mysqlColumns} in `mysql/schema-statements.ts`. */
  async columns(tableName: string): Promise<Column[]> {
    return mysqlColumns.call(this, tableName);
  }

  /** Delegates to {@link mysqlIndexes} in `mysql/schema-statements.ts`. */
  async indexes(tableName: string): Promise<
    Array<{
      name: string;
      columns: string[];
      unique: boolean;
      using?: string;
      type?: string;
      comment?: string;
    }>
  > {
    return mysqlIndexes.call(this, tableName);
  }

  /** @internal Delegates to {@link mysqlStatisticsHasExpressionColumn} in `mysql/schema-statements.ts`. */
  async statisticsHasExpressionColumn(): Promise<boolean> {
    return mysqlStatisticsHasExpressionColumn.call(this);
  }

  /** Delegates to {@link mysqlParseName} in `mysql/schema-statements.ts`. */
  parseMysqlName(name: string): { schema?: string; table: string } {
    return mysqlParseName(name);
  }

  supportsAdvisoryLocks(): boolean {
    return true;
  }

  // Advisory locks are connection-scoped. With a single persistent connection
  // the lock session is always this._client — no separate connection needed.
  // Mirrors Rails' AbstractAdapter#get_advisory_lock / #release_advisory_lock:
  // no client-side lock tracking, just issue the SQL and return the result.

  async getAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const conn = await this._ensureClient();
    const [rows] = await conn.query("SELECT GET_LOCK(?, 0) AS locked", [String(lockId)]);
    return (rows as Record<string, unknown>[])[0]?.locked === 1;
  }

  async releaseAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    if (!this._client) return false;
    const [rows] = await this._client.query("SELECT RELEASE_LOCK(?) AS unlocked", [String(lockId)]);
    return (rows as Record<string, unknown>[])[0]?.unlocked === 1;
  }

  /**
   * Disconnect and mark reconnectable. Mirrors Rails'
   * `Mysql2Adapter#reconnect!` (disconnect! + connect). Connection is
   * re-established lazily on the next query.
   */
  /**
   * No-op: connection is established lazily in `_ensureClient` on the first
   * query. Exists for lifecycle API parity with Rails' `connect` method.
   * @internal
   */
  connect(): void {
    // intentionally empty — single connection is established lazily
  }

  /**
   * Raw reconnect: close the live connection and re-establish it. Mirrors
   * Rails' private `Mysql2Adapter#reconnect` (mysql2_adapter.rb:150 —
   * `@raw_connection&.close; @raw_connection = nil; connect`). Driven by the
   * inherited `AbstractAdapter#reconnectBang`, which wraps this in the
   * `connectionRetries` / `retryDeadline` retry loop and runs the
   * re-enable-lazy-transactions / reconfigure lifecycle.
   *
   * @internal
   */
  override reconnect(): void {
    if (this._permanentlyClosed) throw new Error("Mysql2Adapter: client is permanently closed");
    this.disconnectBang();
    this._activeState = true;
    // Kick off connection eagerly so verify/ping paths find a live connection
    // promptly. Mirrors Rails' reconnect! which calls connect (not lazy) after
    // disconnect!. Errors are surfaced on the next awaited call via _ensureClient.
    this._ensureClient().catch(() => {});
  }

  /**
   * Close the persistent connection and null it out. `active` returns false
   * immediately. The connection can be re-established on the next query.
   * Mirrors Rails' `Mysql2Adapter#disconnect!`.
   */
  override disconnectBang(): void {
    this._activeState = false;
    // Advance generation — _ensureClient() will bypass the stale
    // _connectingPromise (gen mismatch) and start a fresh attempt, while
    // close() can still await the old promise for clean teardown.
    this._connectGeneration++;
    super.disconnectBang();
    this._inTransaction = false;
    this._stmtPool?.detach();
    this._stmtPool = null;
    if (this._client) {
      // Chain onto any in-flight teardown so repeated disconnect/reconnect
      // cycles don't lose earlier end() promises.
      const ending = this._client.end().catch(() => {});
      this._endingClient = this._endingClient ? this._endingClient.then(() => ending) : ending;
      this._client = null;
    }
  }

  /**
   * Close the persistent connection permanently. Unlike disconnectBang(),
   * this is not reconnectable — subsequent execute() calls will throw.
   */
  async close(): Promise<void> {
    this._permanentlyClosed = true;
    this._connectGeneration++;
    this._inTransaction = false;
    this._stmtPool?.detach();
    this._stmtPool = null;
    if (this._client) {
      await this._client.end();
      this._client = null;
    }
    // Await any in-flight end() from disconnectBang()/reconnectBang() so
    // callers (e.g. afterEach) can be sure all sockets are drained.
    if (this._endingClient) {
      await this._endingClient;
      this._endingClient = null;
    }
    // If a connection is still being established, wait for it then close.
    if (this._connectingPromise) {
      try {
        const conn = await this._connectingPromise;
        await conn.end();
      } catch {
        // ignore — connection may have failed or was discarded by gen-mismatch
      }
      this._connectingPromise = null;
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
   * @internal — test-only: returns the flags value from the config, mirroring
   * Rails' `connection.raw_connection.query_options[:flags]` for flag-passing assertions.
   */
  _testOnlyPoolFlags(): string[] | undefined {
    return this._poolConfig.flags;
  }

  /**
   * Get the underlying mysql2 Connection instance.
   * Escape hatch for advanced usage.
   */
  get raw(): mysql.Connection {
    if (!this._client) {
      throw new Error(
        this._permanentlyClosed
          ? "Mysql2Adapter: connection is permanently closed"
          : "Mysql2Adapter: connection not yet established — call execute() or await activeAsync() first",
      );
    }
    return this._client;
  }

  /** Delegates to {@link mysqlForeignKeys} in `mysql/schema-statements.ts`. */
  override async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    // `_mysqlFkAction` is protected on AbstractMysqlAdapter, so bind a public
    // host surface rather than handing `this` straight to the standalone helper.
    return mysqlForeignKeys.call(
      {
        schemaQuery: this.schemaQuery.bind(this),
        quote: this.quote.bind(this),
        _mysqlFkAction: this._mysqlFkAction.bind(this),
      },
      tableName,
    );
  }

  /** @internal */
  override configureConnection(): void {
    // In Rails this sets @raw_connection.query_options[:as] = :array and
    // database_timezone on the single raw connection. We have a single
    // persistent connection here too; mysql2's typeCast handles temporal
    // fields and results are returned as objects (not arrays).
    // The database_timezone equivalent ({@link databaseTimezone}) is seeded
    // from the global default here and re-synced per-query in perform_query,
    // mirroring Rails' `query_options[:database_timezone] = default_timezone`.
    this._syncDatabaseTimezone();
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
    const [[row]] = (await conn.query("SELECT VERSION() AS v")) as [Array<{ v: string }>, unknown];
    const ver = row?.v ?? "0.0.0";
    this._fullVersionString = ver;
    this._mariadb = /mariadb/i.test(ver);
    this._databaseVersion = new Version(this.versionString(ver));
    return ver;
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

  /**
   * Create a new persistent mysql2 `Connection` and run the session
   * init SQL on it. Strips pool-only options (`connectionLimit`,
   * `queueLimit`, `waitForConnections`) that have no meaning on a
   * single-connection handle.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2Adapter.new_client
   */
  static async newClient(
    config: mysql.PoolOptions & MysqlAdapterOptions,
  ): Promise<mysql.Connection> {
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
      // Session init SQL is carried on the config (see MysqlAdapterOptions#initSql)
      // and run below — strip it so it isn't passed to the mysql2 driver.
      initSql,
      // Strip pool-only options — irrelevant for a single connection.
      connectionLimit: _connLimit,
      queueLimit: _queueLimit,
      waitForConnections: _waitFor,
      ...connOptions
    } = config as mysql.PoolOptions &
      MysqlAdapterOptions & {
        connectionLimit?: number;
        queueLimit?: number;
        waitForConnections?: boolean;
      };

    const composedTypeCast =
      typeof userTypeCast === "function"
        ? (field: unknown, next: () => unknown) =>
            temporalTypeCast(field as Parameters<typeof temporalTypeCast>[0], () =>
              (userTypeCast as (f: unknown, n: () => unknown) => unknown)(field, next),
            )
        : TEMPORAL_POOL_OPTIONS.typeCast;

    const conn = await mysql.createConnection({
      supportBigNumbers: true,
      ...(connOptions as mysql.ConnectionOptions),
      typeCast: composedTypeCast,
    });

    if (initSql) {
      try {
        await conn.query(initSql);
      } catch (err) {
        // Init SQL failed — close the socket so it isn't leaked, then rethrow.
        conn.end().catch(() => {});
        throw err;
      }
    }
    return conn;
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
  protected async _warningCount(conn: mysql.Connection): Promise<number> {
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
   * connection is still held — warnings are connection-scoped.
   *
   * Mirrors: AbstractMysqlAdapter#handle_warnings.
   * @internal
   */
  protected async _handleWarningsOn(
    conn: mysql.Connection | undefined,
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
          Message: `Query had warning_count=${count} but 'SHOW WARNINGS' did not return the warnings. Check MySQL logs or database configuration.`,
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
  // Called before createConnection so a validation throw doesn't leak a live connection.
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
 * Translate a connection-establishment error to the matching Rails exception.
 * Mirrors `Mysql2Adapter.new_client`'s rescue block — maps specific MySQL
 * errnos to typed AR errors so callers get the same exception hierarchy as
 * Rails.
 * @internal
 */
function translateConnectError(
  err: unknown,
  database: string | undefined,
  config: mysql.PoolOptions & MysqlAdapterOptions,
): Error {
  if (!(err instanceof Error)) return new ConnectionNotEstablished(String(err));
  const errno = (err as { errno?: number }).errno;
  switch (errno) {
    case 1049: {
      // ER_BAD_DB_ERROR
      const db = database ?? "unknown";
      return new NoDatabaseError(
        `We could not find your database: ${db}. Available database configurations can be found in config/database.yml.`,
        { cause: err },
      );
    }
    case 1044: // ER_DBACCESS_DENIED_ERROR
    case 1045: {
      // ER_ACCESS_DENIED_ERROR
      const user =
        (config.user as string | undefined) ?? parseUriField(config, "username") ?? "unknown";
      return new DatabaseConnectionError(
        `There is an issue connecting to your database with your username/password, username: ${user}.\n\nPlease check your database configuration to ensure the username/password are valid.`,
        { cause: err },
      );
    }
    case 2003: // ER_CONN_HOST_ERROR
    case 2005: {
      // ER_UNKNOWN_HOST_ERROR
      const host =
        (config.host as string | undefined) ?? parseUriField(config, "hostname") ?? "unknown";
      return new DatabaseConnectionError(
        `There is an issue connecting with your hostname: ${host}.\n\nPlease check your database configuration and ensure there is a valid connection to your database.`,
        { cause: err },
      );
    }
    default:
      return new ConnectionNotEstablished(err.message, { cause: err });
  }
}

/**
 * Extract a single URL field from a URI-based config (e.g. `{ uri: "mysql://..." }`).
 * Returns undefined if the config has no `uri` or if parsing fails.
 * @internal
 */
function parseUriField(
  config: mysql.PoolOptions & MysqlAdapterOptions,
  field: "username" | "hostname",
): string | undefined {
  const uri = (config as { uri?: string }).uri;
  if (!uri) return undefined;
  try {
    const val = new URL(uri)[field];
    return val || undefined;
  } catch {
    return undefined;
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
function initializeTypeMap(m: any): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/mysql2_adapter.rb:40 cluster=mysql-mysql2-adapter
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Mysql2Adapter#initialize_type_map is not implemented",
  );
}

// `executeMutation` is this adapter's write/DDL primitive (reads go through the
// overridden `execQuery`), so dirtying it clears the query cache on writes and
// schema changes — the trails analogue of Rails' `dirties_query_cache base,
// :execute` for the write side.
dirtiesQueryCache(Mysql2Adapter, "executeMutation");
