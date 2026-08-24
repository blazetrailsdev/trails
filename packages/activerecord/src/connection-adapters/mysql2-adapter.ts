import mysql from "mysql2/promise";
import { Temporal } from "@blazetrails/date";
import { BigDecimal, KeyError } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import type { MysqlAdapterOptions } from "./pool-config.js";
import {
  AbstractMysqlAdapter,
  StatementPool as MysqlStatementPool,
  type MysqlPreparedStatement,
} from "./abstract-mysql-adapter.js";
import { StringType, ImmutableStringType, BinaryData } from "@blazetrails/activemodel";
import { isRubyTruthy } from "../ruby-truthy.js";
import { TypeMap } from "../type/type-map.js";
import * as Type from "../type.js";
import { UnsignedInteger } from "../type/unsigned-integer.js";
import { AbstractAdapter, RAW_CONNECTION_DEPRECATION_MESSAGE } from "./abstract-adapter.js";
import { deprecator } from "../deprecator.js";
import { dirtiesQueryCache } from "./abstract/query-cache.js";
import {
  ActiveRecordError,
  AdapterError,
  AdapterTimeout,
  ConnectionFailed,
  ConnectionNotEstablished,
  DatabaseConnectionError,
  MismatchedForeignKey,
  NoDatabaseError,
} from "../errors.js";
import { Result } from "../result.js";
import { ExplainPrettyPrinter } from "./mysql/explain-pretty-printer.js";
import {
  affectedRows as mysql2AffectedRows,
  lastInsertedId as mysql2LastInsertedId,
  castResult as mysql2CastResult,
  performQuery as mysql2PerformQuery,
  type Mysql2RawResult,
} from "./mysql2/database-statements.js";
import { transactionIsolationLevels } from "./abstract/database-statements.js";
import { Value as TimeValue } from "../type/time.js";
import { ActiveRecord } from "../ar-config.js";
import { temporalTypeCast, TEMPORAL_POOL_OPTIONS } from "./mysql/temporal-type-cast.js";
import { SchemaDumper as MysqlSchemaDumper } from "./mysql/schema-dumper.js";
import { abandonRawSocket } from "./abandon-raw-socket.js";
import { parseMysqlName as mysqlParseName } from "./mysql/schema-statements.js";

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
    try {
      (conn as unknown as { unprepare: (sql: string) => void }).unprepare(stmt.sql);
    } catch {
      // swallow — matches Rails' Mysql2::Error rescue on stmt close
    }
  }

  _detach(): void {
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
  static readonly ER_BAD_DB_ERROR = 1049;
  static readonly ER_DBACCESS_DENIED_ERROR = 1044;
  static readonly ER_ACCESS_DENIED_ERROR = 1045;
  static readonly ER_CONN_HOST_ERROR = 2003;
  static readonly ER_UNKNOWN_HOST_ERROR = 2005;

  /**
   * Mirrors: Mysql2Adapter#initialize_type_map (mysql2_adapter.rb:40-49).
   *
   * `super` registers the shared MySQL types. On top of that the concrete
   * mysql2 adapter resolves char/varchar/enum/set through
   * `Type.lookup(:string, adapter: :mysql2)`, which returns the adapter-scoped
   * `StringType` whose boolean coercions are `"1"`/`"0"` rather than the
   * ActiveModel default `"t"`/`"f"` (see the module-level `Type.register` calls
   * below), so a boolean assigned to a string column round-trips as 1/0.
   * char/varchar thread `extract_limit(sql_type)` through the `limit:` kwarg
   * (`register_type(%r(char)i)`), so `type_for_attribute(col).limit` reflects
   * the column limit; enum/set look up the limitless string. These are NOT in
   * AbstractMysqlAdapter because they bind mysql2-specific behavior to a
   * concrete client.
   *
   * @internal
   */
  static override initializeTypeMap(m: TypeMap): void {
    super.initializeTypeMap(m);
    m.registerType(/char/i, undefined, (sqlType) => {
      const limit = this.extractLimit(sqlType);
      return Type.lookup("string", { adapter: "mysql2", limit });
    });
    m.registerType(/^enum/i, Type.lookup("string", { adapter: "mysql2" }));
    m.registerType(/^set/i, Type.lookup("string", { adapter: "mysql2" }));
  }

  // Mirrors Rails' Mysql2Adapter#active? (mysql2_adapter.rb:108), whose body is
  // `if connected? ... @raw_connection&.ping ... end || false` — it *calls*
  // `connected?` rather than re-deriving the guard, so this delegates to
  // `isConnected()` (trails' `connected?`) the same way. node-mysql2's `ping()`
  // returns a promise, which is why the predicate is awaitable here where
  // Rails' is not.
  override async active(): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      const conn = await this._ensureClient();
      await conn.ping();
      return true;
    } catch {
      return false;
    }
  }

  // Mirrors Rails' Mysql2Adapter#connected? — `!(@raw_connection.nil? ||
  // @raw_connection.closed?)` (mysql2_adapter.rb:104). `_client` is trails'
  // `@raw_connection`, so a never-connected / disconnected adapter (`_client
  // === null`) reports NOT connected. This also matches the base adapter's
  // `isConnected()` (`_connection !== null`). The ping result is deliberately
  // NOT a term here: Rails' `connected?` asks only about the handle, and
  // `active?` is `connected?` PLUS a live ping — so a failed ping leaves
  // `connected?` true while `active?` goes false.
  override isConnected(): boolean {
    return this._client !== null && !this._permanentlyClosed && !this._isFakeConnection;
  }

  // Single persistent connection — mirrors Rails' @raw_connection. Unified onto
  // the inherited base `_connection` slot rather than a parallel field: Rails
  // has ONE `@raw_connection` ivar every adapter shares, so the live
  // `mysql.Connection` lives IN `_connection`. `_client` is a thin typed
  // accessor so the mysql2 lifecycle code reads the concrete driver handle,
  // while the base run-loop guard (`_connection === null`), `active`,
  // `isConnected`, and `secondsSinceLastActivity` all see the live handle with
  // no sentinel. Mirrors PostgreSQLAdapter's `_rawConnection` accessor.
  private get _client(): mysql.Connection | null {
    return this._connection as unknown as mysql.Connection | null;
  }
  private set _client(value: mysql.Connection | null) {
    this._connection = value as unknown as AbstractAdapter | null;
  }
  private _connectingPromise: Promise<mysql.Connection> | null = null;
  private _connectGeneration = 0;
  private _connectingPromiseGen = -1;
  // Generations orphaned by discardBang() (Rails' discard!). A connect at one
  // of these generations that resolves after the discard must abandon its raw
  // socket without end()ing it — discard! is forbidden from talking to the
  // server. disconnectBang()/close() bump the generation too but are NOT
  // recorded here, so their stale connects still end() the socket as before.
  private _discardedConnectGenerations = new Set<number>();
  private _endingClient: Promise<void> | null = null;
  private _permanentlyClosed = false;
  private _isFakeConnection = false;
  private _poolConfig: mysql.PoolOptions & MysqlAdapterOptions;
  private _inTransaction = false;
  // Gates the connect-once portion of configureConnection() (super/checkVersion
  // + any future connect-time-only logic) to exactly once per physical
  // connection. Mirrors PostgreSQLAdapter's `_connectionConfigured`: the eager
  // connect path (_ensureClient) configures the fresh socket and flips this
  // true, so the argless configureConnection() that reconnectBang's
  // attemptConfigureConnection issues re-runs only the (idempotent) timezone
  // reseed, not the gated work. Reset to false whenever the raw handle is torn
  // down so the next connect re-configures — matching Rails' connect-time
  // `configure_connection`.
  private _connectionConfigured = false;
  private _statementPool: Mysql2StatementPool | null = null;

  /**
   * The timezone applied to result rows for the most recent query. Rails-private
   * (`_` prefix) because Rails exposes no reader for it: the value lives inside
   * the Ruby driver as `@raw_connection.query_options[:database_timezone]`,
   * seeded by `Mysql2Adapter#configure_connection` (mysql2_adapter.rb:160) and
   * re-synced to `default_timezone` on every statement by
   * `Mysql2::DatabaseStatements#perform_query` (mysql2/database_statements.rb:49).
   * node-mysql2 has no `query_options` hash, so trails holds the same state in a
   * field — there is no Rails method name to map it onto, only a driver ivar.
   *
   * Updated by {@link _syncDatabaseTimezone} from the perform-query path.
   */
  _databaseTimezone: "utc" | "local" = "utc";

  /**
   * Rows affected by the most recent write, recorded by {@link performQuery}.
   * Rails takes the statement result in `affected_rows` and ignores it, reading
   * `@affected_rows` (set inside `perform_query`) instead — this is that field.
   */
  _affectedRowsBeforeWarnings = 0;

  /**
   * Refresh {@link _databaseTimezone} from the global default. Called from
   * the perform-query path so a `withTimezoneConfig({ default: "local" })`
   * block is observable on the very next query — matching Rails'
   * `raw_connection.query_options[:database_timezone] = default_timezone`
   * line in `Mysql2Adapter#perform_query`.
   */
  private _syncDatabaseTimezone(): void {
    this._databaseTimezone = ActiveRecord.defaultTimezone;
  }

  /**
   * Mirrors `Mysql2Adapter#translate_exception`. Promotes a driver-level
   * read-timeout (a node-mysql2 error with no MySQL errno) to
   * `AdapterTimeout`. Everything else falls through to the
   * AbstractMysqlAdapter mapping, which handles the statement-timeout
   * codes (`ER_QUERY_TIMEOUT` / `ER_FILSORT_ABORT`).
   */
  protected override _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    const build = (): Error => {
      if (isMysql2DriverTimeout(e)) {
        const msg = e instanceof Error ? e.message : String(e);
        return new AdapterTimeout(msg, { sql, binds, connectionPool: this.pool });
      }
      if (isMysql2ConnectionError(e)) {
        // Mirrors `Mysql2Adapter#translate_exception`'s
        // `Mysql2::Error::ConnectionError` branch: a "MySQL client is not
        // connected" message is promoted to ConnectionNotEstablished;
        // everything else in this family is ConnectionFailed.
        const msg = (e as Error).message;
        if (/MySQL client is not connected/i.test(msg)) {
          // mysql2_adapter.rb:177 passes the driver exception itself here, while
          // :179 below passes the message — the asymmetry is Rails'.
          return new ConnectionNotEstablished(e as Error, { connectionPool: this.pool });
        }
        return new ConnectionFailed(msg, { sql, binds, connectionPool: this.pool });
      }
      return super._translateException(e, sql, binds);
    };
    const translated = build();
    // The raise-site stand-in for Ruby's implicit `Exception#cause`, as in the
    // superclass — `translate_exception` never names the driver error in its
    // argument list (mysql2_adapter.rb `translate_exception`).
    if (translated !== e && (translated as { cause?: unknown }).cause === undefined) {
      (translated as { cause?: unknown }).cause = e;
    }
    return translated;
  }

  /**
   * Look up (or lazily create) the statement pool for the persistent
   * connection.
   */
  private _getStmtPool(conn: mysql.Connection): Mysql2StatementPool {
    if (!this._statementPool) {
      this._statementPool = new Mysql2StatementPool(conn, this._statementLimit);
    }
    return this._statementPool;
  }

  /**
   * Gate named-prepared-statement routing through our pool. Rails' gate is
   * `prepared_statements && !binds.empty?` (the inverse of
   * `without_prepared_statement?`, abstract_adapter.rb:1177) and nothing more.
   * In particular it does not consult `statement_limit`: a limit of 0 is
   * unsupported in Rails, whose `StatementPool#[]=` loop raises on the empty
   * cache (statement_pool.rb:31-33), so there is nothing for this gate to
   * degrade around.
   */
  _shouldPrepare(binds: unknown[]): boolean {
    return this.preparedStatements && binds.length > 0;
  }

  /**
   * Track a SQL string in the statement pool BEFORE handing it to
   * `conn.execute()`. If the insert evicts an older entry, our pool's
   * `dealloc` sends COM_STMT_CLOSE via `unprepare` so the mysql2
   * driver's internal cache and the server both release the prepared
   * statement. There is no `statementLimit` 0 branch here because Rails has
   * none: its `[]=` raises on the empty cache (statement_pool.rb:31-33), so a
   * limit of 0 is unsupported rather than a caching switch.
   */
  _trackPrepared(conn: mysql.Connection, sql: string): void {
    const pool = this._getStmtPool(conn);
    if (pool.get(sql)) return;
    void pool.set(sql, { sql, key: pool.nextKey() });
  }

  /**
   * Test-only accessor for the statement pool on the persistent
   * connection. Matches the PG adapter's equivalent hook.
   * @internal
   */
  _statementPoolForTest(): Mysql2StatementPool | undefined {
    return this._statementPool ?? undefined;
  }

  /**
   * Test-only accessor for the persistent raw connection. Mirrors the PG
   * adapter's `_rawConnectionForTest`.
   * @internal
   */
  _clientForTest(): mysql.Connection | null {
    return this._client;
  }

  /**
   * Clear cached prepared statements on the persistent connection.
   * Mirrors Rails' `Mysql2Adapter#clear_cache!` which calls `close` on
   * each cached statement on the adapter's sole connection.
   */
  override clearCacheBang({ newConnection = false }: { newConnection?: boolean } = {}): void {
    void super.clearCacheBang({ newConnection });
    if (newConnection) {
      this._statementPool?.reset();
    } else {
      void this._statementPool?.clear();
    }
  }
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
  /**
   * @missingRailsCall push — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   mysql2_adapter.rb:61-66 pushes onto `@config[:flags]` (a Ruby Array) while
   *   building the client flags; trails composes the mysql2 driver options
   *   object instead — the node driver takes named booleans, not a FLAGS array,
   *   so there is no array to push onto.
   */
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
    // Mirrors Rails abstract_adapter.rb — `@config = config`. Persist the full
    // config hash so config-driven getters (`foreign_keys_enabled?`,
    // default_timezone, etc.) read the real values rather than the empty
    // default. The object branch below destructures adapter-level keys off it,
    // but the untouched hash is what `_config`-reading helpers consult.
    if (typeof config === "object" && config !== null) {
      this._config = { ...(config as Record<string, unknown>) };
    }
    // abstract_adapter.rb:159 — the global toggle is folded into the config
    // read, which Rails does in the common tail of `initialize`. trails' config
    // parsing forks below into a connection-string branch that returns early,
    // so the read sits above the fork to cover both.
    this.preparedStatements =
      !ActiveRecord.disablePreparedStatements &&
      Mysql2Adapter.typeCastConfigToBoolean(
        "preparedStatements" in this._config
          ? this._config.preparedStatements
          : this.defaultPreparedStatements(),
      );
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
          url.searchParams.delete("wait_timeout");
          uri = url.toString();
        }
      } catch {}
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
    if (statementLimit !== undefined) this._statementLimit = statementLimit;
    if (advisoryLocks !== undefined) {
      this._advisoryLocksEnabled = Mysql2Adapter.typeCastConfigToBoolean(advisoryLocks) !== false;
    }
    this._database =
      mysqlConfig.database ??
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
    // Deviation forced by the driver, NOT a port: Rails hands the config hash
    // to Mysql2::Client untouched (mysql2_adapter.rb:24 `::Mysql2::Client.new(config)`)
    // because the Ruby gem reads `:username` natively. Node's `mysql2` reads
    // the driver-native `user` and ignores unknown keys, so an unmapped
    // Rails-spelled hash connects as the OS user instead of failing.
    //
    // Semantics deliberately match the one place Rails DOES translate —
    // postgresql_adapter.rb:326 — so both adapters agree, down to the same
    // `isRubyTruthy` guard: a Ruby-truthy `username` (including "") overwrites
    // `user`, while `username: false` does not.
    //
    // `socket` is the same class of deviation. Rails' database.yml spells a
    // Unix socket `socket` (config.example.yml:18-19) and the Ruby gem reads
    // `:socket` natively, but node-mysql2's option is `socketPath` — and it
    // ignores the unknown key, so an unmapped `socket` connects over TCP
    // instead of failing. There is no Rails guard to inherit here, so the
    // precedence deliberately matches `username` above: a Ruby-truthy `socket`
    // overwrites an explicit `socketPath` and is deleted from the hash.
    // `socket: ""` therefore maps (Ruby-truthy), which lands on mysql2 as a
    // falsy `socketPath` and so falls back to host/port — the same outcome as
    // a blank socket in Rails.
    const {
      username: railsUsername,
      socket: railsSocket,
      ...mysqlDriverConfig
    } = mysqlConfig as typeof mysqlConfig & {
      username?: string;
      socket?: string;
    };
    // No compact/allowlist here, unlike PostgreSQLAdapter (which mirrors
    // postgresql_adapter.rb:322-331). Rails hands mysql2 the residual config
    // hash verbatim — `::Mysql2::Client.new(config)` (mysql2_adapter.rb:24-25)
    // — with no `compact` and no `slice!`, so passing the residual hash through
    // IS the faithful port. The `username` remap above is a separate,
    // driver-forced deviation and does not imply an allowlist belongs here.
    this._poolConfig = {
      ...mysqlDriverConfig,
      ...(isRubyTruthy(railsUsername) ? { user: railsUsername } : {}),
      ...(isRubyTruthy(railsSocket) ? { socketPath: railsSocket } : {}),
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
    const _charset = mysqlConfig.charset ?? (mysqlConfig as { encoding?: string }).encoding;
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
  // Rails' Mysql2Adapter has no `exec_query` override: the abstract
  // `exec_query` (abstract/database_statements.rb:147-149) funnels into
  // `internal_exec_query`, which is the one we override below.

  override async internalExecQuery(
    sql: string,
    name: string | null = "SQL",
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean },
  ): Promise<Result> {
    sql = this.preprocessQuery(sql);
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds ?? []);
    // Rails logs the caller's own binds (`QueryAttribute` objects) plus their
    // type-casted values, NOT the driver wire form — abstract_adapter.rb:1134-1145
    // / abstract/database_statements.rb:553-554. `driverBinds` stays scoped to
    // the driver call below.
    const typeCastedBinds = this.typeCastedBinds(binds ?? []) ?? [];
    return this.log(driverSql, name, binds ?? [], typeCastedBinds, false, async (payload) => {
      try {
        // Thread allowRetry (Rails' select_all → internal_exec_query
        // `allow_retry: preparable`) into withRawConnection so idempotent SELECTs
        // retry+reconnect after a severed connection, while raw-SQL-fragment
        // reads (allowRetry false) surface the connection error. Mirrors PG's
        // internalExecQuery (postgresql-adapter.ts).
        return await this.withRawConnection(
          { allowRetry: options?.allowRetry ?? false },
          async (conn) => {
            const mysqlConn = conn as unknown as mysql.Connection;
            // Rails' internal_exec_query is `cast_result(internal_execute(...))`
            // (abstract/database_statements.rb:545-547), which reaches
            // `raw_execute` → `perform_query` (`:588-591` → `:552-558`) — one
            // perform_query primitive per adapter, not a second inline driver call.
            const raw = await this.performQuery(mysqlConn, driverSql, binds ?? [], driverBinds, {
              prepare: options?.prepare,
              notificationPayload: payload,
            });
            return this.castResult(raw);
          },
        );
      } catch (e: any) {
        const translated =
          e instanceof MismatchedForeignKey
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, driverBinds)
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, driverBinds);
        throw translated;
      }
    });
  }

  /**
   * Open the socket and nothing else, as Rails' private `Mysql2Adapter#connect`
   * does (mysql2_adapter.rb:144), serializing concurrent callers through a
   * single Promise. Every `configure_connection` dispatch belongs to the
   * lifecycle (`attempt_configure_connection`, abstract_adapter.rb:1216), and
   * no caller reaches an unconfigured socket: `getConn` and
   * `awaitRawConnectionReady` establish through `connectBang`.
   */
  private async _ensureClient(): Promise<mysql.Connection> {
    if (this._client) return this._client;
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
      async (conn): Promise<mysql.Connection> => {
        if (this._connectGeneration !== gen) {
          if (this._connectingPromiseGen === gen) this._connectingPromise = null;
          const discardErr = new ConnectionNotEstablished(
            "Mysql2Adapter: connection was closed during connect",
          );
          if (this._discardedConnectGenerations.delete(gen)) {
            // discardBang() orphaned this connect: abandon the fd without
            // end()ing it, matching Rails mysql2 discard! (no server I/O).
            abandonRawSocket(conn);
            throw discardErr;
          }
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
        // Assigns the live handle into the base `_connection` slot (via the
        // `_client` accessor) exactly as Rails' `@raw_connection = new_client`.
        // The base run-loop guard `_connection === null` (abstract-adapter.ts)
        // is now satisfied, so connectBang fires once per connect rather than
        // on every withRawConnection call.
        this._client = conn;
        this._statementPool = null;
        return conn;
      },
      (err) => {
        if (this._connectingPromiseGen === gen) this._connectingPromise = null;
        // Mirrors Rails' Mysql2Adapter#connect: `rescue ConnectionNotEstablished
        // => ex; raise ex.set_pool(@pool)`. Attach the originating pool (a
        // NullPool for a standalone adapter) so `error.connection_pool` is set
        // on a connect-time failure. translateConnectError returns a
        // ConnectionNotEstablished in every branch but NoDatabaseError; use its
        // dedicated setPool (which flips the `_poolSet` guard) so a later
        // setPool on the same object can't silently overwrite it.
        // `new_client` has already mapped the errno to its typed error
        // (mysql2_adapter.rb:24-37); Rails' `connect` only re-raises it with
        // the pool attached.
        const translated = err instanceof Error ? err : new ConnectionNotEstablished(String(err));
        if (translated instanceof ConnectionNotEstablished) {
          translated.setPool(this.pool);
        } else if (translated instanceof AdapterError) {
          translated.setConnectionPool(this.pool);
        }
        throw translated;
      },
    );
    return this._connectingPromise;
  }

  /**
   * Get the active connection — always the single persistent connection.
   * Establishing it goes through the lifecycle (`connect!`, which is
   * `verify!` — abstract_adapter.rb:778), never a bare raw connect, so the
   * socket handed out has always seen `configure_connection`.
   */
  private async getConn(): Promise<mysql.Connection> {
    await this.awaitRawConnectionReady();
    return this._ensureClient();
  }

  /**
   * Establish the socket before the base `withRawConnection` loop yields
   * `this._connection`, so the loop never acquires one itself — Rails yields
   * the `@raw_connection` `connect!`/`verify!`/`reconnect!` already
   * established (abstract_adapter.rb:1030-1070). Its own pre-loop `connect!`
   * is gated on `@raw_connection.nil? && reconnect_can_restore_state?`, so a
   * dirty connection or a non-restorable stack would otherwise leave the seam
   * to open the first — unconfigured — socket, as PostgreSQLAdapter found.
   *
   * @internal
   */
  protected override async awaitRawConnectionReady(): Promise<void> {
    if (this._client === null && !this._permanentlyClosed && !this._isFakeConnection) {
      await this.connectBang();
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
   * quoteColumnName(..., "mysql") directly where appropriate.
   */
  private mysqlQuote(sql: string): string {
    const parts = sql.split(/('(?:[^'\\]|\\.)*')/);
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i].replace(/"/g, "`");
    }
    let result = parts.join("");

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
    let translated: Error = this._translateException(e, sql, binds);
    if (translated instanceof MismatchedForeignKey) {
      translated = translated.setQuery(sql, binds);
    }
    if (translated instanceof MismatchedForeignKey) {
      translated = await this._enrichMismatchedForeignKey(translated);
    }
    // Mirrors Rails' AbstractAdapter#translate_exception, which attaches the
    // originating pool to every translated exception. Done after enrichment so
    // the rebuilt MismatchedForeignKey carries it too.
    if (translated instanceof AdapterError) translated.setConnectionPool(this.pool);
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
      if (v && typeof v === "object" && "valueForDatabase" in v) {
        v = (v as { valueForDatabase: unknown }).valueForDatabase;
      }
      // `value_for_database` now yields cast Temporal values; convert to the SQL
      // wire string the mysql2 driver expects. Rails' `type_cast` dispatches
      // these through `self.quoted_time` / `self.quoted_date`
      // (abstract/quoting.rb:103-104), so the microsecond capping comes from
      // this adapter's `quotedDate` rather than a dialect argument.
      if (v instanceof TimeValue || v instanceof Temporal.PlainTime) {
        v = this.quotedTime(v);
      } else if (
        v instanceof Temporal.Instant ||
        v instanceof Temporal.PlainDateTime ||
        v instanceof Temporal.PlainDate ||
        v instanceof Temporal.ZonedDateTime
      ) {
        v = this.quotedDate(v);
      } else if (v instanceof BigDecimal) {
        // Rails: `when BigDecimal then value.to_s("F")` (abstract/quoting.rb:101).
        v = v.toString("F");
      }
      // `BinaryType#serialize` yields a `Type::Binary::Data`; Rails' `type_cast`
      // unwraps it to its byte string at abstract/quoting.rb:96. This path
      // deliberately does not route through `typeCast` (see above), so unwrap
      // here — otherwise the wrapper reaches mysql2, which binds it as a plain
      // object and matches no rows (measured: 0 rows for a value that is
      // present, i.e. a wrong answer rather than a raise).
      //
      // Unlike node-postgres (which needs a Buffer, hence PG's re-wrap in
      // `postgresql/quoting.ts` typeCast), mysql2 binds a bare `Uint8Array` as a
      // BLOB: verified with a non-Buffer `Uint8Array` round-tripping byte-exactly
      // through a bound where clause, including 0x00 and bytes >= 0x80. This is
      // also what the path received before `serialize` began wrapping.
      if (v instanceof BinaryData) v = v.bytes;
      return v === true ? 1 : v === false ? 0 : v;
    });
  }

  /**
   * The single SQL primitive `raw_execute` — and, in trails, `execute` /
   * `executeMutation` — delegate to. Assigned to the prototype below so
   * `raw_execute`'s virtual `perform_query` dispatch resolves here; declared
   * with `declare` so call sites type-check against the port's signature.
   * Returns the raw `{ rows, fields, affectedRows, insertId }` — `execute`
   * rebuilds row objects from it, `executeMutation` reads the affected rows /
   * insert id. mysql2 hands back a ResultSetHeader (with `affectedRows` /
   * `insertId`) rather than rows for a non-row-returning statement, so the
   * read/write split is which shape came back, not a driver throw.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#perform_query
   * @internal
   */
  declare performQuery: typeof mysql2PerformQuery;

  /**
   * Assigned onto the prototype below; declared here so `internal_exec_query`'s
   * virtual call resolves against the concrete adapter rather than
   * AbstractAdapter's optional member.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#cast_result
   * @internal
   */
  declare castResult: typeof mysql2CastResult;

  /**
   * Rows affected by the most recent write. Rails takes the statement result
   * and ignores it, reading `@affected_rows` instead — wired to the this-less
   * port so parity:api's `affected_rows` coverage points at reachable code.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#affected_rows
   * @internal
   */
  affectedRows(rawResult: Mysql2RawResult): number {
    return mysql2AffectedRows.call(this as any, rawResult);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#last_inserted_id
   * @internal
   */
  lastInsertedId(result: Result): Promise<unknown> {
    return mysql2LastInsertedId.call(this as never, result);
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
    name: string | null = "SQL",
    { allowRetry = false }: { allowRetry?: boolean } = {},
  ): Promise<Record<string, unknown>[]> {
    sql = this.preprocessQuery(sql);
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds);
    // Rails' raw_execute logs the caller's own binds plus their type-casted
    // values (abstract/database_statements.rb:552-556, abstract_adapter.rb:1134-1145),
    // never the mysql2 wire form; `driverBinds` stays scoped to the driver call.
    const typeCastedBinds = this.typeCastedBinds(binds) ?? [];
    return this.log(driverSql, name, binds, typeCastedBinds, false, async (payload) => {
      try {
        return await this.withRawConnection({ allowRetry }, async (conn) => {
          const mysqlConn = conn as unknown as mysql.Connection;
          const raw = await this.performQuery(mysqlConn, driverSql, binds, driverBinds, {
            notificationPayload: payload,
          });
          if (raw.rows == null) return [];
          const names = raw.fields.map((f) => f.name);
          return raw.rows.map((row) => {
            const obj: Record<string, unknown> = {};
            for (let i = 0; i < names.length; i++) obj[names[i]] = row[i];
            return obj;
          });
        });
      } catch (e: any) {
        const translated =
          e instanceof MismatchedForeignKey
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, driverBinds)
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, driverBinds);
        throw translated;
      }
    });
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   * Wrapped in a `sql.active_record` notification — see `execute`.
   */
  async executeMutation(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
  ): Promise<number> {
    sql = this.preprocessQuery(sql);
    this._syncDatabaseTimezone();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds);
    // Rails' raw_execute logs the caller's own binds plus their type-casted
    // values (abstract/database_statements.rb:552-556, abstract_adapter.rb:1134-1145),
    // never the mysql2 wire form; `driverBinds` stays scoped to the driver call.
    const typeCastedBinds = this.typeCastedBinds(binds) ?? [];
    return this.log(driverSql, name, binds, typeCastedBinds, false, async (payload) => {
      try {
        return await this.withRawConnection(async (conn) => {
          const mysqlConn = conn as unknown as mysql.Connection;
          const raw = await this.performQuery(mysqlConn, driverSql, binds, driverBinds, {
            notificationPayload: payload,
          });
          // Source affected rows through the `affected_rows` port (reads the
          // `_affectedRowsBeforeWarnings` field `perform_query` set) rather than
          // off the statement result, mirroring Rails' `affected_rows`. The
          // notification payload's `row_count` is left as `perform_query` set it
          // (0 for a write) — Rails reports the count only via `affected_rows`.
          const affected = this.affectedRows(raw);

          if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
            if (affected > 1) {
              return affected;
            }
            return raw.insertId ?? 0;
          }

          return affected;
        });
      } catch (e: any) {
        const translated =
          e instanceof MismatchedForeignKey
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, driverBinds)
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, driverBinds);
        throw translated;
      }
    });
  }

  /**
   * Begin a transaction. Acquires the persistent connection and issues BEGIN.
   */
  async beginTransaction(): Promise<void> {
    await this._transactionManager.beginTransaction({ _lazy: false });
  }

  /**
   * Mirrors Rails' `AbstractMysqlAdapter#begin_db_transaction`:
   * `internal_execute("BEGIN", allow_retry: true, materialize_transactions:
   * false)`. The `allow_retry` routes BEGIN through `with_raw_connection`'s
   * retry loop so a transaction opened on a severed connection reconnects and
   * re-issues BEGIN. `internalExecute` now threads `allowRetry` into its own
   * `withRawConnection` call, so this is a single call matching Rails
   * abstract_mysql_adapter.rb:227 (no outer wrap). Restoring the stack on
   * reconnect is a no-op here — this frame isn't materialized until
   * `super.materializeBang()` runs after this returns.
   */
  async beginDbTransaction(): Promise<void> {
    await this.internalExecute("BEGIN", "TRANSACTION", [], {
      materializeTransactions: false,
      allowRetry: true,
    });
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
   * routes through `with_raw_connection` and retries the batch once). Unlike
   * `beginDbTransaction` — a single statement that now threads `allowRetry`
   * straight through `internalExecute` — this outer wrap is NOT redundant: it
   * is what replays BOTH statements together, so the inner `internalExecute`
   * calls run with `allowRetry: false` (the batch, not each leaf, retries).
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
    // Rails: `transaction_isolation_levels.fetch(isolation)`
    // (abstract_mysql_adapter.rb:235) — unknown levels raise Ruby's `KeyError`.
    const level = transactionIsolationLevels()[isolation];
    if (level === undefined) throw new KeyError(`key not found: :${isolation}`);
    await this.withRawConnection({ allowRetry: true, materializeTransactions: false }, async () => {
      await this.internalExecute(`SET TRANSACTION ISOLATION LEVEL ${level}`, "TRANSACTION", [], {
        materializeTransactions: false,
      });
      await this.internalExecute("BEGIN", "TRANSACTION", [], { materializeTransactions: false });
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
  // materializeTransactions is handled here (before the loop) instead of inside
  // withRawConnection, and the loop is passed false, so transaction-control SQL
  // keeps its exact pre-existing materialize semantics. The Rails ensure —
  // with_raw_connection's `dirty_current_transaction if materialize_transactions`
  // (abstract_adapter.rb:1046) — is relocated to this method's own finally so it
  // still fires when the param is true (savepoint statements, savepoints.rb:11-20).
  // Returns the raw {rows, fields, affectedRows} so internalExecQuery's `castResult`
  // (and execUpdate/execDelete's affectedRows) can build a Result — the Rails-faithful
  // query_value/update path. Transaction-control callers ignore the return.
  override async internalExecute(
    sql: string,
    name: string | null = "SQL",
    binds: unknown[] = [],
    {
      materializeTransactions = true,
      allowRetry = false,
      prepare: prepareOption,
    }: {
      materializeTransactions?: boolean;
      allowRetry?: boolean;
      prepare?: boolean;
    } = {},
  ): Promise<Mysql2RawResult> {
    sql = this.preprocessQuery(sql);
    try {
      if (materializeTransactions) {
        this._syncDatabaseTimezone();
        await this.materializeTransactions();
      }
      const driverSql = this.mysqlQuote(sql);
      // Thread binds through so a bound INSERT ... RETURNING (MariaDB) reaches the
      // driver, matching Rails internal_execute(sql, name, binds). Transaction-
      // control callers pass none, keeping their byte-identical no-bind path.
      const driverBinds = binds.length > 0 ? this.mysqlBinds(binds) : [];
      const typeCastedBinds = this.typeCastedBinds(binds) ?? [];
      return await this.log(driverSql, name, binds, typeCastedBinds, false, async (payload) => {
        try {
          // materializeTransactions is run BEFORE the loop (above) and we pass
          // `false` into withRawConnection — the same materialize-outside-the-loop
          // split PostgreSQLAdapter#internalExecute uses (postgresql-adapter.ts).
          // The leaf still gains the retry/verify/reconnect loop, so callers thread
          // allowRetry in a single call (matching Rails abstract_mysql_adapter.rb:227-239).
          //
          // Because the split moved materialize out of withRawConnection, the
          // loop's `finally dirtyCurrentTransaction()` (abstract-adapter.ts) never
          // fires for this leaf. Rails' equivalent `ensure dirty_current_transaction
          // if materialize_transactions` (abstract_adapter.rb:1046) is relocated to
          // this method's own finally so a savepoint statement (materialize:true,
          // savepoints.rb:11-20) still dirties the current — parent, for a popped
          // RELEASE/ROLLBACK TO SAVEPOINT frame — transaction on every exit. COMMIT/
          // ROLLBACK pass materialize:false and so do not dirty (nor would it matter:
          // _commitTransactionInner pops the committing frame first, transaction.ts:
          // 1108-1117, leaving currentTransaction the NULL_TRANSACTION no-op).
          //
          // Error translation + invalidateTransaction live in the withRawConnection
          // loop and the outer catch below — mirroring execute()/executeMutation()
          // — so the block stays a bare leaf and does not double-translate or
          // double-invalidate.
          return await this.withRawConnection(
            { materializeTransactions: false, allowRetry },
            async (rawConn) => {
              // Route the read path through the shared array-mode performQuery seam
              // (rowsAsArray + single CALL/multi-result unwrap), mirroring Rails'
              // internal_execute → raw_execute → cast_result. Array-mode rows keep
              // duplicate column names that the old hash-keyed conn.query collapsed.
              const conn = rawConn as unknown as mysql.Connection;
              // Rails' internal_execute forwards `prepare:` to raw_execute →
              // perform_query (abstract/database_statements.rb:552-558, 589-591).
              const rawResult = await this.performQuery(conn, driverSql, binds, driverBinds, {
                prepare: prepareOption,
              });
              payload.row_count = rawResult.affectedRows;
              return rawResult;
            },
          );
        } catch (e: any) {
          const translated =
            e instanceof MismatchedForeignKey
              ? await this._translateAndEnrich(e.cause ?? e, driverSql, driverBinds)
              : e instanceof ActiveRecordError
                ? e
                : await this._translateAndEnrich(e, driverSql, driverBinds);
          throw translated;
        }
      });
    } finally {
      // Rails' with_raw_connection `ensure dirty_current_transaction if
      // materialize_transactions` (abstract_adapter.rb:1046), relocated here
      // because the materialize pass runs outside withRawConnection (above).
      // Fires on every exit path, so a retryable savepoint failure mid-flight
      // leaves the parent frame dirty → isRestorable() refuses to restore it.
      if (materializeTransactions) this.dirtyCurrentTransaction();
    }
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    // materializeTransactions defaults to true, matching Rails savepoints.rb:11-20.
    // internalExecute's finally then dirties the current transaction (Rails'
    // with_raw_connection ensure) — see internalExecute above.
    await this.internalExecute(`SAVEPOINT \`${name}\``, "TRANSACTION");
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    await this.internalExecute(`RELEASE SAVEPOINT \`${name}\``, "TRANSACTION");
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    await this.internalExecute(`ROLLBACK TO SAVEPOINT \`${name}\``, "TRANSACTION");
  }

  /**
   * Return the query execution plan. Accepts Rails-style options (e.g.
   * `["analyze"]` → `EXPLAIN ANALYZE <sql>` on MySQL 8.0.18+). Runs
   * through `internalExecQuery` as Rails' MySQL `explain` does, so the
   * EXPLAIN is instrumented and a collected prepared-statement SQL with
   * `?` placeholders re-EXPLAINs with its binds.
   */
  async explain(
    sql: string,
    binds: unknown[] = [],
    options: ExplainOption[] = [],
  ): Promise<string> {
    const clause = await this.buildExplainClause(options);
    const start = Date.now();
    const result = await this.internalExecQuery(`${clause} ${sql}`, "EXPLAIN", binds);
    const elapsed = (Date.now() - start) / 1000;
    const printer = new ExplainPrettyPrinter();
    return printer.pp(result, elapsed);
  }

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    this._syncDatabaseTimezone();
    const conn = await this.getConn();
    await conn.query(this.mysqlQuote(sql));
  }

  createSchemaDumper(options: Record<string, unknown> = {}): MysqlSchemaDumper {
    const dumper = MysqlSchemaDumper.create(this as unknown as DatabaseAdapter, options);
    dumper.connection = this;
    return dumper;
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
    const rows = (
      await this.internalExecQuery(
        `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = database() AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
        "SCHEMA",
      )
    ).toArray();
    return rows.map((r) => (r.name ?? r.NAME ?? r.TABLE_NAME) as string);
  }

  /**
   * List all VIEWs in the current database, matching Rails'
   * `data_source_sql(type: "VIEW")`.
   */
  async views(): Promise<string[]> {
    const rows = (
      await this.internalExecQuery(
        `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = database() AND table_type = 'VIEW'
         ORDER BY table_name`,
        "SCHEMA",
      )
    ).toArray();
    return rows.map((r) => (r.name ?? r.NAME ?? r.TABLE_NAME) as string);
  }

  async tableExists(name: string): Promise<boolean> {
    // Rails' table_exists?(nil) / "" returns false; a null/empty name has no
    // schema to parse, so short-circuit before mysqlParseName (which trims).
    if (!name) return false;
    const { schema, table } = mysqlParseName(name);
    const rows = (
      await this.internalExecQuery(
        `SELECT 1 AS one FROM information_schema.tables
         WHERE table_schema = COALESCE(?, database())
         AND table_name = ?
         AND table_type = 'BASE TABLE'
         LIMIT 1`,
        "SCHEMA",
        [schema ?? null, table],
      )
    ).toArray();
    return rows.length > 0;
  }

  /**
   * Return the primary key: scalar string for single-column PKs,
   * array for composite PKs, null for no-PK tables. Uses the same
   * `information_schema.statistics` + `seq_in_index` shape Rails
   * emits in `abstract_mysql_adapter#primary_keys`.
   */
  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const { schema, table } = mysqlParseName(tableName);
    const rows = (
      await this.internalExecQuery(
        `SELECT column_name AS name FROM information_schema.statistics
         WHERE index_name = 'PRIMARY'
         AND table_schema = COALESCE(?, database())
         AND table_name = ?
         ORDER BY seq_in_index`,
        "SCHEMA",
        [schema ?? null, table],
      )
    ).toArray() as Array<{ name?: string; NAME?: string; COLUMN_NAME?: string }>;
    const names = rows.map((r) => (r.name ?? r.NAME ?? r.COLUMN_NAME) as string);
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    return names;
  }

  supportsAdvisoryLocks(): boolean {
    return true;
  }

  // Advisory locks are connection-scoped. With a single persistent connection
  // the lock session is always this._client — no separate connection needed.
  // Mirrors Rails' AbstractAdapter#get_advisory_lock / #release_advisory_lock:
  // no client-side lock tracking, just issue the SQL and return the result.

  async getAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const conn = await this.getConn();
    const [rows] = await conn.query("SELECT GET_LOCK(?, 0) AS locked", [String(lockId)]);
    return (rows as Record<string, unknown>[])[0]?.locked === 1;
  }

  async releaseAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    if (!this._client) return false;
    const [rows] = await this._client.query("SELECT RELEASE_LOCK(?) AS unlocked", [String(lockId)]);
    return (rows as Record<string, unknown>[])[0]?.unlocked === 1;
  }

  /**
   * Eagerly establish the single persistent connection. Mirrors Rails' private
   * `Mysql2Adapter#connect` (`@raw_connection = new_client(@connection_parameters)`,
   * mysql2_adapter.rb:144), which raises `ConnectionNotEstablished` (carrying the
   * pool via `set_pool`) when the socket is dead. Driven by `connectBang()`
   * (Rails' public `connect!`); `reconnect()` establishes the same way via
   * `_ensureClient()` — the `new_client` analog, which already attaches the pool
   * to a connect failure.
   * @internal
   */
  async connect(): Promise<void> {
    await this._ensureClient();
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
  override async reconnect(): Promise<void> {
    if (this._permanentlyClosed) throw new Error("Mysql2Adapter: client is permanently closed");
    // Rails' private `reconnect` is itself `@lock.synchronize`d
    // (mysql2_adapter.rb:149-155) — close, null, connect must not interleave
    // with another connection-lifecycle body. The lock is reentrant per async
    // chain, so the common caller (`reconnectBang`, which already holds it)
    // re-enters rather than deadlocking.
    return this.lock.synchronize(async () => {
      this._connectGeneration++;
      // Mirror Rails' private `Mysql2Adapter#reconnect` (mysql2_adapter.rb:150):
      // `@raw_connection&.close; @raw_connection = nil; connect`. Crucially it does
      // NOT run the full `disconnect!` path, which resets the transaction manager
      // and would discard the (restorable) transaction stack before the inherited
      // reconnectBang's own resetTransaction({ restore: … }) can swap it back in.
      // clearCache! / @raw_connection_dirty are reconnectBang's responsibility
      // (abstract_adapter.rb reconnect!), so they are deliberately not repeated
      // here — only the raw-handle teardown. `_closeRawHandle` ends the live
      // socket then nulls `_client`, which nulls the unified base `_connection`.
      this._closeRawHandle();
      // Re-establish the connection eagerly and PROPAGATE any connect failure —
      // Rails' private `reconnect` calls `connect` synchronously, so a dead socket
      // raises out of `reconnect!` (mysql2_adapter.rb:150 → :144). Awaiting here
      // lets the inherited `reconnectBang` translate + re-raise the
      // `ConnectionNotEstablished` (carrying the pool) instead of swallowing it.
      await this._ensureClient();
    });
  }

  /**
   * Close the persistent connection and null it out. `active` returns false
   * immediately. The connection can be re-established on the next query.
   * Mirrors Rails' `Mysql2Adapter#disconnect!`.
   */
  override disconnectBang(): void {
    this._connectGeneration++;
    this._closeRawHandle();
    super.disconnectBang();
  }

  /**
   * Tear down the mysql2-specific raw-handle state (transaction flag, statement
   * pool, driver socket) shared by `disconnectBang` and `reconnect`. Does NOT
   * touch the transaction manager — callers that need `reset_transaction`
   * (disconnect!) get it from the base `disconnectBang`; `reconnect` deliberately
   * preserves the stack for restore.
   *
   * @internal
   */
  private _closeRawHandle(): void {
    this._inTransaction = false;
    this._connectionConfigured = false;
    this._statementPool?._detach();
    this._statementPool = null;
    if (this._client) {
      const ending = this._client.end().catch(() => {});
      this._endingClient = this._endingClient ? this._endingClient.then(() => ending) : ending;
      this._client = null;
    }
  }

  /**
   * Mirrors Rails' `Mysql2Adapter#discard!`. Used just before a forked
   * process sheds a connection inherited from its parent. Rails sets
   * `@raw_connection&.automatic_close = false` then nulls the handle so the
   * abandoned connection won't close its fd on GC, keeping the parent's live
   * socket intact. node-mysql2 has no `automatic_close`; we mirror the
   * contract by dropping the reference and neutralizing the abandoned socket
   * (`abandonRawSocket`: unref + strip listeners) WITHOUT calling
   * `client.end()`, which would actively close it.
   */
  override discardBang(): void {
    // If a connect is in flight, record its generation so that when it
    // resolves into the gen-mismatch branch it abandons the socket instead
    // of end()ing it (Rails discard! must not communicate with the server).
    if (this._connectingPromise && this._connectingPromiseGen === this._connectGeneration) {
      this._discardedConnectGenerations.add(this._connectGeneration);
    }
    this._connectGeneration++;
    super.discardBang();
    this._inTransaction = false;
    this._connectionConfigured = false;
    this._statementPool?._detach();
    this._statementPool = null;
    const conn = this._client;
    this._client = null;
    abandonRawSocket(conn);
  }

  /**
   * Close the persistent connection permanently. Unlike disconnectBang(),
   * this is not reconnectable — subsequent execute() calls will throw.
   */
  async close(): Promise<void> {
    this._permanentlyClosed = true;
    this._connectGeneration++;
    this._inTransaction = false;
    this._connectionConfigured = false;
    this._statementPool?._detach();
    this._statementPool = null;
    if (this._client) {
      await this._client.end();
      this._client = null;
    }
    if (this._endingClient) {
      await this._endingClient;
      this._endingClient = null;
    }
    if (this._connectingPromise) {
      try {
        const conn = await this._connectingPromise;
        await conn.end();
      } catch {}
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
          : "Mysql2Adapter: connection not yet established — call execute() or await active() first",
      );
    }
    return this._client;
  }

  /** @internal */
  override async configureConnection(): Promise<void> {
    // In Rails this sets @raw_connection.query_options[:as] = :array and
    // database_timezone on the single raw connection. We have a single
    // persistent connection here too; mysql2's typeCast handles temporal
    // fields and results are returned as objects (not arrays).
    // The database_timezone equivalent ({@link _databaseTimezone}) is seeded
    // from the global default here and re-synced per-query in perform_query,
    // mirroring Rails' `query_options[:database_timezone] = default_timezone`.
    // This reseed is UNGATED: Rails reassigns database_timezone on every
    // configure_connection call, and the value is not connect-once state (it
    // also re-syncs per query), so it runs whenever configureConnection is
    // invoked.
    this._syncDatabaseTimezone();
    // Connect-once work (checkVersion and any future connect-time-only logic)
    // is gated so it runs exactly once per physical socket — whether reached
    // via the eager connect path (_ensureClient) or reconnectBang's argless
    // attemptConfigureConnection. Mirrors PostgreSQLAdapter's
    // _maybeConfigureConnection gate. Reset to false on raw-handle teardown so
    // the next connect re-runs it.
    // Only the connect-once warm+check needs a live socket. Rails'
    // configure_connection always runs with @raw_connection set (called from
    // connect!/reconnect! once the driver connection exists); a standalone
    // configureConnection() on a not-yet-connected adapter (the timezone-seed
    // reseed path) must not flip the gate or bootstrap an unawaited connect via
    // getDatabaseVersion — so bail before the gate when there's no `_client`.
    if (this._connectionConfigured || !this._client) return;
    this._connectionConfigured = true;
    await super.configureConnection();
  }

  /**
   * Mirrors: Mysql2Adapter#full_version (mysql2_adapter.rb:164-166) — a bare
   * `database_version.full_version_string`, which fetches on demand.
   *
   * @internal
   */
  override async fullVersion(): Promise<string | null> {
    return (await this.databaseVersion).fullVersionString;
  }

  /**
   * Mirrors: Mysql2Adapter#get_full_version (mysql2_adapter.rb:168-170). No
   * memo and no side effects: `database_version` is the only memo in the Rails
   * chain. Like Rails' `any_raw_connection.server_info[:version]`, the banner
   * is read off the connection's handshake state rather than queried —
   * node-mysql2 keeps the parsed handshake on `_handshakePacket`
   * (mysql2/lib/base/connection.js:135, `serverVersion` per
   * lib/packets/handshake.js:62) of the core connection, which the promise
   * wrapper we hold delegates to as `.connection`
   * (mysql2/lib/promise/connection.js:12). It carries the same string the Ruby
   * driver's
   * `server_info[:version]` reports. An absent banner is Ruby's nil: it is
   * passed through so it reaches `versionString` and raises there, where Rails'
   * nil does.
   * @internal
   */
  override async getFullVersion(): Promise<string | null> {
    type Handshake = { _handshakePacket?: { serverVersion?: string } };
    const conn = (await this.anyRawConnection()) as unknown as
      | (Handshake & { connection?: Handshake })
      | null;
    return (conn?.connection ?? conn)?._handshakePacket?.serverVersion ?? null;
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
    const {
      typeCast: userTypeCast,
      strict: _strict,
      waitTimeout: _wt,
      variables: _vars,
      initSql,
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

    // Rails' `new_client` is `::Mysql2::Client.new(config)` with the errno
    // rescue attached to the method itself (mysql2_adapter.rb:24-37), so the
    // typed NoDatabaseError / DatabaseConnectionError is raised from here
    // rather than from `connect`.
    let conn: mysql.Connection;
    try {
      conn = await mysql.createConnection({
        supportBigNumbers: true,
        ...(connOptions as mysql.ConnectionOptions),
        typeCast: composedTypeCast,
      });
    } catch (err) {
      if (!(err instanceof Error)) throw new ConnectionNotEstablished(String(err));
      switch ((err as { errno?: number }).errno) {
        case Mysql2Adapter.ER_BAD_DB_ERROR:
          throw NoDatabaseError.dbError(
            (connOptions as { database?: string }).database ?? "unknown",
          );
        case Mysql2Adapter.ER_DBACCESS_DENIED_ERROR:
        case Mysql2Adapter.ER_ACCESS_DENIED_ERROR:
          throw DatabaseConnectionError.usernameError(
            config.user ?? parseUriField(config, "username") ?? "unknown",
          );
        case Mysql2Adapter.ER_CONN_HOST_ERROR:
        case Mysql2Adapter.ER_UNKNOWN_HOST_ERROR:
          throw DatabaseConnectionError.hostnameError(
            config.host ?? parseUriField(config, "hostname") ?? "unknown",
          );
        default:
          throw new ConnectionNotEstablished(err.message, { cause: err });
      }
    }

    if (initSql) {
      try {
        await conn.query(initSql);
      } catch (err) {
        conn.end().catch(() => {});
        throw err;
      }
    }
    return conn;
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
      this._poolConfig.charset ??
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
  // The node-mysql2 driver's client-side "Can't add new command when
  // connection is in closed state" error (base/connection.js#_addCommandClosedState)
  // carries no `code`/`errno`. It fires when the socket was severed out from
  // under the adapter (e.g. a `wait_timeout` remote disconnect), the analogue
  // of Rails' Mysql2::Error::ConnectionError. Without this the raw driver error
  // surfaces untranslated instead of the retryable ConnectionFailed. Match on
  // the message: the `fatal` flag is stripped by the time the error reaches
  // translation (it is re-wrapped in the withRawConnection retry path).
  if (/add new command when connection is in closed state/i.test(e.message)) {
    return true;
  }
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

// `executeMutation` is this adapter's write/DDL primitive (reads go through the
// overridden `execQuery`), so dirtying it clears the query cache on writes and
// schema changes — the trails analogue of Rails' `dirties_query_cache base,
// :execute` for the write side.
// Mirrors: Mysql2::DatabaseStatements#cast_result — builds an ActiveRecord::Result
// from the raw {rows, fields} internalExecute returns, replacing the abstract
// throwing stub so internalExecQuery/query_value work on MySQL.
(Mysql2Adapter.prototype as unknown as { castResult: typeof mysql2CastResult }).castResult =
  mysql2CastResult;

// `dirties_query_cache` for the write methods this adapter OVERRIDES (Rails
// query_cache.rb:13). Overridden methods must be wrapped on the concrete class,
// not on AbstractAdapter, or the override would run unwrapped. The write methods
// this adapter does NOT override (`execInsert`/`execUpdate`/`execDelete`/`execInsertAll`/
// `truncateTables`/`restartDbTransaction`) are wired once on AbstractAdapter.
// Each logical write clears the cache exactly once; the still-lower
// `executeMutation` these funnel through is deliberately NOT wrapped (DDL runs
// through the wired `execute`, as in Rails), and reads route through
// `internalExecQuery` (never tripping the wrapper).
dirtiesQueryCache(Mysql2Adapter, "rollbackDbTransaction", "rollbackToSavepoint");
dirtiesQueryCache(Mysql2Adapter, "execute");

// Mirrors `include Mysql2::DatabaseStatements` — `perform_query` is an instance
// method of the adapter, so `raw_execute`'s `this.performQuery(...)` dispatch
// resolves here (mysql2/database_statements.rb:41).
Mysql2Adapter.prototype.performQuery = mysql2PerformQuery;
// Rails installs `Mysql2::DatabaseStatements#execute_batch` here too
// (`include Mysql2::DatabaseStatements`, mysql2_adapter.rb:21). trails cannot
// yet, and the blocker is the driver rather than the port: the ported body is
// correct (mysql2/database-statements.ts), but `combine_multi_statements`
// (mysql/database_statements.rb:66-76) joins with `";\n"` unconditionally and
// carries no multi-statement guard. Rails' guard lives in `perform_query`,
// which turns the option on for the batch query itself —
// `raw_connection.set_server_option(OPTION_MULTI_STATEMENTS_ON)`
// (mysql2/database_statements.rb:41-45) — and node-mysql2 ships no command
// class for COM_SET_OPTION: `lib/constants/commands.js:31` defines
// `SET_OPTION: 0x1b` but `lib/commands/` has no `set_option.js`, and the
// option is protocol-level with no SQL equivalent. Installing the override
// therefore fails every batch on a connection not created with
// multi-statements; measured against mariadb:11:
//
//   ER_PARSE_ERROR (1064) ... near 'CREATE TABLE batch_probe (id int)' at line 2
//   sql: 'DROP TABLE IF EXISTS batch_probe;\nCREATE TABLE batch_probe (id int)'
//
// So mysql2 keeps AbstractAdapter's per-statement loop, which is correct
// because it never combines. Story:
// mysql2-execute-batch-routes-through-raw-execute (blocked on the above).

// Mirrors: mysql2_adapter.rb:190-198 — adapter-scoped type registrations. The
// mysql2 `:string`/`:immutable_string` types coerce booleans to `"1"`/`"0"`
// (not the ActiveModel default `"t"`/`"f"`) so a boolean assigned to a string
// column round-trips as 1/0; `initializeTypeMap` resolves char/varchar/enum/set
// through `Type.lookup(:string, adapter: :mysql2)`.
Type.register("immutable_string", null, { adapter: "mysql2" }, (_symbol, args?) => {
  return new ImmutableStringType({
    true: "1",
    false: "0",
    ...((args as Record<string, unknown>) ?? {}),
  });
});
Type.register("string", null, { adapter: "mysql2" }, (_symbol, args?) => {
  return new StringType({
    true: "1",
    false: "0",
    ...((args as Record<string, unknown>) ?? {}),
  });
});
Type.register("unsigned_integer", UnsignedInteger, { adapter: "mysql2" });
