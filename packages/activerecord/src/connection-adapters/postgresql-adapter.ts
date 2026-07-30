import pg from "pg";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { type Type, ValueType, ArgumentError, BinaryData } from "@blazetrails/activemodel";
import {
  singularize,
  Notifications,
  getErrorReporter,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { sql as arelSql, Nodes, Visitors } from "@blazetrails/arel";
import { isRubyTruthy } from "../ruby-truthy.js";
import { Result } from "../result.js";
import { HashLookupTypeMap } from "../type/hash-lookup-type-map.js";
import { TypeMap } from "../type/type-map.js";
import { ActiveRecord } from "../ar-config.js";
import { Name, Utils } from "./postgresql/utils.js";
import {
  checkAllForeignKeysValidBang,
  disableReferentialIntegrity,
} from "./postgresql/referential-integrity.js";
import { Column } from "./postgresql/column.js";
import { ExplainPrettyPrinter } from "./postgresql/explain-pretty-printer.js";
import {
  quote as pgQuote,
  typeCast as pgTypeCast,
  quoteTableName as pgQuoteTableName,
  quoteColumnName as pgQuoteColumnName,
  quotedDate as pgQuotedDate,
  quoteString as pgQuoteString,
  quoteTableNameForAssignment as pgQuoteTableNameForAssignment,
  quoteDefaultExpression as pgQuoteDefaultExpression,
  quotedBinary as pgQuotedBinary,
  columnNameMatcher as pgColumnNameMatcher,
  columnNameWithOrderMatcher as pgColumnNameWithOrderMatcher,
} from "./postgresql/quoting.js";
import { TypeMapInitializer, type PgTypeRow } from "./postgresql/oid/type-map-initializer.js";
import { Money } from "./postgresql/oid/money.js";
import { Range as OidRange } from "./postgresql/oid/range.js";
import { Data as ArrayData } from "./postgresql/oid/array.js";
import { Data as XmlData } from "./postgresql/oid/xml.js";
import { Data as BitData } from "./postgresql/oid/bit.js";
import {
  initializeInstanceTypeMap,
  initializeTypeMap as staticInitializeTypeMap,
} from "./postgresql/type-map-init.js";
import { inspectExplainOption } from "./abstract/database-statements.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { InsertBuilder } from "../insert-all.js";
import type { AdapterName } from "./abstract-adapter.js";
import type { PostgreSQLAdapterOptions } from "./pool-config.js";
import {
  ActiveRecordError,
  AdapterError,
  ConnectionFailed,
  ConnectionNotEstablished,
  DatabaseAlreadyExists,
  DatabaseConnectionError,
  Deadlocked,
  InvalidForeignKey,
  LockWaitTimeout,
  NoDatabaseError,
  NotNullViolation,
  PreparedStatementCacheExpired,
  QueryCanceled,
  RangeError as ActiveRecordRangeError,
  RecordNotUnique,
  SerializationFailure,
  StatementInvalid,
  ValueTooLong,
  SQLWarning,
} from "../errors.js";
import { AbstractAdapter, RAW_CONNECTION_DEPRECATION_MESSAGE } from "./abstract-adapter.js";
import { deprecator } from "../deprecator.js";
import { captureUnwrappedExecute, dirtiesQueryCache } from "./abstract/query-cache.js";
import { PostgreSQLSchemaStatements } from "./postgresql/schema-statements-class.js";
import type { JoinTableOptions } from "./abstract/schema-statements.js";
import { SchemaStatements } from "./abstract/schema-statements.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";
import {
  transactionIsolationLevels,
  preprocessQuery,
  temporalToBindString,
  extractTableRefFromInsertSql,
  sqlForInsert,
  execInsertReturningReadback,
} from "./abstract/database-statements.js";
import { makeGetTypeParser } from "./postgresql/temporal-type-parsers.js";

const getTemporalTypeParser = makeGetTypeParser(pg.types);
const TEMPORAL_OIDS = new Set([1082, 1083, 1114, 1184, 1266]);
const OID_INTERVAL = 1186;
const OID_INTERVAL_ARRAY = 1187;
const OID_MONEY = 790;
import {
  READ_QUERY,
  buildTruncateStatements as pgBuildTruncateStatements,
  executeBatch as pgExecuteBatch,
  suppressCompositePrimaryKey,
  castResult,
  performQuery,
  affectedRows as pgAffectedRows,
  handleWarnings,
  returningColumnValues as pgReturningColumnValues,
} from "./postgresql/database-statements.js";
import type { CreateDatabaseOptions, PgIndexDefinition } from "./postgresql/schema-statements.js";
import {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
  TableDefinition as PgTableDefinition,
  AlterTable as PgAlterTable,
  type Table as PgTable,
  type ExclusionConstraintOptions,
  type UniqueConstraintOptions,
} from "./postgresql/schema-definitions.js";
import { TypeMetadata as PgTypeMetadata } from "./postgresql/type-metadata.js";
import {
  CheckConstraintDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  ForeignKeyDefinition,
  IndexDefinition as AbstractIndexDefinition,
  TableDefinition as AbstractTableDefinition,
  type ColumnOptions,
  type ColumnType,
  type ForeignKeyLookupOptions,
  type AddForeignKeyOptions,
} from "./abstract/schema-definitions.js";
import { SchemaCreation as PgSchemaCreation } from "./postgresql/schema-creation.js";
import { SchemaDumper as PgSchemaDumper } from "./postgresql/schema-dumper.js";
import type { SchemaSource } from "../schema-dumper.js";
import { pgDatetimeConfig } from "./postgresql/pg-datetime-config.js";
import { abandonRawSocket } from "./abandon-raw-socket.js";
import {
  POSTGRESQL_NATIVE_DATABASE_TYPES,
  postgresqlNativeDatabaseTypes,
  type NativeDatabaseTypes,
} from "./abstract/native-database-types.js";

const OID_JSON = 114;
const OID_JSONB = 3802;

// Internal liveness flags node-pg sets on its `pg.Client` (lib/client.js).
// Not part of pg's public typings, so we narrow the client through this shape
// to mirror libpq's `PGconn#finished?`. See `rawConnectionFinished()`.
interface PgClientLiveness {
  _ending?: boolean;
  _ended?: boolean;
  _connectionError?: boolean;
  _queryable?: boolean;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  try {
    return new Error(String(value));
  } catch {
    return new Error(Object.prototype.toString.call(value));
  }
}

/**
 * PostgreSQL adapter — connects ActiveRecord to a real PostgreSQL database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter
 *
 * Accepts either a connection string (`postgres://...`) or a merged
 * config hash — `pg.PoolConfig` keys for the driver, plus Rails'
 * adapter-level keys (`statementLimit`, `preparedStatements`) stripped
 * into the adapter before `pg.Pool` is built. Matches Rails' database.yml
 * shape where driver params and adapter knobs share one hash.
 * Uses a connection pool internally for concurrent access.
 */
export class PostgreSQLAdapter extends AbstractAdapter implements DatabaseAdapter {
  override get adapterName(): AdapterName {
    return "postgres";
  }

  static columnNameMatcher(): RegExp {
    return pgColumnNameMatcher();
  }

  static columnNameWithOrderMatcher(): RegExp {
    return pgColumnNameWithOrderMatcher();
  }

  // Mirrors Rails' PostgreSQLAdapter.dbconsole, which exports PG* env vars
  // before exec'ing psql. We can't mutate the process environment (no
  // process.* access), so we return the env map the PTY exec would set;
  // PGPASSWORD is included only when `includePassword` is set, matching Rails.
  static override dbconsole(
    config: Record<string, unknown> = {},
    options: { includePassword?: boolean } = {},
  ): Record<string, string> {
    const env: Record<string, string> = {};
    if (isRubyTruthy(config.username)) env.PGUSER = String(config.username);
    if (isRubyTruthy(config.host)) env.PGHOST = String(config.host);
    if (isRubyTruthy(config.port)) env.PGPORT = String(config.port);
    if (isRubyTruthy(config.password) && options.includePassword) {
      env.PGPASSWORD = String(config.password);
    }
    if (isRubyTruthy(config.sslmode)) env.PGSSLMODE = String(config.sslmode);
    if (isRubyTruthy(config.sslcert)) env.PGSSLCERT = String(config.sslcert);
    if (isRubyTruthy(config.sslkey)) env.PGSSLKEY = String(config.sslkey);
    if (isRubyTruthy(config.sslrootcert)) env.PGSSLROOTCERT = String(config.sslrootcert);
    const variables = config.variables as Record<string, unknown> | undefined;
    if (variables) {
      // Rails: PGOPTIONS = variables.filter_map { "-c name=value" unless :default }
      const pgOptions = Object.entries(variables)
        .filter(([, v]) => v !== ":default")
        .map(([name, v]) => `-c ${name}=${String(v).replace(/[ \\]/g, "\\$&")}`)
        .join(" ");
      if (pgOptions) env.PGOPTIONS = pgOptions;
    }
    return env;
  }

  override get active(): boolean {
    // Rails' active? starts with `return false unless @raw_connection`
    // (postgresql_adapter.rb); the ping half can't run in a sync getter.
    return this._rawConnection !== null && !this._closed && this._pgClientOptions != null;
  }

  // Mirrors Rails' `PostgreSQLAdapter#connected?`
  // (`!(@raw_connection.nil? || @raw_connection.finished?)`,
  // postgresql_adapter.rb:343), which overrides the base `connected?`
  // (`!@raw_connection.nil?`, abstract_adapter.rb:649). The null check is the
  // base behavior; PG additionally rejects a handle whose socket is gone via
  // libpq's `PGconn#finished?` (`_rawConnectionFinished` below).
  override isConnected(): boolean {
    return this._connection !== null && !this._rawConnectionFinished();
  }

  /**
   * Mirrors libpq's `PGconn#finished?` (the `@raw_connection.finished?` half of
   * Rails' `connected?`) over node-pg's `pg.Client`. A client is "finished" once
   * its socket is gone: `end()` was called (`_ending`/`_ended`) or a post-connect
   * error fired and flipped it un-queryable (`_queryable === false` — set by pg's
   * `_handleErrorEvent`, e.g. a server-side `pg_terminate_backend`/FATAL or a
   * dropped socket). `_connectionError` is included defensively for the
   * connection-phase fatal (lib/client.js:376), though `isConnected()`'s null
   * guard already short-circuits before `_rawConnection` is published post-connect.
   * Verified against the pinned `pg@8.20` Client internals (lib/client.js:
   * `_ending`/`_ended`/`_queryable`/`_connectionError`).
   * @internal
   */
  private _rawConnectionFinished(): boolean {
    const client = this._rawConnection as PgClientLiveness | null;
    if (client === null) return false;
    return (
      client._ending === true ||
      client._ended === true ||
      client._connectionError === true ||
      client._queryable === false
    );
  }

  // Mirrors: PostgreSQLAdapter::NATIVE_DATABASE_TYPES (postgresql_adapter.rb:134)
  static readonly NATIVE_DATABASE_TYPES: NativeDatabaseTypes = POSTGRESQL_NATIVE_DATABASE_TYPES;

  // Mirrors: PostgreSQLAdapter.datetime_type class_attribute (postgresql_adapter.rb:123).
  // Proxied through pgDatetimeConfig so OID::DateTime.realTypeUnlessAliased can read
  // the current value without creating a circular import.
  static get datetimeType(): string {
    return pgDatetimeConfig.datetimeType;
  }
  static set datetimeType(v: string) {
    pgDatetimeConfig.datetimeType = v;
  }

  // Mirrors: PostgreSQLAdapter.create_unlogged_tables class_attribute (postgresql_adapter.rb:105).
  // Pass this value as `unlogged` when constructing a PostgreSQL TableDefinition.
  static createUnloggedTables = false;

  /** Mirrors: PostgreSQLAdapter.decode_dates class_attribute (postgresql_adapter.rb:132). */
  static decodeDates = true;

  private static _spCounter = 0;
  // Mirrors Rails' `@raw_connection` on PostgreSQLAdapter — one persistent
  // pg.Client owned by the adapter for its lifetime. The trails outer
  // ConnectionPool is the only pooling layer; concurrent callers under a
  // pinned context all share this single client and queue on its socket.
  //
  // This is the single base `_connection` slot, not a parallel one: Rails'
  // `@raw_connection` IS the one connection ivar every adapter shares, and
  // trails unifies PG onto the inherited `_connection` field so base helpers
  // (`active`, `secondsSinceLastActivity`, `validRawConnection`, `isConnected`)
  // see PG's live handle with no PG-specific shim. `_rawConnection` is kept as
  // a thin typed accessor so the PG lifecycle code (which needs the concrete
  // `pg.Client`) reads naturally; the base field is typed `AbstractAdapter |
  // null`, so the accessor narrows it.
  private get _rawConnection(): pg.Client | null {
    return this._connection as unknown as pg.Client | null;
  }
  private set _rawConnection(value: pg.Client | null) {
    this._connection = value as unknown as AbstractAdapter | null;
    if (value) {
      // Register this client's DEALLOCATE serializer so a StatementPool built
      // for it (via buildStatementPool) deallocates through the adapter-owned
      // maintenance queue rather than fire-and-forget — without the pool
      // constructor needing a non-Rails-shaped extra argument. Mirrors Rails,
      // where StatementPool#dealloc reaches @connection.@raw_connection to issue
      // the DEALLOCATE under the connection's control (postgresql_adapter.rb:307).
      pgDeallocSerializers.set(value, (deallocSql) => {
        // Fire-and-forget by contract (serializer is typed void; callers ignore
        // the result). The maintenance queue owns error handling and ordering.
        void this._enqueueMaintenance(() => value.query(deallocSql));
      });
    }
  }
  /**
   * The node-pg analogue of `PG::Connection.conndefaults_hash.keys + [:requiressl]`
   * (postgresql_adapter.rb:330-331). libpq's conndefaults enumerates the keywords
   * libpq itself accepts; node-pg does not talk to libpq, so its accepted keyword
   * set is every key `pg.Client` actually reads. That is derived from the
   * pinned pg@8.20 SOURCE, not from `@types/pg`: the published `ClientConfig`
   * interface is narrower than the driver, omitting `binary`, `replication`,
   * `enableChannelBinding`, `connection` and `Promise`. Slicing against the
   * types would silently reject params node-pg accepts — the same silent-drop
   * failure this allowlist exists to prevent. The two read sites are:
   *   - `pg/lib/connection-parameters.js:63-127` — user, database, password,
   *     port, host, binary, options, ssl, client_encoding, replication,
   *     application_name, fallback_application_name, statement_timeout,
   *     lock_timeout, idle_in_transaction_session_timeout, query_timeout,
   *     connectionTimeoutMillis, keepAlive, keepAliveInitialDelayMillis
   *     (plus `connectionString`, which it parses).
   *   - `pg/lib/client.js:62-99` — Promise, types, enableChannelBinding,
   *     connection, stream, binary, connectionTimeoutMillis.
   * `Promise` and `connection` are deprecated in pg@9 but accepted today;
   * Rails slices against what the driver accepts, so they stay in.
   *
   * `database` is deliberately NOT renamed to Rails' `dbname`: Rails renames
   * because libpq's keyword is `dbname`, whereas node-pg's keyword IS `database`
   * (ConnectionParameters reads `config.database`) and it has no `dbname` key at
   * all. Renaming would drop the database name. This is an intentional
   * divergence from postgresql_adapter.rb:326.
   * @internal
   */
  private static readonly VALID_CONN_PARAM_KEYS: ReadonlySet<string> = new Set([
    "user",
    "database",
    "password",
    "port",
    "host",
    "connectionString",
    "keepAlive",
    "stream",
    "statement_timeout",
    "ssl",
    "query_timeout",
    "lock_timeout",
    "keepAliveInitialDelayMillis",
    "idle_in_transaction_session_timeout",
    "application_name",
    "fallback_application_name",
    "connectionTimeoutMillis",
    "types",
    "options",
    "client_encoding",
    "binary",
    "replication",
    "enableChannelBinding",
    "connection",
    "Promise",
  ]);

  /**
   * Mirrors the whole `conn_params` pipeline of `PostgreSQLAdapter#initialize`
   * (postgresql_adapter.rb:322-331), in Rails' order:
   *
   *   1. `conn_params = @config.compact` — drop absent values so node-pg
   *      applies its own defaults.
   *   2. `conn_params[:user] = conn_params.delete(:username) if conn_params[:username]`
   *      — map the AR param name onto the driver's. Applied by the CALLER
   *      (shared `isRubyTruthy` guard, #4964); this helper receives the
   *      already-mapped hash.
   *   3. `conn_params.slice!(*valid_conn_param_keys)` — forward only keys the
   *      driver understands, so Rails-native keys (`adapter`, `pool`,
   *      `checkoutTimeout`, `migrationsPaths`, ...) and typo'd driver keys are
   *      dropped here rather than silently ignored by the driver.
   *
   * The order is load-bearing: slicing before the mapping would drop `username`
   * before it could be renamed, and node-pg would then connect as the OS user
   * instead of failing (`user` is what `ConnectionParameters` reads; unknown
   * keys are ignored). The call site therefore slices the mapped hash.
   * @internal
   */
  private static _sliceValidConnParams(config: Record<string, unknown>): pg.ClientConfig {
    const sliced: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      // Ruby's `compact` drops nil; both `undefined` and `null` are the JS
      // spelling of an absent value in a database.yml-shaped config.
      if (value === undefined || value === null) continue;
      if (!PostgreSQLAdapter.VALID_CONN_PARAM_KEYS.has(key)) continue;
      sliced[key] = value;
    }
    return sliced as pg.ClientConfig;
  }

  private _pgClientOptions: pg.ClientConfig | null = null;
  // Non-null when a transaction is open on _rawConnection. Always equals
  // _rawConnection while set — kept as a field for legibility of the
  // "in TX?" check at call sites that mirror the prior shape.
  private _client: pg.Client | null = null;
  private _inTransaction = false;
  private _queryInFlight = false;
  private _databaseVersion: number | null = null;
  private _typeMap: HashLookupTypeMap | null = null;
  private _maxIdentifierLength: number | null = null;
  private _useInsertReturning = true;
  // Rails' @mapped_default_timezone: the timezone the session/typemap was last
  // configured for. `null` until the first query configures it, matching Rails'
  // nil start (postgresql_adapter.rb:1094).
  private _mappedDefaultTimezone: "utc" | "local" | null = null;
  private _minMessages = "warning";
  // Memoized search path, backing Rails' @schema_search_path. Populated lazily
  // by schemaSearchPath() and updated by setSchemaSearchPath().
  private _schemaSearchPathMemo: string | null = null;
  private _warnedOids = new Set<number>();
  private _caseInsensitiveCache: Map<string, boolean> = new Map([["citext", false]]);
  private _sessionVariables: Record<string, string | number | boolean | null | "default"> = {};
  // Whether _maybeConfigureConnection has run for the current _rawConnection.
  // Reset on reconnect.
  private _connectionConfigured = false;
  // Whether the eager load_additional_types pass has run for the current
  // physical connection. Reset on disconnect/discard (a brand-new socket needs
  // it) but NOT on resetBang: DISCARD ALL leaves the in-memory type map intact,
  // and the reset reconfigure runs inside the _inFlightReset barrier — issuing
  // the pg_type queries there would deadlock awaitRawConnectionReady.
  private _typeMapEagerLoaded = false;
  // The single StatementPool attached to _rawConnection. PG prepared
  // statements are session-scoped; lifetime tracks _rawConnection.
  private _statementPool: StatementPool | null = null;
  // True when the next checkout should run DEALLOCATE ALL to drain
  // orphaned server-side prepared statements (set by clearCacheBang's
  // reset branch after a rollback).
  private _needsDeallocateAll = false;
  // True after disconnectBang/discardBang/close until the next reconnect.
  // Backs the `active` getter so a torn-down adapter reports inactive
  // even before the next lazy acquire would notice the missing connection.
  private _closed = false;
  // Per-acquire generation. Each _doAcquire captures the current value; a
  // teardown that must invalidate the in-flight acquire bumps it. `discardBang`
  // (Rails' `discard!`) is the only teardown that bumps it AND records the
  // captured generation in `_discardedAcquireGenerations`. A connect that
  // races the discard then (a) is no longer reused by `_acquireFreshClient`
  // (generation mismatch, like mysql2's `_connectingPromiseGen` check) and
  // (b) abandons its raw socket instead of `end()`ing or adopting it when it
  // resolves — surviving a later reconnect that would reset a mutable flag.
  private _acquireGeneration = 0;
  // Generation stamped on the currently-stored `_acquiring` promise.
  private _acquiringGen = -1;
  private _discardedAcquireGenerations = new Set<number>();
  // In-flight connect/configure promise. Concurrent _acquireFreshClient
  // callers converge on this so we never open two pg.Clients in
  // parallel — mirrors Rails' @lock.synchronize around connect (Rails
  // postgresql_adapter.rb:349, abstract_adapter.rb:984).
  private _acquiring: Promise<pg.Client> | null = null;
  // In-flight reset promise (ROLLBACK + DISCARD ALL). Query paths await
  // this before proceeding so no query can interleave between the two
  // SQL commands that resetBang fires asynchronously.
  private _inFlightReset: Promise<void> | null = null;
  // Serializes out-of-band maintenance SQL on the pinned client — DEALLOCATE
  // (statement-pool eviction) and resetBang's ROLLBACK + DISCARD ALL — so these
  // never fire-and-forget onto a client that's already executing a query
  // (node-pg's "already executing a query" deprecation, the wire-protocol-desync
  // seam). Each op chains onto the previous; query-acquisition paths drain this
  // (alongside _inFlightReset) before yielding the socket so a pending DEALLOCATE
  // can't race the next user query. It is ALSO the tail the full per-query mutex
  // (`_serializePinnedQuery`) chains onto, so user queries, DEALLOCATE, ROLLBACK,
  // and DISCARD ALL all serialize on this one chain — a single wire, no overlap.
  private _maintenanceTail: Promise<void> = Promise.resolve();
  // Accumulates PG NOTICE/WARNING messages fired during the current query.
  // Cleared before each query; processed by _flushWarnings after.
  private _noticeReceiverSqlWarnings: Array<{
    level?: string;
    message?: string;
    code?: string;
  }> = [];
  // Rails' `statement_limit` database.yml key — max prepared
  // statements cached per session before LRU eviction (default 1000).
  private _statementLimit = 1000;

  /**
   * Maximum prepared statements cached per connection.
   *
   * Mirrors: `database.yml`'s `statement_limit` — read by Rails as
   * `config[:statement_limit]` in PostgreSQLAdapter#initialize.
   *
   * @noRailsEquivalent `statement_limit` is a `database.yml` config key Rails reads as
   *   `config[:statement_limit]` in
   *   each adapter's `initialize` (abstract_mysql_adapter.rb, postgresql_adapter.rb,
   *   sqlite3_adapter.rb) — a config option, never a Ruby `def`, so there is nothing for the
   *   extractor to match. trails exposes the same setting as a validated accessor on the adapter,
   *   identically on all three.
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
    // Resize the single StatementPool immediately so a mid-session
    // change is visible. Rails reads `statement_limit` once at pool
    // construction; we mirror that for new pools and propagate setter
    // changes to the live pool.
    this._statementPool?.setMaxSize(value);
  }

  constructor(config: string | (pg.PoolConfig & PostgreSQLAdapterOptions));
  /**
   * @deprecated Raw-connection overload (abstract_adapter.rb:141): pass a
   * pre-opened `pg.Client`. Emits a deprecation warning; the connection is
   * stashed for promotion. Prefer the config-hash / connection-string form.
   */
  constructor(rawConnection: pg.Client, deprecatedConfig?: Record<string, unknown> | null);
  constructor(
    config: string | (pg.PoolConfig & PostgreSQLAdapterOptions) | pg.Client,
    deprecatedConfig?: Record<string, unknown> | null,
  ) {
    super();
    // Rails: `PostgreSQLAdapter` inherits the abstract adapter's
    // `default_prepared_statements = true`.
    this.preparedStatements = true;
    // Deprecated raw-connection overload (abstract_adapter.rb:141): a
    // pre-opened pg.Client passed positionally is stashed in
    // `_unconfiguredConnection`, mirroring Rails' `initialize`, which likewise
    // only stashes (`@unconfigured_connection`) — usability comes later via
    // `verify!`. The base `verifyBang` (abstract-adapter.ts) promotes the
    // stash, but PostgreSQLAdapter OVERRIDES `verifyBang` and does not yet
    // consume `_unconfiguredConnection` (it treats `_pgClientOptions == null`
    // as closed). Wiring the stashed client into PG's connection-acquisition
    // path so the overload can serve queries is a tracked follow-up
    // (a larger restructure); for now the overload constructs + warns + stashes
    // but the connection is not yet usable for queries on PG.
    if (PostgreSQLAdapter._isDeprecatedRawConnectionArg(config)) {
      deprecator().warn(RAW_CONNECTION_DEPRECATION_MESSAGE);
      this._acceptDeprecatedRawConnection(config, deprecatedConfig);
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
    if (typeof config === "string") {
      this._minMessages = "warning";
      this._sessionVariables = {};
      this._pgClientOptions = {
        connectionString: config,
        types: {
          getTypeParser: (oid: number, format?: string) => {
            // PG interval (OID 1186): return the raw ISO 8601 string so the
            // AR Interval type can Duration.parse() it (Rails sets
            // intervalstyle = iso_8601 per connection). For binary format
            // pg-types ships no interval decoder, so explicitly delegate to
            // the built-in (text-only assumption: configureConnection sets
            // intervalstyle, so we never receive binary intervals in
            // practice — this branch is documented passthrough).
            if (oid === OID_INTERVAL) {
              return format === "binary"
                ? pg.types.getTypeParser(OID_INTERVAL, "binary")
                : (v: unknown) => v;
            }
            // PG interval[] (OID 1187): pg-types hard-codes parseInterval as
            // the element parser, bypassing our OID 1186 override. Return the
            // raw array literal so AR Array.deserialize parses the elements
            // through Interval.castValue (Duration.parse on ISO 8601).
            if (oid === OID_INTERVAL_ARRAY && format !== "binary") return (v: unknown) => v;
            if ((oid === OID_JSON || oid === OID_JSONB) && format !== "binary")
              return (v: unknown) => v;
            // PG money (OID 790): the wire format is locale-formatted text
            // ("$123.45"). Decode to the deserialized decimal string via the
            // Money type so result values from raw expressions
            // (SUM(id * wealth), pluck(Arel.sql)) come back as the bare number
            // string — mirrors Rails' money type-map coder.
            if (oid === OID_MONEY && format !== "binary")
              return (v: unknown) => (typeof v === "string" ? MoneyDecoder.decode(v) : v);
            return oid === 1082 && !PostgreSQLAdapter.decodeDates
              ? format === "binary"
                ? pg.types.getTypeParser(oid, "binary")
                : (v: unknown) => v
              : getTemporalTypeParser(oid, format);
          },
        },
      };
      // pg.Client connects lazily on the first acquisition path
      // (_acquireFreshClient); the constructor only stores config so
      // that adapter construction stays synchronous to match Rails.
      return;
    }
    // Rails' database.yml merges driver connection params + adapter
    // options into one hash; AbstractAdapter#initialize reads
    // `config[:statement_limit]` / `config[:prepared_statements]`
    // and hands the rest to the driver. Validate & apply the
    // adapter-level keys FIRST so an invalid value fails before
    // the pg.Client is opened.
    const {
      statementLimit,
      preparedStatements,
      insertReturning,
      advisoryLocks,
      minMessages,
      variables,
      ...pgConfig
    } = config as pg.PoolConfig & PostgreSQLAdapterOptions;
    if (statementLimit !== undefined) this.statementLimit = statementLimit;
    if (preparedStatements !== undefined) this.preparedStatements = preparedStatements;
    if (advisoryLocks !== undefined) {
      this._advisoryLocksEnabled =
        PostgreSQLAdapter.typeCastConfigToBoolean(advisoryLocks) !== false;
    }
    if (insertReturning !== undefined) this._useInsertReturning = insertReturning;
    if (minMessages !== undefined && typeof minMessages !== "string") {
      throw new TypeError(`minMessages must be a string, got ${typeof minMessages}`);
    }
    if (variables !== null && variables !== undefined) {
      if (typeof variables !== "object" || Array.isArray(variables)) {
        throw new TypeError("variables must be a plain object");
      }
      const variablesPrototype = Object.getPrototypeOf(variables);
      if (variablesPrototype !== Object.prototype && variablesPrototype !== null) {
        throw new TypeError("variables must be a plain object");
      }
      for (const [key, val] of Object.entries(variables)) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(key)) {
          throw new Error(`Invalid PostgreSQL session variable name: ${JSON.stringify(key)}`);
        }
        if (
          val !== null &&
          typeof val !== "string" &&
          typeof val !== "boolean" &&
          typeof val !== "number"
        ) {
          throw new TypeError(
            `variables[${JSON.stringify(key)}] must be string | number | boolean | null, got ${typeof val}`,
          );
        }
      }
    }
    this._minMessages = minMessages ?? "warning";
    // Freeze a shallow copy so post-construction mutation can't bypass the
    // key/value validation above and introduce un-sanitized SQL fragments.
    this._sessionVariables = Object.freeze({ ...(variables ?? {}) });
    const userGetTypeParser = (
      pgConfig.types as { getTypeParser?: (oid: number, format?: string) => unknown } | undefined
    )?.getTypeParser;
    // postgresql_adapter.rb:322-326 — "Map ActiveRecords param names to PGs."
    //   conn_params = @config.compact
    //   conn_params[:user] = conn_params.delete(:username) if conn_params[:username]
    // The guard is RUBY truthiness, which differs from JS in both directions:
    // "" is truthy in Ruby (so a blank username maps and overwrites `user`),
    // while `false` is falsy AND survives `compact` (which drops only nils),
    // so `username: false` is the one present value that does NOT map.
    // `isRubyTruthy` encodes exactly that. Without this mapping a Rails-spelled
    // config connects as the OS user rather than failing, because `pg` reads
    // the driver-native `user` and ignores unknown keys.
    const { username: railsUsername, ...pgDriverConfig } = pgConfig as typeof pgConfig & {
      username?: string;
    };
    // The slice runs on the ALREADY-MAPPED hash, matching Rails' order
    // (postgresql_adapter.rb:325 then :331): slicing first would drop
    // `username` before it could be renamed.
    this._pgClientOptions = {
      ...PostgreSQLAdapter._sliceValidConnParams({
        ...pgDriverConfig,
        ...(isRubyTruthy(railsUsername) ? { user: railsUsername } : {}),
      }),
      types: {
        getTypeParser(oid: number, format?: string): unknown {
          // Our Temporal parsers handle text-format for the 5 datetime OIDs.
          // When decodeDates is false, skip the date parser (OID 1082) so
          // pg returns the raw string — mirrors Rails' decode_dates flag.
          // PG interval (OID 1186): return raw ISO 8601 string for AR
          // Interval (intervalstyle = iso_8601 is set on connect). Binary
          // format is delegated to the pg-types built-in — see the
          // matching branch in the connectionString constructor for the
          // text-only-in-practice rationale.
          if (oid === OID_INTERVAL) {
            const fallback =
              format === "binary"
                ? pg.types.getTypeParser(OID_INTERVAL, "binary")
                : (v: unknown) => v;
            return userGetTypeParser?.(oid, format) ?? fallback;
          }
          // PG interval[] (OID 1187): pg-types hard-codes parseInterval as
          // the element parser, so we must override the array OID too. Raw
          // array literal is handed to AR Array.deserialize, which routes
          // each element through Interval.castValue.
          if (oid === OID_INTERVAL_ARRAY && format !== "binary") {
            const fallback = (v: unknown) => v;
            return userGetTypeParser?.(oid, format) ?? fallback;
          }
          if ((oid === OID_JSON || oid === OID_JSONB) && format !== "binary") {
            const fallback = (v: unknown) => v;
            return userGetTypeParser?.(oid, format) ?? fallback;
          }
          // PG money (OID 790): decode locale-formatted text ("$123.45") to the
          // deserialized decimal string via the Money type so SUM(id * wealth)
          // / pluck(Arel.sql(...)) come back as the bare number string —
          // mirrors Rails' money type-map coder.
          if (oid === OID_MONEY && format !== "binary") {
            const fallback = (v: unknown) => (typeof v === "string" ? MoneyDecoder.decode(v) : v);
            return userGetTypeParser?.(oid, format) ?? fallback;
          }
          if (oid === 1082 && !PostgreSQLAdapter.decodeDates) {
            const fallback =
              format === "binary" ? pg.types.getTypeParser(oid, "binary") : (v: unknown) => v;
            return userGetTypeParser?.(oid, format) ?? fallback;
          }
          // For all other OIDs, respect any user-supplied parser first, then
          // delegate to getTemporalTypeParser which falls back to pg built-ins.
          if (TEMPORAL_OIDS.has(oid) && (format === "text" || !format)) {
            return getTemporalTypeParser(oid, format);
          }
          return userGetTypeParser?.(oid, format) ?? getTemporalTypeParser(oid, format);
        },
      },
    };
    // pg.Client connects lazily on first acquisition (see
    // _acquireFreshClient). The error listener is attached after
    // connect() so a server-side FATAL on the live connection doesn't
    // surface as an uncaughtException.
  }

  /**
   * Mirrors: PostgreSQLAdapter#configure_connection. Runs once per new
   * physical connection — tracked by a boolean flag that resets on
   * reconnect. Called (and awaited) inside _acquireFreshClient so errors
   * propagate and misconfigured connections are never handed to user code.
   *
   * Note: the notice listener is NOT attached here. node-pg's
   * client.on("notice", ...) accumulates listeners, whereas Rails uses
   * libpq's set_notice_receiver which is a single-slot replacement.
   * resetBang flips _connectionConfigured back to false to re-run the
   * SET queries after DISCARD ALL; re-attaching the notice listener
   * here would compound on every reset. The listener is attached once
   * per pg.Client lifecycle in _doAcquire instead.
   */
  private async _maybeConfigureConnection(client: pg.Client): Promise<void> {
    if (this._connectionConfigured) return;
    // Rails resets @mapped_default_timezone = nil while installing decoders in
    // configure_connection (postgresql_adapter.rb:1112) so the next
    // update_typemap_for_default_timezone re-applies the session timezone. This
    // is a fresh physical session (reconnect/reset/discard cleared
    // _connectionConfigured), which starts at PostgreSQL's default timezone, so
    // the cache must be invalidated here or the guard would skip reconfiguring.
    this._mappedDefaultTimezone = null;
    // Mirrors: set_standard_conforming_strings — required for correct quoting behaviour.
    await client.query("SET standard_conforming_strings = on");
    // Mirrors: SET intervalstyle — ISO 8601 so intervals parse cleanly.
    await client.query("SET intervalstyle = iso_8601");
    await client.query(`SET client_min_messages TO ${this.quoteLiteral(this._minMessages)}`);
    for (const [key, val] of Object.entries(this._sessionVariables)) {
      if (val === null) continue;
      if (val === "default") {
        await client.query(`SET SESSION ${key} TO DEFAULT`);
      } else {
        const pgVal = val === true ? "on" : val === false ? "off" : String(val);
        await client.query(`SET SESSION ${key} TO ${this.quoteLiteral(pgVal)}`);
      }
    }
    this._connectionConfigured = true;
    // Mirrors Rails' configure_connection, which ends with reload_type_map →
    // initialize_type_map → load_additional_types: an eager full load of every
    // array/range/enum/domain type once per physical connection.
    // Aliasing every scalar OID up front means targeted loadAdditionalTypes
    // misses (columns(), getOidType) always find their element/range subtype in
    // the store — no deferral path needed.
    //
    // The pg_type queries run DIRECTLY on `client` (like the SET statements
    // above), NOT through schemaQuery/withRawConnection. configure runs while
    // the acquire machinery still holds `_acquiring` (and, on resetBang, inside
    // the `_inFlightReset` barrier); routing these queries back through the
    // connection-readiness stack would re-enter connectBang/verify or block on
    // that barrier and deadlock. Issuing them on the raw socket sidesteps all
    // of it, exactly as Rails runs them inline on the raw connection.
    //
    // Gated per physical socket: resetBang's DISCARD ALL leaves the in-memory
    // type map intact, so the reconfigure it triggers can skip the reload.
    if (!this._typeMapEagerLoaded) {
      this._typeMapEagerLoaded = true;
      await this._eagerLoadAdditionalTypes(client);
    }
  }

  /**
   * Run Rails' full `load_additional_types` reload directly on the raw
   * connection `client`, bypassing schemaQuery/withRawConnection. Used only
   * from `_maybeConfigureConnection`, where re-entering the acquire stack would
   * deadlock. Rebuilds the base type map first (mirroring reload_type_map's
   * clear) so the registrations layer onto a fresh map.
   */
  private async _eagerLoadAdditionalTypes(client: pg.Client): Promise<void> {
    this._typeMap = null;
    const initializer = new TypeMapInitializer(this.typeMap);
    for await (const query of this.loadTypesQueries(initializer)) {
      const result = await client.query(query);
      initializer.run(result.rows as unknown as PgTypeRow[]);
    }
  }

  /**
   * Attach the per-connection notice listener that feeds
   * `_noticeReceiverSqlWarnings`. Called once per pg.Client lifecycle
   * from _doAcquire (matches Rails' single-slot set_notice_receiver).
   */
  private _attachNoticeListener(client: pg.Client): void {
    if ((this.constructor as typeof PostgreSQLAdapter).dbWarningsAction === "ignore") return;
    client.on("notice", (msg: { severity?: string; message?: string; code?: string }) => {
      this._noticeReceiverSqlWarnings.push({
        level: msg.severity,
        message: msg.message,
        code: msg.code,
      });
    });
  }

  /**
   * Mirrors: PostgreSQLAdapter.initialize_type_map (class method).
   * Seeds a HashLookupTypeMap with the ~30 known PG types by typname.
   * Exposed as a static so tests and external callers can build their
   * own type_map without instantiating the adapter.
   *
   * Param is the base `TypeMap`, matching the override target
   * `AbstractAdapter.initializeTypeMap`. In Rails `HashLookupTypeMap` and
   * `TypeMap` are deliberately-duplicated standalone classes (neither extends
   * the other — see type/hash_lookup_type_map.rb), so they are nominally
   * unrelated here too and the seeder needs the `HashLookupTypeMap` surface
   * (string|number keys + `(fmod, sql_type)` varargs fetch). An `instanceof`
   * guard narrows soundly to that type — no cast — mirroring Ruby's implicit
   * assumption that PG always builds its type_map as a HashLookupTypeMap.
   */
  static initializeTypeMap(m: TypeMap): void {
    if (!(m instanceof HashLookupTypeMap)) {
      throw new TypeError("initializeTypeMap expects a HashLookupTypeMap");
    }
    staticInitializeTypeMap(m);
  }

  /**
   * Mirrors: PostgreSQLAdapter#type_map. Lazily builds and caches the
   * adapter's HashLookupTypeMap on first access. The map is populated
   * by the instance-level initializer which layers `time`, `timestamp`,
   * `timestamptz` (timezone-aware) on top of the class-level base.
   *
   * @internal
   */
  get typeMap(): HashLookupTypeMap {
    if (this._typeMap == null) {
      this._typeMap = new HashLookupTypeMap();
      // Rails threads @default_timezone into the instance initializer so
      // time / timestamp registrations use the connection's timezone
      // preference. We read the repo-wide default here so that
      // (ActiveRecord.defaultTimezone = ) is honored consistently with the quoting
      // path.
      initializeInstanceTypeMap(this._typeMap, ActiveRecord.defaultTimezone);
    }
    return this._typeMap;
  }

  /**
   * Mirrors: PostgreSQLAdapter#get_oid_type(oid, fmod, column_name, sql_type).
   * On miss, queries pg_type via `loadAdditionalTypes([oid])` and retries
   * before falling back to a ValueType. Rails' get_oid_type is sync
   * because Ruby's PG gem blocks; in Node we return a Promise so the
   * underlying pg_type query can be awaited.
   *
   * @internal
   */
  async getOidType(
    oid: number,
    fmod: number,
    columnName: string,
    sqlType: string = "",
  ): Promise<Type> {
    if (!this.typeMap.has(oid)) {
      await this.loadAdditionalTypes([oid]);
    }
    return this.typeMap.fetch(oid, fmod, sqlType, () => {
      if (!this._warnedOids.has(oid)) {
        this._warnedOids.add(oid);
        console.warn(
          `unknown OID ${oid}: failed to recognize type of '${columnName}'. It will be treated as String.`,
        );
      }
      const fallback = new ValueType();
      this.typeMap.registerType(oid, fallback);
      return fallback;
    });
  }

  /**
   * Mirrors: PostgreSQLAdapter#lookup_cast_type_from_column(column).
   * Synchronous — only consults the already-populated type_map. Rails'
   * get_oid_type auto-loads on miss because Ruby can block; TS callers
   * of this method (e.g. the type-caster that runs during attribute
   * reads) are sync, so missing OIDs resolve to a ValueType here and
   * callers that need miss-loading should call `loadAdditionalTypes`
   * first (as `execQuery` does).
   */
  lookupCastTypeFromColumn(column: {
    oid?: number | null;
    fmod?: number | null;
    sqlType?: string | null;
    name?: string;
  }): Type {
    const oid = column.oid;
    if (oid == null) return new ValueType();
    // Rails' lookup_cast_type_from_column only *looks up* — it never
    // mutates the type_map on miss. Registering a fallback here would
    // poison the map: subsequent getOidType calls would see
    // typeMap.has(oid)=true, skip loadAdditionalTypes, and never
    // resolve the real type. Return a fresh ValueType on miss and
    // leave miss-loading to getOidType / loadAdditionalTypes.
    // columns() batch-loads missing OIDs via loadAdditionalTypes before
    // building Column objects, so OIDs are registered by the time this is
    // called for type-casting during attribute reads.
    return this.typeMap.fetch(oid, column.fmod ?? -1, column.sqlType ?? "", () => new ValueType());
  }

  /**
   * Mirrors: PostgreSQLAdapter#case_insensitive_comparison (via AbstractAdapter).
   * Async override: looks up the column type and checks pg_proc before emitting LOWER.
   * @internal
   */
  override async caseInsensitiveComparison(
    attribute: Nodes.Attribute,
    value: unknown,
  ): Promise<Nodes.Node> {
    const column = await this.columnForAttribute(attribute);
    if (column && (await this.canPerformCaseInsensitiveComparisonFor(column))) {
      return attribute.lower().eq(attribute.relation.lower(value));
    }
    return attribute.eq(value);
  }

  /**
   * Mirrors: PostgreSQLAdapter#can_perform_case_insensitive_comparison_for?(column).
   * Queries pg_proc once per sql_type and caches the result.
   * citext is pre-seeded as false — case-insensitive by definition, LOWER() unnecessary.
   * @internal
   */
  override async canPerformCaseInsensitiveComparisonFor(column: {
    sqlType?: string | null;
  }): Promise<boolean> {
    const sqlType = column.sqlType ?? "";
    if (!sqlType) {
      this._caseInsensitiveCache.set(sqlType, false);
      return false;
    }
    if (this._caseInsensitiveCache.has(sqlType)) {
      return this._caseInsensitiveCache.get(sqlType)!;
    }
    const sql = `
      SELECT (
        exists(
          SELECT * FROM pg_proc
          WHERE proname = 'lower'
            AND proargtypes = ARRAY[${this.quote(sqlType)}::regtype]::oidvector
        ) OR exists(
          SELECT * FROM pg_proc
          INNER JOIN pg_cast
            ON ARRAY[casttarget]::oidvector = proargtypes
          WHERE proname = 'lower'
            AND castsource = ${this.quote(sqlType)}::regtype
        )
      ) AS can_lower`;
    const rows = await this.schemaQuery(sql);
    const result = (rows[0]?.can_lower as boolean) === true;
    this._caseInsensitiveCache.set(sqlType, result);
    return result;
  }

  /**
   * Mirrors: PostgreSQLAdapter#exec_query. Executes a query and returns
   * an ActiveRecord::Result with `columnTypes` populated from the
   * adapter's type_map — each field's dataTypeID resolves to a
   * Type::Value via getOidType so callers can use `result.castValues()`
   * to deserialize values through the right PG OID type.
   *
   * `Result.each()` / `Result.toArray()` build hash-shaped rows from
   * columnIndexes, which still collapse duplicate column names —
   * callers that need the raw positional values should read
   * `result.rows` instead. This override's responsibility is to
   * attach the right Type metadata so explicit casting has what it
   * needs.
   *
   * The mixin-level execQuery returns a Result with empty columnTypes;
   * this override is the Rails-faithful PG version that actually
   * populates them.
   */
  // Public `exec_query` is wrapped by `dirties_query_cache`; the actual work
  // lives in `internal_exec_query` (Rails' structure), which `select_all`
  // routes through so cached reads never clear the cache.
  override async execQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<Result> {
    return this.internalExecQuery(sql, name, binds, options);
  }

  override async internalExecQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<Result> {
    sql = this.preprocessQuery(sql);
    // Release the query client BEFORE any loadAdditionalTypes call —
    // that path re-enters execute() and acquires its own pooled client,
    // and holding both would consume 2 connections per query during
    // type-map warmup.
    interface ArrayQueryResult {
      fields: Array<{ name: string; dataTypeID: number }>;
      rows: unknown[][];
    }
    // Type-cast bind objects (QueryAttribute) → primitives, then run each
    // through `_bindForPg` for Temporal / BinaryData normalization before
    // pg sees them.
    const bindArray = (this.typeCastedBinds(binds) ?? []).map((v) => this._bindForPg(v));
    const rewritten = this.rewriteBinds(sql, bindArray);
    this._noticeReceiverSqlWarnings = [];
    const txPublicQuery = this.currentTransaction().userTransaction;
    const payload: Record<string, unknown> = {
      sql: rewritten,
      name: name ?? "SQL",
      binds: binds ?? [],
      type_casted_binds: bindArray,
      connection: this,
      row_count: 0,
      transaction: txPublicQuery.isOpen() ? txPublicQuery : null,
    };
    const pgResult: ArrayQueryResult = await Notifications.instrumentAsync(
      "sql.active_record",
      payload,
      async () => {
        try {
          // Materialize the pending lazy transaction before the query, mirroring
          // Rails' raw_execute (materialize_transactions defaults true). A no-bind
          // unprepared SELECT inside an open lazy transaction thus emits BEGIN,
          // matching sqlite/MySQL and the Rails
          // `unprepared statement materializes transaction` assertion.
          const r = await this.withRawConnection(
            {
              materializeTransactions: options?.materializeTransactions ?? true,
              allowRetry: options?.allowRetry ?? false,
            },
            async (conn) => {
              const client = conn as unknown as pg.Client;
              try {
                // rowMode: "array" returns rows as positional arrays, preserving
                // duplicate column names and matching the field-index order.
                // Delegates to `_runQuery` so prepared-statement caching and
                // in-txn / out-of-txn cached-plan handling stay in one place.
                return await this._runQuery<ArrayQueryResult>(client, rewritten, bindArray, {
                  rowMode: "array",
                  prepareHint: options?.prepare,
                  onPrepared: (stmtName) => {
                    payload.statement_name = stmtName;
                  },
                });
              } catch (e: any) {
                throw this._translateException(e, rewritten, bindArray);
              }
            },
          );
          payload.row_count = r.rows?.length ?? 0;
          return r;
        } catch (e: any) {
          const translated = this._translateException(e, rewritten, bindArray);
          throw translated;
        }
      },
    );

    const fields = pgResult.fields ?? [];
    // Flush before loadAdditionalTypes — nested execQuery calls reset the buffer.
    this._flushWarnings(rewritten);
    if (fields.length === 0) return Result.fromRowHashes([]);

    // Batch-load any unknown dataTypeIDs in a single pg_type roundtrip.
    // Without this, a SELECT with N distinct unknown OIDs would trigger
    // N sequential getOidType → loadAdditionalTypes queries.
    const missing = new Set<number>();
    for (const f of fields) {
      if (!this.typeMap.has(f.dataTypeID)) missing.add(f.dataTypeID);
    }
    if (missing.size > 0) {
      await this.loadAdditionalTypes([...missing]);
    }

    const columns = fields.map((f) => f.name);
    // Store types under BOTH name and numeric index so Result's
    // columnType lookup works with duplicate column names. Skip the
    // name entry when the field name is an integer-like string — JS
    // object keys are all strings, so `{0: type, "0": other}` would
    // collide and Result would pick the wrong type for one of them.
    const columnTypes: Record<string | number, Type> = {};
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      // fmod isn't on pg.FieldDef; Rails reads it from PG::Result#fmod(i)
      // which isn't exposed by node-pg. Pass -1 so numeric/interval
      // registrations fall into their default (scale-absent) branch.
      const type = await this.getOidType(f.dataTypeID, -1, f.name, "");
      columnTypes[i] = type;
      if (!/^\d+$/.test(f.name)) {
        columnTypes[f.name] = type;
      }
    }
    // pgResult.rows is already positional arrays thanks to rowMode.
    const rowArrays = pgResult.rows;
    return new Result(columns, rowArrays, columnTypes as Record<string, Type>);
  }

  /**
   * Mirrors: PostgreSQLAdapter#load_additional_types(oids = nil). Queries
   * pg_type for user-defined types (enums, domains, arrays, ranges,
   * composites) and registers them via OID::TypeMapInitializer.run.
   *
   * Rails' signature uses oids=nil to mean "reload everything we know";
   * pass an array of OIDs to target a specific miss.
   *
   * @internal
   */
  async loadAdditionalTypes(oids?: number[]): Promise<void> {
    const initializer = new TypeMapInitializer(this.typeMap);
    for await (const query of this.loadTypesQueries(initializer, oids)) {
      const rows = (await this.schemaQuery(query)) as unknown as PgTypeRow[];
      initializer.run(rows);
    }
  }

  /**
   * Mirrors: PostgreSQLAdapter#load_types_queries(initializer, oids). For a
   * specific OID list yields one query; for a full reload yields three
   * (by typname, typtype, array-of-known) — **in order**, because
   * `queryConditionsForArrayTypes` depends on numeric OIDs registered
   * by the first query (`aliasType(row.oid, row.typname)`). Ruby does
   * this with `yield` inside a method; we use an async generator so
   * each query is built fresh after the prior one has run.
   */
  private async *loadTypesQueries(
    initializer: TypeMapInitializer,
    oids?: number[],
  ): AsyncGenerator<string, void, void> {
    const baseQuery = [
      "SELECT t.oid, t.typname, t.typelem, t.typdelim, t.typinput,",
      "       r.rngsubtype, t.typtype, t.typbasetype",
      "FROM pg_type as t",
      "LEFT JOIN pg_range as r ON t.oid = r.rngtypid",
    ].join("\n");

    if (oids && oids.length > 0) {
      // Validate every OID is a finite integer before interpolating
      // into SQL. loadAdditionalTypes is public, so untrusted input
      // could reach us.
      const safe = oids.map((oid) => {
        const n = Number(oid);
        if (!Number.isInteger(n) || n < 0) {
          throw new Error(`loadAdditionalTypes: invalid OID ${String(oid)}`);
        }
        return n;
      });
      yield `${baseQuery}\nWHERE t.oid IN (${safe.join(", ")})`;
      return;
    }
    yield `${baseQuery}\n${initializer.queryConditionsForKnownTypeNames()}`;
    yield `${baseQuery}\n${initializer.queryConditionsForKnownTypeTypes()}`;
    // Generated AFTER the prior two yields have been awaited and run,
    // so the initializer has already registered numeric OIDs via
    // aliasType. If we computed this up front, the array query would
    // typically be empty and fall through to `WHERE 1=0`.
    yield `${baseQuery}\n${initializer.queryConditionsForArrayTypes()}`;
  }

  /**
   * Mirrors: PostgreSQLAdapter#reload_type_map. Clears the memoized
   * type_map and re-runs the instance initializer, matching Rails'
   * reload_type_map behavior when new user-defined types have been
   * created (CREATE TYPE, CREATE DOMAIN, etc).
   */
  async reloadTypeMap(): Promise<void> {
    this._typeMap = null;
    await this.loadAdditionalTypes();
    // A type-map reload signals the database's type universe changed — an
    // extension or user type (hstore, enum, composite) was created or dropped,
    // reassigning OIDs. A cached prepared statement that bound or returned one
    // of those types embeds the now-stale OID in its server-side plan, so
    // re-executing it raises "cache lookup failed for type <oid>". Drop the
    // client-side statement map (NOT clearCacheBang) so the next prepare gets a
    // fresh monotonic name and re-parses against the current OIDs. We
    // deliberately skip the DEALLOCATE: reloadTypeMap runs mid-DDL-transaction
    // (e.g. createEnum), and queuing DEALLOCATEs onto the pinned client there
    // interleaves with the in-flight statement and desyncs the pg protocol.
    // The orphaned server statements keep their old names — never reused — and
    // are reclaimed on session reset/close.
    this._statementPool?.reset();
  }

  /**
   * Rewrite `?` bind placeholders to PostgreSQL `$1, $2, ...` syntax.
   */
  private rewriteBinds(sql: string, binds?: unknown[]): string {
    if (!binds || binds.length === 0) return sql;
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  /**
   * Open (or return) the single persistent pg.Client. Configures the
   * session once and drains any orphaned server-side prepared
   * statements left by a prior PSCE event. All checkouts go through
   * here so configure/drain guarantees hold for every code path.
   *
   * Concurrent callers that hit the slow path (uncached connect, or
   * pre-configure window) converge on a shared `_acquiring` promise
   * so only one pg.Client is ever opened per adapter lifecycle.
   * Mirrors Rails' @lock.synchronize around connect.
   */
  private async _acquireFreshClient(): Promise<pg.Client> {
    if (this._closed || this._pgClientOptions == null) {
      throw new Error("PostgreSQLAdapter: connection is closed");
    }
    // Serialize behind any in-flight reset (ROLLBACK + DISCARD ALL) so no
    // query can interleave between the two commands resetBang fires.
    while (this._inFlightReset) await this._inFlightReset;
    // Drain any pending maintenance op (DEALLOCATE) so it can't race the query
    // we're about to hand the caller on the pinned client.
    await this._maintenanceTail;
    // Re-check after the yield: a concurrent close/disconnect/discard
    // may have run while we were waiting for the reset to complete.
    if (this._closed || this._pgClientOptions == null) {
      throw new Error("PostgreSQLAdapter: connection is closed");
    }
    // Fast path: connection already opened and configured, no drain pending.
    if (this._rawConnection && this._connectionConfigured && !this._needsDeallocateAll) {
      return this._rawConnection;
    }
    // Reuse the in-flight acquire only if it belongs to the current
    // generation. A discardBang() bumps the generation, so its orphaned
    // acquire is bypassed here (a fresh one is opened) rather than adopted
    // — mirrors mysql2's `_connectingPromiseGen === _connectGeneration`.
    if (!this._acquiring || this._acquiringGen !== this._acquireGeneration) {
      const acquireGen = this._acquireGeneration;
      const acquiring = this._doAcquire(acquireGen).finally(() => {
        this._discardedAcquireGenerations.delete(acquireGen);
        // Only clear if we still own the slot — a newer-generation acquire
        // may have replaced us while this one was in flight.
        if (this._acquiring === acquiring) this._acquiring = null;
      });
      this._acquiring = acquiring;
      this._acquiringGen = acquireGen;
    }
    return this._acquiring;
  }

  private async _doAcquire(acquireGen: number): Promise<pg.Client> {
    // Snapshot the connection into a local so a concurrent
    // disconnectBang / discardBang / reconnect that nulls
    // _rawConnection between awaits can't smuggle null into the
    // configure/drain calls or the final return.
    let client = this._rawConnection;
    if (client == null) {
      // Route through newClient so a failed connect is translated to
      // ConnectionNotEstablished / NoDatabaseError (mirrors Rails' connect →
      // new_client) rather than surfacing the raw pg driver error. newClient
      // tears the partial client down on failure.
      let newClient: pg.Client;
      try {
        newClient = await PostgreSQLAdapter.newClient(this._pgClientOptions!);
      } catch (error) {
        // Mirrors Rails' `PostgreSQLAdapter#connect`: `rescue
        // ConnectionNotEstablished => ex; raise ex.set_pool(@pool)`. Rails
        // rescues ONLY ConnectionNotEstablished (which includes
        // DatabaseConnectionError). A NoDatabaseError from new_client is a
        // StatementInvalid, which Rails' connect does not rescue — it
        // propagates with connection_pool == nil — so it must not be stamped.
        if (error instanceof ConnectionNotEstablished) {
          error.setPool(this.pool);
        }
        throw error;
      }
      // Guard against a close / disconnect / discard / reconnect
      // that raced with the in-flight connect(). If the adapter was
      // torn down between the await above and this point, do NOT
      // publish `newClient` — tear it down instead so we don't leak
      // a live socket onto a closed adapter.
      const racedDiscard = this._discardedAcquireGenerations.has(acquireGen);
      // A disconnectBang/close/discardBang bumps _acquireGeneration when this
      // acquire is in flight, so a mismatch means this acquire was orphaned by
      // one of them. Checking the captured generation (not the mutable _closed
      // flag) keeps the decision correct even when a racing reconnect clears
      // _closed before the connect resolves — otherwise the stale acquire would
      // adopt/publish its pre-disconnect newClient onto the reconnected adapter.
      const staleGeneration = acquireGen !== this._acquireGeneration;
      if (
        this._closed ||
        this._pgClientOptions == null ||
        this._rawConnection != null ||
        racedDiscard ||
        staleGeneration
      ) {
        this._teardownRacedClient(newClient, acquireGen);
        // A stale-generation acquire ALWAYS fails, uniformly — even in the
        // narrow sub-case where a racing reconnect has already published a
        // valid _rawConnection (i.e. we'd otherwise fall through to adopt it
        // below). This is a deliberate behavior change: an acquire orphaned by
        // disconnect!/close/discard! belongs to a connection epoch that was
        // explicitly torn down, so adopting a POST-teardown connection would
        // silently paper over the disconnect (the mirror of the adoption bug
        // this guard fixes). Only same-generation callers that merely lost a
        // benign open race are allowed to adopt the winner's connection below.
        if (this._closed || this._pgClientOptions == null || racedDiscard || staleGeneration) {
          throw new Error("PostgreSQLAdapter: connection is closed");
        }
        // Another caller raced ahead and already published a
        // connection — use theirs instead of ours.
        client = this._rawConnection!;
      } else {
        // Suppress unhandled error events from the idle connection
        // (e.g. server-side FATAL from pg_terminate_backend). Without
        // this listener node emits an uncaughtException.
        newClient.on("error", () => {});
        // Attach the notice listener exactly once per pg.Client. We
        // can't do this inside _maybeConfigureConnection because
        // resetBang resets _connectionConfigured to re-run the SET
        // queries after DISCARD ALL; re-running configure on the same
        // client would otherwise accumulate notice listeners on every
        // reset (node-pg's EventEmitter, unlike libpq's
        // set_notice_receiver, doesn't replace).
        this._attachNoticeListener(newClient);
        this._rawConnection = newClient;
        client = newClient;
      }
    }
    try {
      await this.configureConnection(client);
      // Re-check teardown after every await: a concurrent reconnect
      // can null _rawConnection while configure is in flight.
      if (this._closed || this._rawConnection !== client) {
        throw new Error("PostgreSQLAdapter: connection is closed");
      }
      await this._maybeDrainOrphanedPreparedStatements(client);
      if (this._closed || this._rawConnection !== client) {
        throw new Error("PostgreSQLAdapter: connection is closed");
      }
    } catch (error) {
      // Configure/drain failure (or mid-flight teardown) leaves the
      // connection in an unknown state — tear it down so the next
      // caller reconnects cleanly. Only touch shared state if this
      // local snapshot is still the published connection; otherwise
      // a concurrent reconnect already swapped in a new one.
      if (this._rawConnection === client) {
        this._rawConnection = null;
        this._connectionConfigured = false;
        this._typeMapEagerLoaded = false;
        this._statementPool?.detach();
        this._statementPool = null;
      }
      this._teardownRacedClient(client, acquireGen);
      throw error;
    }
    return client;
  }

  /**
   * Dispose of a raw client that a concurrent teardown orphaned mid-acquire.
   * When this acquire's generation was orphaned by `discardBang()` (Rails'
   * `discard!`), whose contract forbids talking to the server, we abandon the
   * fd without closing it (`abandonRawSocket`); otherwise (disconnect/close/
   * configure failure) we actively `end()` the socket as before. Keying on the
   * captured generation — not a mutable flag — keeps the decision correct even
   * when a later reconnect runs before this acquire resolves.
   */
  private _teardownRacedClient(client: pg.Client, acquireGen: number): void {
    if (this._discardedAcquireGenerations.has(acquireGen)) {
      abandonRawSocket(client);
    } else {
      client.end().catch(() => {});
    }
  }

  /**
   * If the connection was tagged for `DEALLOCATE ALL` (by the
   * `clearCacheBang` reset branch on the prior session), drain its
   * server-side prepared statements before handing it to user code.
   */
  private async _maybeDrainOrphanedPreparedStatements(client: pg.Client): Promise<void> {
    if (!this._needsDeallocateAll) return;
    this._needsDeallocateAll = false;
    await client.query("DEALLOCATE ALL");
  }

  /**
   * Drain the async reset barrier before the base `withRawConnection` loop
   * yields `this._connection`. `resetBang` defers ROLLBACK + DISCARD ALL +
   * reconfigure behind `_inFlightReset` (it can't block the way Rails'
   * `reset!` does); awaiting it here — once per call, pre-loop — guarantees
   * the yielded socket is scrubbed and reconfigured, with no per-iteration
   * re-acquire. The connection itself is opened eagerly by `connectBang()`
   * (initial use) or `reconnect()` (post-failure), so there is nothing left
   * to acquire here. Replaces the deleted `rawConnectionForBlock` seam.
   *
   * @internal
   */
  protected override async awaitRawConnectionReady(): Promise<void> {
    while (this._inFlightReset) await this._inFlightReset;
    // Drain any pending maintenance op (DEALLOCATE) so it can't race the query
    // the withRawConnection loop is about to issue on the pinned client.
    await this._maintenanceTail;
    // If the reset's reconfigure step failed it tore down the socket; re-open
    // a fresh, configured connection so the loop never yields an unconfigured
    // (or null) one. connect() throws here only if the server is truly down —
    // the same pre-loop failure shape as a failed initial connectBang().
    if (!this._closed && this._rawConnection === null && this._pgClientOptions !== null) {
      await this.connect();
    }
    // Drain server-side prepared statements orphaned by a prior PSCE event
    // (clearCacheBang's reset branch tagged `_needsDeallocateAll` while the
    // socket was torn down). When the connection is reopened by connectBang's
    // `_acquireFreshClient` this already ran; this covers the case where the
    // live socket survives so the loop never yields it un-drained.
    const client = this._rawConnection;
    if (client && !this._closed) await this._maybeDrainOrphanedPreparedStatements(client);
  }

  /**
   * Return the single StatementPool for the persistent connection,
   * lazily creating it. PG prepared statements are session-scoped;
   * with one persistent client there is exactly one pool per adapter.
   */
  private _poolFor(client: pg.Client): StatementPool {
    if (!this._statementPool) {
      this._statementPool = this.buildStatementPool(client);
    }
    return this._statementPool;
  }

  /**
   * Chain `fn` onto the pinned client's maintenance tail so DEALLOCATE /
   * ROLLBACK / DISCARD ALL serialize against each other (and, via the drain in
   * `_acquireFreshClient` / `awaitRawConnectionReady`, against the next user
   * query). Errors are swallowed — these are best-effort, session-scoped cleanup
   * commands (Rails' StatementPool#dealloc / reset! likewise rescue), and an
   * unhandled rejection on a post-close socket must not crash the process.
   *
   * @internal
   */
  private _enqueueMaintenance(fn: () => Promise<unknown>): Promise<void> {
    const next = this._maintenanceTail.then(fn).then(
      () => {},
      () => {},
    );
    this._maintenanceTail = next;
    return next;
  }

  /**
   * Serialize a single `client.query` on the pinned `pg.Client` against every
   * other query (and maintenance op) on that same client, so no two ever
   * overlap on the wire. node-pg's own request queue is insufficient under the
   * write-path query volume: two calls that interleave desync the wire protocol
   * and leave the connection idle-in-transaction (the
   * `client.query() … already executing a query` deprecation is that seam). This
   * is the general per-query mutex the sibling
   * `pg-serialize-fire-and-forget-client-query-sites` maintenance serializer
   * anticipated (see `_maintenanceTail`).
   *
   * It shares the one `_maintenanceTail` chain so DEALLOCATE / ROLLBACK /
   * DISCARD ALL and user queries all serialize on a single tail — a maintenance
   * op enqueued mid-query lands after it, and a query issued after an eviction's
   * DEALLOCATE lands after that. Each call chains a fresh gate onto the tail and
   * releases it once `fn` settles; the granularity is one `client.query`, never
   * a whole `withRawConnection` block, so re-entrant/retry paths (which re-issue
   * sequentially) each re-acquire without ever awaiting their own outstanding
   * gate — no self-deadlock.
   *
   * Configure-time queries run on a not-yet-published client
   * (`client !== _rawConnection`) and bypass the mutex: they already run direct
   * on `client.query()` before the connection is acquirable (RFC 0013), and
   * chaining them here would interleave with the maintenance tail during
   * connect.
   *
   * A few other pinned-client sites deliberately stay direct because routing
   * them onto the shared tail would deadlock or defeat their purpose, NOT for
   * lack of coverage: `_maybeConfigureConnection` / the reset reconfigure run
   * *inside* the `_inFlightReset` barrier that IS the tail (self-await), the
   * DEALLOCATE / ROLLBACK / DISCARD ALL maintenance ops already chain via
   * `_enqueueMaintenance`, `execRollbackDbTransaction`'s `ROLLBACK` follows a
   * `_cancelAnyRunningQuery` that must not be made to wait on the query it just
   * cancelled, and the memoized `server_version` bootstrap probe runs before the
   * client is in normal service.
   *
   * @internal
   */
  private async _serializePinnedQuery<R>(client: pg.Client, fn: () => Promise<R>): Promise<R> {
    if (client !== this._rawConnection) return fn();
    const prev = this._maintenanceTail;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this._maintenanceTail = prev.then(() => gate);
    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Tear down the single StatementPool. Called from `close()` /
   * `reconnect()` only — commit/rollback keep the pool attached
   * because PG prepared statements are session-scoped, not
   * transaction-scoped (mirrors Rails' PG::StatementPool, which only
   * clears on disconnect).
   */
  private _releaseStatementPool(): void {
    this._statementPool?.detach();
    this._statementPool = null;
  }

  /**
   * Run a query on `client`, routing through the statement pool when
   * binds are present and `preparedStatements` is on. On Rails-parity
   * "invalid cached plan" (SQLSTATE 0A000 + "cached plan" in the
   * message), purges the pool entry and either re-runs once (outside
   * a txn) or raises `PreparedStatementCacheExpired` (inside one, so
   * the transaction machinery can retry the whole txn).
   *
   * Shared by execute/executeMutation so every bound path benefits
   * from prepared-statement reuse — matches Rails where `exec_cache`
   * backs both exec_query and exec_delete / exec_update / exec_insert.
   */
  private async _runQuery<R = pg.QueryResult>(
    client: pg.Client,
    sql: string,
    binds: unknown[],
    extra: {
      rowMode?: "array";
      // A *hint*, not a guarantee: `true` (e.g. `select_all` threading a
      // preparable SELECT) still passes through `_shouldPrepare`, so PG's own
      // gates — prepared_statements, non-empty binds, a non-zero pool limit —
      // decide whether to actually prepare. This avoids forcing a server-side
      // PREPARE that a disabled (maxSize 0) pool would leak per execution. Only
      // an explicit `false` hard-disables preparation.
      prepareHint?: boolean;
      onPrepared?: (stmtName: string) => void;
    } = {},
  ): Promise<R> {
    const { prepareHint, onPrepared, ...queryExtra } = extra;
    const prepare = prepareHint === false ? false : this._shouldPrepare(binds);
    const attempt = async (): Promise<R> => {
      if (prepare) {
        const stmtName = this._preparedNameFor(client, sql);
        onPrepared?.(stmtName);
        // `_preparedNameFor` may have evicted an LRU entry, queueing its
        // DEALLOCATE on the maintenance tail. The serializer captures that tail
        // (with the DEALLOCATE already enqueued) and awaits it before issuing,
        // so the DEALLOCATE lands on an idle client rather than racing the query
        // that triggered the eviction — subsuming the old explicit drain.
        // Mirrors Rails, where StatementPool#[]= deallocs the evicted entry
        // inline (under the connection lock) before the new query is sent
        // (statement_pool.rb:31, postgresql_adapter.rb:307).
        return this._serializePinnedQuery(
          client,
          () =>
            client.query({
              name: stmtName,
              text: sql,
              values: binds,
              ...queryExtra,
            }) as Promise<R>,
        );
      }
      if (queryExtra.rowMode) {
        return this._serializePinnedQuery(
          client,
          () => client.query({ text: sql, values: binds, ...queryExtra }) as Promise<R>,
        );
      }
      return this._serializePinnedQuery(client, () => client.query(sql, binds) as Promise<R>);
    };
    const isTxConn = client === this._rawConnection;
    if (isTxConn) this._queryInFlight = true;
    try {
      try {
        return await attempt();
      } catch (e) {
        if (prepare && this._isInvalidCachedPlan(e)) {
          // Mirrors Rails' `perform_query` rescue
          // (postgresql/database_statements.rb:143-151): inside a transaction we
          // can't recover (all commands would raise InFailedSQLTransaction), so
          // raise `PreparedStatementCacheExpired` and let the transaction machinery
          // clear the whole cache on rollback; otherwise drop just this entry and
          // retry. `in_transaction?` is `open_transactions > 0`
          // (postgresql_adapter.rb:908-910), so an open *lazy* (un-materialized)
          // frame still counts — a read-only block (`transaction { record.reload }`)
          // never emits a physical `BEGIN` because reads don't materialize.
          if (this.openTransactions > 0) {
            throw new PreparedStatementCacheExpired(
              (e as { message?: string })?.message ?? "cached plan expired",
              { sql, binds, cause: e },
            );
          }
          this._poolFor(client).delete(this.sqlKey(sql));
          return await attempt();
        }
        throw e;
      }
    } finally {
      if (isTxConn) this._queryInFlight = false;
    }
  }

  /**
   * Return the prepared-statement name for `sql` on `client`. Names
   * are allocated from the per-pool counter (`StatementPool#nextKey`)
   * so each session has its own `a1`, `a2`, ... sequence. Mirrors
   * Rails' `PostgreSQL::StatementPool#[]` / `#[]=` — present key →
   * cached name, absent → `next_key` + store.
   */
  private _preparedNameFor(client: pg.Client, sql: string): string {
    const pool = this._poolFor(client);
    const key = this.sqlKey(sql);
    const existing = pool.get(key);
    if (existing) return existing.name;
    const name = pool.nextKey();
    pool.set(key, { name });
    return name;
  }

  /**
   * True when the adapter should try a named prepared statement for
   * this call. Rails' gate: `prepared_statements && !binds.empty?`
   * (there's no point naming an unparameterized statement — the
   * parse cost is the same either way and the name never gets
   * reused without binds).
   */
  private _shouldPrepare(binds: unknown[]): boolean {
    if (!this.preparedStatements || binds.length === 0) return false;
    // Gate on the live pool's maxSize (or the adapter default if not yet
    // constructed). A direct `pool.setMaxSize(0)` — by a test or an
    // operator shrinking the session — must reliably disable preparation,
    // because `StatementPool#set` is a no-op at maxSize=0 and we'd
    // otherwise keep allocating a fresh `a<n>` name per execution and
    // leak server-side PREPAREs.
    const poolLimit = this._statementPool?.maxSize ?? this._statementLimit;
    return poolLimit > 0;
  }

  /**
   * True if a pg driver error indicates the cached plan has been
   * invalidated by DDL on a referenced object (typical: `ALTER TABLE`,
   * `DROP COLUMN`, schema change). PG emits SQLSTATE `0A000`
   * FEATURE_NOT_SUPPORTED with the server message "cached plan must
   * not change result type" — Rails checks the source function
   * `RevalidateCachedQuery`, which the node-pg driver does not expose,
   * so we fall back to the message substring.
   *
   * `26000` (invalid_sql_statement_name) is intentionally NOT included
   * here: pg-js's own client-side name cache handles the session-lost
   * case on its own, and retrying behind the driver's back masks
   * genuine "this name never existed" bugs. Rails' equivalent path
   * (`exec_cache`) also only retries on cached-plan failure — not on
   * unknown-statement-name — so this matches the activerecord
   * contract.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter#is_cached_plan_failure?
   * (postgresql_adapter.rb:901-906).
   */
  /** @internal Mirrors: PostgreSQL::DatabaseStatements#handle_warnings */
  /**
   * Run a single query on an already-acquired client with the same
   * instrumentation, exception translation, and warning flushing that
   * execQuery/executeMutation use. Used when two queries must share a
   * session (e.g. INSERT + SELECT currval in the returning-disabled path).
   * @internal
   */
  private async _instrumentedQueryOnClient(
    client: pg.Client,
    sql: string,
    name: string,
    binds: unknown[],
  ): Promise<Result> {
    const bindArray = (this.typeCastedBinds(binds) ?? []).map((v) => this._bindForPg(v));
    const rewritten = this.rewriteBinds(sql, bindArray);
    this._noticeReceiverSqlWarnings = [];
    const payload: Record<string, unknown> = {
      sql: rewritten,
      name,
      binds,
      type_casted_binds: bindArray,
      connection: this,
      row_count: 0,
    };
    const pgResult = await Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        const r = await this._runQuery(client, rewritten, bindArray, { rowMode: "array" });
        payload.row_count = r.rowCount ?? 0;
        return r;
      } catch (e: any) {
        const translated = this._translateException(e, rewritten, bindArray);
        throw translated;
      }
    });
    // Mirrors Rails' raw_execute → verified!: a successful round-trip proves the
    // connection is live, so skip the verify ping on the next withRawConnection.
    this.verifiedBang();
    this._flushWarnings(rewritten);
    return castResult.call(this, pgResult);
  }

  private _flushWarnings(sql?: string): void {
    const actionable = new Set(["WARNING", "ERROR", "FATAL", "PANIC"]);
    const ctor = this.constructor as typeof PostgreSQLAdapter;
    const action = ctor.dbWarningsAction;
    try {
      if (!action || action === "ignore") return;
      for (const w of this._noticeReceiverSqlWarnings) {
        if (!actionable.has(w.level ?? "")) continue;
        if (this.isWarningIgnored(w)) continue;
        const sw = new SQLWarning(w.message, w.code ?? null, w.level ?? null);
        if (sql) sw.sql = sql;
        if (action === "raise") throw sw;
        if (action === "log") {
          const logger = this.logger as { warn?: (msg: string) => void } | null;
          const codeSuffix = w.code ? ` (${w.code})` : "";
          const msg = `[ActiveRecord::SQLWarning] ${sw.message}${codeSuffix}`;
          if (logger?.warn) logger.warn(msg);
          else console.warn(msg);
        }
        if (action === "report") {
          // Mirrors Rails' `:report` → `Rails.error.report(warning, handled: true)`
          // (active_record.rb:248–249). When no reporter is wired, silently no-op
          // — Rails' Rails.error always exists in a booted app, but our
          // activesupport accessor is opt-in.
          getErrorReporter()?.report(sw, { handled: true });
        }
        if (typeof action === "function") action(sw);
      }
    } finally {
      this._noticeReceiverSqlWarnings = [];
    }
  }

  private _isInvalidCachedPlan(e: unknown): boolean {
    const err = e as { code?: string; message?: string } | null;
    if (err?.code !== "0A000") return false;
    // "cached plan must not change result type" is the only
    // 0A000 subtype we retry on — other FEATURE_NOT_SUPPORTED
    // errors (e.g. RETURNING on a view) must surface unchanged.
    return typeof err.message === "string" && err.message.includes("cached plan");
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
    { allowRetry = false }: { allowRetry?: boolean } = {},
  ): Promise<Record<string, unknown>[]> {
    sql = this.preprocessQuery(sql);
    // Type-cast bind objects (QueryAttribute) → primitives via `value_for_database`,
    // then run each through `_bindForPg` for Temporal / BinaryData normalization —
    // mirrors `type_casted_binds` and the execQuery path.
    const bindArray = (this.typeCastedBinds(binds) ?? []).map((v) => this._bindForPg(v));
    const rewritten = this.rewriteBinds(sql, bindArray);
    // payload.sql is the rewritten SQL (`$1` not `?`) so ExplainSubscriber
    // stores something that can be re-EXPLAIN'd on the same adapter
    // without re-running rewriteBinds.
    const txPublic = this.currentTransaction().userTransaction;
    const payload: Record<string, unknown> = {
      sql: rewritten,
      name,
      binds,
      type_casted_binds: bindArray,
      connection: this,
      row_count: 0,
      transaction: txPublic.isOpen() ? txPublic : null,
    };
    this._noticeReceiverSqlWarnings = [];
    // Flush inside the instrumented callback so a warning raise is captured by
    // payload.exception — mirrors Rails' handle_warnings inside perform_query (line 166).
    return await Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        return await this.withRawConnection({ allowRetry }, async (conn) => {
          const client = conn as unknown as pg.Client;
          const result = await this._performQuery(client, rewritten, bindArray, payload);
          return result?.rows ?? [];
        });
      } catch (e: any) {
        const translated = this._translateException(e, rewritten, bindArray);
        throw translated;
      }
    });
  }

  /**
   * The single SQL primitive: run a statement, mark the connection verified,
   * flush warnings, record the affected-row count, and set the notification
   * payload's row count — the shared body of `execute` and `executeMutation`,
   * mirroring Rails' one `perform_query`. Returns the raw pg result (rows for a
   * row-returning statement, `rowCount` for a write). Unlike sqlite, node-pg
   * does not throw on a non-row-returning statement, so there is no branch on a
   * driver throw — the read/write split lives in the callers' contracts
   * (`execute` returns `.rows`, `executeMutation` sources affected rows through
   * the `affectedRows` port).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#perform_query
   */
  private async _performQuery(
    client: pg.Client,
    sql: string,
    binds: unknown[],
    payload: Record<string, unknown>,
  ): Promise<pg.QueryResult> {
    // Rails' perform_query first syncs the timestamp typemap / session timezone
    // when default_timezone changed (database_statements.rb:136 →
    // update_typemap_for_default_timezone); guarded, so it's a no-op unless the
    // timezone actually changed.
    await this.updateTypemapForDefaultTimezone();
    const queryResult = await this._runQuery(client, sql, binds);
    // Mirrors Rails' perform_query → verified!: a successful round-trip proves
    // the connection is live, so skip the verify ping on the next
    // withRawConnection.
    this.verifiedBang();
    // A multi-statement string (e.g. disable_referential_integrity's joined
    // ALTERs) runs under the simple-query protocol, where node-pg returns one
    // Result per statement. Mirror Rails' execute and surface the last
    // command's result.
    const result = (
      Array.isArray(queryResult) ? queryResult[queryResult.length - 1] : queryResult
    ) as pg.QueryResult;
    payload.row_count = result?.rows?.length ?? 0;
    this._flushWarnings(sql);
    return result;
  }

  /**
   * Rows affected by a write, read from its `PG::Result` (`cmd_tuples`).
   * Wired to the existing this-less port so api:compare coverage points at live
   * code. Unlike sqlite3, PG holds no `@last_affected_rows` state — the count is
   * sourced strictly from the passed result, matching Rails.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#affected_rows
   * @internal
   */
  affectedRows(result: pg.QueryResult): number {
    return pgAffectedRows(result);
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   *
   * For INSERT, if the statement includes a RETURNING clause the first column
   * of the first returned row is treated as the inserted ID. Otherwise, the
   * `rowCount` is returned.
   *
   * Rails has no `execute_mutation`; the `execute`/`executeMutation` split is a
   * deliberate trails deviation justified once at the `AbstractAdapter`
   * declaration (abstract-adapter.ts, `executeMutation` on the
   * DatabaseStatements signature block) — read it there before changing this.
   */
  async executeMutation(sql: string, binds: unknown[] = [], name: string = "SQL"): Promise<number> {
    sql = this.preprocessQuery(sql);
    // Type-cast bind objects (QueryAttribute) → primitives via `value_for_database`,
    // then run each through `_bindForPg` for Temporal / BinaryData normalization —
    // mirrors `type_casted_binds`. Without the typeCastedBinds unwrap, an INSERT
    // routed through executeMutation would bind a raw QueryAttribute to pg.
    const originalBinds = binds;
    binds = (this.typeCastedBinds(binds) ?? []).map((v) => this._bindForPg(v));
    const pgSql = this.rewriteBinds(sql, binds);
    this._noticeReceiverSqlWarnings = [];
    // payload.sql records the rewritten SQL — ExplainSubscriber captures
    // something that can be re-EXPLAIN'd without re-running rewriteBinds
    // (and without re-appending RETURNING for bare INSERTs, which isn't
    // part of the logical query).
    const txPublic = this.currentTransaction().userTransaction;
    const payload: Record<string, unknown> = {
      sql: pgSql,
      name,
      binds: originalBinds,
      type_casted_binds: binds,
      connection: this,
      row_count: 0,
      transaction: txPublic.isOpen() ? txPublic : null,
    };
    return await Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        return await this.withRawConnection(async (conn) => {
          const client = conn as unknown as pg.Client;
          const upper = sql.trimStart().toUpperCase();

          // For INSERT without RETURNING, append RETURNING id automatically
          // (only when use_insert_returning? is true — mirrors Rails postgresql_adapter.rb:630)
          if (
            this._useInsertReturning &&
            upper.startsWith("INSERT") &&
            !upper.includes("RETURNING")
          ) {
            const withReturning = `${pgSql} RETURNING id`;
            const useSavepoint = this._inTransaction;
            const spName = useSavepoint ? `_bt_ret_${++PostgreSQLAdapter._spCounter}` : "";
            // Update payload.sql to the exact statement we're about to
            // run so subscribers (LogSubscriber / ExplainSubscriber /
            // QueryCache keys) see what actually hit pg. The fallback
            // branch below resets it to pgSql if the RETURNING attempt
            // fails and we re-run without it.
            payload.sql = withReturning;
            try {
              if (useSavepoint)
                await this._serializePinnedQuery(client, () =>
                  client.query(`SAVEPOINT "${spName}"`),
                );
              const result = await this._performQuery(client, withReturning, binds, payload);
              if (useSavepoint)
                await this._serializePinnedQuery(client, () =>
                  client.query(`RELEASE SAVEPOINT "${spName}"`),
                );
              const affected = this.affectedRows(result);
              payload.row_count = affected;
              if (result.rows.length > 1) {
                return affected;
              }
              if (result.rows.length > 0) {
                return result.rows[0][Object.keys(result.rows[0])[0]] as number;
              }
              return affected;
            } catch (err) {
              // Cached-plan failures must propagate to the
              // transaction-retry machinery (Rails raises
              // PreparedStatementCacheExpired for exactly this
              // reason — retrying inside an aborted txn would fail
              // with 25P02). Everything else falls through to the
              // "retry without RETURNING" path this catch was
              // originally written for.
              if (err instanceof PreparedStatementCacheExpired) throw err;
              if (useSavepoint) {
                await this._serializePinnedQuery(client, () =>
                  client.query(`ROLLBACK TO SAVEPOINT "${spName}"`),
                ).catch(() => {});
                await this._serializePinnedQuery(client, () =>
                  client.query(`RELEASE SAVEPOINT "${spName}"`),
                ).catch(() => {});
              }
              payload.sql = pgSql;
              const result = await this._performQuery(client, pgSql, binds, payload);
              const affected = this.affectedRows(result);
              payload.row_count = affected;
              return affected;
            }
          }

          // For INSERT with explicit RETURNING
          if (upper.startsWith("INSERT") && upper.includes("RETURNING")) {
            const result = await this._performQuery(client, pgSql, binds, payload);
            const affected = this.affectedRows(result);
            payload.row_count = affected;
            if (result.rows.length > 0) {
              return result.rows[0][Object.keys(result.rows[0])[0]] as number;
            }
            return affected;
          }

          // For UPDATE/DELETE, return affected rows
          const result = await this._performQuery(client, pgSql, binds, payload);
          const affected = this.affectedRows(result);
          payload.row_count = affected;
          return affected;
        });
      } catch (e: any) {
        const translated = this._translateException(e, pgSql, binds);
        throw translated;
      }
    });
  }

  /**
   * Begin a transaction. Acquires a dedicated client from the pool.
   */
  async beginTransaction(): Promise<void> {
    // Force materialization (_lazy: false) so _client is acquired and
    // _inTransaction is set immediately. createSavepoint() runs on the raw
    // client which falls back to a fresh connection when _client is null,
    // causing "SAVEPOINT can only be used in transaction blocks".
    await this._transactionManager.beginTransaction({ _lazy: false });
  }

  async beginDbTransaction(): Promise<void> {
    this._client = await this._acquireFreshClient();
    try {
      await this.internalExecute("BEGIN", "TRANSACTION", {
        materializeTransactions: false,
        allowRetry: true,
      });
      this._inTransaction = true;
    } catch (error) {
      this._client = null;
      this._inTransaction = false;
      // Connection-level error on BEGIN poisons the single pg.Client.
      // Tear down so the next caller gets a fresh connection — mirrors
      // the pre-collapse PoolClient.release(err) discard.
      if (PostgreSQLAdapter._isConnectionError(error)) this._discardRawConnection();
      throw error;
    }
  }

  async beginDeferredTransaction(): Promise<void> {
    return this.beginDbTransaction();
  }

  /**
   * Commit the current transaction. With the single persistent
   * connection there is no checkout/release cycle — the same
   * `_rawConnection` continues to serve subsequent queries.
   *
   * Routes through TransactionManager when the TM has an open transaction
   * (e.g. started by beginTransaction()) so the stack stays in sync.
   * Falls through to the direct DB path when openTransactions == 0, which
   * covers: (a) TM calling commitDbTransaction() after already popping the
   * stack, and (b) beginDbTransaction() + commit() direct pairs in tests.
   */
  async commit(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.commitTransaction();
    }
    if (!this._client) throw new Error("No active transaction");
    try {
      await this.internalExecute("COMMIT", "TRANSACTION");
    } catch (e) {
      // Connection-level error (08P01, broken socket, etc.) leaves the
      // single pg.Client unusable. Tear down so the next caller gets a
      // fresh connection — mirrors the pool-discard safety net the
      // pre-collapse design got for free via PoolClient.release(err).
      if (PostgreSQLAdapter._isConnectionError(e)) this._discardRawConnection();
      throw e;
    } finally {
      // PG prepared statements are session-scoped, not transaction-scoped
      // (COMMIT/ROLLBACK don't drop them) — keep the StatementPool
      // attached. Mirrors Rails: clear only on disconnect.
      this._client = null;
      this._inTransaction = false;
    }
  }

  async commitDbTransaction(): Promise<void> {
    return this.commit();
  }

  /**
   * Rollback the current transaction. With the single persistent
   * connection there is no checkout/release — the same `_rawConnection`
   * continues to serve subsequent queries.
   *
   * Routes through TransactionManager when the TM has an open transaction.
   * Falls through to the direct DB path when openTransactions == 0 (e.g.
   * beginDbTransaction() + rollback() direct pairs). Does NOT call
   * _cancelAnyRunningQuery() in the direct path — that cancel step is only
   * safe in the TM path (via execRollbackDbTransaction()) where no
   * fire-and-forget adapter work is in flight. Calling cancel when statement
   * pool deallocs are in-flight causes "unexpected commandComplete" errors.
   */
  async rollback(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.rollbackTransaction();
    }
    if (!this._client) throw new Error("No active transaction");
    try {
      await this.internalExecute("ROLLBACK", "TRANSACTION");
    } catch (e) {
      // Connection-level error — closing the socket implicitly aborts
      // the server-side TX. Swallow and reconnect so the next caller
      // gets a fresh client. Mirrors the pre-collapse pool-discard
      // safety net (PoolClient.release(err) discarded broken sockets).
      if (PostgreSQLAdapter._isConnectionError(e)) {
        this._discardRawConnection();
        return;
      }
      throw e;
    } finally {
      this._client = null;
      this._inTransaction = false;
    }
  }

  async rollbackDbTransaction(): Promise<void> {
    return this.execRollbackDbTransaction();
  }

  // Mirrors: DatabaseStatements#exec_rollback_db_transaction (database_statements.rb:78)
  async execRollbackDbTransaction(): Promise<void> {
    this._cancelAnyRunningQuery();
    if (!this._client) throw new Error("No active transaction");
    try {
      await this.internalExecute("ROLLBACK", "TRANSACTION");
    } catch (e) {
      // ROLLBACK on a poisoned socket (e.g. 08P01 after the cancel
      // race) — tear down and reconnect; closing the socket implicitly
      // aborts the server-side TX. Mirrors the pool-discard safety net
      // the pre-collapse design got via PoolClient.release(err).
      if (PostgreSQLAdapter._isConnectionError(e)) {
        this._discardRawConnection();
        return;
      }
      throw e;
    } finally {
      // See commit() — ROLLBACK doesn't drop server-side prepared
      // statements, so we keep the StatementPool attached for the
      // duration of the connection's life.
      this._client = null;
      this._inTransaction = false;
    }
  }

  /**
   * True when an error indicates the pg.Client's socket is no longer
   * usable for further queries — covers node-postgres' "Client has
   * encountered a connection error and is not queryable", PG protocol
   * desync (SQLSTATE 08P01), and connection-class SQLSTATEs (08xxx).
   */
  private static _isConnectionError(err: unknown): boolean {
    const e = err as { code?: string; message?: string } | null | undefined;
    if (!e) return false;
    if (typeof e.code === "string" && e.code.startsWith("08")) return true;
    const msg = typeof e.message === "string" ? e.message : "";
    if (!msg) return false;
    return (
      msg.includes("Client has encountered a connection error") ||
      msg.includes("invalid frontend message type") ||
      msg.includes("Connection terminated") ||
      msg.includes("client has already ended")
    );
  }

  /**
   * Whether a node-pg connection error indicates the connection was already
   * closed *before* the query was sent — i.e. the query definitely never ran.
   * These are node-pg's analogues of the messages Rails' translate_exception
   * routes to ConnectionNotEstablished rather than ConnectionFailed
   * (postgresql_adapter.rb:801-818 — `connection is closed` /
   * `no connection to the server`, and the pg-internal, pre-send PG::ConnectionBad
   * whose libpq message lacks the trailing newline). node-pg raises these when
   * the client rejected the query because `end()` was called or the client was
   * closed — as opposed to "Client has encountered a connection error" / socket
   * severs, where the server may already have executed part or all of the query.
   */
  private static _isConnectionClosedBeforeSend(err: unknown): boolean {
    const msg =
      typeof (err as { message?: string })?.message === "string"
        ? (err as { message: string }).message
        : "";
    if (!msg) return false;
    return (
      msg.includes("client has already ended") ||
      /client was closed/i.test(msg) ||
      /connection is closed/i.test(msg) ||
      /no connection to the server/i.test(msg)
    );
  }

  // Mirrors: DatabaseStatements#exec_restart_db_transaction (database_statements.rb:83)
  async execRestartDbTransaction(): Promise<void> {
    this._cancelAnyRunningQuery();
    await this.internalExecute("ROLLBACK AND CHAIN", "TRANSACTION");
  }

  // Mirrors: PostgreSQL::DatabaseStatements#cancel_any_running_query (database_statements.rb private)
  // Sends a CancelRequest to abort any in-flight query on the transaction connection
  // before issuing ROLLBACK / ROLLBACK AND CHAIN, so the rollback isn't blocked
  // waiting for a long-running query to finish. Best-effort: errors are swallowed.
  private _cancelAnyRunningQuery(): void {
    type PgClientWithPid = pg.Client & {
      processID?: number | null;
      secretKey?: number | null;
    };
    // connect() and cancel() exist at runtime but are not in @types/pg Connection.
    type PgConnectionWithCancel = pg.Connection & {
      connect(portOrPath: string | number, host?: string): void;
      cancel(processID: number, secretKey: number): void;
    };
    const txClient = this._client as PgClientWithPid | null;
    if (!this._queryInFlight || txClient?.processID == null) return;
    try {
      // Open a FRESH TCP connection to send a CancelRequest — mirrors
      // libpq PQcancel / Ruby PG::Connection#cancel: new socket, send
      // the 16-byte cancel message, close. Leaves the original
      // transaction socket untouched; does NOT consume a pool slot.
      const cancelCon = new pg.Connection() as PgConnectionWithCancel;
      cancelCon.on("error", () => {});
      cancelCon.once("connect", () => {
        cancelCon.cancel(txClient.processID!, txClient.secretKey ?? 0);
      });
      const { host, port } = txClient;
      if (host?.startsWith("/")) {
        cancelCon.connect(`${host}/.s.PGSQL.${port}`);
      } else {
        cancelCon.connect(port, host);
      }
    } catch {
      // cancel is best-effort
    }
  }

  // Mirrors: DatabaseStatements#begin_isolated_db_transaction (database_statements.rb:68)
  async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    const levels = transactionIsolationLevels();
    const level = levels[isolation];
    if (!level) throw new Error(`Unknown isolation level: ${isolation}`);
    this._client = await this._acquireFreshClient();
    try {
      await this.internalExecute(`BEGIN ISOLATION LEVEL ${level}`, "TRANSACTION", {
        materializeTransactions: false,
        allowRetry: true,
      });
      this._inTransaction = true;
    } catch (error) {
      this._client = null;
      this._inTransaction = false;
      // See beginDbTransaction — discard the poisoned client on
      // connection-level failure so callers can recover.
      if (PostgreSQLAdapter._isConnectionError(error)) this._discardRawConnection();
      throw error;
    }
  }

  // Mirrors: DatabaseStatements#write_query? (database_statements.rb:24)
  override isWriteQuery(sql: string): boolean {
    return !READ_QUERY.test(sql);
  }

  // Mirrors: PostgreSQL::DatabaseStatements#execute_batch (database_statements.rb)
  /** @internal */
  executeBatch = pgExecuteBatch;

  // Mirrors: DatabaseStatements#high_precision_current_timestamp (database_statements.rb:92)
  // Rails: HIGH_PRECISION_CURRENT_TIMESTAMP = Arel.sql("CURRENT_TIMESTAMP")
  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
    return arelSql("CURRENT_TIMESTAMP");
  }

  // Mirrors: DatabaseStatements#set_constraints (database_statements.rb:110)
  async setConstraints(
    deferred: "deferred" | "immediate",
    ...constraints: string[]
  ): Promise<void> {
    if (deferred !== "deferred" && deferred !== "immediate") {
      throw new ArgumentError(`deferred must be "deferred" or "immediate"`);
    }
    const list =
      constraints.length === 0 ? "ALL" : constraints.map((c) => this.quoteTableName(c)).join(", ");
    await this.execute(`SET CONSTRAINTS ${list} ${deferred.toUpperCase()}`);
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#internal_execute
  // materializeTransactions is handled here (before the loop) instead of inside
  // withRawConnection, so transaction-control SQL keeps its exact pre-existing
  // materialize semantics. Rails' with_raw_connection `ensure
  // dirty_current_transaction if materialize_transactions` (abstract_adapter.rb:1046)
  // is relocated to this method's own finally so a savepoint statement
  // (materialize:true, savepoints.rb:11-20) still dirties the current — parent, for a
  // popped RELEASE/ROLLBACK TO SAVEPOINT frame — transaction on every exit.
  override async internalExecute(
    sql: string,
    name: string = "SQL",
    {
      materializeTransactions = true,
      allowRetry = false,
      binds = [],
    }: { materializeTransactions?: boolean; allowRetry?: boolean; binds?: unknown[] } = {},
  ): Promise<unknown> {
    sql = preprocessQuery.call(this as any, sql);
    try {
      if (materializeTransactions) await this.materializeTransactions();
      // Thread binds through so a bound INSERT ... RETURNING reaches the driver,
      // matching Rails internal_execute(sql, name, binds). Transaction-control
      // callers pass none, keeping their byte-identical no-bind path (no rewrite).
      const hasBinds = binds.length > 0;
      const bindArray = hasBinds
        ? (this.typeCastedBinds(binds) ?? []).map((v) => this._bindForPg(v))
        : [];
      const runSql = hasBinds ? this.rewriteBinds(sql, bindArray) : sql;
      // A bound query here is the exec_insert RETURNING read-back; mirror
      // _instrumentedQueryOnClient by resetting the notice buffer up front and
      // flushing after, so PG WARNING/NOTICE handling (db_warnings_action) is not
      // dropped or misattributed to the next query. Transaction-control SQL passes
      // no binds and keeps its byte-identical path (no reset/flush/rewrite).
      if (hasBinds) this._noticeReceiverSqlWarnings = [];
      const payload: Record<string, unknown> = {
        sql: runSql,
        name,
        binds,
        type_casted_binds: bindArray,
        connection: this,
        row_count: 0,
      };
      const result = await Notifications.instrumentAsync("sql.active_record", payload, () =>
        // materializeTransactions is handled above (not delegated to
        // withRawConnection) so transaction-control SQL — COMMIT/ROLLBACK/
        // SAVEPOINT — keeps its exact pre-existing materialize semantics. The
        // loop's own `finally dirtyCurrentTransaction()` does not fire (false is
        // passed); this method's finally handles it instead. The leaf still gains
        // the retry/verify/reconnect loop.
        this.withRawConnection({ materializeTransactions: false, allowRetry }, async (conn) => {
          const client = conn as unknown as pg.Client;
          // Errors propagate raw: withRawConnection translates the driver error to
          // an ActiveRecordError (with sql: null / binds: []), and the shared logSql
          // rescue then attaches sql + binds via set_query — mirroring Rails'
          // AbstractAdapter#log. Translating here would duplicate that and, on an
          // already-translated error, re-wrap it as StatementInvalid.
          const runResult = await this._runQuery(client, runSql, bindArray, { rowMode: "array" });
          const count = runResult.rowCount ?? runResult.rows.length;
          payload.row_count = count;
          return runResult;
        }),
      );
      if (hasBinds) this._flushWarnings(runSql);
      return result;
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
    await this.internalExecute(`SAVEPOINT "${name}"`, "TRANSACTION");
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    await this.internalExecute(`RELEASE SAVEPOINT "${name}"`, "TRANSACTION");
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    await this.internalExecute(`ROLLBACK TO SAVEPOINT "${name}"`, "TRANSACTION");
  }

  /**
   * Return the query execution plan.
   *
   * Accepts Rails-style options (`["analyze", "verbose"]`) which get
   * composed into the EXPLAIN clause via `buildExplainClause` — e.g.
   * `EXPLAIN (ANALYZE, VERBOSE) <sql>`. Binds pass through in the
   * same rewritten form `execute()`/`execQuery()` use (`?` → `$1`
   * placeholders + the values array) so a collected
   * prepared-statement query re-EXPLAINs cleanly without pg
   * rejecting it for "no parameter $1".
   */
  async explain(
    sql: string,
    binds: unknown[] = [],
    options: ExplainOption[] = [],
  ): Promise<string> {
    return this.withRawConnection({}, async (conn) => {
      const client = conn as unknown as pg.Client;
      const clause = this._explainStatementClause(options);
      // Rewrite `?` → `$1` the same way execute/execQuery do, so a
      // collected query with driver-neutral placeholders (`?`) can be
      // re-EXPLAIN'd. Bind values pass through to pg as the values
      // array so `EXPLAIN` with parameters doesn't error with
      // "there is no parameter $1".
      const pgBinds = binds.map((v) => this._bindForPg(v));
      const rewritten = this.rewriteBinds(sql, pgBinds);
      const result = await this._serializePinnedQuery(client, () =>
        client.query(`${clause} ${rewritten}`, pgBinds),
      );
      const printer = new ExplainPrettyPrinter();
      return printer.pp(result.rows);
    });
  }

  /**
   * Build the printed header prefix used by `Relation#explain`. PG
   * accepts the boolean flags in `EXPLAIN_FLAGS` plus a `format`
   * keyword (`{ format: "json" }`), composed into the same clause shape
   * the adapter sends to the server: `EXPLAIN (ANALYZE, FORMAT JSON) for:`.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#build_explain_clause
   */
  override buildExplainClause(options: ExplainOption[] = []): string {
    if (options.length === 0) return "EXPLAIN for:";
    const parts = this._validateExplainOptions(options);
    return `EXPLAIN (${parts.join(", ")}) for:`;
  }

  /**
   * Boolean PG EXPLAIN flags. Rails' `PostgreSQL::DatabaseStatements#explain`
   * accepts the Symbols `:analyze :verbose :costs :buffers :settings
   * :wal :timing :summary`; `format` is handled separately as a
   * key/value hash entry (`{ format: "json" }`) because it requires a
   * value.
   */
  private static readonly EXPLAIN_FLAGS = new Set([
    "analyze",
    "verbose",
    "costs",
    "buffers",
    "settings",
    "wal",
    "timing",
    "summary",
  ]);

  /**
   * Allowed values for the `format` keyword option. PG supports
   * `TEXT` (default), `XML`, `JSON`, `YAML` — see
   * https://www.postgresql.org/docs/current/sql-explain.html.
   * Values come from user code via `Relation#explain(...)`, so
   * interpolation has to be allowlisted.
   */
  private static readonly EXPLAIN_FORMATS = new Set(["text", "xml", "json", "yaml"]);

  private _validateExplainOptions(options: ExplainOption[]): string[] {
    const parts: string[] = [];
    let seenFormat = false;
    for (const o of options) {
      if (typeof o === "string") {
        const key = o.toLowerCase();
        if (!PostgreSQLAdapter.EXPLAIN_FLAGS.has(key)) {
          throw new Error(`Unknown PostgreSQL EXPLAIN option: ${o}`);
        }
        parts.push(key.toUpperCase());
        continue;
      }
      if (!o || typeof o !== "object" || typeof o.format !== "string") {
        throw new Error(
          `Unknown PostgreSQL EXPLAIN option: ${inspectExplainOption(o)} (expected a string flag or an object with a string 'format')`,
        );
      }
      if (seenFormat) {
        throw new Error("PostgreSQL EXPLAIN accepts at most one FORMAT option");
      }
      const fmt = o.format.toLowerCase();
      if (!PostgreSQLAdapter.EXPLAIN_FORMATS.has(fmt)) {
        throw new Error(
          `Unknown PostgreSQL EXPLAIN format: ${o.format}. Allowed: text, xml, json, yaml.`,
        );
      }
      parts.push(`FORMAT ${fmt.toUpperCase()}`);
      seenFormat = true;
    }
    return parts;
  }

  /**
   * Compose the actual `EXPLAIN ...` SQL statement clause that prefixes
   * the query — distinct from `buildExplainClause`, which builds the
   * printed header. Options are validated against the adapter's
   * allowlist before interpolation.
   */
  private _explainStatementClause(options: ExplainOption[]): string {
    if (options.length === 0) return "EXPLAIN";
    const validated = this._validateExplainOptions(options);
    return `EXPLAIN (${validated.join(", ")})`;
  }

  // Mirrors: PostgreSQLAdapter.native_database_types (postgresql_adapter.rb:404)
  // The datetime entry is resolved dynamically from datetimeType, matching Rails'
  // `types[:datetime] = types[datetime_type]`.
  static nativeDatabaseTypes(): NativeDatabaseTypes {
    return postgresqlNativeDatabaseTypes(
      this.datetimeType,
      pgDatetimeConfig.nativeDatabaseTypesOverrides,
    );
  }

  // Mirrors: PostgreSQLAdapter#native_database_types (postgresql_adapter.rb:400)
  nativeDatabaseTypes(): NativeDatabaseTypes {
    return (this.constructor as typeof PostgreSQLAdapter).nativeDatabaseTypes();
  }

  // Mirrors PG's explicit `ColumnMethods` list (`postgresql/schema_definitions.rb:185`
  // `define_column_methods`), appended to the abstract names. `serial`/`bigserial`
  // are SERIAL/BIGSERIAL pseudo-types and the range/geometric/network types are all
  // exposed as `change_table` shorthands. Multi-word names use the camelCase form of
  // the trails TableDefinition method (e.g. `bit_varying` -> `bitVarying`).
  /**
   * @noRailsEquivalent Rails spells this list as the `ColumnMethods` modules'
   *   `define_column_methods` metaprogramming
   *   (abstract/schema_definitions.rb:324 plus the per-adapter ColumnMethods modules), not as a
   *   `def`, so the Ruby extractor records no counterpart. TypeScript has no `define_method`, so
   *   trails reifies the list; each adapter appends to `super.columnMethodNames()` exactly where
   *   Rails' adapter-specific ColumnMethods module extends the abstract one.
   */
  override columnMethodNames(): string[] {
    return [
      ...super.columnMethodNames(),
      "bigserial",
      "bit",
      "bitVarying",
      "cidr",
      "citext",
      "daterange",
      "hstore",
      "inet",
      "interval",
      "int4range",
      "int8range",
      "jsonb",
      "ltree",
      "macaddr",
      "money",
      "numrange",
      "oid",
      "point",
      "line",
      "lseg",
      "box",
      "path",
      "polygon",
      "circle",
      "serial",
      "tsrange",
      "tstzrange",
      "tsvector",
      "uuid",
      "xml",
      "timestamptz",
      "enum",
    ];
  }

  // Mirrors: PostgreSQLAdapter#set_standard_conforming_strings (postgresql_adapter.rb:412)
  async setStandardConformingStrings(): Promise<void> {
    await this.execute("SET standard_conforming_strings = on");
  }

  async enumTypes(): Promise<[string, string[]][]> {
    return this.pgSchemaStatements().enumTypes();
  }

  // Mirrors: PostgreSQLAdapter#max_identifier_length (postgresql_adapter.rb:620)
  // Rails memoizes `query_value("SHOW max_identifier_length", "SCHEMA").to_i`
  // and reads it synchronously. trails queries are async, so the query lives in
  // the async `warmMaxIdentifierLength` (invoked lazily by the async callers
  // that need the real value, e.g. renameTable — exactly where Rails' lazy
  // `||=` first fires it), and this synchronous accessor — the receiver the
  // inherited DatabaseLimits mixin dispatches to — returns the memo once warmed,
  // else PostgreSQL's compile-time default (NAMEDATALEN-1 = 63). Because the
  // server value is 63 on every stock build, the fallback matches what the
  // query would return, so the synchronous alias/index/table-name-length callers
  // stay correct without an eager per-connection round-trip Rails never pays.
  maxIdentifierLength(): number {
    return this._maxIdentifierLength ?? 63;
  }

  // Lazily populate the max_identifier_length memo via a logged SCHEMA query,
  // matching Rails' `query_value("SHOW max_identifier_length", "SCHEMA")`
  // (postgresql_adapter.rb:620-622). The null guard makes it a no-op once
  // warmed; the memo persists across reconnects, mirroring Rails' `||=` which
  // never resets.
  async warmMaxIdentifierLength(): Promise<number> {
    if (this._maxIdentifierLength == null) {
      const rows = (await this.schemaQuery("SHOW max_identifier_length")) as Array<{
        max_identifier_length: string;
      }>;
      this._maxIdentifierLength = parseInt(rows[0]?.max_identifier_length ?? "63", 10);
    }
    return this._maxIdentifierLength;
  }

  // Mirrors: PostgreSQLAdapter#session_auth= (postgresql_adapter.rb:625)
  // Returns a Promise so callers can await the SET SESSION AUTHORIZATION round-trip.
  async sessionAuth(user: string): Promise<void> {
    this.clearCacheBang();
    const quoted = user.toUpperCase() === "DEFAULT" ? "DEFAULT" : pgQuoteColumnName(user);
    await this.execute(`SET SESSION AUTHORIZATION ${quoted}`);
  }

  // Mirrors: PostgreSQLAdapter#use_insert_returning? (postgresql_adapter.rb:630)
  isUseInsertReturning(): boolean {
    return this._useInsertReturning;
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#exec_insert
   * @internal
   */
  override async execInsert(
    sql: string,
    name?: string | null,
    binds: unknown[] = [],
    pk?: string | false | null,
    sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result | number> {
    // Mirrors Rails: `if use_insert_returning? || pk == false`.
    if (pk === false) {
      // Explicit caller opt-out: skip the pk-derived RETURNING column.
      // Cannot delegate to super here — our mixed-in DatabaseStatements
      // default routes through executeMutation, which auto-appends
      // `RETURNING id` for bare INSERTs when use_insert_returning is on
      // (postgresql-adapter.ts:1238-1243). That would defeat the opt-out.
      // Cannot use execQuery either — it intentionally skips
      // materializeTransactions / dirtyCurrentTransaction (read-path
      // optimisation), so an INSERT inside a lazy transaction would
      // escape rollback. Use the same write-path scaffolding the
      // pk-non-false branch below uses, just without the currval probe.
      if (returning && returning.length > 0) {
        const cols = returning.map((c) => this.quoteColumnName(c)).join(", ");
        sql = `${sql} RETURNING ${cols}`;
      }
      sql = this.preprocessQuery(sql);
      return this.withRawConnection(async (conn) => {
        const client = conn as unknown as pg.Client;
        return this._instrumentedQueryOnClient(client, sql, name ?? "SQL", binds);
      });
    }
    if (this._useInsertReturning) {
      // A multi-column RETURNING list is the auto-populated-columns read-back
      // (Rails `_create_record` zips every returning column). The shared helper
      // runs it through the bind-aware internalExecQuery (which materializes) and
      // dirties the transaction, handing back the whole Result — `super`/
      // `executeMutation` would collapse the row to its first column. A single-
      // column list falls through to the `super`/`executeMutation` fast path
      // (scalar id + prepared-statement-cache retry).
      const readback = await execInsertReturningReadback.call(
        this as never,
        sql,
        name,
        binds,
        pk,
        returning,
      );
      if (readback !== undefined) return readback;
      // When the caller names RETURNING columns (a custom-named serial/identity
      // PK), append them up front via sql_for_insert so executeMutation reads the
      // DB-generated value back from the right column instead of falling back to
      // its auto-appended `RETURNING id` (which errors on tables without an `id`
      // column and leaves the in-memory PK stale). Mirrors Rails, where the
      // abstract exec_insert runs sql_for_insert before the query.
      if (returning && returning.length > 0) {
        const [sqlWithReturning, resolvedBinds] = sqlForInsert.call(
          this as never,
          sql,
          pk ?? null,
          binds,
          returning,
        );
        return super.execInsert(sqlWithReturning, name, resolvedBinds, pk, sequenceName, returning);
      }
      return super.execInsert(sql, name, binds, pk, sequenceName, returning);
    }
    // Resolve sequence name before acquiring the INSERT client so the
    // metadata queries (primaryKey, defaultSequenceName) don't consume
    // an extra connection while the INSERT client is held.
    if (!sequenceName) {
      const tableRef = extractTableRefFromInsertSql.call(this as never, sql);
      if (tableRef) {
        if (pk == null) pk = (await this.primaryKey(tableRef)) as string | null;
        const pkStr = typeof pk === "string" ? pk : null;
        const resolvedPk = suppressCompositePrimaryKey(pkStr ?? undefined);
        sequenceName = resolvedPk ? await this.defaultSequenceName(tableRef, resolvedPk) : null;
      }
    }
    sql = this.preprocessQuery(sql);
    // currval() is session-scoped: INSERT and SELECT currval(...) must
    // run on the same connection. withRawConnection pins both to one client.
    return this.withRawConnection(async (conn) => {
      const client = conn as unknown as pg.Client;
      const insertResult = await this._instrumentedQueryOnClient(client, sql, name ?? "SQL", binds);
      if (!sequenceName) return insertResult;
      const currvalSql = `SELECT currval(${this.quote(sequenceName)})`;
      return this._instrumentedQueryOnClient(client, currvalSql, "SQL", []);
    });
  }

  /** Mirrors: PostgreSQL::DatabaseStatements#returning_column_values — the full
   *  first row of the RETURNING result (supports multi-column RETURNING). *
   * @internal
   */
  override returningColumnValues(result: Result): unknown[] | undefined {
    return pgReturningColumnValues(result);
  }

  /**
   * Returns true for raw pg errors that indicate the database doesn't exist (SQLSTATE 3D000).
   *
   * @noRailsEquivalent Rails recognizes the no-such-database condition inline at the connect site
   *   and raises
   *   `ActiveRecord::NoDatabaseError` there (postgresql_adapter.rb:63, sqlite3_adapter.rb:38,120) —
   *   there is no named predicate to mirror. trails needs the predicate separated from raising
   *   because `DatabaseTasks._isMissingDatabaseError` (tasks/database-tasks.ts) classifies an
   *   already-raised raw driver error, after the adapter failed to construct. Identical shape on all
   *   three: the base returns false, each concrete adapter overrides with its driver check.
   */
  isNoDatabaseError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    return (error as { code?: unknown }).code === "3D000";
  }

  // Mirrors: PostgreSQLAdapter.new_client (postgresql_adapter.rb:57)
  // Connects a single pg.Client and translates connection errors into
  // the same ActiveRecord error hierarchy as Rails (ConnectionNotEstablished,
  // NoDatabaseError, DatabaseConnectionError).
  static async newClient(config: pg.ClientConfig): Promise<pg.Client> {
    const client = new pg.Client(config);
    // pg.Client parses connectionString on construction, so these typed properties
    // reflect the actual params even when only connectionString was passed —
    // matching Rails' conn_params[:dbname] / [:user] / [:host] access.
    const { database, user, host } = client;
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      if (database === "postgres") {
        throw new ConnectionNotEstablished(message);
      } else if (database && message.includes(database)) {
        throw NoDatabaseError.dbError(database);
      } else if (user && message.includes(user)) {
        throw DatabaseConnectionError.usernameError(user);
      } else if (host && message.includes(host)) {
        throw DatabaseConnectionError.hostnameError(host);
      } else {
        throw new ConnectionNotEstablished(message);
      }
    }
  }

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    await this.withRawConnection(async (conn) => {
      const client = conn as unknown as pg.Client;
      try {
        await this._serializePinnedQuery(client, () => client.query(sql));
      } catch (e) {
        // The bare driver `exec()` is the DDL path for schema statements.
        // Unlike `execute()`/`executeMutation()`, it bypasses bind rewriting,
        // but server-side rejections (e.g. SQLSTATE 42804 "cannot be cast
        // automatically" from a bad change_column) must still surface as
        // ActiveRecord::StatementInvalid, not a raw pg driver error.
        throw this._translateException(e, sql, []);
      }
    });
  }

  /**
   * Close the persistent connection. After this call the adapter is
   * unusable; `_pgClientOptions` is nulled so `active` returns false
   * and `_acquireFreshClient` throws.
   */
  async close(): Promise<void> {
    this._releaseStatementPool();
    this._client = null;
    this._inTransaction = false;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    this._closed = true;
    // Bump the in-flight acquire's generation (see disconnectBang) so a stale
    // connect end()s its socket instead of adopting it onto a racing reconnect.
    if (this._acquiring) this._acquireGeneration++;
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._pgClientOptions = null;
    if (conn) await conn.end();
  }

  /**
   * Mirrors Rails' private `PostgreSQLAdapter#connect`: open `@raw_connection`
   * and run `configure_connection`. With the single-client design that work
   * lives in `_acquireFreshClient` (open + `_maybeConfigureConnection`), which
   * this delegates to. Driven by `connectBang()` (initial use) and
   * `reconnect()` (post-failure) so both populate `_connection` eagerly.
   *
   * @internal
   */
  async connect(): Promise<void> {
    await this._acquireFreshClient();
  }

  /**
   * Mirrors Rails' `connect!` (abstract_adapter.rb:778), which is just
   * `verify!`: with no raw connection, verifyBang drives
   * `reconnectBang({ restoreTransactions: true })` — the retry loop that gives
   * a configure_connection failure its connection_retries re-attempts
   * (adapter_test.rb:852) — and eagerly populates `this._connection` so the
   * base `withRawConnection` loop yields it directly. Called pre-loop by the
   * base when `_connection` is null and the transaction state is restorable.
   *
   * @internal
   */
  override async connectBang(): Promise<void> {
    await this.verifyBang();
  }

  /**
   * Tear down the current socket (fire-and-forget `client.end()`) and reset
   * all per-connection state WITHOUT re-opening. `_closed` stays false so the
   * next acquire re-opens lazily. Used by the connection-error handlers in the
   * transaction-control paths (begin/commit/rollback): they only need to
   * discard the poisoned client so the next `withRawConnection` pre-loop
   * `connectBang()` opens a fresh one — they must NOT eagerly re-open, or a
   * subsequent `reconnect()` would close the just-opened socket and open
   * another (a wasted open/close cycle).
   *
   * @internal
   */
  private _discardRawConnection(): void {
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._client = null;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    this._statementPool?.detach();
    this._statementPool = null;
    this._needsDeallocateAll = false;
    this._inTransaction = false;
    this._closed = false;
    conn?.end().catch(() => {});
  }

  /**
   * Mirrors the role of Rails' private `PostgreSQLAdapter#reconnect`. Rails
   * does `@raw_connection&.reset` (libpq PQreset, an in-place reconnect on the
   * existing socket) and only opens a fresh connection if that fails; node-pg
   * has no in-place reset, so trails always tears down and opens a fresh
   * `pg.Client` via `connect()` — the behavior differs (fresh socket vs reuse)
   * but the role is identical: leave `@raw_connection` live and reconfigured.
   *
   * Like Rails' private `reconnect`, this does NOT reset the transaction
   * manager — that is owned by the inherited `AbstractAdapter#reconnectBang`
   * lifecycle (Rails' `reconnect!`), which runs the restore-aware
   * `resetTransaction` after this raw reconnect. Callers wanting the full
   * reset/reconfigure/retry cycle drive `reconnectBang` (as `verifyBang` does),
   * not this primitive.
   *
   * @internal
   */
  async reconnect(): Promise<void> {
    this._discardRawConnection();
    // Rails' private `reconnect` repopulates `@raw_connection`. Eagerly
    // open + configure the new pg.Client via `connect()` so `withRawConnection`
    // yields a live handle directly, with no lazy second acquire. The inherited
    // `reconnectBang` awaits this (and retries connection errors); the
    // fire-and-forget error-handler callers ignore the result via `.catch`.
    await this.connect();
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#active?` + `AbstractAdapter#verify!`.
   * Pings the server with a lightweight query (Rails' `active?`); on PG::Error
   * (server-side disconnect, timeout, pg_terminate_backend) it drives the
   * inherited `reconnectBang({ restoreTransactions: true })` — exactly Rails'
   * `verify!` → `reconnect!(restore_transactions: true)` — for the retry loop,
   * restore-aware tx reset, and reconfigure. PG keeps its own `verifyBang`
   * because trails' `active` getter is a sync property and cannot run the
   * async ping the way Rails' `active?` does.
   *
   * @internal
   */
  override async verifyBang(): Promise<void> {
    // Mirrors Rails' verify! → reconnect! when active? returns false
    // (abstract_adapter.rb:759-776). The ConnectionPool calls this on
    // checkout, so a prior disconnectBang/discardBang doesn't leave
    // the adapter permanently unusable — the pool flow reopens it.
    //
    // A terminal close() nulls _pgClientOptions; in that state there
    // is nothing to reconnect to, so refuse to mark the adapter
    // verified rather than silently returning a usable-looking handle.
    if (this._pgClientOptions == null) {
      throw new Error("PostgreSQLAdapter: connection is closed");
    }
    if (this._closed || !this._rawConnection) {
      await this.reconnectBang({ restoreTransactions: true });
      this.verifiedBang();
      return;
    }
    while (this._inFlightReset) await this._inFlightReset;
    // Re-check after the yield: a concurrent disconnect/close/discard
    // may have nulled _rawConnection while we were waiting.
    const conn = this._rawConnection;
    if (this._closed || !conn) {
      await this.reconnectBang({ restoreTransactions: true });
      this.verifiedBang();
      return;
    }
    try {
      await conn.query(";");
    } catch {
      await this.reconnectBang({ restoreTransactions: true });
    }
    this.verifiedBang();
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#reset!` (postgresql_adapter.rb:371).
   * If there's no connection yet, lazy-connect on next use. Otherwise
   * fire ROLLBACK (best-effort, only if in TX) followed by DISCARD ALL
   * on the SAME persistent connection — preserves the socket and only
   * scrubs session state, exactly as Rails does.
   *
   * @internal
   */
  override resetBang(): void {
    if (!this._rawConnection) {
      super.resetBang();
      return;
    }
    // Capture the live connection so subsequent DISCARD ALL chains
    // onto it even if a concurrent reconnect later nulls
    // _rawConnection. resetBang is sync per AbstractAdapter, so we
    // can't truly await — chain via .then so DISCARD ALL is sent
    // only AFTER ROLLBACK's response is processed (matching the
    // sequence in Rails' reset!, postgresql_adapter.rb:371-382).
    const live = this._rawConnection;
    // Chain off the maintenance tail so ROLLBACK (and the DISCARD ALL below)
    // serialize behind any pending DEALLOCATE on the pinned client rather than
    // firing onto a client that's still executing one.
    let work: Promise<unknown> = this._maintenanceTail;
    if (this._client) {
      this._cancelAnyRunningQuery();
      work = this._maintenanceTail.then(() => live.query("ROLLBACK")).catch(() => {});
      this._client = null;
      this._inTransaction = false;
    }
    // Gate all query paths behind this promise so no query can interleave
    // between ROLLBACK and DISCARD ALL. _acquireFreshClient awaits it.
    // Capture in a local so the .finally() only clears the barrier when
    // this specific reset is still the active one — prevents a second
    // concurrent resetBang() from having its barrier cleared prematurely
    // by the first reset's .finally().
    // DISCARD ALL also resets session-level GUCs (standard_conforming_
    // strings, intervalstyle, client_min_messages, custom variables) —
    // mark the connection unconfigured so the chain below (and any racing
    // acquire) re-runs _maybeConfigureConnection. Matches Rails' reset!,
    // which calls attempt_configure_connection via super
    // (abstract_adapter.rb:729). Set BEFORE building the chain so the
    // chained _maybeConfigureConnection sees it false and reconfigures.
    this._connectionConfigured = false;
    const reset: Promise<void> = work
      .then(() => live.query("DISCARD ALL"))
      // Re-run configure_connection on the SAME socket once DISCARD ALL has
      // landed, so a connection yielded by withRawConnection (which drains
      // this barrier via awaitRawConnectionReady) is already reconfigured —
      // mirroring Rails' blocking reset! → super → configure_connection.
      // Guard on socket identity: a concurrent reconnect may have swapped in
      // a new client, in which case its own acquire handles configuration.
      // On configure failure, tear down the socket (mirroring _doAcquire's
      // catch) so awaitRawConnectionReady re-opens a fresh, configured
      // connection rather than yielding an unconfigured one.
      .then(() => {
        if (this._rawConnection === live && !this._closed) {
          return this._maybeConfigureConnection(live).catch((error: unknown) => {
            if (this._rawConnection === live) {
              this._rawConnection = null;
              this._connectionConfigured = false;
              this._typeMapEagerLoaded = false;
              this._statementPool?.detach();
              this._statementPool = null;
            }
            live.end().catch(() => {});
            throw error;
          });
        }
      })
      .then(() => {})
      .catch(() => {})
      .finally(() => {
        if (this._inFlightReset === reset) this._inFlightReset = null;
      });
    this._inFlightReset = reset;
    // Make subsequent maintenance ops (DEALLOCATE) queue behind the full
    // ROLLBACK → DISCARD ALL → reconfigure chain on this socket.
    this._maintenanceTail = reset;
    // DISCARD ALL drops server-side prepared statements — reset the
    // local pool so a later PREPARE name (a1, a2, ...) doesn't collide.
    this._statementPool?.reset();
    super.resetBang();
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#configure_connection`. Applies
   * per-connection settings (standard_conforming_strings, intervalstyle,
   * client_min_messages, session variables). Delegates to the internal
   * `_maybeConfigureConnection` which gates on a boolean so the
   * persistent client is configured exactly once per connection.
   *
   * The inherited `reconnectBang` lifecycle calls this argless after the
   * raw `reconnect()` has nulled `_rawConnection`. PG opens the new
   * connection lazily on the next acquire, where `_acquireFreshClient`
   * runs `_maybeConfigureConnection` itself — so the argless call is a
   * no-op (configure-on-next-acquire), mirroring Rails' connect-time
   * `configure_connection`.
   *
   * @internal
   */
  async configureConnection(client?: pg.Client): Promise<void> {
    if (!client) return;
    return this._maybeConfigureConnection(client);
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#disconnect!`. Tears down the
   * persistent connection asynchronously so no new queries can start;
   * the underlying socket drains in the background.
   */
  override disconnectBang(): void {
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._client = null;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    this._statementPool?.detach();
    this._statementPool = null;
    this._needsDeallocateAll = false;
    this._inTransaction = false;
    // Rails' disconnect! is NOT terminal: with_raw_connection's
    // `connect! if @raw_connection.nil?` (abstract_adapter.rb:985) lazily
    // reopens on the next query (cases/disconnected_test.rb). `_closed = true`
    // is reserved for close()/discardBang(), which ARE terminal.
    // If a connect is in flight, bump its generation so it tears down (end()s,
    // not adopts) its socket when it resolves — even if a racing reconnect
    // clears _closed first — and so a later reconnect opens a fresh acquire
    // instead of reusing the orphaned one. Unlike discardBang, this generation
    // is NOT recorded in _discardedAcquireGenerations, so _teardownRacedClient
    // end()s the socket (matching Rails' disconnect!) rather than abandoning it.
    if (this._acquiring) this._acquireGeneration++;
    conn?.end().catch(() => {});
    // Rails' disconnect! calls reset_transaction; super.disconnectBang() does not.
    this.resetTransaction();
    super.disconnectBang();
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#discard!`. Used when the process is
   * about to fork or the connection is unrecoverably broken. Rails does
   * `@raw_connection&.socket_io&.reopen(IO::NULL)` then nulls the handle — it
   * ABANDONS the fd WITHOUT closing it, so a forked child tearing down its
   * inherited copy can't disturb the parent's live server socket. We mirror
   * that: drop every reference and neutralize the abandoned socket via
   * `abandonRawSocket` (unref + strip listeners) but never call `client.end()`,
   * which would actively close it.
   */
  override discardBang(): void {
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._client = null;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    this._statementPool?.detach();
    this._statementPool = null;
    this._needsDeallocateAll = false;
    this._inTransaction = false;
    this._closed = true;
    // If a connect is in flight, record its generation so it abandons (not
    // ends/adopts) its socket when it resolves, then bump so a later
    // reconnect opens a fresh acquire instead of reusing the orphaned one.
    if (this._acquiring) this._discardedAcquireGenerations.add(this._acquireGeneration);
    this._acquireGeneration++;
    abandonRawSocket(conn);
    // Rails' discard! (unlike disconnect!) does NOT reset the transaction
    // manager — it only forgets the connection (super is the empty base
    // discard!). So we drop the references above and call the no-op super
    // without running the disconnect/reset-transaction lifecycle.
    super.discardBang();
  }

  /**
   * Test-only accessor for the single session-scoped StatementPool
   * attached to `_rawConnection`. After the Phase D-X collapse there
   * is one pool per adapter for the connection's full lifetime — it
   * survives commit/rollback and is only torn down on disconnect /
   * close / reconnect. Returns undefined before the first acquire (no
   * pool built yet) or after teardown. Mirrors Rails'
   * `raw_connection.instance_variable_get(:@statement_pool)` escape
   * hatch used by `PostgreSQL::StatementPoolTest`.
   *
   * @internal
   */
  _statementPoolForTest(): StatementPool | undefined {
    return this._statementPool ?? undefined;
  }

  /** @internal — the currently-held txn client (always _rawConnection while in TX). */
  _currentClientForTest(): pg.Client | null {
    return this._client;
  }

  /** @internal — whether the next acquire will run DEALLOCATE ALL. */
  _needsDeallocateAllForTest(): boolean {
    return this._needsDeallocateAll;
  }

  /**
   * Clear cached prepared statements. Mirrors Rails'
   * `PostgreSQLAdapter#clear_cache!` which sends DEALLOCATE for each
   * cached entry on the adapter's sole PG::Connection. With the
   * single-client design we always own the session, so a full
   * `clear()` always applies (it fires DEALLOCATE per entry via the
   * PG-specific dealloc override). If the connection has been torn
   * down (post-disconnect/reconnect failure window) we mark
   * `_needsDeallocateAll` so the next acquire drains the server side.
   */
  override clearCacheBang(): void {
    super.clearCacheBang();
    if (this._rawConnection && this._statementPool) {
      this._statementPool.clear();
    } else if (this._statementPool) {
      this._statementPool.reset();
      this._needsDeallocateAll = true;
    }
  }

  /**
   * Check if we're in a transaction.
   *
   * @internal
   */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  /**
   * Get the underlying persistent pg.Client.
   * Escape hatch for advanced usage — mirrors mysql2/sqlite3 adapter
   * conventions (`get raw()`). Throws with a precise reason when the
   * connection is unavailable: either not yet lazy-opened (call any
   * query method first), or torn down by disconnect/discard/close.
   */
  get raw(): pg.Client {
    if (this._rawConnection) return this._rawConnection;
    if (this._closed || this._pgClientOptions == null) {
      throw new Error("PostgreSQLAdapter: connection is closed");
    }
    throw new Error(
      "PostgreSQLAdapter: connection has not been opened yet — run a query first to lazy-connect",
    );
  }

  // ---------------------------------------------------------------------------
  // Feature support predicates
  // Mirrors: PostgreSQLAdapter supports_* methods
  // ---------------------------------------------------------------------------

  // Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter#build_insert_sql.
  // Like the SQLite form, but the timestamp-touch guard uses
  // `<table>.<col> IS NOT DISTINCT FROM excluded.<col>` (Rails qualifies the
  // target with the table name and uses Postgres-correct NULL comparison).
  override buildInsertSql(insert: InsertBuilder): string {
    let sql = `INSERT ${insert.into()}`;

    if (insert.skipDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO NOTHING`;
    } else if (insert.updateDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO UPDATE SET `;
      const raw = insert.rawUpdateSql();
      if (raw) {
        sql += raw.value;
      } else {
        const assignments: string[] = [];
        const touch = insert.touchModelTimestampsUnless(
          (col) => `${insert.quotedTableName()}.${col} IS NOT DISTINCT FROM excluded.${col}`,
        );
        if (touch) assignments.push(touch);
        for (const col of insert.updatableColumns()) assignments.push(`${col}=excluded.${col}`);
        sql += assignments.join(",");
      }
    }

    const ret = insert.returning();
    if (ret) sql += ` RETURNING ${ret}`;
    return sql;
  }

  /**
   * Mirrors PG::Connection#server_version — reads the live server version
   * number off the raw connection. A standalone seam so tests can stub a
   * bad (zero) version the way Rails stubs `raw_connection.server_version`.
   *
   * @internal
   */
  async _serverVersion(client: pg.Client): Promise<number> {
    const result = await client.query("SHOW server_version_num");
    return parseInt(String(result.rows[0]?.server_version_num ?? "0"), 10);
  }

  /**
   * Fetch and cache the server version number. Called automatically on
   * the first query via _ensureInitialized(). Version-dependent
   * supports_* methods throw if called before initialization.
   */
  async getDatabaseVersion(): Promise<number> {
    if (this._databaseVersion !== null) return this._databaseVersion;
    // Off the withRawConnection loop: this is a memoized bootstrap probe run
    // during init / schema introspection (lock-free). Acquire the raw client
    // directly via _acquireFreshClient(); tear down on a dead socket so the next caller
    // gets a fresh connection (the recovery withClient used to provide).
    {
      const client = await this._acquireFreshClient();
      try {
        const version = await this._serverVersion(client);
        // Mirrors Rails' get_database_version: a zero version means the version
        // probe failed (e.g. a half-open connection), so don't cache it — raise
        // ConnectionFailed so the reconnect path can retry.
        if (version === 0) {
          throw new ConnectionFailed("Could not determine PostgreSQL version");
        }
        this._databaseVersion = version;
      } catch (error) {
        if (PostgreSQLAdapter._isConnectionError(error)) this._discardRawConnection();
        throw error;
      }
    }
    // Eagerly populate optimizer hints flag
    if (this._hasOptimizerHints === null) {
      try {
        const client = await this._acquireFreshClient();
        const result = await client.query(
          "SELECT COUNT(*) AS count FROM pg_available_extensions WHERE name = $1",
          ["pg_hint_plan"],
        );
        this._hasOptimizerHints = Number(result.rows[0]?.count) > 0;
      } catch (error) {
        // Carry the version-probe block's recovery forward: tear down on a
        // dead socket so the next _acquireFreshClient() opens a fresh pg.Client rather
        // than handing back the stale handle (the recovery the former
        // withClient body provided before being swallowed by a bare catch).
        if (PostgreSQLAdapter._isConnectionError(error)) this._discardRawConnection();
        this._hasOptimizerHints = false;
      }
    }
    return this._databaseVersion;
  }

  /**
   * Synchronous version check. Populated lazily on first query via
   * _ensureInitialized(). Throws if accessed before any query has run.
   */
  get databaseVersion(): number {
    if (this._databaseVersion === null) {
      throw new Error(
        "databaseVersion is not available yet — call getDatabaseVersion() after connecting",
      );
    }
    return this._databaseVersion;
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#postgresql_version`, an alias for
   * `database_version` (postgresql_adapter.rb). Public so callers can read the
   * connected server's numeric version without going through the protected
   * `databaseVersion` getter directly.
   */
  postgresqlVersion(): number {
    return this.databaseVersion;
  }

  supportsBulkAlter(): boolean {
    return true;
  }
  supportsIndexSortOrder(): boolean {
    return true;
  }
  // Rails: `index.using == :btree || super` (postgresql_adapter.rb#default_index_type?).
  override defaultIndexType(using?: string): boolean {
    return using === "btree" || super.defaultIndexType(using);
  }
  supportsPartitionedIndexes(): boolean {
    return this.databaseVersion >= 110000;
  }
  supportsPartialIndex(): boolean {
    return true;
  }
  supportsIndexInclude(): boolean {
    return this.databaseVersion >= 110000;
  }
  supportsExpressionIndex(): boolean {
    return true;
  }
  supportsTransactionIsolation(): boolean {
    return true;
  }
  supportsForeignKeys(): boolean {
    return true;
  }
  supportsCheckConstraints(): boolean {
    return true;
  }
  supportsExclusionConstraints(): boolean {
    return true;
  }
  supportsUniqueConstraints(): boolean {
    return true;
  }
  supportsValidateConstraints(): boolean {
    return true;
  }
  supportsDeferrableConstraints(): boolean {
    return true;
  }
  supportsViews(): boolean {
    return true;
  }
  supportsDatetimeWithPrecision(): boolean {
    return true;
  }
  supportsJson(): boolean {
    return true;
  }
  supportsComments(): boolean {
    return true;
  }
  supportsSavepoints(): boolean {
    return true;
  }
  supportsRestartDbTransaction(): boolean {
    return this.databaseVersion >= 120000;
  }
  supportsInsertReturning(): boolean {
    return true;
  }
  supportsInsertOnConflict(): boolean {
    return this.databaseVersion >= 90500;
  }
  supportsInsertOnDuplicateSkip(): boolean {
    return this.supportsInsertOnConflict();
  }
  supportsInsertOnDuplicateUpdate(): boolean {
    return this.supportsInsertOnConflict();
  }
  supportsInsertConflictTarget(): boolean {
    return this.supportsInsertOnConflict();
  }
  supportsVirtualColumns(): boolean {
    return this.databaseVersion >= 120000;
  }
  supportsIdentityColumns(): boolean {
    return this.databaseVersion >= 100000;
  }
  supportsNullsNotDistinct(): boolean {
    return this.databaseVersion >= 150000;
  }
  supportsNativePartitioning(): boolean {
    return this.databaseVersion >= 100000;
  }

  indexAlgorithms(): Record<string, string> {
    return { concurrently: "CONCURRENTLY" };
  }

  /** @internal */
  override arelVisitor(): Visitors.ToSql {
    return new Visitors.PostgreSQLWithBinds(this);
  }

  supportsDdlTransactions(): boolean {
    return true;
  }
  supportsAdvisoryLocks(): boolean {
    return true;
  }

  // Advisory locks are session-scoped — acquire and release must use the
  // same connection. With the dual-pool collapse the adapter owns one
  // persistent pg.Client, so the lock naturally lives on `_rawConnection`
  // for its duration with no separate checkout.
  async getAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const client = await this._acquireFreshClient();
    const [sql, param] = _pgAdvisoryLockSql("pg_try_advisory_lock", "locked", lockId);
    const result = await this._serializePinnedQuery(client, () => client.query(sql, [param]));
    return result.rows[0]?.locked === true;
  }

  async releaseAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    if (!this._rawConnection) return false;
    const client = await this._acquireFreshClient();
    const [sql, param] = _pgAdvisoryLockSql("pg_advisory_unlock", "unlocked", lockId);
    const result = await this._serializePinnedQuery(client, () => client.query(sql, [param]));
    return result.rows[0]?.unlocked === true;
  }

  supportsExplain(): boolean {
    return true;
  }
  supportsExtensions(): boolean {
    return true;
  }
  supportsMaterializedViews(): boolean {
    return true;
  }
  supportsForeignTables(): boolean {
    return true;
  }
  supportsPgcryptoUuid(): boolean {
    return this.databaseVersion >= 90400;
  }

  private _hasOptimizerHints: boolean | null = null;

  supportsOptimizerHints(): boolean {
    return this._hasOptimizerHints ?? false;
  }

  supportsCommonTableExpressions(): boolean {
    return true;
  }

  supportsLazyTransactions(): boolean {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Schema management
  // ---------------------------------------------------------------------------

  async schemaNames(): Promise<string[]> {
    return this.pgSchemaStatements().schemaNames();
  }

  async createSchema(
    name: string,
    options: { force?: boolean; ifNotExists?: boolean } = {},
  ): Promise<void> {
    await this.pgSchemaStatements().createSchema(name, options);
  }

  async dropSchema(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    await this.pgSchemaStatements().dropSchema(name, options);
  }

  async schemaExists(name: string): Promise<boolean> {
    return this.pgSchemaStatements().schemaExists(name);
  }

  async currentSchema(): Promise<string> {
    return this.pgSchemaStatements().currentSchema();
  }

  async dataSourceExists(name: string): Promise<boolean> {
    return this.pgSchemaStatements().dataSourceExists(name);
  }

  quoteColumnName(name: string): string {
    return pgQuoteColumnName(name);
  }

  quoteTableName(name: string): string {
    return pgQuoteTableName(name);
  }

  /**
   * Quote a value for inclusion in a SQL literal. PG-specific branches
   * (XmlData, BitData, Range, ArrayData) fall through to the base
   * dispatch, and strings use PG's `E'\\\\'`-escape form when a
   * backslash is present.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting#quote
   */
  override quote(value: unknown): string {
    // `.call(this)` so the inherited date/time dispatch resolves to this
    // adapter's `quotedDate` (BC-suffixing), mirroring PG#quote's `super`.
    return pgQuote.call(this, value);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting#quoted_date.
   * Appends " BC" for proleptic years ≤ 0; `quote` dispatches through here.
   */
  quotedDate(value: Parameters<typeof pgQuotedDate>[0]): string {
    return pgQuotedDate(value);
  }

  override typeCast(value: unknown): unknown {
    // `.call(this)` so the inherited date/time dispatch resolves to this
    // adapter's `quotedDate` (BC-suffixing), mirroring PG#type_cast's `super`.
    return pgTypeCast.call(this, value);
  }

  /**
   * Normalize a single bind value before handing it to node-postgres.
   *
   * BinaryData wrappers (produced by `Type::Binary::Data`-shape serializers
   * like `EncryptedAttributeType` on binary columns) are unwrapped to a
   * Buffer so pg binds them as bytea; pg has no built-in coercion for
   * BinaryData and would `JSON.stringify` it otherwise, corrupting bytes
   * 128–255 (the PG-only encryption binary round-trip failure surfaced
   * by Phase 9b-1). Other values flow through `temporalToBindString` for
   * Temporal / infinity sentinel handling.
   *
   * Mirrors Rails' `type_casted_binds` calling `type_cast` per value.
   * Detection is duck-typed (`bytes: Uint8Array`) rather than delegating
   * to `this.typeCast` so the gate survives split module identity in the
   * dep tree (`pgTypeCast`'s `instanceof BinaryData` check would silently
   * miss when the encryption module and the adapter resolve different
   * copies of `@blazetrails/activemodel`).
   * @internal
   */
  private _bindForPg(value: unknown): unknown {
    // Duck-type BinaryData detection: instanceof would silently miss across
    // module-identity splits (e.g. duplicated @blazetrails/activemodel copies
    // in the dep tree), in which case the wrapper would slip past as a plain
    // object and pg would JSON.stringify it. Checking the Uint8Array `bytes`
    // shape directly is robust to that.
    if (
      value !== null &&
      typeof value === "object" &&
      (value as { bytes?: unknown }).bytes instanceof Uint8Array &&
      !(value instanceof Uint8Array)
    ) {
      const u8 = (value as { bytes: Uint8Array }).bytes;
      return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    }
    // Date/time Temporal values bind through the adapter's BC-aware `quotedDate`
    // (proleptic years ≤ 0 get the " BC" suffix); `value_for_database` now yields
    // the cast Temporal rather than a pre-quoted string. PlainTime keeps the
    // abstract path's 2000-01-01-stripped form via temporalToBindString below.
    if (
      value instanceof Temporal.Instant ||
      value instanceof Temporal.PlainDate ||
      value instanceof Temporal.PlainDateTime ||
      value instanceof Temporal.ZonedDateTime
    ) {
      return this.quotedDate(value);
    }
    // Object-valued binds reach pg as raw objects unless serialized to their pg
    // literal string. Rails' `type_casted_binds` applies the adapter `type_cast`
    // per value, which routes the PG OID `Data` wrappers — Range → `encode_range`,
    // ArrayData → `encode_array`, Xml/Bit `Data` → `value.to_s` (Quoting#type_cast).
    // These are the object-valued cast outputs `value_for_database` can emit
    // (e.g. a `where` bind on a range/array/bit/xml column). Apply the cast
    // narrowly to these wrapper types so we don't reintroduce the bind-everything
    // pinned-client hang.
    if (
      value instanceof OidRange ||
      value instanceof ArrayData ||
      value instanceof XmlData ||
      value instanceof BitData
    ) {
      return this.typeCast(value);
    }
    return temporalToBindString(value, "postgres");
  }

  /**
   * Mirrors: PostgreSQL::Quoting#lookup_cast_type (postgresql/quoting.rb:195).
   * Resolves a sql_type string to its OID with a live
   * `SELECT '<sql_type>'::regtype::oid` SCHEMA query, then looks the OID up in
   * the type map (Rails' `super` = abstract `type_map.lookup(oid)`). The PG
   * type map is keyed by OID and short typname, so DDL-formatted names like
   * `character varying` resolve only through this regtype round-trip — which
   * also handles typmods (`(255)`), `[]` array suffixes, enums, and domains.
   *
   * Async where Rails (and the inherited `AbstractAdapter#lookup_cast_type`) is
   * sync, and public where Rails keeps it private — TS cannot narrow an
   * inherited member's visibility. Contained today: PG overrides both
   * `lookupCastTypeFromColumn` (sync, OID-keyed) and `quoteDefaultExpression`
   * (awaits this), so no sync duck-typed consumer sees the promise. Tracked by
   * `pg-lookup-cast-type-async-divergence`.
   * @internal
   */
  async lookupCastType(sqlType: string | null): Promise<Type> {
    const rows = await this.schemaQuery(`SELECT ${this.quote(sqlType)}::regtype::oid`);
    return this.typeMap.lookup(Number(rows[0]?.oid));
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting#quote_default_expression.
   * Routes through the array- and typeMap-aware `pgQuoteDefaultExpression`
   * so DEFAULT clauses on array columns and OID-backed types serialize
   * correctly. Async: a ColumnDefinition (no OID) resolves its cast type via
   * `lookupCastType`'s live regtype query, as Rails does.
   */
  override quoteDefaultExpression(value: unknown, column?: unknown): Promise<string> {
    const col = column as
      | {
          sqlType?: string | null;
          type?: string;
          array?: boolean;
          oid?: number | null;
          fmod?: number | null;
          options?: { array?: boolean };
        }
      | undefined;
    // ColumnDefinition stores `array` under `options`; live PG Column
    // instances expose it as a top-level boolean. Accept both shapes so
    // DDL paths (addColumn/changeColumn → ColumnDefinition) and dump/SET
    // DEFAULT paths (live Column) both fire the array branch.
    const isArray = col?.array === true || col?.options?.array === true;
    const rawSqlType = col?.sqlType ?? col?.type ?? null;
    const self = this;
    const lookup = {
      lookupCastTypeFromColumn(c: {
        sqlType?: string | null;
        oid?: number | null;
        fmod?: number | null;
      }):
        | { serialize?(v: unknown): unknown }
        | null
        | Promise<{ serialize?(v: unknown): unknown } | null> {
        // A live Column carries an OID, so hand it straight through: Rails
        // keys the lookup on (oid, fmod, sql_type) (quoting.rb:191), and for
        // an array column that OID resolves to OID::Array(subtype) — an
        // array-aware type whose serialize returns ArrayData, which
        // quoteDefaultExpression handles directly.
        if (c.oid != null) {
          return self.lookupCastTypeFromColumn(c) as {
            serialize?(v: unknown): unknown;
          } | null;
        }
        // No OID means a ColumnDefinition from a DDL path: Rails resolves its
        // sql_type with the live regtype query (postgresql/quoting.rb:195),
        // which handles typmods and `[]` array suffixes server-side — an
        // array sql_type resolves to the array type's OID directly.
        return self.lookupCastType(c.sqlType ?? "");
      },
    };
    return pgQuoteDefaultExpression.call(
      this,
      value,
      col != null
        ? {
            array: isArray,
            sqlType: rawSqlType,
            oid: col.oid ?? null,
            fmod: col.fmod ?? null,
            // Rails' uuid branch tests `column.type` (the AR type symbol), not
            // sql_type, so forward it separately from `rawSqlType`.
            type: col.type ?? null,
          }
        : null,
      lookup,
    );
  }

  columnsForDistinct(columns: string | string[], orders?: (string | Nodes.Node)[]): string {
    return this.pgSchemaStatements().columnsForDistinct(columns, orders);
  }

  async extensions(): Promise<string[]> {
    // Rails does not filter plpgsql or any built-in extension — the full list
    // (including pg_catalog.plpgsql) is returned, matching PostgreSQLAdapter#extensions.
    const rows = await this.schemaQuery(`
      SELECT pg_extension.extname, n.nspname AS schema,
             current_schema() AS current_schema
      FROM pg_extension
      JOIN pg_namespace n ON pg_extension.extnamespace = n.oid
    `);
    return rows.map((r) => {
      const schema = r.schema === r.current_schema ? null : (r.schema as string);
      return [schema, r.extname as string].filter(Boolean).join(".");
    });
  }

  async extensionEnabled(name: string): Promise<boolean> {
    return (
      (await this.queryValue(
        `SELECT installed_version IS NOT NULL FROM pg_available_extensions WHERE name = ${this.quote(name)}`,
        "SCHEMA",
      )) === true
    );
  }

  async extensionAvailable(name: string): Promise<boolean> {
    return (
      (await this.queryValue(
        `SELECT true FROM pg_available_extensions WHERE name = ${this.quote(name)}`,
        "SCHEMA",
      )) === true
    );
  }

  async enableExtension(name: string, _options?: Record<string, unknown>): Promise<void> {
    const parts = String(name).split(".");
    const extName = parts[parts.length - 1];
    const schema = parts.length > 1 ? parts[parts.length - 2] : null;
    let sql = `CREATE EXTENSION IF NOT EXISTS "${extName}"`;
    if (schema) sql += ` SCHEMA ${schema}`;
    await this.exec(sql);
    await this.reloadTypeMap();
  }

  async disableExtension(
    name: string,
    options: { force?: "cascade"; schema?: string } = {},
  ): Promise<void> {
    // Mirrors Rails: _schema, name = name.to_s.split(".").values_at(-2, -1)
    // Extensions are global in PG — DROP uses only extname, not schema.
    const parts = String(name).split(".");
    const extName = parts[parts.length - 1];
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    if (options.schema) {
      await this.withRawConnection(async (conn) => {
        const client = conn as unknown as pg.Client;
        const { rows } = await client.query(`SHOW search_path`);
        const originalSearchPath = rows[0]?.search_path as string;
        await client.query(`SELECT set_config('search_path', $1, false)`, [options.schema]);
        try {
          await client.query(`DROP EXTENSION IF EXISTS ${this.quoteIdentifier(extName)}${cascade}`);
        } finally {
          await client.query(`SELECT set_config('search_path', $1, false)`, [
            originalSearchPath ?? "public",
          ]);
        }
      });
    } else {
      await this.exec(`DROP EXTENSION IF EXISTS ${this.quoteIdentifier(extName)}${cascade}`);
    }
    // Mirrors Rails' disable_extension, which reloads the type map after the
    // drop; reloadTypeMap also drops the prepared-statement name map so a later
    // query doesn't re-execute a plan that referenced the dropped type's OID.
    await this.reloadTypeMap();
  }

  async databaseExists(name: string): Promise<boolean> {
    return this.pgSchemaStatements().databaseExists(name);
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    return this.pgSchemaStatements().indexes(tableName);
  }

  async indexNameExists(tableName: string, indexName: string): Promise<boolean> {
    return this.pgSchemaStatements().indexNameExists(tableName, indexName);
  }

  async primaryKey(tableName: string): Promise<string | string[] | null> {
    return this.pgSchemaStatements().primaryKey(tableName);
  }

  async pkAndSequenceFor(
    tableName: string,
  ): Promise<[string, { schema: string; name: string } | null] | null> {
    return this.pgSchemaStatements().pkAndSequenceFor(tableName);
  }

  async resetPkSequence(tableName: string): Promise<void> {
    await this.pgSchemaStatements().resetPkSequence(tableName);
  }

  async setPkSequence(tableName: string, value: number): Promise<void> {
    await this.pgSchemaStatements().setPkSequence(tableName, value);
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    this.schemaCache?.clearDataSourceCacheBang(this.pool, tableName);
    this.pgSchemaStatements().validateIndexLengthBang(tableName, newName);
    const [schema] = this.extractSchemaQualifiedName(tableName);
    const qualifier = schema ? `${this.quoteTableName(schema)}.` : "";
    await this.execute(
      `ALTER INDEX ${qualifier}${this.quoteColumnName(oldName)} RENAME TO ${this.quoteTableName(newName)}`,
    );
  }

  async columns(tableName: string): Promise<Column[]> {
    return this.pgSchemaStatements().columns(tableName);
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): Promise<void> {
    await this.pgSchemaStatements().changeColumn(tableName, columnName, type, options);
  }

  async createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: AbstractTableDefinition) => void),
    fn?: (t: AbstractTableDefinition) => void,
  ): Promise<void> {
    await this.pgSchemaStatements().createJoinTable(table1, table2, options, fn);
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & {
      comment?: string | null;
      ifNotExists?: boolean;
    } = {},
  ): Promise<void> {
    await this.pgSchemaStatements().addColumn(tableName, columnName, type, options);
  }

  async renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void> {
    await this.pgSchemaStatements().renameColumn(tableName, columnName, newColumnName);
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    await this.pgSchemaStatements().changeColumnDefault(tableName, columnName, defaultOrChanges);
  }

  buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: string,
    options: {
      using?: string;
      castAs?: string;
      default?: unknown;
      null?: boolean;
      array?: boolean;
    } = {},
  ): ChangeColumnDefinition {
    return this.pgSchemaStatements().buildChangeColumnDefinition(
      tableName,
      columnName,
      type,
      options,
    );
  }

  async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined> {
    return this.pgSchemaStatements().buildChangeColumnDefaultDefinition(
      tableName,
      columnName,
      defaultOrChanges,
    );
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    nullable: boolean,
    defaultValue: unknown = null,
  ): Promise<void> {
    await this.pgSchemaStatements().changeColumnNull(tableName, columnName, nullable, defaultValue);
  }

  async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: string | null | { from?: string | null; to?: string | null },
  ): Promise<void> {
    await this.pgSchemaStatements().changeColumnComment(tableName, columnName, commentOrChanges);
  }

  async changeTableComment(
    tableName: string,
    commentOrChanges: string | null | { from?: string | null; to?: string | null },
  ): Promise<void> {
    await this.pgSchemaStatements().changeTableComment(tableName, commentOrChanges);
  }

  /** @internal */
  async validateConstraint(tableName: string, constraintName: string): Promise<void> {
    await this.pgSchemaStatements().validateConstraint(tableName, constraintName);
  }

  async validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string },
  ): Promise<void> {
    await this.pgSchemaStatements().validateCheckConstraint(tableName, nameOrOptions);
  }

  async validateForeignKey(
    fromTable: string,
    toTable?: string,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<void> {
    await this.pgSchemaStatements().validateForeignKey(fromTable, toTable, options);
  }

  typeToSql(
    type: string,
    options: {
      limit?: number;
      precision?: number;
      scale?: number;
      array?: boolean;
      enumType?: string;
    } = {},
  ): string {
    return this.pgSchemaStatements().typeToSql(type, options);
  }

  foreignKeyColumnFor(tableName: string, columnName = "id"): string {
    return this.pgSchemaStatements().foreignKeyColumnFor(tableName, columnName);
  }

  /**
   * The serial detection Rails inlines in `new_column_from_field`, extracted so
   * PostgreSQLSchemaStatements#columns can share it: that path cannot delegate
   * to newColumnFromField because it batch-preloads the row OIDs and resolves
   * types through lookupCastTypeFromColumn, where fetchTypeMetadata would issue
   * a per-column pg_type query.
   * @internal
   */
  serialFromDefaultFunction(
    tableName: string,
    columnName: string,
    defaultFunction: string | null,
  ): boolean {
    const match = defaultFunction?.match(SERIAL_SEQUENCE_RE);
    if (!match) return false;
    const { sequenceName, suffix } = match.groups!;
    return this.sequenceNameFromParts(tableName, columnName, suffix) === sequenceName;
  }

  /** @internal */
  sequenceNameFromParts(tableName: string, columnName: string, suffix: string): string {
    return this.pgSchemaStatements().sequenceNameFromParts(tableName, columnName, suffix);
  }

  /** @internal */
  assertValidDeferrable(deferrable: unknown): void {
    this.pgSchemaStatements().assertValidDeferrable(deferrable);
  }

  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | "restrict" | undefined {
    return this.pgSchemaStatements().extractForeignKeyAction(specifier);
  }

  /** @internal */
  extractConstraintDeferrable(
    deferrable: boolean,
    deferred: boolean,
  ): "deferred" | "immediate" | false {
    return this.pgSchemaStatements().extractConstraintDeferrable(deferrable, deferred);
  }

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    return this.pgSchemaStatements().foreignKeys(tableName);
  }

  async foreignTables(): Promise<string[]> {
    const names = await this.queryValues(
      this.dataSourceSql(null, { type: "FOREIGN TABLE" }),
      "SCHEMA",
    );
    return names as string[];
  }

  async foreignTableExists(tableName: string): Promise<boolean> {
    if (!tableName) return false;
    const names = await this.queryValues(
      this.dataSourceSql(tableName, { type: "FOREIGN TABLE" }),
      "SCHEMA",
    );
    return names.length > 0;
  }

  quotedIncludeColumnsForIndex(columnNames: string | string[]): string {
    return this.pgSchemaStatements().quotedIncludeColumnsForIndex(columnNames);
  }

  /** @internal */
  dataSourceSql(name?: string | null, options: { type?: string } = {}): string {
    const scope = this.quotedScope(name, options);
    const type = scope.type ?? "'r','v','m','p','f'";
    let sql = `SELECT c.relname FROM pg_class c LEFT JOIN pg_namespace n ON n.oid = c.relnamespace`;
    sql += ` WHERE n.nspname = ${scope.schema}`;
    if (scope.name) sql += ` AND c.relname = ${scope.name}`;
    sql += ` AND c.relkind IN (${type})`;
    return sql;
  }

  /** @internal */
  quotedScope(
    name?: string | null,
    options: { type?: string } = {},
  ): { schema: string; name: string | null; type: string | null } {
    const [schema, table] = this.extractSchemaQualifiedName(name ?? "");
    let type: string | null = null;
    switch (options.type) {
      case "BASE TABLE":
        type = "'r','p'";
        break;
      case "VIEW":
        type = "'v','m'";
        break;
      case "FOREIGN TABLE":
        type = "'f'";
        break;
    }
    return {
      schema: schema ? this.quote(schema) : "ANY (current_schemas(false))",
      name: table ? this.quote(table) : null,
      type,
    };
  }

  /** @internal */
  referenceNameForTable(tableName: string): string {
    const [, table] = this.extractSchemaQualifiedName(tableName);
    return singularize(table);
  }

  /** @internal */
  async columnNamesFromColumnNumbers(tableOid: number, columnNumbers: number[]): Promise<string[]> {
    return this.pgSchemaStatements().columnNamesFromColumnNumbers(tableOid, columnNumbers);
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    this.schemaStatements().validateTableLengthBang(newName);
    const [oldSchema, unqualifiedOld] = this.extractSchemaQualifiedName(oldName);
    const [, unqualifiedNew] = this.extractSchemaQualifiedName(newName);
    this.schemaCache.clearDataSourceCacheBang(this.pool, oldName);
    this.schemaCache.clearDataSourceCacheBang(this.pool, newName);
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(oldName)} RENAME TO ${this.quoteIdentifier(unqualifiedNew)}`,
    );
    // Rails reads max_identifier_length here, which lazily runs the SHOW query
    // on first use; warm the memo so the truncation limit is the real server
    // value rather than the synchronous fallback.
    const maxLen = await this.warmMaxIdentifierLength();
    // After rename the table lives in the old schema; build the correct name for lookup.
    const renamedName = oldSchema
      ? `${this.quoteIdentifier(oldSchema)}.${this.quoteIdentifier(unqualifiedNew)}`
      : unqualifiedNew;
    const result = await this.pkAndSequenceFor(renamedName).catch(() => null);
    if (result) {
      const [pk, seq] = result;
      const pkeySuffix = "_pkey";
      const maxPkeyPrefix = maxLen - pkeySuffix.length;
      const oldIdx = `${unqualifiedOld.slice(0, maxPkeyPrefix)}${pkeySuffix}`;
      const newIdx = `${unqualifiedNew.slice(0, maxPkeyPrefix)}${pkeySuffix}`;
      const qualifiedOldIdx = oldSchema
        ? `${this.quoteIdentifier(oldSchema)}.${this.quoteIdentifier(oldIdx)}`
        : this.quoteIdentifier(oldIdx);
      // Always rename the pkey index when a PK exists (mirrors Rails schema_statements.rb:443-445).
      await this.exec(
        `ALTER INDEX IF EXISTS ${qualifiedOldIdx} RENAME TO ${this.quoteIdentifier(newIdx)}`,
      );
      // Only rename the sequence when the PK has one (SERIAL/BIGSERIAL; not UUID).
      if (seq) {
        const seqSuffix = `_${pk}_seq`;
        const maxSeqPrefix = maxLen - seqSuffix.length;
        const expectedOldSeq = `${unqualifiedOld.slice(0, maxSeqPrefix)}${seqSuffix}`;
        if (seq.name === expectedOldSeq) {
          const newSeqName = `${unqualifiedNew.slice(0, maxSeqPrefix)}${seqSuffix}`;
          const qualifiedOldSeq = `${this.quoteIdentifier(seq.schema)}.${this.quoteIdentifier(seq.name)}`;
          await this.exec(
            `ALTER SEQUENCE IF EXISTS ${qualifiedOldSeq} RENAME TO ${this.quoteIdentifier(newSeqName)}`,
          );
        }
      }
    }
    await this.schemaStatements().renameTableIndexes(oldName, newName);
  }

  async tables(): Promise<string[]> {
    return this.pgSchemaStatements().tables();
  }

  async views(): Promise<string[]> {
    return this.pgSchemaStatements().views();
  }

  async dataSources(): Promise<string[]> {
    return this.pgSchemaStatements().dataSources();
  }

  async tableExists(name: string): Promise<boolean> {
    return this.pgSchemaStatements().tableExists(name);
  }

  async viewExists(name: string): Promise<boolean> {
    return this.pgSchemaStatements().viewExists(name);
  }

  async addIndex(
    tableName: string,
    columns: string | string[],
    options: {
      name?: string;
      unique?: boolean;
      using?: string;
      where?: string;
      algorithm?: string;
      order?: Record<string, string> | string;
      opclass?: Record<string, string>;
      ifNotExists?: boolean;
      nullsNotDistinct?: boolean;
      include?: string[];
      comment?: string;
    } = {},
  ): Promise<void> {
    // Priming the cached database version is a trails addition: the visitor's
    // supportsNullsNotDistinct/supportsIndexInclude predicates read
    // `databaseVersion` synchronously and silently yield false on a cold
    // connection.
    await this.getDatabaseVersion();
    this.schemaCache?.clearDataSourceCacheBang(this.pool, tableName);

    // Called on the adapter, not on pgSchemaStatements(): PG overrides
    // add_index_options to quote a bare-column-name `:where`, and only the
    // adapter's override is on this path.
    const createIndex = (await this.buildCreateIndexDefinition(tableName, columns, options))!;
    await this.execute(await this.schemaCreation.accept(createIndex));

    const index = createIndex.index;
    if (index.comment) {
      await this.execute(
        `COMMENT ON INDEX ${this.quoteColumnName(index.name)} IS ${this.quote(index.comment)}`,
      );
    }
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#remove_index
  async removeIndex(
    tableName: string,
    columnOrOptions?:
      | string
      | string[]
      | { name?: string; column?: string | string[]; algorithm?: string; ifExists?: boolean },
    options: {
      name?: string;
      column?: string | string[];
      algorithm?: string;
      ifExists?: boolean;
    } = {},
  ): Promise<void> {
    // Rails: `remove_index(table_name, column_name = nil, **options)` — column
    // may be positional or in the options hash.
    let columnName: string | string[] | undefined;
    let opts: { name?: string; column?: string | string[]; algorithm?: string; ifExists?: boolean };
    if (typeof columnOrOptions === "string" || Array.isArray(columnOrOptions)) {
      columnName = columnOrOptions;
      opts = options;
    } else {
      columnName = undefined;
      opts = columnOrOptions ?? {};
    }

    if (opts.algorithm === "concurrently" && this._inTransaction) {
      throw new Error("DROP INDEX CONCURRENTLY cannot run inside a transaction");
    }

    let table = Utils.extractSchemaQualifiedName(tableName);
    let resolveOpts = opts;
    if (opts.name != null) {
      const providedIndex = Utils.extractSchemaQualifiedName(opts.name);
      resolveOpts = { ...opts, name: providedIndex.identifier };
      const tableSchema = table.schema;
      if (!tableSchema) table = new Name(providedIndex.schema, table.identifier);
      if (providedIndex.schema && tableSchema && tableSchema !== providedIndex.schema) {
        throw new ArgumentError(
          `Index schema '${providedIndex.schema}' does not match table schema '${tableSchema}'`,
        );
      }
    }

    if (opts.ifExists && !(await this.indexExists(tableName, columnName, resolveOpts))) {
      return;
    }

    // Rails resolves the name against `table.to_s` — the SCHEMA-QUALIFIED name,
    // so a generated index name matches the one addIndex produced for the same
    // argument. Passing the bare identifier here silently misses those.
    const positional = typeof columnName === "string" ? columnName : null;
    const nameOpts = Array.isArray(columnName)
      ? { ...resolveOpts, column: columnName }
      : resolveOpts;
    const indexToRemove = new Name(
      table.schema,
      await this.indexNameForRemove(table.toString(), positional, nameOpts),
    );

    const algorithm = this.indexAlgorithm(opts.algorithm);
    await this.execute(
      `DROP INDEX${algorithm ? ` ${algorithm}` : ""} ${this.quoteTableName(indexToRemove.toString())}`,
    );
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    // Rails: PostgreSQL::SchemaStatements#add_foreign_key is just
    //   assert_valid_deferrable(options[:deferrable]); super
    this.assertValidDeferrable(options.deferrable);
    await SchemaStatements.prototype.addForeignKey.call(this, fromTable, toTable, options);
  }

  async foreignKeyExists(
    fromTable: string,
    toTable?: string | ForeignKeyLookupOptions,
    options: Omit<ForeignKeyLookupOptions, "toTable"> = {},
  ): Promise<boolean> {
    return this.pgSchemaStatements().foreignKeyExists(fromTable, toTable, options);
  }

  // Mirrors: ReferentialIntegrity#disable_referential_integrity. Extracted to
  // postgresql/referential-integrity.ts (Rails houses this in the
  // ReferentialIntegrity module, not schema_statements.rb).
  override disableReferentialIntegrity = disableReferentialIntegrity;

  // Mirrors: ReferentialIntegrity#check_all_foreign_keys_valid!
  checkAllForeignKeysValidBang = checkAllForeignKeysValidBang;

  async createDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    await this.pgSchemaStatements().createDatabase(name, options);
  }

  // ---------------------------------------------------------------------------
  // Enum types
  // ---------------------------------------------------------------------------

  async createEnum(
    name: string,
    values: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    await this.pgSchemaStatements().createEnum(name, values, options);
  }

  async dropEnum(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    await this.pgSchemaStatements().dropEnum(name, options);
  }

  // ---------------------------------------------------------------------------
  // Range types
  // ---------------------------------------------------------------------------

  /**
   * @noRailsEquivalent Rails has no range-type DDL helper anywhere — ranges are created with a raw
   *   `execute("CREATE
   *   TYPE … AS RANGE")`. trails adds `createRange`/`dropRange` following Rails' own type-DDL helpers
   *   (create_enum/drop_enum/rename_enum, postgresql_adapter.rb:541-615), including their
   *   `reload_type_map` epilogue; the implementation and the full justification live at the emitting
   *   call site, connection-adapters/postgresql/schema-statements-class.ts. Deliberately
   *   PostgreSQL-only: the no-op stubs that shadowed these on AbstractAdapter were deleted rather
   *   than allowlisted, since Rails stubs only the enum quartet on the base.
   */
  async createRange(
    name: string,
    options: { subtype: string; subtypeDiff?: string },
  ): Promise<void> {
    await this.pgSchemaStatements().createRange(name, options);
  }

  /**
   * @noRailsEquivalent Rails has no range-type DDL helper anywhere — ranges are created with a raw
   *   `execute("CREATE
   *   TYPE … AS RANGE")`. trails adds `createRange`/`dropRange` following Rails' own type-DDL helpers
   *   (create_enum/drop_enum/rename_enum, postgresql_adapter.rb:541-615), including their
   *   `reload_type_map` epilogue; the implementation and the full justification live at the emitting
   *   call site, connection-adapters/postgresql/schema-statements-class.ts. Deliberately
   *   PostgreSQL-only: the no-op stubs that shadowed these on AbstractAdapter were deleted rather
   *   than allowlisted, since Rails stubs only the enum quartet on the base.
   */
  async dropRange(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    await this.pgSchemaStatements().dropRange(name, options);
  }

  async renameEnum(name: string, newNameOrOptions: string | { to: string }): Promise<void> {
    await this.pgSchemaStatements().renameEnum(name, newNameOrOptions);
  }

  async addEnumValue(
    name: string,
    value: string,
    options: { before?: string; after?: string; ifNotExists?: boolean } = {},
  ): Promise<void> {
    await this.pgSchemaStatements().addEnumValue(name, value, options);
  }

  async renameEnumValue(name: string, options: { from: string; to: string }): Promise<void> {
    await this.pgSchemaStatements().renameEnumValue(name, options);
  }

  async enumValues(name: string): Promise<string[]> {
    const [schema, enumName] = this.extractSchemaQualifiedName(name);
    let sql = `SELECT e.enumlabel AS value
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace`;
    const params: unknown[] = [];

    if (schema) {
      sql += `
       WHERE t.typname = $1 AND n.nspname = $2
       ORDER BY e.enumsortorder`;
      params.push(enumName, schema);
    } else {
      sql += `
       WHERE t.typname = $1
         AND n.nspname = ANY(current_schemas(false))
       ORDER BY e.enumsortorder`;
      params.push(enumName);
    }

    const rows = await this.schemaQuery(sql, params);
    return rows.map((r) => r.value as string);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  // quoteIdentifier is NOT overridden: PG's identifier quoting is
  // byte-identical to AbstractAdapter's double-quote form (`"x"` with
  // `"` → `""`), so the inherited base method produces the same SQL.

  /**
   * Mirrors: PostgreSQL::Quoting#quote_table_name_for_assignment
   * (`postgresql/quoting.rb:136`) — PG ignores the table and quotes
   * only the column. Abstract default returns `table.attr`-qualified;
   * PG overrides because PostgreSQL UPDATE syntax doesn't allow a
   * table-qualified column on the LHS of `SET`.
   */
  override quoteTableNameForAssignment(_table: string, attr: string): string {
    return pgQuoteTableNameForAssignment(_table, attr);
  }

  /**
   * Mirrors: PostgreSQL::Quoting#quoted_binary
   * (`postgresql/quoting.rb:152`) — `'\\xHEX'` bytea-escape form.
   * Without this override, the adapter would inherit
   * AbstractAdapter#quotedBinary (Rails-equivalent
   * `"'#{quote_string(value.to_s)}'"` from `abstract/quoting.rb:206`)
   * and emit malformed bytea literals on PG.
   */
  override quotedBinary(value: unknown): string {
    // Rails passes the `Type::Binary::Data` itself; our `quote` unwraps to bytes
    // before dispatching. Rails has a single quoted_binary with no adapter-layer
    // narrowing (postgresql/quoting.rb:152), so delegate the whole union
    // pgQuotedBinary's toBytes accepts — any ArrayBuffer view, a bare
    // ArrayBuffer, BinaryData, or a latin1 string — rather than re-narrowing.
    if (
      value instanceof BinaryData ||
      ArrayBuffer.isView(value) ||
      value instanceof ArrayBuffer ||
      typeof value === "string"
    ) {
      return pgQuotedBinary(value);
    }
    throw new TypeError(
      `quotedBinary expects Uint8Array, ArrayBuffer, Buffer, string, or BinaryData; got ${
        value === null ? "null" : typeof value
      }`,
    );
  }

  private nativeType(type: string): string {
    const map: Record<string, string> = {
      string: "character varying",
      text: "text",
      integer: "integer",
      bigint: "bigint",
      float: "double precision",
      decimal: "numeric",
      boolean: "boolean",
      date: "date",
      datetime:
        pgDatetimeConfig.datetimeType === "timestamptz"
          ? "timestamp with time zone"
          : "timestamp without time zone",
      timestamp: "timestamp without time zone",
      timestamptz: "timestamp with time zone",
      time: "time without time zone",
      binary: "bytea",
      json: "json",
      jsonb: "jsonb",
      uuid: "uuid",
    };
    return map[type] ?? type;
  }

  private quoteLiteral(value: unknown): string {
    if (value === null) return "NULL";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return pgQuoteString(String(value));
  }

  /**
   * Map PostgreSQL driver errors to ActiveRecord exception classes by
   * SQLSTATE code, matching Rails'
   * `ConnectionAdapters::PostgreSQL::DatabaseStatements#translate_exception`.
   */
  private _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    if (e instanceof ActiveRecordError) return e;
    const build = (): Error => {
      if (!(e instanceof Error)) return new StatementInvalid(String(e), { sql, binds, cause: e });
      const code = (e as { code?: string }).code;
      const msg = e.message;
      const cause = e;
      switch (code) {
        case "23505": // unique_violation
          return new RecordNotUnique(msg, { sql, binds, cause });
        case "23503": // foreign_key_violation
          return new InvalidForeignKey(msg, { sql, binds, cause });
        case "23502": // not_null_violation
          return new NotNullViolation(msg, { sql, binds, cause });
        case "22001": // string_data_right_truncation
          return new ValueTooLong(msg, { sql, binds, cause });
        case "22003": // numeric_value_out_of_range
          return new ActiveRecordRangeError(msg, { sql, binds, cause });
        case "40001": // serialization_failure
          return new SerializationFailure(msg, { sql, binds, cause });
        case "40P01": // deadlock_detected
          return new Deadlocked(msg, { sql, binds, cause });
        case "42P04": // duplicate_database
          return new DatabaseAlreadyExists(msg, { sql, binds, cause });
        case "55P03": // lock_not_available
          return new LockWaitTimeout(msg, { sql, binds, cause });
        case "57014": // query_canceled
          return new QueryCanceled(msg, { sql, binds, cause });
        case "57P01": // admin_shutdown (pg_terminate_backend or server restart)
          return new ConnectionNotEstablished(msg, { cause });
        default:
          // A severed connection (08xxx, "Connection terminated", pg's
          // "Client has encountered a connection error", …) surfaces here as a
          // generic Error or non-DatabaseError. This is the query path
          // (_translateException runs inside execute/execQuery, after the query
          // was dispatched), so it mirrors Rails' translate_exception
          // (postgresql_adapter.rb:801-818), which splits connection errors:
          //   - "connection is closed" / "no connection to the server", and the
          //     pre-send pg-internal PG::ConnectionBad → ConnectionNotEstablished
          //     (the query definitely never ran).
          //   - a libpq PG::ConnectionBad whose message ends with "\n" →
          //     ConnectionFailed ("the server may have already executed part or
          //     all of the query").
          // We preserve ConnectionNotEstablished for node-pg's pre-send/closed
          // analogues (see _isConnectionClosedBeforeSend). Rails matches these
          // messages directly, ahead of the PG::ConnectionBad split, so this
          // check runs FIRST — some of its messages ("connection is closed",
          // "no connection to the server", "client was closed") are not in
          // _isConnectionError's set and would otherwise fall through as raw
          // Errors. The remaining live-socket severs map to the retryable
          // ConnectionFailed so idempotent queries retry+reconnect and
          // non-retryable queries raise a connection error rather than a raw
          // driver error, matching Rails' remote-disconnect behavior. node-pg
          // has no libpq layer, so it cannot reproduce Rails' newline signal for
          // the ambiguous server-sever case ("Client has encountered a
          // connection error and is not queryable" is emitted identically
          // whether the socket died mid-send or just before); that residual case
          // takes ConnectionFailed. (Connect-path failures still surface as
          // ConnectionNotEstablished — see newClient.)
          if (PostgreSQLAdapter._isConnectionClosedBeforeSend(e)) {
            return new ConnectionNotEstablished(msg, { cause });
          }
          if (PostgreSQLAdapter._isConnectionError(e)) {
            return new ConnectionFailed(msg, { sql, binds, cause });
          }
          // Only wrap node-postgres `DatabaseError`s. The SQLSTATE
          // 5-char shape alone isn't enough — Node system errors like
          // `EPIPE` / `EBADF` also match it, so gating on
          // instanceof pg.DatabaseError avoids re-tagging socket /
          // network failures as StatementInvalid with misleading
          // sql/binds attached.
          if (e instanceof pg.DatabaseError && e instanceof StatementInvalid === false) {
            return new StatementInvalid(msg, { sql, binds, cause });
          }
          return e;
      }
    };
    const translated = build();
    // Mirrors Rails' PostgreSQLAdapter#translate_exception, which builds every
    // translated error with `connection_pool: @pool`. For a standalone adapter
    // that pool is a NullPool. Use setPool/setConnectionPool (both guarded) so
    // a pool attached at raise-time isn't overwritten.
    if (translated instanceof ConnectionNotEstablished) {
      translated.setPool(this.pool);
    } else if (translated instanceof AdapterError) {
      translated.setConnectionPool(this.pool);
    }
    return translated;
  }

  async dropDatabase(name: string): Promise<void> {
    await this.pgSchemaStatements().dropDatabase(name);
  }

  async recreateDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    await this.pgSchemaStatements().recreateDatabase(name, options);
  }

  /**
   * @noRailsEquivalent PERMANENT. Rails gains these bodies with `include SchemaStatements` on the
   *   adapter, so there is no accessor to mirror. Permanent because TypeScript has no `include`:
   *   the repo's substitute is a `this`-typed function assigned per method, and
   *   abstract/schema_statements.rb defines 76 of them — that many hand-assigned statics is not a
   *   readable class, and no future port removes the limitation. trails therefore keeps the module
   *   as a companion class and `schemaStatements(host?)` returns it bound to a host adapter. It is
   *   the TS stand-in for the `include`, not new capability — mysql2-adapter.ts overrides it to
   *   return the MySQL companion the same way Rails includes `MySQL::SchemaStatements`.
   */
  override schemaStatements(host?: DatabaseAdapter): SchemaStatements {
    return new PostgreSQLSchemaStatements((host ?? this) as unknown as DatabaseAdapter);
  }

  private pgSchemaStatements(): PostgreSQLSchemaStatements {
    return this.schemaStatements() as PostgreSQLSchemaStatements;
  }

  async dropTable(
    ...args:
      | [string, ...string[]]
      | [string, ...string[], { ifExists?: boolean; force?: "cascade" }]
  ): Promise<void> {
    // Rails: PostgreSQLAdapter has no separate `drop_table` — the method comes
    // solely from the included `PostgreSQL::SchemaStatements` module. Delegate
    // here so schema-cache eviction + single-statement CASCADE behavior lives
    // in one place (PostgreSQLSchemaStatements#dropTable).
    await this.schemaStatements().dropTable(...args);
  }

  async currentDatabase(): Promise<string> {
    return this.pgSchemaStatements().currentDatabase();
  }

  async encoding(): Promise<string> {
    return this.pgSchemaStatements().encoding();
  }

  async collation(): Promise<string> {
    return this.pgSchemaStatements().collation();
  }

  async ctype(): Promise<string> {
    return this.pgSchemaStatements().ctype();
  }

  async schemaSearchPath(): Promise<string> {
    return this.pgSchemaStatements().schemaSearchPath();
  }

  async setSchemaSearchPath(searchPath: string | null): Promise<void> {
    await this.pgSchemaStatements().setSchemaSearchPath(searchPath);
  }

  async clientMinMessages(): Promise<string> {
    return this.pgSchemaStatements().clientMinMessages();
  }

  async setClientMinMessages(level: string): Promise<void> {
    await this.pgSchemaStatements().setClientMinMessages(level);
  }

  async tableComment(tableName: string): Promise<string | null> {
    return this.pgSchemaStatements().tableComment(tableName);
  }

  async tablePartitionDefinition(tableName: string): Promise<string | null> {
    return this.pgSchemaStatements().tablePartitionDefinition(tableName);
  }

  async inheritedTableNames(tableName: string): Promise<string[]> {
    return this.pgSchemaStatements().inheritedTableNames(tableName);
  }

  async tableOptions(tableName: string): Promise<Record<string, unknown>> {
    return this.pgSchemaStatements().tableOptions(tableName);
  }

  async serialSequence(tableName: string, column: string): Promise<string | null> {
    return this.pgSchemaStatements().serialSequence(tableName, column);
  }

  async defaultSequenceName(
    tableName: string,
    pk: string | string[] = "id",
  ): Promise<string | null> {
    return this.pgSchemaStatements().defaultSequenceName(tableName, pk);
  }

  async setPkSequenceBang(tableName: string, value: number): Promise<void> {
    await this.pgSchemaStatements().setPkSequenceBang(tableName, value);
  }

  async resetPkSequenceBang(
    tableName: string,
    pk: string | null = null,
    sequence: string | null = null,
  ): Promise<void> {
    await this.pgSchemaStatements().resetPkSequenceBang(tableName, pk, sequence);
  }

  async primaryKeys(tableName: string): Promise<string[]> {
    return this.pgSchemaStatements().primaryKeys(tableName);
  }

  async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    return this.pgSchemaStatements().checkConstraints(tableName);
  }

  exclusionConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.pgSchemaStatements().exclusionConstraintOptions(tableName, expression, options);
  }

  async addExclusionConstraint(
    tableName: string,
    expression: string,
    options: ExclusionConstraintOptions = {},
  ): Promise<void> {
    return this.pgSchemaStatements().addExclusionConstraint(tableName, expression, options);
  }

  async removeExclusionConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown> | null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    return this.pgSchemaStatements().removeExclusionConstraint(
      tableName,
      expressionOrOptions,
      options,
    );
  }

  uniqueConstraintOptions(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.pgSchemaStatements().uniqueConstraintOptions(tableName, columnName, options);
  }

  async addUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | null,
    options: UniqueConstraintOptions = {},
  ): Promise<void> {
    return this.pgSchemaStatements().addUniqueConstraint(tableName, columnName, options);
  }

  async removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | Record<string, unknown> | null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    return this.pgSchemaStatements().removeUniqueConstraint(
      tableName,
      columnNameOrOptions,
      options,
    );
  }

  indexName(
    tableName: string,
    options: { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean },
  ): string {
    // Rails PostgreSQL#index_name strips the schema qualifier and derives the
    // name from the bare table (postgresql/schema_statements.rb), so a
    // `my_schema.values` table indexes as `index_values_on_value` — created in
    // `my_schema` via the schema-qualified table, keeping add/remove symmetric.
    const [, table] = this.extractSchemaQualifiedName(tableName);
    if (options.column != null) {
      if (options._usesLegacyIndexName) {
        const cols = Array.isArray(options.column) ? options.column : [options.column];
        return `index_${table}_on_${cols.join("_and_")}`;
      }
      return this.generateIndexName(table, options.column);
    }
    if (options.name != null) return options.name;
    throw new ArgumentError("You must specify the index name");
  }

  // Mirrors Rails PostgreSQL#add_index_options (schema_statements.rb:937-942):
  // when `:where` is a bare column name, quote it as an identifier
  // (`WHERE "deleted"` for a boolean column) rather than emitting it verbatim.
  // Anything with spaces, quotes, or operators (e.g. `state = 'active'`) is an
  // expression and passes through unchanged — columnExists now binds its
  // identifier values and safely returns false for such input, so no extra
  // call-site identifier guard is needed.
  async addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Promise<[AbstractIndexDefinition, string | undefined, boolean]> {
    const opts = { ...options };
    if (typeof opts.where === "string") {
      const ss = this.pgSchemaStatements();
      if ((await ss.tableExists(tableName)) && (await ss.columnExists(tableName, opts.where))) {
        opts.where = this.quoteColumnName(opts.where);
      }
    }
    return super.addIndexOptions(tableName, columnName, opts);
  }

  get schemaCreation(): PgSchemaCreation {
    return new PgSchemaCreation(this);
  }

  updateTableDefinition(tableName: string, base?: unknown): PgTable {
    return this.pgSchemaStatements().updateTableDefinition(tableName, base ?? this);
  }

  createSchemaDumper(source: SchemaSource, options: Record<string, unknown> = {}): PgSchemaDumper {
    return new PgSchemaDumper(source, options);
  }

  /** @internal */
  createTableDefinition(name: string, options: Record<string, unknown> = {}): PgTableDefinition {
    const { adapter: _adapterOpt, adapterName: _adapterNameOpt, ...rest } = options;
    const unlogged =
      (rest.unlogged as boolean | undefined) ?? PostgreSQLAdapter.createUnloggedTables;
    return new PgTableDefinition(name, { ...rest, unlogged, adapter: this });
  }

  /** @internal */
  createAlterTable(name: string): PgAlterTable {
    return new PgAlterTable(this.createTableDefinition(name));
  }

  /** @internal */
  async fetchTypeMetadata(
    columnName: string,
    sqlType: string,
    oid: number,
    fmod: number,
  ): Promise<PgTypeMetadata> {
    const castType = await this.getOidType(oid, fmod, columnName, sqlType);
    return new PgTypeMetadata({
      sqlType,
      type: castType.type(),
      oid,
      fmod,
      limit: castType.limit ?? null,
      precision: castType.precision ?? null,
      scale: castType.scale ?? null,
    });
  }

  /** @internal */
  async newColumnFromField(
    tableName: string,
    field: unknown[],
    _definitions: unknown,
  ): Promise<Column> {
    const [columnName, type, default_, notnull, oid, fmod, collation, comment, identity, gen] =
      field as [
        string,
        string,
        string | null,
        boolean,
        number,
        number,
        string | null,
        string | null,
        string | null,
        string | null,
      ];
    const typeMetadata = await this.fetchTypeMetadata(columnName, type, Number(oid), Number(fmod));
    // The literal stays a raw String: deserialization is deferred to
    // Attribute.from_database so *_before_type_cast reads back the raw default.
    const defaultValue = this.extractValueFromDefault(default_);

    let defaultFunction: string | null;
    if (gen) {
      defaultFunction = default_;
    } else {
      defaultFunction = this.extractDefaultFunction(defaultValue, default_);
    }

    let serial: boolean | undefined;
    const match = defaultFunction?.match(SERIAL_SEQUENCE_RE);
    if (match) {
      const { sequenceName, suffix } = match.groups!;
      serial = this.sequenceNameFromParts(tableName, columnName, suffix) === sequenceName;
    }

    return new Column(
      columnName,
      defaultValue,
      {
        sqlType: typeMetadata.sqlType,
        type: typeMetadata.type,
        oid: Number(oid),
        fmod: Number(fmod),
        limit: typeMetadata.limit,
        precision: typeMetadata.precision,
        scale: typeMetadata.scale,
      },
      !notnull,
      {
        defaultFunction: defaultFunction ?? undefined,
        collation: collation ?? undefined,
        comment: comment || null,
        serial,
        array: type.endsWith("[]"),
        identity: identity || null,
        generated: gen || null,
      },
    );
  }

  /** @internal */
  async addColumnForAlter(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): Promise<unknown> {
    const col = this.createTableDefinition(tableName).newColumnDefinition(
      columnName,
      type,
      options,
    );
    const sql = `ADD COLUMN ${await this.schemaCreation.accept(col)}`;
    return "comment" in options
      ? [
          sql,
          () => this.changeColumnComment(tableName, columnName, options.comment as string | null),
        ]
      : sql;
  }

  /** @internal */
  async changeColumnForAlter(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): Promise<unknown[]> {
    const changeDef = this.buildChangeColumnDefinition(
      tableName,
      columnName,
      type,
      options as Parameters<typeof this.buildChangeColumnDefinition>[3],
    );
    const sqls: unknown[] = [await this.schemaCreation.accept(changeDef)];
    if ("comment" in options)
      sqls.push(() =>
        this.changeColumnComment(tableName, columnName, options.comment as string | null),
      );
    return sqls;
  }

  /** @internal */
  changeColumnNullForAlter(
    tableName: string,
    columnName: string,
    nullable: boolean,
    defaultValue?: unknown,
  ): unknown {
    if (defaultValue == null)
      return `ALTER COLUMN ${this.quoteColumnName(columnName)} ${nullable ? "DROP" : "SET"} NOT NULL`;
    return () => this.changeColumnNull(tableName, columnName, nullable, defaultValue);
  }

  /**
   * Mirrors PostgreSQL::SchemaStatements#add_index_opclass
   * (postgresql/schema_statements.rb:1066): appends each column's operator class
   * to its quoted form.
   * @internal
   */
  addIndexOpclass(
    quotedColumns: Map<string, string>,
    options: { opclass?: string | Record<string, string> } = {},
  ): Map<string, string> {
    const opclasses = this.optionsForIndexColumns(options.opclass);
    for (const [name] of quotedColumns) {
      const opclass = opclasses(name);
      if (opclass) quotedColumns.set(name, `${quotedColumns.get(name)} ${opclass}`);
    }
    return quotedColumns;
  }

  /**
   * Mirrors PostgreSQL::SchemaStatements#add_options_for_index_columns
   * (postgresql/schema_statements.rb:1073): folds in opclass, then falls through
   * to the base (sort order) via `super`.
   * @internal
   */
  addOptionsForIndexColumns(
    quotedColumns: Map<string, string>,
    options: {
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
      length?: number | Record<string, number>;
    } = {},
  ): Map<string, string> {
    quotedColumns = this.addIndexOpclass(quotedColumns, options);
    return super.addOptionsForIndexColumns(quotedColumns, options);
  }

  async exclusionConstraints(tableName: string): Promise<ExclusionConstraintDefinition[]> {
    return this.pgSchemaStatements().exclusionConstraints(tableName);
  }

  async uniqueConstraints(tableName: string): Promise<UniqueConstraintDefinition[]> {
    return this.pgSchemaStatements().uniqueConstraints(tableName);
  }

  /** @internal */
  exclusionConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    return this.pgSchemaStatements().exclusionConstraintName(tableName, options);
  }

  /** @internal */
  async exclusionConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<ExclusionConstraintDefinition | undefined> {
    return this.pgSchemaStatements().exclusionConstraintFor(tableName, options);
  }

  /** @internal */
  async exclusionConstraintForBang(
    tableName: string,
    expression?: string | null,
    options: Record<string, unknown> = {},
  ): Promise<ExclusionConstraintDefinition> {
    return this.pgSchemaStatements().exclusionConstraintForBang(tableName, expression, options);
  }

  /** @internal */
  uniqueConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    return this.pgSchemaStatements().uniqueConstraintName(tableName, options);
  }

  /** @internal */
  async uniqueConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<UniqueConstraintDefinition | undefined> {
    return this.pgSchemaStatements().uniqueConstraintFor(tableName, options);
  }

  /** @internal */
  async uniqueConstraintForBang(
    tableName: string,
    column?: string | string[] | null,
    options: Record<string, unknown> = {},
  ): Promise<UniqueConstraintDefinition> {
    return this.pgSchemaStatements().uniqueConstraintForBang(tableName, column, options);
  }

  /** @internal */
  extractSchemaQualifiedName(string: string): [string | null, string] {
    const name = Utils.extractSchemaQualifiedName(string);
    return [name.schema, name.identifier];
  }

  private deferrable(deferrable: "immediate" | "deferred" | undefined): string {
    if (!deferrable) return "";
    return ` DEFERRABLE INITIALLY ${deferrable.toUpperCase()}`;
  }

  /**
   * Parse a raw `pg_attrdef` expression into a scalar default value.
   * Mirrors: PostgreSQLAdapter#extract_value_from_default
   * @internal
   */
  extractValueFromDefault(defaultExpr: string | null): unknown {
    if (defaultExpr == null) return null;
    // Quoted types: [(B]?'...'.*::"?([\w. ]+)"?(?:\[\])? — Rails uses /m so . matches newline
    const quoted = /^[(B]?'([\s\S]*)'.*::"?([\w. ]+)"?(?:\[\])?$/.exec(defaultExpr);
    if (quoted) {
      if (quoted[1] === "now" && quoted[2] === "date") return null;
      return quoted[1].replace(/''/g, "'");
    }
    if (defaultExpr === "true" || defaultExpr === "false") return defaultExpr;
    // Numeric: optional parens, optional ::bigint cast
    const num = /^\(?(-?\d+(?:\.\d*)?)\)?(?:::bigint)?$/.exec(defaultExpr);
    if (num) return num[1];
    // Object identifier (bare integer)
    if (/^-?\d+$/.test(defaultExpr)) return defaultExpr;
    // Deviation from Rails, which only allows an optional `::bigint` suffix on
    // the numeric branch above and therefore reflects these as *function*
    // defaults. PG emits `(150.55)::numeric::money` for `DEFAULT 150.55` on a
    // money column and `(3.14...)::numeric` for a decimal domain column, and
    // both money_test.rb ("default") and the domain-default schema tests assert
    // a literal default there, so the multi-cast numeric forms are parsed here.
    const parenNum = /^\((-?\d+(?:\.\d+)?)\)(?:::[\w"\s.]+)+$/.exec(defaultExpr);
    if (parenNum) return parenNum[1];
    const castNum = /^(-?\d+(?:\.\d+)?)(?:::[\w"\s.]+)+$/.exec(defaultExpr);
    if (castNum) return castNum[1];
    return null;
  }

  /**
   * Return the default expression as-is when it is a SQL function/expression.
   * Mirrors: PostgreSQLAdapter#extract_default_function
   * @internal
   */
  extractDefaultFunction(defaultValue: unknown, defaultExpr: string | null): string | null {
    if (defaultExpr != null && this.hasDefaultFunction(defaultValue, defaultExpr)) {
      return defaultExpr;
    }
    return null;
  }

  /**
   * True when the raw default expression is a SQL function rather than a literal.
   * Mirrors: PostgreSQLAdapter#has_default_function?
   * @internal
   */
  hasDefaultFunction(defaultValue: unknown, defaultExpr: string): boolean {
    return defaultValue == null && DEFAULT_FUNCTION_RE.test(defaultExpr);
  }

  /**
   * Map a pg driver error to the appropriate ActiveRecord exception class.
   * Mirrors: PostgreSQLAdapter#translate_exception (the private helper).
   * @internal
   */
  translateException(
    exception: unknown,
    opts: { message?: string; sql?: string; binds?: unknown[] } = {},
  ): Error {
    // Pass sql/binds through without coercing nullish → "" / []. Rails'
    // translate_exception keeps sql: nil when called from with_raw_connection
    // (it has no statement yet) so StatementInvalid#set_query can fill it in
    // later via AbstractAdapter#log. Coercing null → "" would make the error
    // look like it already had a (blank) statement and suppress that attach.
    return this._translateException(exception, opts.sql as string, opts.binds ?? []);
  }

  /**
   * True when the error is retryable (not inside a failed transaction).
   * Mirrors: PostgreSQLAdapter#retryable_query_error?
   * @internal
   */
  isRetryableQueryError(exception: unknown): boolean {
    // Rails additionally guards on `@raw_connection.transaction_status !=
    // PG::PQTRANS_INERROR`. node-pg does not expose the PG transaction status
    // byte, so that guard is omitted; the abstract predicate (Deadlocked |
    // LockWaitTimeout) is still the authoritative gate.
    return super.isRetryableQueryError(exception);
  }

  /**
   * True when the PG error is a cached-plan invalidation (SQLSTATE 0A000
   * from RevalidateCachedQuery). Mirrors: PostgreSQLAdapter#is_cached_plan_failure?
   * @internal
   */
  isCachedPlanFailure(pgerror: unknown): boolean {
    if (!(pgerror instanceof Error)) return false;
    const code = (pgerror as { code?: string }).code;
    return code === "0A000";
  }

  /**
   * Statement-pool key, scoped to the current schema_search_path so a
   * statement prepared under one path is not reused under another (the
   * same SQL resolves to different tables across paths). Reads the
   * connection-scoped memo synchronously; setSchemaSearchPath() updates it,
   * so a mid-connection path change re-scopes the key and never reuses a
   * statement bound to the old path. Until the memo is set the prefix is
   * empty (`-sql`), matching the prior fixed-prefix behavior; the real path
   * is only resolved lazily (Rails' sql_key calls the schema_search_path
   * getter, which we cannot do from this synchronous hot path).
   * Mirrors: PostgreSQLAdapter#sql_key
   * @internal
   */
  sqlKey(sql: string): string {
    return `${this._schemaSearchPathMemo ?? ""}-${sql}`;
  }

  /**
   * Prepare a statement on the given client, caching by sql_key.
   * Mirrors: PostgreSQLAdapter#prepare_statement
   * @internal
   */
  async prepareStatement(sql: string, _binds: unknown[], client: pg.Client): Promise<string> {
    const pool = this._poolFor(client);
    // Use same cache key as _preparedNameFor so prepared statements created here
    // are visible to / deduped with the internal query path.
    const key = this.sqlKey(sql);
    const existing = pool.get(key);
    if (existing) return existing.name;
    const name = pool.nextKey();
    // PREPARE ... AS avoids executing the statement (node-pg's { name, text } form
    // both prepares and executes in a single roundtrip).
    await client.query(`PREPARE ${pgQuoteColumnName(name)} AS ${sql}`);
    pool.set(key, { name });
    // `set` may have evicted an LRU entry, queueing its DEALLOCATE on the
    // maintenance tail. Drain it before returning so the caller's Bind+Execute
    // lands on an idle client rather than racing the eviction's DEALLOCATE —
    // matching Rails' inline dealloc-under-lock in StatementPool#[]=.
    await this._maintenanceTail;
    return name;
  }

  /**
   * Sync the session timezone variable after `default_timezone` changes.
   * Mirrors: PostgreSQLAdapter#reconfigure_connection_timezone
   * @internal
   */
  async reconfigureConnectionTimezone(): Promise<void> {
    // Rails returns early when `variables["timezone"]` was set by the user
    // (postgresql_adapter.rb:1005): configure_connection already applied it and
    // it must never be overridden by the default_timezone SET below.
    if (this._sessionVariables["timezone"]) return;
    const tz = ActiveRecord.defaultTimezone;
    // Off the withRawConnection loop. This runs as the first step of
    // performQuery (database-statements.ts), which is itself the block
    // executing inside withRawConnection on the same async chain. Re-entering
    // withRawConnection would NOT deadlock — TransactionManager.synchronize is
    // reentrant per async chain (transaction.ts: getStore() === _currentLockOwner
    // passes straight through). It is bypassed because this SET SESSION is a
    // sub-step of an already-in-flight query on the already-acquired live
    // handle: re-entering the leaf loop would redundantly re-run its verify /
    // materialize / dirtyCurrentTransaction bookkeeping for a session variable.
    // Acquire the raw client directly via _acquireFreshClient(); tear down on a dead
    // socket so the next caller gets a fresh connection.
    const client = await this._acquireFreshClient();
    try {
      if (tz === "utc") {
        await client.query("SET SESSION timezone TO 'UTC'");
      } else {
        await client.query("SET SESSION timezone TO DEFAULT");
      }
    } catch (error) {
      if (PostgreSQLAdapter._isConnectionError(error)) this._discardRawConnection();
      throw error;
    }
  }

  /**
   * Fetch raw column metadata rows from pg_attribute for a table.
   * Mirrors: PostgreSQLAdapter#column_definitions
   * @internal
   */
  async columnDefinitions(tableName: string): Promise<
    {
      attname: string;
      format_type: string;
      pg_get_expr: string | null;
      attnotnull: boolean;
      atttypid: number;
      atttypmod: number;
      collname: string | null;
      comment: string | null;
      identity: string | null;
      attgenerated: string | null;
    }[]
  > {
    return this.pgSchemaStatements().columnDefinitions(tableName);
  }

  /**
   * Build the per-adapter StatementPool (used on initialization).
   * Mirrors: PostgreSQLAdapter#build_statement_pool
   * @internal
   */
  buildStatementPool(client: pg.Client): StatementPool {
    return new StatementPool(
      client,
      PostgreSQLAdapter.typeCastConfigToInteger(this._statementLimit) as number,
    );
  }

  /**
   * No-op in node-pg: Ruby's pg gem uses PG::TypeMapByClass to encode
   * query parameters as text. node-pg serialises bind values with
   * JS's toString() by default, which is equivalent for our supported
   * types (Integer, Boolean). Mirrors: PostgreSQLAdapter#add_pg_encoders
   * @internal
   */
  addPgEncoders(): void {
    // node-pg handles parameter encoding natively; no extra type map needed.
  }

  /**
   * Update the timestamp decoder after default_timezone changes.
   * Mirrors: PostgreSQLAdapter#update_typemap_for_default_timezone
   * @internal
   */
  async updateTypemapForDefaultTimezone(): Promise<void> {
    // Rails guards on `@mapped_default_timezone != default_timezone`
    // (postgresql_adapter.rb:1094): reconfigure only when the timezone actually
    // changed, so `perform_query` calling this per statement is a cheap no-op on
    // the hot path. node-pg uses custom type parsers registered at pool
    // construction time via getTypeParser (see constructor); a timezone change
    // only requires a session-level SET so subsequent result sets decode right.
    const tz = ActiveRecord.defaultTimezone;
    if (this._mappedDefaultTimezone === tz) return;
    this._mappedDefaultTimezone = tz;
    await this.reconfigureConnectionTimezone();
  }

  /**
   * No-op in node-pg: result decoding is handled by the getTypeParser hook
   * registered at pool construction. Mirrors: PostgreSQLAdapter#add_pg_decoders
   * @internal
   */
  addPgDecoders(): void {
    // node-pg decodes results via getTypeParser registered in the constructor.
  }

  /**
   * Build a type-coder descriptor from a pg_type row and a coder class name.
   * Mirrors: PostgreSQLAdapter#construct_coder
   * @internal
   */
  constructCoder(
    row: { oid: string | number; typname: string },
    coderClass: string | null,
  ): { oid: number; name: string; coderClass: string } | null {
    if (!coderClass) return null;
    return { oid: Number(row.oid), name: row.typname, coderClass };
  }

  /** @internal — exposed for tests inspecting the persistent connection. */
  _rawConnectionForTest(): pg.Client | null {
    return this._rawConnection;
  }
}

export type IndexDefinition = PgIndexDefinition;

/**
 * A prepared-statement entry tracked in the per-client pool. `name` is
 * the server-side name passed to `client.query({ name, text, values })`;
 * pg auto-PREPAREs on first use with that name and EXECUTEs on reuse.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::StatementPool entry shape.
 */
export interface PreparedStatement {
  name: string;
}

/**
 * Maps a pinned `pg.Client` to its owning adapter's DEALLOCATE serializer
 * (populated by the adapter's `_rawConnection` setter). A `StatementPool`'s
 * `dealloc` looks the client up here so eviction cleanup chains behind the
 * in-flight query on the adapter-owned maintenance queue rather than racing it,
 * without the pool constructor needing a non-Rails-shaped extra argument. A
 * `WeakMap` so entries vanish when the client is GC'd. Clients no adapter owns
 * (standalone pools) are absent → the prior best-effort fire-and-forget path.
 */
const pgDeallocSerializers = new WeakMap<pg.Client, (deallocSql: string) => void>();

/**
 * PG-flavored StatementPool. Backs the per-connection statement cache;
 * `dealloc` sends `DEALLOCATE` for the evicted name. PG prepared
 * statements are session-scoped, and after the dual-pool collapse the
 * adapter owns exactly one persistent `pg.Client`, so a single
 * StatementPool lives for the connection's lifetime.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::StatementPool
 */
export class StatementPool extends GenericStatementPool<PreparedStatement> {
  private _client: pg.Client | null;
  // Per-pool counter. Rails' PG StatementPool uses `@counter` on the
  // pool instance so names are scoped to the session — matches the
  // session-scoped nature of PG prepared statements and lets the
  // adapter own zero state about naming.
  private _counter = 0;

  constructor(client: pg.Client, maxSize = 1000) {
    super(maxSize);
    this._client = client;
  }

  /**
   * Allocate a fresh prepared-statement name. Rails' equivalent is
   * `next_key` on `PostgreSQL::StatementPool` — `"a#{@counter += 1}"`.
   */
  nextKey(): string {
    return `a${++this._counter}`;
  }

  /**
   * Called when an entry is evicted (LRU overflow or explicit delete).
   * Rails swallows PG::InvalidSqlStatementName ("prepared statement
   * does not exist") and errors against a closed connection — the
   * statement is already gone on the server either way. Node-pg
   * surfaces the same as error codes / messages.
   */
  protected override dealloc(stmt: PreparedStatement): void {
    const client = this._client;
    if (!client) return;
    // Best-effort async cleanup. The server drops prepared statements on
    // session close, so a swallowed failure here is safe — Rails' PG::
    // StatementPool#dealloc likewise rescues PG::InvalidSqlStatementName /
    // connection errors. `pgQuoteColumnName` escapes any embedded `"` instead
    // of raising, so a leaked caller-supplied name can't produce a synchronous
    // throw at the call site.
    const deallocSql = `DEALLOCATE ${pgQuoteColumnName(stmt.name)}`;
    const serialize = pgDeallocSerializers.get(client);
    if (serialize) {
      // Adapter-owned client: route through its maintenance serializer so the
      // DEALLOCATE chains behind the in-flight query / prior eviction on the
      // pinned client rather than fire-and-forgetting onto a busy client
      // (node-pg's "already executing a query" deprecation). It swallows errors.
      serialize(deallocSql);
      return;
    }
    // Standalone pool whose client no adapter owns: keep the prior best-effort
    // fire-and-forget. The empty `.catch` keeps node from treating a post-close
    // DEALLOCATE as an unhandled rejection.
    client.query(deallocSql).catch(() => {});
  }

  /**
   * Mark the pool detached from its client (e.g. on connection release
   * or close). Prevents late DEALLOCATE calls from racing with a
   * client that's already back in the pg.Pool — the server will
   * discard statements on session end anyway.
   */
  detach(): void {
    this._client = null;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter::MoneyDecoder.
 *
 * Registered as the result-set coder for OID 790 (PG money). Rails defines
 * `TYPE = OID::Money.new` and `decode(value) = TYPE.deserialize(value)`; we
 * delegate to the same Money type so locale-formatted money text — US
 * ("$123.45"), EU grouping ("$12.345.678,12"), and accounting parentheses —
 * deserializes exactly as the Money attribute type, not via ad-hoc stripping.
 */
export class MoneyDecoder {
  static readonly TYPE = new Money();

  static decode(value: string): string | null {
    return MoneyDecoder.TYPE.deserialize(value) as string | null;
  }
}

function _pgAdvisoryLockSql(
  fn: string,
  col: string,
  lockId: number | bigint | string,
): [string, unknown] {
  if (typeof lockId === "bigint") return [`SELECT ${fn}($1::bigint) AS ${col}`, lockId.toString()];
  if (typeof lockId === "number") return [`SELECT ${fn}($1) AS ${col}`, lockId];
  return [`SELECT ${fn}(hashtext($1)) AS ${col}`, lockId];
}

/**
 * Mirrors: PostgreSQLAdapter#has_default_function? regex
 * (postgresql_adapter.rb:786). A function call, parenthesized cast, or
 * CURRENT_DATE/CURRENT_TIMESTAMP — anything else is a literal default or
 * unrecognized expression and does not populate Column#default_function.
 */
const DEFAULT_FUNCTION_RE = /\w+\(.*\)|\(.*\)::\w+|CURRENT_DATE|CURRENT_TIMESTAMP/;

/** Mirrors the `nextval(...)` match inlined in Rails' `new_column_from_field`. */
const SERIAL_SEQUENCE_RE = /^nextval\('"?(?<sequenceName>.+_(?<suffix>seq\d*))"?'::regclass\)$/;

(PostgreSQLAdapter.prototype as any).performQuery = performQuery;
(PostgreSQLAdapter.prototype as any).castResult = castResult;
(PostgreSQLAdapter.prototype as any).handleWarnings = handleWarnings;
// Mirrors: PostgreSQL::DatabaseStatements#build_truncate_statements (database_statements.rb)
// Combines all table names into a single TRUNCATE TABLE a, b, c statement, so
// the abstract `truncateTables` emits Rails' combined form instead of N per-table ones.
(PostgreSQLAdapter.prototype as any).buildTruncateStatements = pgBuildTruncateStatements;

// `dirties_query_cache` for the write methods this adapter OVERRIDES (Rails
// query_cache.rb:13). Overridden methods must be wrapped on the concrete class,
// not on AbstractAdapter, or the override would run unwrapped. The write methods
// this adapter does NOT override (`execUpdate`/`execDelete`/`execInsertAll`/
// `truncateTables`/`restartDbTransaction`) are wired once on AbstractAdapter.
// Each logical write clears the cache exactly once; the still-lower
// `executeMutation` these funnel through is deliberately NOT wrapped (DDL runs
// through the wired `execute`, as in Rails), and reads route through
// `internalExecQuery` (never tripping the wrapper).
dirtiesQueryCache(PostgreSQLAdapter, "execInsert", "rollbackDbTransaction", "rollbackToSavepoint");
// Snapshot the unwrapped `execute` first: schema reflection routes through it
// (via schemaQuery) so it never trips the dirtying wrapper, mirroring Rails'
// `internal_exec_query`.
captureUnwrappedExecute(PostgreSQLAdapter);
dirtiesQueryCache(PostgreSQLAdapter, "execQuery", "execute");

// Mirrors `ActiveSupport.run_load_hooks(:active_record_postgresqladapter, self)`
// at the bottom of Rails' postgresql_adapter.rb — lets railtie initializers
// gate behavior on the postgresql adapter being loaded.
runLoadHooks("active_record_postgresqladapter", PostgreSQLAdapter);
