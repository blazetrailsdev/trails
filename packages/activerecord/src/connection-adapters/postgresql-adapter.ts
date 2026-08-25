import pg from "pg";
import {
  type Type,
  ValueType,
  ArgumentError,
  BinaryData,
  TimeType,
} from "@blazetrails/activemodel";
import { singularize, runLoadHooks, include, KeyError } from "@blazetrails/activesupport";
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
  lookupCastTypeFromColumn as pgLookupCastTypeFromColumn,
  type CastableColumn,
} from "./postgresql/quoting.js";
import { TypeMapInitializer, type PgTypeRow } from "./postgresql/oid/type-map-initializer.js";
import { Money } from "./postgresql/oid/money.js";
import {
  initializeInstanceTypeMap,
  initializeTypeMap as staticInitializeTypeMap,
  registerClassWithPrecision,
} from "./postgresql/type-map-init.js";
import { Timestamp } from "./postgresql/oid/timestamp.js";
import { TimestampWithTimeZone } from "./postgresql/oid/timestamp-with-time-zone.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { InsertBuilder } from "../insert-all.js";
import type { AdapterName } from "./abstract-adapter.js";
import type { PostgreSQLAdapterOptions } from "./pool-config.js";
import {
  ActiveRecordError,
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
import { dirtiesQueryCache } from "./abstract/query-cache.js";
import { SchemaStatements } from "./postgresql/schema-statements-class.js";
import type { SchemaStatements as AbstractSchemaStatements } from "./abstract/schema-statements.js";
import type {
  CommentOrChanges,
  JoinTableOptions,
  ValidateConstraintStatements,
  CommentStatements,
  ExtensionStatements,
  EnumStatements,
  UniqueConstraintStatements,
  SchemaNamespaceStatements,
} from "./abstract/schema-statements.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";
import {
  transactionIsolationLevels,
  preprocessQuery,
  extractTableRefFromInsertSql,
} from "./abstract/database-statements.js";
import { makeGetTypeParser } from "./postgresql/temporal-type-parsers.js";

const getTemporalTypeParser = makeGetTypeParser(pg.types);
const TEMPORAL_OIDS = new Set([1082, 1083, 1114, 1184, 1266]);
const OID_INTERVAL = 1186;
const OID_INTERVAL_ARRAY = 1187;
const OID_MONEY = 790;
/**
 * ruby-pg's `PG::PQTRANS_*` (libpq `PGTransactionStatusType`), which
 * `PG::Connection#transaction_status` answers. Rails reads it in
 * `retryable_query_error?` (postgresql_adapter.rb:850) and in
 * `cancel_any_running_query` (postgresql/database_statements.rb:127).
 */
const PQTRANS_IDLE = 0;
const PQTRANS_ACTIVE = 1;
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;
const PQTRANS_UNKNOWN = 4;
/**
 * Mirrors: `PostgreSQL::DatabaseStatements::IDLE_TRANSACTION_STATUSES`
 * (postgresql/database_statements.rb:124).
 */
const IDLE_TRANSACTION_STATUSES = [PQTRANS_IDLE, PQTRANS_INTRANS, PQTRANS_INERROR];
/**
 * Mirrors: `PostgreSQLAdapter::FEATURE_NOT_SUPPORTED`
 * (postgresql_adapter.rb:890) — the SQLSTATE a cached-plan invalidation
 * arrives under.
 */
const FEATURE_NOT_SUPPORTED = "0A000";
import {
  READ_QUERY,
  buildTruncateStatements as pgBuildTruncateStatements,
  executeBatch as pgExecuteBatch,
  suppressCompositePrimaryKey,
  castResult,
  affectedRows as pgAffectedRows,
  handleWarnings,
  isWarningIgnored as pgIsWarningIgnored,
  lastInsertIdResult as pgLastInsertIdResult,
  performQuery as pgPerformQuery,
  returningColumnValues as pgReturningColumnValues,
} from "./postgresql/database-statements.js";
import type { CreateDatabaseOptions } from "./postgresql/schema-statements.js";
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
import { pgDatetimeConfig } from "./postgresql/pg-datetime-config.js";
import { abandonRawSocket } from "./abandon-raw-socket.js";
import {
  POSTGRESQL_NATIVE_DATABASE_TYPES,
  postgresqlNativeDatabaseTypes,
  type NativeDatabaseTypes,
} from "./abstract/native-database-types.js";

const OID_JSON = 114;
const OID_JSONB = 3802;

/**
 * The `:variables` hash from `@config` (postgresql_adapter.rb:977, :1000).
 */
type SessionVariables = Record<string, string | number | boolean | null | "default">;

/**
 * Ruby's `Hash#fetch(key, default)` returns the STORED value whenever the key
 * exists — including a stored `nil` — where `??` would substitute the default.
 */
function fetch<T>(hash: Record<string, unknown>, key: string, defaultValue: T): T {
  return key in hash ? (hash[key] as T) : defaultValue;
}

interface PgClientLiveness {
  _ending?: boolean;
  _ended?: boolean;
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PostgreSQLAdapter
  extends AbstractAdapter
  implements
    DatabaseAdapter,
    ValidateConstraintStatements,
    CommentStatements,
    ExtensionStatements,
    EnumStatements,
    UniqueConstraintStatements,
    SchemaNamespaceStatements
{
  override get adapterName(): AdapterName {
    return "postgres";
  }

  static columnNameMatcher(): RegExp {
    return pgColumnNameMatcher();
  }

  static columnNameWithOrderMatcher(): RegExp {
    return pgColumnNameWithOrderMatcher();
  }

  /**
   * Mirrors: PostgreSQL::Quoting::ClassMethods#quote_column_name
   * (postgresql/quoting.rb:46-48). Lives on the class, as in Rails — the
   * instance quoter is the inherited `self.class` delegator
   * (abstract/quoting.rb:135-138).
   */
  static override quoteColumnName(name: string): string {
    return pgQuoteColumnName(name);
  }

  /**
   * Mirrors: PostgreSQL::Quoting::ClassMethods#quote_table_name
   * (postgresql/quoting.rb:54-56).
   */
  static override quoteTableName(name: string): string {
    return pgQuoteTableName(name);
  }

  // Mirrors Rails' PostgreSQLAdapter.dbconsole, which exports PG* env vars
  // before exec'ing psql. We can't mutate the process environment (no
  // process.* access), so we return the env map the PTY exec would set;
  // PGPASSWORD is included only when `includePassword` is set, matching Rails.
  /**
   * @missingRailsCall find_cmd_and_exec — PERMANENT: Rails' dbconsole execs `psql` through
   *   find_cmd_and_exec; process spawning is forbidden in this package (no
   *   node:* imports, no process.*), so trails' dbconsole only builds the PG*
   *   environment the console command needs.
   */
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

  // Is this connection alive and ready for queries?
  // Mirrors Rails' PostgreSQLAdapter#active? (postgresql_adapter.rb:347-356):
  // the `@raw_connection` presence guard, then a live `query ";"` probe and
  // `verified!`, rescuing PG::Error to false. `_closed`/`_pgClientOptions` are
  // trails' handle-state terms for "this client was torn down / never
  // configured" — a client in either state has no usable socket, so they sit
  // with the presence guard rather than letting the probe throw.
  override async active(): Promise<boolean> {
    const rawConnection = this._rawConnection;
    if (rawConnection === null || this._closed || this._pgClientOptions == null) return false;
    try {
      await rawConnection.query(";");
      this.verifiedBang();
      return true;
    } catch {
      return false;
    }
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
   * Rails' `connected?`, postgresql_adapter.rb:343). `finished?` is true only
   * once the handle itself has been closed — ruby-pg sets it in `PQfinish`, and
   * a backend that dies underneath a live handle (a server-side
   * `pg_terminate_backend`/FATAL, a dropped socket) leaves it FALSE: the
   * connection is BAD, not finished, and Rails' `connected?` stays true until
   * something calls `disconnect!`. `active?` is the predicate that asks the
   * server. node-pg's analogue of `PQfinish` is `end()`, which sets
   * `_ending`/`_ended`, so those two flags are the whole term.
   *
   * `_queryable === false` and `_connectionError === true` are deliberately NOT
   * terms. pg flips `_queryable` from `_handleErrorEvent` on any post-connect
   * fatal, which made `connected?` go false on a live-but-broken handle where
   * Rails' stays true — a server-side termination arriving between a successful
   * `verifyBang()` and a `connected?` read then reported the pool as
   * disconnected. `end()` clears `_queryable` too, so the finished case is
   * still covered by `_ending`/`_ended`.
   *
   * Verified against the pinned `pg@8.20` Client internals (lib/client.js:
   * `_ending`/`_ended`).
   * @internal
   */
  private _rawConnectionFinished(): boolean {
    const client = this._rawConnection as PgClientLiveness | null;
    if (client === null) return false;
    return client._ending === true || client._ended === true;
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
  //
  // Not `private`: `StatementPool#dealloc` re-reads it at eviction time, which
  // is exactly Rails' `@connection.instance_variable_get(:@raw_connection)`
  // (postgresql_adapter.rb:310) — a deliberate reach into the adapter's
  // connection slot from its own statement pool. TS `private` is per-class, so
  // a sibling class in this file cannot do what Ruby's reflection does.
  /** @internal */
  get _rawConnection(): pg.Client | null {
    return this._connection as unknown as pg.Client | null;
  }
  /** @internal */
  set _rawConnection(value: pg.Client | null) {
    this._connection = value as unknown as AbstractAdapter | null;
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
  private _client: pg.Client | null = null;
  private _inTransaction = false;
  /**
   * The status byte of the last ReadyForQuery message on `_rawConnection`
   * ('I' idle / 'T' in transaction / 'E' failed transaction), which is what
   * libpq derives `PQtransactionStatus` from. See `transactionStatus`.
   */
  private _readyForQueryStatus = "I";
  /**
   * Whether the command on the wire has produced its terminating message
   * (CommandComplete / ErrorResponse) but not yet its ReadyForQuery. libpq has
   * no such window — `PQgetResult` returns only once the whole cycle is drained
   * — but node-pg settles the query promise on the terminating message, so
   * without this the caller can read the status back in that gap and see a
   * command that is over reported as PQTRANS_ACTIVE.
   *
   * The invariant is that it is set `false` immediately before *every*
   * `client.query` issued on the pinned client — `_performQuery`, `exec`, the
   * `_bt_ret_*` savepoint wrapper in `executeMutation`, and both DEALLOCATE
   * sites (statement-pool eviction and `DEALLOCATE ALL` at checkout) — and back
   * to `true` only by the terminating-message handlers in
   * `_attachReadyForQueryListener`. Miss an issue site and `transactionStatus`
   * answers IDLE/INTRANS while that command is mid-cycle.
   *
   * Non-private (underscore-public) so the extracted `performQuery` can keep
   * the invariant on the arms it issues.
   */
  _commandSettled = true;
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
  private _connectionConfigured = false;
  private _typeMapEagerLoaded = false;
  // Rails' `@statements = build_statement_pool` (abstract_adapter.rb:156): one
  // pool per adapter, built in the constructor and never replaced. PG prepared
  // statements are session-scoped, and the pool re-reads `_rawConnection` at
  // dealloc time, so a teardown just resets the map.
  //
  // Non-private so the extracted `performQuery` in
  // `postgresql/database-statements.ts` can reach the statement cache Rails
  // names `@statements`.
  /** @internal */
  declare _statements: StatementPool;
  private _needsDeallocateAll = false;
  private _closed = false;
  private _closingDriver: Promise<void> | null = null;
  // Per-acquire generation. Each _doAcquire captures the current value; a
  // teardown that must invalidate the in-flight acquire bumps it. `discardBang`
  // (Rails' `discard!`) is the only teardown that bumps it AND records the
  // captured generation in `_discardedAcquireGenerations`. A connect that
  // races the discard then (a) is no longer reused by `_acquireFreshClient`
  // (generation mismatch, like mysql2's `_connectingPromiseGen` check) and
  // (b) abandons its raw socket instead of `end()`ing or adopting it when it
  // resolves — surviving a later reconnect that would reset a mutable flag.
  private _acquireGeneration = 0;
  private _acquiringGen = -1;
  private _discardedAcquireGenerations = new Set<number>();
  // In-flight connect/configure promise. Concurrent _acquireFreshClient
  // callers converge on this so we never open two pg.Clients in
  // parallel — mirrors Rails' @lock.synchronize around connect (Rails
  // postgresql_adapter.rb:349, abstract_adapter.rb:984).
  private _acquiring: Promise<pg.Client> | null = null;
  _noticeReceiverSqlWarnings: SQLWarning[] = [];
  /**
   * `database.yml`'s `statement_limit`, which Rails reads as
   * `@config[:statement_limit]` inline at StatementPool construction
   * (postgresql_adapter.rb:1056) and never exposes. trails' constructor
   * destructures the adapter-level keys out of the config hash, so the value is
   * held here — read by `buildStatementPool`'s pool-limit
   * check.
   *
   * @internal
   */
  private _statementLimit = 1000;

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
      this._statements = this.buildStatementPool();
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
    // abstract_adapter.rb:159 — `@prepared_statements = !ActiveRecord
    // .disable_prepared_statements && type_cast_config_to_boolean(
    // @config.fetch(:prepared_statements) { default_prepared_statements })`.
    // Rails reads it once, in the common tail of `initialize`; trails' config
    // parsing forks below into a connection-string branch that returns early,
    // so the read sits above the fork to cover both.
    this.preparedStatements =
      !ActiveRecord.disablePreparedStatements &&
      PostgreSQLAdapter.typeCastConfigToBoolean(
        "preparedStatements" in this._config
          ? this._config.preparedStatements
          : this.defaultPreparedStatements(),
      );
    if (typeof config === "string") {
      this._minMessages = "warning";
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
      this._statements = this.buildStatementPool();
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
    if (statementLimit !== undefined) this._statementLimit = statementLimit;
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
    //
    // Mirrors AbstractAdapter#initialize's `@statements = build_statement_pool`
    // (abstract_adapter.rb:156). It runs here rather than as a field
    // initializer because `statement_limit` is only known once the config hash
    // above has been destructured.
    this._statements = this.buildStatementPool();
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
    // Mirrors: `super` at the top of PostgreSQLAdapter#configure_connection
    // (postgresql_adapter.rb:957) — warms the pool's server_version memo and
    // runs check_version (abstract_adapter.rb:1212-1214).
    await super.configureConnection();
    // Rails resets @mapped_default_timezone = nil while installing decoders in
    // configure_connection (postgresql_adapter.rb:1112) so the next
    // update_typemap_for_default_timezone re-applies the session timezone. This
    // is a fresh physical session (reconnect/reset/discard cleared
    // _connectionConfigured), which starts at PostgreSQL's default timezone, so
    // the cache must be invalidated here or the guard would skip reconfiguring.
    this._mappedDefaultTimezone = null;
    // Mirrors: set_standard_conforming_strings — required for correct quoting behaviour.
    await client.query("SET standard_conforming_strings = on");
    const variables = fetch<SessionVariables>(this._config, "variables", {});
    // Mirrors: SET intervalstyle — ISO 8601 so intervals parse cleanly.
    await client.query("SET intervalstyle = iso_8601");
    await client.query(`SET client_min_messages TO ${this.quoteLiteral(this._minMessages)}`);
    for (const [key, val] of Object.entries(variables)) {
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
    // above), NOT through internalExecQuery/withRawConnection. configure runs while
    // the acquire machinery still holds `_acquiring` (and, on resetBang, while
    // the reset holds the connection lock); routing these queries back through
    // the connection-readiness stack would re-enter connectBang/verify and
    // deadlock. Issuing them on the raw socket sidesteps all
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
   * connection `client`, bypassing internalExecQuery/withRawConnection. Used only
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
   * from _doAcquire (matches Rails' single-slot set_notice_receiver), under
   * Rails' `unless ActiveRecord.db_warnings_action.nil?` guard
   * (postgresql_adapter.rb:965).
   */
  private _attachNoticeListener(client: pg.Client): void {
    if (ActiveRecord.dbWarningsAction == null) return;
    client.on("notice", (msg: { severity?: string; message?: string; code?: string }) => {
      // Rails' notice receiver buffers SQLWarning instances themselves
      // (postgresql_adapter.rb:970), so `handle_warnings` dispatches the very
      // objects it iterates.
      this._noticeReceiverSqlWarnings.push(
        new SQLWarning(msg.message, msg.code ?? null, msg.severity ?? null, undefined, this.pool),
      );
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
  static initializeTypeMap(m: TypeMap | HashLookupTypeMap): void {
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
   * Mirrors: PostgreSQLAdapter#initialize_type_map (postgresql_adapter.rb:744-751)
   * — the private instance initializer that layers the timezone-aware
   * `time` / `timestamp` / `timestamptz` registrations on top of the
   * class-level seed and then pulls the connection's user-defined types.
   *
   * Async where Rails is sync: `load_additional_types` is a pg_type query, so
   * the tail of the body is a Promise. That is why the `type_map` getter —
   * which must stay sync — seeds only the sync half (`initializeInstanceTypeMap`)
   * and leaves the `loadAdditionalTypes` tail to the async callers
   * (`reloadTypeMap`, `getOidType`, `columns`).
   */
  private async initializeTypeMap(m: HashLookupTypeMap = this.typeMap): Promise<void> {
    (this.constructor as typeof PostgreSQLAdapter).initializeTypeMap(m);

    // Rails spells these `self.class.register_class_with_precision`
    // (postgresql_adapter.rb:747-749), the same dispatch used for
    // `initialize_type_map` above. Ours cannot: `AbstractAdapter`'s static is
    // `TypeMap`-shaped and reads the sql_type as `args.at(-1)`, while
    // `HashLookupTypeMap` — the map PG registers into — forwards
    // `(lookupKey, ...args)`, so a keyless `lookup(oid)` would hand it the OID
    // as the sql_type. `postgresql/type-map-init.ts` carries the
    // HashLookupTypeMap-shaped port, which is what the class-level seeder uses
    // too. Unifying the two is `pg-register-class-with-precision-one-impl`.
    const timezone = ActiveRecord.defaultTimezone;
    registerClassWithPrecision(m, "time", TimeType, { timezone });
    registerClassWithPrecision(m, "timestamp", Timestamp, { timezone });
    registerClassWithPrecision(m, "timestamptz", TimestampWithTimeZone);

    await this.loadAdditionalTypes();
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
      const castType = new ValueType();
      this.typeMap.registerType(oid, castType);
      return castType;
    });
  }

  /**
   * Mirrors: `include PostgreSQL::Quoting` — the module's
   * `lookup_cast_type_from_column` (postgresql/quoting.rb:189-192), reached
   * through the same one-line seam as `quotedDate` / `quotedBinary`.
   */
  override lookupCastTypeFromColumn(column: CastableColumn): Type {
    return pgLookupCastTypeFromColumn.call(this, column) as Type;
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
    const rows = (await this.internalExecQuery(sql, "SCHEMA")).toArray();
    const result = (rows[0]?.can_lower as boolean) === true;
    this._caseInsensitiveCache.set(sqlType, result);
    return result;
  }

  /**
   * Mirrors: PostgreSQL::DatabaseStatements#internal_exec_query. Executes a
   * query and returns an ActiveRecord::Result with `columnTypes` populated from the
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
   * The mixin-level internalExecQuery returns a Result with empty columnTypes;
   * this override is the Rails-faithful PG version that actually
   * populates them.
   *
   * Rails has no PG `exec_query` override: the abstract one
   * (abstract/database_statements.rb:147-149) funnels here, so we inherit it.
   */
  override async internalExecQuery(
    sql: string,
    name: string | null = "SQL",
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<Result> {
    sql = this.preprocessQuery(sql);
    interface ArrayQueryResult {
      fields: Array<{ name: string; dataTypeID: number }>;
      rows: unknown[][];
    }
    // Mirrors `type_casted_binds` (abstract/quoting.rb:224): the single bind
    // normalizer, mapping the adapter's `type_cast` over the binds.
    const bindArray = this.typeCastedBinds(binds) ?? [];
    const rewritten = this.rewriteBinds(sql, bindArray);
    const pgResult: ArrayQueryResult = await this.log(
      rewritten,
      name,
      binds ?? [],
      bindArray,
      false,
      async (payload) => {
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
                // Rails' internal_exec_query forwards `prepare:` down to
                // perform_query (abstract/database_statements.rb:552-558); an
                // explicit `false` hard-disables preparation, while an absent
                // one still passes through the adapter's own gate.
                return await this._performQuery<ArrayQueryResult & pg.QueryResult>(
                  client,
                  rewritten,
                  binds ?? [],
                  bindArray,
                  {
                    prepare:
                      options?.prepare === false
                        ? false
                        : this.preparedStatements && bindArray.length > 0,
                    notificationPayload: payload,
                    rowMode: "array",
                  },
                );
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
    if (fields.length === 0) return Result.fromRowHashes([]);

    const missing = new Set<number>();
    for (const f of fields) {
      if (!this.typeMap.has(f.dataTypeID)) missing.add(f.dataTypeID);
    }
    if (missing.size > 0) {
      await this.loadAdditionalTypes([...missing]);
    }

    const columns = fields.map((f) => f.name);
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
      // `internal_execute` is UNCAST, which is what keeps the cycle
      // unreachable: `cast_result` would resolve every pg_type column through
      // `get_oid_type`, re-entering this method. Ruby's PG::Result already
      // yields hash rows; node-pg's array mode needs the field names put back.
      const result = (await this.internalExecute(query, "SCHEMA", [], {
        allowRetry: true,
        materializeTransactions: false,
      })) as { fields?: Array<{ name: string }>; rows?: unknown[][] };
      const records = new Result(
        (result.fields ?? []).map((f) => f.name),
        result.rows ?? [],
      ).toArray() as unknown as PgTypeRow[];
      initializer.run(records);
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
    yield `${baseQuery}\n${initializer.queryConditionsForArrayTypes()}`;
  }

  /**
   * Mirrors: PostgreSQLAdapter#reload_type_map. Clears the memoized
   * type_map and re-runs the instance initializer, matching Rails'
   * reload_type_map behavior when new user-defined types have been
   * created (CREATE TYPE, CREATE DOMAIN, etc).
   */
  async reloadTypeMap(): Promise<void> {
    // Rails holds `@lock.synchronize` over the whole body
    // (postgresql_adapter.rb:359-369). The cleared map stays empty across the
    // `loadAdditionalTypes` await, so without the lock a concurrent reader —
    // or a second reloadTypeMap — observes a half-seeded map mid-reload.
    return this.lock.synchronize(async () => {
      if (this._typeMap) {
        this.typeMap.clear();
      } else {
        this._typeMap = new HashLookupTypeMap();
      }

      await this.initializeTypeMap();
      this._statements.reset();
    });
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
    if (this._rawConnection && this._connectionConfigured && !this._needsDeallocateAll) {
      return this._rawConnection;
    }
    if (!this._acquiring || this._acquiringGen !== this._acquireGeneration) {
      const acquireGen = this._acquireGeneration;
      const acquiring = this._doAcquire(acquireGen).finally(() => {
        this._discardedAcquireGenerations.delete(acquireGen);
        if (this._acquiring === acquiring) this._acquiring = null;
      });
      this._acquiring = acquiring;
      this._acquiringGen = acquireGen;
    }
    return this._acquiring;
  }

  private async _doAcquire(acquireGen: number): Promise<pg.Client> {
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
      const racedDiscard = this._discardedAcquireGenerations.has(acquireGen);
      const staleGeneration = acquireGen !== this._acquireGeneration;
      if (
        this._closed ||
        this._pgClientOptions == null ||
        this._rawConnection != null ||
        racedDiscard ||
        staleGeneration
      ) {
        this._teardownRacedClient(newClient, acquireGen);
        if (this._closed || this._pgClientOptions == null || racedDiscard || staleGeneration) {
          throw new Error("PostgreSQLAdapter: connection is closed");
        }
        client = this._rawConnection!;
      } else {
        newClient.on("error", () => {});
        this._attachNoticeListener(newClient);
        this._attachReadyForQueryListener(newClient);
        this._rawConnection = newClient;
        client = newClient;
      }
    }
    try {
      await this.configureConnection();
      if (this._closed || this._rawConnection !== client) {
        throw new Error("PostgreSQLAdapter: connection is closed");
      }
      await this._maybeDrainOrphanedPreparedStatements(client);
      if (this._closed || this._rawConnection !== client) {
        throw new Error("PostgreSQLAdapter: connection is closed");
      }
    } catch (error) {
      if (this._rawConnection === client) {
        this._rawConnection = null;
        this._connectionConfigured = false;
        this._typeMapEagerLoaded = false;
        this._statements.reset();
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
    this._commandSettled = false;
    await client.query("DEALLOCATE ALL");
  }

  /**
   * Re-open / drain the connection before the base `withRawConnection` loop
   * yields `this._connection`. Serialization against `resetBang` is NOT this
   * hook's job: the reset body runs under the same `@lock` the loop already
   * holds (postgresql_adapter.rb:372), so it can only run before or after this
   * call, never between two of the statements it fires. The connection itself
   * is opened eagerly by `connectBang()` (initial use) or `reconnect()`
   * (post-failure), so there is nothing left to acquire here. Replaces the
   * deleted `rawConnectionForBlock` seam.
   *
   * @internal
   */
  protected override async awaitRawConnectionReady(): Promise<void> {
    if (!this._closed && this._rawConnection === null && this._pgClientOptions !== null) {
      await this.connect();
    }
    const client = this._rawConnection;
    if (client && !this._closed) await this._maybeDrainOrphanedPreparedStatements(client);
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
    // Mirrors `type_casted_binds` (abstract/quoting.rb:224) — the same single
    // normalizer the execQuery path uses.
    const bindArray = this.typeCastedBinds(binds) ?? [];
    const rewritten = this.rewriteBinds(sql, bindArray);
    try {
      return await this.log(rewritten, name, binds, bindArray, false, async (payload) => {
        try {
          return await this.withRawConnection({ allowRetry }, async (conn) => {
            const client = conn as unknown as pg.Client;
            const result = await this._performQuery(client, rewritten, binds, bindArray, {
              prepare: this.preparedStatements && bindArray.length > 0,
              notificationPayload: payload,
            });
            return result?.rows ?? [];
          });
        } catch (e: any) {
          const translated = this._translateException(e, rewritten, bindArray);
          throw translated;
        }
      });
    } finally {
      // Rails' `execute(...) ... ensure @notice_receiver_sql_warnings = []`
      // (postgresql/database_statements.rb:39-43). This is the only place the
      // buffer is reset per query — a warning raised on an internal path
      // survives into the next `handle_warnings` pass, as it does in Rails.
      this._noticeReceiverSqlWarnings = [];
    }
  }

  /**
   * The single SQL primitive every query path funnels through, extracted to
   * `postgresql/database-statements.ts` (`performQuery`) so parity:api's
   * file-level match sees it where Rails puts it.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#perform_query
   * @internal
   */
  private _performQuery = pgPerformQuery;

  /**
   * `raw_execute` reaches `perform_query` through `this`
   * (abstract/database_statements.rb:552-558), and `raw_exec_query` casts what
   * it returns (`:541-543`) — the path `FutureResult#exec_query` runs on
   * (future_result.rb:169-171). Rails needs no seam here because a `PG::Result`
   * exposes both the hash and the positional view of a row, so its
   * `cast_result` can read columns off the one object `perform_query` returns.
   * node-pg does not: positional rows come only from `rowMode: "array"` (see
   * the extracted `performQuery`'s note), which every trails path that builds a
   * `Result` therefore has to ask for. This supplies it for the `raw_execute`
   * entry; `_performQuery`'s direct callers pass their own.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#perform_query
   * @internal
   */
  declare performQuery: (
    rawConnection: pg.Client,
    sql: string,
    binds: unknown[],
    typeCastedBinds: unknown[],
    options: { prepare?: boolean; notificationPayload?: Record<string, unknown> },
  ) => Promise<pg.QueryResult>;

  /**
   * Dispatch the notices PG raised during the last statement, wired from the
   * extracted module below.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#handle_warnings
   * @internal
   */
  declare handleWarnings: (sql: unknown) => void;

  /**
   * Rows affected by a write, read from its `PG::Result` (`cmd_tuples`).
   * Wired to the existing this-less port so parity:api coverage points at live
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
  async executeMutation(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
  ): Promise<number> {
    sql = this.preprocessQuery(sql);
    // Mirrors `type_casted_binds` (abstract/quoting.rb:224). Without the typeCastedBinds unwrap, an INSERT
    // routed through executeMutation would bind a raw QueryAttribute to pg.
    const originalBinds = binds;
    binds = this.typeCastedBinds(binds) ?? [];
    const pgSql = this.rewriteBinds(sql, binds);
    return await this.log(pgSql, name, originalBinds, binds, false, async (payload) => {
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
            payload.sql = withReturning;
            try {
              if (useSavepoint) {
                this._commandSettled = false;
                await client.query(`SAVEPOINT "${spName}"`);
              }
              const result = await this._performQuery(client, withReturning, originalBinds, binds, {
                prepare: this.preparedStatements && binds.length > 0,
                notificationPayload: payload,
              });
              if (useSavepoint) {
                this._commandSettled = false;
                await client.query(`RELEASE SAVEPOINT "${spName}"`);
              }
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
                this._commandSettled = false;
                await client.query(`ROLLBACK TO SAVEPOINT "${spName}"`).catch(() => {});
                this._commandSettled = false;
                await client.query(`RELEASE SAVEPOINT "${spName}"`).catch(() => {});
              }
              payload.sql = pgSql;
              const result = await this._performQuery(client, pgSql, originalBinds, binds, {
                prepare: this.preparedStatements && binds.length > 0,
                notificationPayload: payload,
              });
              const affected = this.affectedRows(result);
              payload.row_count = affected;
              return affected;
            }
          }

          if (upper.startsWith("INSERT") && upper.includes("RETURNING")) {
            const result = await this._performQuery(client, pgSql, originalBinds, binds, {
              prepare: this.preparedStatements && binds.length > 0,
              notificationPayload: payload,
            });
            const affected = this.affectedRows(result);
            payload.row_count = affected;
            if (result.rows.length > 0) {
              return result.rows[0][Object.keys(result.rows[0])[0]] as number;
            }
            return affected;
          }

          const result = await this._performQuery(client, pgSql, originalBinds, binds, {
            prepare: this.preparedStatements && binds.length > 0,
            notificationPayload: payload,
          });
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
    await this._transactionManager.beginTransaction({ _lazy: false });
  }

  async beginDbTransaction(): Promise<void> {
    this._client = await this._acquireFreshClient();
    try {
      await this.internalExecute("BEGIN", "TRANSACTION", [], {
        materializeTransactions: false,
        allowRetry: true,
      });
      this._inTransaction = true;
    } catch (error) {
      this._client = null;
      this._inTransaction = false;
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
    if (!this._client) throw new ActiveRecordError("No active transaction");
    try {
      await this.internalExecute("COMMIT", "TRANSACTION");
    } catch (e) {
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
    if (!this._client) throw new ActiveRecordError("No active transaction");
    try {
      await this.internalExecute("ROLLBACK", "TRANSACTION", [], {
        allowRetry: false,
        materializeTransactions: true,
      });
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

  /**
   * Mirrors: `PostgreSQL::DatabaseStatements#exec_rollback_db_transaction`
   * (`postgresql/database_statements.rb:78-81`).
   *
   * Deviation, language-forced: the `finally` releases trails' single
   * persistent pg.Client. Ruby's adapter *is* the connection and has no
   * `@client` to release, whereas here `beginDbTransaction` pins one and
   * `_inTransaction` gates the RETURNING savepoint wrap and the
   * `CREATE INDEX CONCURRENTLY` guard.
   */
  async execRollbackDbTransaction(): Promise<void> {
    await this._cancelAnyRunningQuery();
    try {
      await this.internalExecute("ROLLBACK", "TRANSACTION", [], {
        allowRetry: false,
        materializeTransactions: true,
      });
    } finally {
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
    await this._cancelAnyRunningQuery();
    await this.internalExecute("ROLLBACK AND CHAIN", "TRANSACTION", [], {
      allowRetry: false,
      materializeTransactions: true,
    });
  }

  /**
   * Mirrors: `PG::Connection#transaction_status` (ruby-pg / libpq
   * `PQtransactionStatus`), which Rails reads in `retryable_query_error?`
   * (postgresql_adapter.rb:850) and `cancel_any_running_query`
   * (postgresql/database_statements.rb:127).
   *
   * libpq derives it from the status byte of the last ReadyForQuery message
   * plus whether a query is outstanding; node-pg exposes both — pg-protocol
   * parses the byte into `ReadyForQueryMessage.status` and `pg.Client` flips
   * `readyForQuery` false for exactly the span a query is on the wire, which is
   * the PQTRANS_ACTIVE that has no byte of its own.
   *
   * @internal
   */
  get transactionStatus(): number {
    const client = this._rawConnection as (pg.Client & { readyForQuery?: boolean }) | null;
    if (client == null) return PQTRANS_UNKNOWN;
    if (client.readyForQuery !== true && !this._commandSettled) return PQTRANS_ACTIVE;
    switch (this._readyForQueryStatus) {
      case "T":
        return PQTRANS_INTRANS;
      case "E":
        return PQTRANS_INERROR;
      default:
        return PQTRANS_IDLE;
    }
  }

  /**
   * Record the ReadyForQuery status byte libpq keeps on the PGconn. Attached
   * once per pg.Client lifecycle alongside the notice listener, for the same
   * reason: `resetBang` re-runs configure on the same client. An ErrorResponse
   * aborts the open transaction, which the ReadyForQuery that follows spells
   * 'E'; recording it on both keeps them consistent across the settle window.
   *
   * @internal
   */
  private _attachReadyForQueryListener(client: pg.Client): void {
    this._readyForQueryStatus = "I";
    this._commandSettled = true;
    const connection = (client as pg.Client & { connection?: pg.Connection }).connection;
    if (connection == null) return;
    connection.on("readyForQuery", (message: { status?: string }) => {
      if (typeof message?.status === "string") this._readyForQueryStatus = message.status;
      this._commandSettled = true;
    });
    connection.on("commandComplete", () => {
      this._commandSettled = true;
    });
    connection.on("errorMessage", () => {
      if (this._readyForQueryStatus === "T") this._readyForQueryStatus = "E";
      this._commandSettled = true;
    });
  }

  // Mirrors: PostgreSQL::DatabaseStatements#cancel_any_running_query (database_statements.rb:127-133)
  // Sends a CancelRequest to abort any in-flight query on the transaction connection
  // before issuing ROLLBACK / ROLLBACK AND CHAIN. Best-effort: errors are
  // swallowed, as Ruby's `rescue PG::Error` swallows them.
  //
  // The invariant both of Ruby's lines buy, and neither buys alone: a
  // CancelRequest is addressed to a BACKEND, not to a statement, so whatever
  // that backend is running when the packet lands is what dies. `cancel` is
  // PQcancel and returns only once the request has been sent and the socket
  // closed; `block` waits for the cancelled command to come back. Both block,
  // so the cancel is delivered — and its effect consumed — inside the chain
  // that owns the query, rather than firing at whatever is on the wire
  // milliseconds later.
  private async _cancelAnyRunningQuery(): Promise<void> {
    type PgClientWithPid = pg.Client & {
      processID?: number | null;
      secretKey?: number | null;
    };
    type PgConnectionWithCancel = pg.Connection & {
      connect(portOrPath: string | number, host?: string): void;
      cancel(processID: number, secretKey: number): void;
    };
    const txClient = this._client as PgClientWithPid | null;
    if (this._rawConnection == null || IDLE_TRANSACTION_STATUSES.includes(this.transactionStatus)) {
      return;
    }
    if (txClient?.processID == null) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const cancelCon = new pg.Connection() as PgConnectionWithCancel;
        // A failed PQcancel raises PG::Error in Ruby, so `block` never runs.
        cancelCon.on("error", (error: unknown) => reject(error));
        cancelCon.on("end", () => resolve());
        cancelCon.once("connect", () => {
          cancelCon.cancel(txClient.processID!, txClient.secretKey ?? 0);
        });
        const { host, port } = txClient;
        if (host?.startsWith("/")) {
          cancelCon.connect(`${host}/.s.PGSQL.${port}`);
        } else {
          cancelCon.connect(port, host);
        }
      });
      await this._blockUntilCommandSettles(txClient);
    } catch {
      // cancel is best-effort — a drain failure must not mask the rollback,
      // as Rails' `rescue PG::Error` on cancel_any_running_query does not.
    }
  }

  /**
   * Mirrors `PG::Connection#block` as `cancel_any_running_query` uses it
   * (postgresql/database_statements.rb:131): wait until the command on the
   * wire has produced its terminating message. libpq blocks on the socket;
   * node-pg is event-driven, so the wait is on the same terminating-message
   * events `_attachReadyForQueryListener` tracks `_commandSettled` from, plus
   * the socket's own end/error so a connection that dies under the cancel
   * cannot hang the rollback. Like Ruby's, it has no timeout of its own.
   *
   * @internal
   */
  private _blockUntilCommandSettles(client: pg.Client): Promise<void> {
    if (this._commandSettled) return Promise.resolve();
    const connection = (client as pg.Client & { connection?: pg.Connection }).connection;
    if (connection == null) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const settle = (): void => {
        connection.off("readyForQuery", settle);
        connection.off("commandComplete", settle);
        connection.off("errorMessage", settle);
        connection.off("end", settle);
        connection.off("error", settle);
        resolve();
      };
      connection.on("readyForQuery", settle);
      connection.on("commandComplete", settle);
      connection.on("errorMessage", settle);
      connection.on("end", settle);
      connection.on("error", settle);
    });
  }

  // Mirrors: DatabaseStatements#begin_isolated_db_transaction (database_statements.rb:68)
  async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    // Rails: `transaction_isolation_levels.fetch(isolation)`
    // (postgresql/database_statements.rb:69) — an unknown level raises Ruby's
    // `KeyError: key not found: :bogus`, not a bespoke message.
    const level = transactionIsolationLevels()[isolation];
    if (level === undefined) throw new KeyError(`key not found: :${isolation}`);
    this._client = await this._acquireFreshClient();
    try {
      await this.internalExecute(`BEGIN ISOLATION LEVEL ${level}`, "TRANSACTION", [], {
        materializeTransactions: false,
        allowRetry: true,
      });
      this._inTransaction = true;
    } catch (error) {
      this._client = null;
      this._inTransaction = false;
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
    name: string | null = "SQL",
    binds: unknown[] = [],
    {
      materializeTransactions = true,
      allowRetry = false,
      prepare,
    }: {
      materializeTransactions?: boolean;
      allowRetry?: boolean;
      prepare?: boolean;
    } = {},
  ): Promise<unknown> {
    sql = preprocessQuery.call(this as any, sql);
    try {
      if (materializeTransactions) await this.materializeTransactions();
      // Thread binds through so a bound INSERT ... RETURNING reaches the driver,
      // matching Rails internal_execute(sql, name, binds). Transaction-control
      // callers pass none, keeping their byte-identical no-bind path (no rewrite).
      const hasBinds = binds.length > 0;
      const bindArray = hasBinds ? (this.typeCastedBinds(binds) ?? []) : [];
      const runSql = hasBinds ? this.rewriteBinds(sql, bindArray) : sql;
      const result = await this.log(runSql, name, binds, bindArray, false, (payload) =>
        this.withRawConnection({ materializeTransactions: false, allowRetry }, async (conn) => {
          const client = conn as unknown as pg.Client;
          // Errors propagate raw: withRawConnection translates the driver error to
          // an ActiveRecordError (with sql: null / binds: []), and the shared logSql
          // rescue then attaches sql + binds via set_query — mirroring Rails'
          // AbstractAdapter#log. Translating here would duplicate that and, on an
          // already-translated error, re-wrap it as StatementInvalid.
          // Rails' internal_execute forwards `prepare:` to raw_execute →
          // perform_query (abstract/database_statements.rb:552-558, 589-591).
          const runResult = await this._performQuery(client, runSql, binds, bindArray, {
            prepare: prepare === false ? false : this.preparedStatements && bindArray.length > 0,
            notificationPayload: payload,
            rowMode: "array",
          });
          const count = runResult.rowCount ?? runResult.rows.length;
          payload.row_count = count;
          return runResult;
        }),
      );
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
   * `EXPLAIN (ANALYZE, VERBOSE) <sql>`. Runs through
   * `internalExecQuery` as Rails' PG `explain` does, so the EXPLAIN is
   * instrumented and binds pass through in the same rewritten form
   * (`?` → `$1` placeholders + the values array) that
   * `execute()`/`execQuery()` use.
   */
  async explain(
    sql: string,
    binds: unknown[] = [],
    options: ExplainOption[] = [],
  ): Promise<string> {
    const explainSql = (await this.buildExplainClause(options)) + " " + this.toSql(sql, binds);
    const result = await this.internalExecQuery(explainSql, "EXPLAIN", binds);
    const printer = new ExplainPrettyPrinter();
    return printer.pp(result);
  }

  /**
   * The EXPLAIN clause — both the statement PG executes and the header
   * `Relation#explain` prints, exactly as in Rails, where `explain` composes
   * its SQL out of this same method (`postgresql/database_statements.rb:8`).
   * The trailing `" for:"` belongs only to `ActiveRecord::Explain`'s fallback
   * for adapters that do not define `build_explain_clause`
   * (`explain.rb:56-61`) — an adapter that defines it must not append it.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements#build_explain_clause
   * (postgresql/database_statements.rb:96-100)
   */
  async buildExplainClause(options: ExplainOption[] = []): Promise<string> {
    if (options.length === 0) return "EXPLAIN";
    return `EXPLAIN (${options.join(", ").toUpperCase()})`;
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
   * @internal Reification of Rails' PostgreSQL `ColumnMethods` module, which extends the abstract
   * `define_column_methods` list (abstract/schema_definitions.rb:324) rather than exposing public
   * API.
   */
  override _columnMethodNames(): string[] {
    return [
      ...super._columnMethodNames(),
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
    await this.internalExecute("SET standard_conforming_strings = on", "SCHEMA");
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
  /**
   * @missingRailsCall query_value — PERMANENT: Rails runs the query inside the sync reader
   *   via `||=`; trails queries are Promises, so the `queryValue` call lives in
   *   the async `warmMaxIdentifierLength` and this reader returns the warmed
   *   memo.
   */
  maxIdentifierLength(): number {
    return this._maxIdentifierLength ?? 63;
  }

  // Lazily populate the max_identifier_length memo via a logged SCHEMA query,
  // matching Rails' `query_value("SHOW max_identifier_length", "SCHEMA")`
  // (postgresql_adapter.rb:620-622). The null guard makes it a no-op once
  // warmed; the memo persists across reconnects, mirroring Rails' `||=` which
  // never resets.
  /**
   * @noRailsEquivalent PERMANENT — Rails' `max_identifier_length`
   * (postgresql_adapter.rb:620) does the `SHOW max_identifier_length` query
   * inside the synchronous reader via `||=`. trails queries are Promises, so
   * the reader cannot issue one and the round-trip has to live in a separate
   * async warmer. No Rails method can ever map onto it.
   */
  async warmMaxIdentifierLength(): Promise<number> {
    if (this._maxIdentifierLength == null) {
      const value = await this.queryValue("SHOW max_identifier_length", "SCHEMA");
      this._maxIdentifierLength = parseInt(String(value ?? "63"), 10);
    }
    return this._maxIdentifierLength;
  }

  // Mirrors: PostgreSQLAdapter#session_auth= (postgresql_adapter.rb:625)
  // Returns a Promise so callers can await the SET SESSION AUTHORIZATION round-trip.
  async sessionAuth(user: string): Promise<void> {
    await this.clearCacheBang();
    const quoted = user.toUpperCase() === "DEFAULT" ? "DEFAULT" : pgQuoteColumnName(user);
    await this.internalExecute(`SET SESSION AUTHORIZATION ${quoted}`, undefined, [], {
      materializeTransactions: true,
    });
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
    name: string | null = null,
    binds: unknown[] = [],
    pk?: string | false | null,
    sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result> {
    // Mirrors Rails' single `if use_insert_returning? || pk == false` arm
    // (postgresql/database_statements.rb:46-47) — `super` is the abstract
    // `sql_for_insert` + `internal_exec_query` pair, which honours the
    // `pk == false` opt-out inside `sql_for_insert` itself.
    if (this._useInsertReturning || pk === false) {
      return super.execInsert(sql, name, binds, pk, sequenceName, returning);
    }
    // Rails' else arm (database_statements.rb:48-59). In Rails the whole method
    // runs on the connection the calling thread has checked out, so the INSERT
    // and `currval()` — which is session-scoped *and* session-mutable — cannot
    // be separated by another thread's INSERT on the same session. JS has no
    // per-thread checkout, so the adapter's own reentrant monitor (the same
    // `@lock` withRawConnection takes, abstract_adapter.rb:972-984) is the lease:
    // the two internalExecQuery calls below re-enter it and stay a unit.
    return this.lock.synchronize(async () => {
      const result = await this.internalExecQuery(sql, name, binds);
      if (!sequenceName) {
        const tableRef = extractTableRefFromInsertSql.call(this as never, sql);
        if (tableRef) {
          if (pk == null) pk = (await this.primaryKey(tableRef)) as string | null;
          pk = suppressCompositePrimaryKey(typeof pk === "string" ? pk : undefined) ?? null;
          sequenceName = pk ? await this.defaultSequenceName(tableRef, pk) : null;
        }
        if (!sequenceName) return result;
      }
      return this.lastInsertIdResult(sequenceName);
    });
  }

  /**
   * Mirrors: PostgreSQL::DatabaseStatements#last_insert_id_result
   * (postgresql/database_statements.rb:204-206) — the current id of a table's
   * sequence.
   */
  private lastInsertIdResult = pgLastInsertIdResult;

  /** Mirrors: PostgreSQL::DatabaseStatements#returning_column_values — the full
   *  first row of the RETURNING result (supports multi-column RETURNING). *
   * @internal
   */
  override returningColumnValues(result: Result): unknown[] | undefined {
    return pgReturningColumnValues(result);
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
        this._commandSettled = false;
        await client.query(sql);
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
    // Rails' disconnect! → clear_cache!(new_connection: true) → @statements.reset
    // (abstract_adapter.rb:700-706, 739-747): the map is dropped without
    // DEALLOCATE, since the session that owned those names is gone.
    this._statements.reset();
    this._client = null;
    this._inTransaction = false;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    this._closed = true;
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
    this._statements.reset();
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
    const conn = this._rawConnection;
    if (this._closed || !conn) {
      await this.reconnectBang({ restoreTransactions: true });
      this.verifiedBang();
      return;
    }
    try {
      // Rails' `active?` sends its `;` ping under `@lock`
      // (postgresql_adapter.rb:348-352), so it can never land between the
      // statements `reset!` fires under the same lock.
      await this.lock.synchronize(() => conn.query(";"));
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
    const live = this._rawConnection;
    // DISCARD ALL also resets session-level GUCs (standard_conforming_
    // strings, intervalstyle, client_min_messages, custom variables) —
    // mark the connection unconfigured so the body below (and any racing
    // acquire) re-runs _maybeConfigureConnection. Matches Rails' reset!,
    // which calls attempt_configure_connection via super
    // (abstract_adapter.rb:729). Set BEFORE scheduling the body so a racing
    // _maybeConfigureConnection sees it false and reconfigures.
    this._connectionConfigured = false;
    // Rails wraps the whole body — the conditional ROLLBACK, DISCARD ALL and
    // super — in ONE @lock.synchronize (postgresql_adapter.rb:372-381), so no
    // foreign query can interleave between those statements. resetBang is sync
    // per AbstractAdapter and cannot block for the lock, so the body is
    // scheduled onto it instead: it runs to completion once, uninterrupted,
    // and every query path serializes on the same lock rather than on a
    // separate reset barrier.
    // The lock is `@lock` on the adapter itself (abstract_adapter.rb:181-192),
    // which `super.resetBang()` leaves in place — a foreign query entering
    // while the body runs takes that same monitor and queues behind it.
    void this.lock
      .synchronize(async () => {
        if (this._client) {
          // No CancelRequest: `reset!` waits behind the query on the wire, it
          // never cancels one — `cancel_any_running_query`'s only callers are
          // `exec_rollback_db_transaction` / `exec_restart_db_transaction`
          // (postgresql/database_statements.rb:79, :84).
          await live.query("ROLLBACK").catch(() => {});
          this._client = null;
          this._inTransaction = false;
        }
        await live.query("DISCARD ALL");
        if (this._rawConnection === live && !this._closed) {
          // Rails' reset! ends in configure_connection via super
          // (postgresql_adapter.rb:380), so the dispatch goes through the
          // public, overridable hook.
          await this.configureConnection().catch((error: unknown) => {
            if (this._rawConnection === live) {
              this._rawConnection = null;
              this._connectionConfigured = false;
              this._typeMapEagerLoaded = false;
              this._statements.reset();
            }
            live.end().catch(() => {});
            throw error;
          });
        }
        this._statements.reset();
        // Rails' `super` — clear_cache!(new_connection: true), reset_transaction
        // and attempt_configure_connection (abstract_adapter.rb:726-730) — runs
        // inside the same lock, last (postgresql_adapter.rb:380). Its configure
        // hop is a no-op here: the body above has already re-run it on this
        // socket and latched `_connectionConfigured`.
        super.resetBang();
      })
      .catch(() => {});
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#configure_connection`. Applies
   * per-connection settings (standard_conforming_strings, intervalstyle,
   * client_min_messages, session variables). Delegates to the internal
   * `_maybeConfigureConnection` which gates on a boolean so the
   * persistent client is configured exactly once per connection.
   *
   * Rails' `configure_connection` (postgresql_adapter.rb:956) is argless and
   * operates on `@raw_connection`, so this one is too. `_doAcquire` publishes
   * the freshly-opened socket as `_rawConnection` before dispatching here, the
   * way Rails' `connect` assigns `@raw_connection` before calling
   * `configure_connection` — there is no pre-install window to configure
   * through, and no parameter naming one.
   *
   * The inherited `reconnectBang` lifecycle calls this argless after the raw
   * `reconnect()` has nulled `_rawConnection`; PG opens the new connection
   * lazily on the next acquire, so that call still resolves to
   * configure-on-next-acquire.
   *
   * @internal
   *
   * @missingRailsCall internal_execute — CONVERGEABLE (RFC 0073-permanent-connection-checkout-disallowed): configure runs while the acquire
   *   machinery still holds the connection, so the SET statements go straight to
   *   the pg.Client — routing them through internalExecute would re-enter
   *   connectBang/verify and deadlock. Root cause (RFC 0106 re-confirmation):
   *   Rails' `with_raw_connection` wraps its body in `@lock.synchronize`
   *   (abstract_adapter.rb:983-984) and `@lock` is a `Monitor`
   *   (abstract_adapter.rb:180-189, `LoadInterlockAwareMonitor < Monitor`),
   *   which is RE-ENTRANT for the owning thread — so Rails nests this call
   *   inside the acquire that is already holding the connection. A JS
   *   promise-based mutex has no thread/fiber identity to key re-entrancy on, so
   *   the nested call deadlocks instead of re-entering. Language shortcoming,
   *   tracked by RFC 0073.
   * @missingRailsCall quote — CONVERGEABLE (RFC 0073-permanent-connection-checkout-disallowed): The SET SESSION values are rendered by
   *   `quoteLiteral` on the raw client in `_maybeConfigureConnection`; `quote`
   *   would route back through the type-cast stack the connection is still
   *   mid-configure for. Root cause (RFC 0106 re-confirmation): Rails'
   *   `with_raw_connection` wraps its body in `@lock.synchronize`
   *   (abstract_adapter.rb:983-984) and `@lock` is a `Monitor`
   *   (abstract_adapter.rb:180-189, `LoadInterlockAwareMonitor < Monitor`),
   *   which is RE-ENTRANT for the owning thread — so Rails nests this call
   *   inside the acquire that is already holding the connection. A JS
   *   promise-based mutex has no thread/fiber identity to key re-entrancy on, so
   *   the nested call deadlocks instead of re-entering. Language shortcoming,
   *   tracked by RFC 0073.
   */
  async configureConnection(): Promise<void> {
    const conn = this._rawConnection;
    if (!conn) return;
    return this._maybeConfigureConnection(conn);
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#disconnect!`. Tears down the
   * persistent connection synchronously so no new queries can start; the
   * `client.end()` it starts is recorded in `_closingDriver` and surfaced
   * through `whenClosed()`, which `ConnectionPool#disconnect` awaits.
   */
  override disconnectBang(): void {
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._client = null;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    this._statements.reset();
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
    this._closingDriver = conn?.end().catch(() => {}) ?? null;
    // Rails' disconnect! calls reset_transaction; super.disconnectBang() does not.
    this.resetTransaction();
    super.disconnectBang();
  }

  /**
   * The pending `client.end()` left in flight by `disconnectBang()`, which is
   * synchronous as Rails' `disconnect!` is. `ConnectionPool#disconnect` awaits
   * this, so `await pool.disconnect()` means the PG socket is actually closed
   * — not merely that no further queries can start. Resolves immediately when
   * nothing is draining.
   *
   * @noRailsEquivalent PERMANENT — Rails' `disconnect!`
   * (postgresql_adapter.rb:386-392) closes the connection through libpq's
   * synchronous `PG::Connection#close`, so there is no pending close for a
   * Rails method to expose. node-pg's `Client#end()` is promise-returning.
   */
  whenClosed(): Promise<void> {
    return this._closingDriver ?? Promise.resolve();
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
    this._statements.reset();
    this._needsDeallocateAll = false;
    this._inTransaction = false;
    this._closed = true;
    if (this._acquiring) this._discardedAcquireGenerations.add(this._acquireGeneration);
    this._acquireGeneration++;
    abandonRawSocket(conn);
    // Rails' discard! (unlike disconnect!) does NOT reset the transaction
    // manager — it only forgets the connection (super is the empty base
    // discard!). So we drop the references above and call the no-op super
    // without running the disconnect/reset-transaction lifecycle.
    super.discardBang();
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
   * Returns the pool's chained DEALLOCATEs so the caller can await them before
   * putting its own query on the socket; Rails' `clear_cache!` blocks on them.
   */
  override clearCacheBang({
    newConnection = false,
  }: { newConnection?: boolean } = {}): void | Promise<void> {
    void super.clearCacheBang({ newConnection });
    // Rails wraps the pool mutation in `@lock.synchronize`
    // (abstract_adapter.rb:741-747) — the precondition `dealloc` states
    // outright: "the statement pool is only accessed while holding the
    // connection's lock" (postgresql_adapter.rb:308-310).
    return this.lock.synchronize(() => {
      if (newConnection) {
        // Rails' `new_connection: true` branch (statement_pool.rb:44-46) drops the
        // map without DEALLOCATE: the session that owned those statement names is
        // gone, so naming them again is an error, not a cleanup.
        this._statements.reset();
      } else if (this._rawConnection) {
        return this._statements.clear();
      } else {
        this._statements.reset();
        this._needsDeallocateAll = true;
      }
    });
  }

  /**
   * Mirrors: `PostgreSQLAdapter#in_transaction?`
   * (`postgresql_adapter.rb:908-910`) — `open_transactions > 0`, so an open
   * *lazy* (un-materialized) frame counts, exactly like `transaction_open?`.
   * The physical-BEGIN marker is the private `_inTransaction` flag, which is a
   * different question and deliberately not this one.
   *
   * @internal
   */
  get inTransaction(): boolean {
    return this.openTransactions > 0;
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
  override async buildInsertSql(insert: InsertBuilder): Promise<string> {
    let sql = `INSERT ${insert.into()}`;

    if (insert.skipDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO NOTHING`;
    } else if (insert.updateDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO UPDATE SET `;
      const raw = insert.rawUpdateSql();
      if (raw) {
        sql += raw.value;
      } else {
        sql += insert.touchModelTimestampsUnless(
          (column) =>
            `${insert.quotedTableName()}.${column} IS NOT DISTINCT FROM excluded.${column}`,
        );
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

  // Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter#check_version
  // (postgresql_adapter.rb:669-673).
  override async checkVersion(): Promise<void> {
    if ((await this.databaseVersion) < 9_03_00) {
      throw new Error(
        `Your version of PostgreSQL (${await this.databaseVersion}) is too old. Active Record supports PostgreSQL >= 9.3.`,
      );
    }
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
   * Mirrors: PostgreSQLAdapter#get_database_version
   * (`postgresql_adapter.rb:634-643`) — a pure fetch, run at most once through
   * the pool memo (`pool_config.rb:39-41`,
   * `abstract/connection_pool.rb:30-32`) that `configureConnection` warms at
   * connect time.
   *
   * Deviation, language-forced: Rails' `with_raw_connection` is re-entrant on
   * `@raw_connection`, so this runs on the connection being configured. Ours
   * takes the published `_rawConnection` when there is one for the same reason
   * — `_acquireFreshClient()` would await the very acquire this call is nested
   * inside.
   *
   * @missingRailsCall with_raw_connection — CONVERGEABLE (RFC 0073-permanent-connection-checkout-disallowed): Rails' with_raw_connection is
   *   re-entrant on @raw_connection; ours is not, and this runs inside the very
   *   acquire configureConnection is warming, so it takes the published
   *   `_rawConnection` directly. Root cause (RFC 0106 re-confirmation): Rails'
   *   `with_raw_connection` wraps its body in `@lock.synchronize`
   *   (abstract_adapter.rb:983-984) and `@lock` is a `Monitor`
   *   (abstract_adapter.rb:180-189, `LoadInterlockAwareMonitor < Monitor`),
   *   which is RE-ENTRANT for the owning thread — so Rails nests this call
   *   inside the acquire that is already holding the connection. A JS
   *   promise-based mutex has no thread/fiber identity to key re-entrancy on, so
   *   the nested call deadlocks instead of re-entering. Language shortcoming,
   *   tracked by RFC 0073.
   */
  async getDatabaseVersion(): Promise<number> {
    const conn = this._rawConnection ?? (await this._acquireFreshClient());
    let version: number;
    try {
      version = await this._serverVersion(conn);
      if (version === 0) {
        throw new ConnectionFailed("Could not determine PostgreSQL version");
      }
    } catch (error) {
      if (PostgreSQLAdapter._isConnectionError(error)) this._discardRawConnection();
      throw error;
    }
    return version;
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#postgresql_version`, an alias for
   * `database_version` (postgresql_adapter.rb). Public so callers can read the
   * connected server's numeric version without going through the protected
   * `databaseVersion` getter directly.
   */
  async postgresqlVersion(): Promise<number> {
    return await this.databaseVersion;
  }

  supportsBulkAlter(): boolean {
    return true;
  }
  async supportsIndexSortOrder(): Promise<boolean> {
    return true;
  }
  // Rails: `index.using == :btree || super` (postgresql_adapter.rb#default_index_type?).
  override defaultIndexType(index: IndexDefinition): boolean {
    return index.using === "btree" || super.defaultIndexType(index);
  }
  async supportsPartitionedIndexes(): Promise<boolean> {
    return (await this.databaseVersion) >= 110000;
  }
  supportsPartialIndex(): boolean {
    return true;
  }
  async supportsIndexInclude(): Promise<boolean> {
    return (await this.databaseVersion) >= 110000;
  }
  async supportsExpressionIndex(): Promise<boolean> {
    return true;
  }
  supportsTransactionIsolation(): boolean {
    return true;
  }
  supportsForeignKeys(): boolean {
    return true;
  }
  async supportsCheckConstraints(): Promise<boolean> {
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
  async supportsJson(): Promise<boolean> {
    return true;
  }
  supportsComments(): boolean {
    return true;
  }
  supportsSavepoints(): boolean {
    return true;
  }
  async supportsRestartDbTransaction(): Promise<boolean> {
    return (await this.databaseVersion) >= 120000;
  }
  async supportsInsertReturning(): Promise<boolean> {
    return true;
  }
  async supportsInsertOnConflict(): Promise<boolean> {
    return (await this.databaseVersion) >= 90500;
  }
  async supportsInsertOnDuplicateSkip(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }
  async supportsInsertOnDuplicateUpdate(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }
  async supportsInsertConflictTarget(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }
  async supportsVirtualColumns(): Promise<boolean> {
    return (await this.databaseVersion) >= 120000;
  }
  async supportsIdentityColumns(): Promise<boolean> {
    return (await this.databaseVersion) >= 100000;
  }
  async supportsNullsNotDistinct(): Promise<boolean> {
    return (await this.databaseVersion) >= 150000;
  }
  async supportsNativePartitioning(): Promise<boolean> {
    return (await this.databaseVersion) >= 100000;
  }

  indexAlgorithms(): Record<string, string> {
    return { concurrently: "CONCURRENTLY" };
  }

  /** @internal */
  override arelVisitor(): Visitors.ToSql {
    return new Visitors.PostgreSQL(this);
  }

  supportsDdlTransactions(): boolean {
    return true;
  }
  supportsAdvisoryLocks(): boolean {
    return true;
  }

  async getAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    _assertPgAdvisoryLockId(lockId);
    return (await this.queryValue(`SELECT pg_try_advisory_lock(${lockId})`)) === true;
  }

  async releaseAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    _assertPgAdvisoryLockId(lockId);
    return (await this.queryValue(`SELECT pg_advisory_unlock(${lockId})`)) === true;
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
  async supportsPgcryptoUuid(): Promise<boolean> {
    return (await this.databaseVersion) >= 90400;
  }

  private _hasPgHintPlan?: boolean;

  // Mirrors: PostgreSQLAdapter#supports_optimizer_hints?
  // (postgresql_adapter.rb:444-449) — `unless defined?(@has_pg_hint_plan)`, so
  // the `extension_available?` probe runs once, on first read.
  async supportsOptimizerHints(): Promise<boolean> {
    if (this._hasPgHintPlan === undefined) {
      this._hasPgHintPlan = await this.extensionAvailable("pg_hint_plan");
    }
    return this._hasPgHintPlan;
  }

  async supportsCommonTableExpressions(): Promise<boolean> {
    return true;
  }

  supportsLazyTransactions(): boolean {
    return true;
  }

  /**
   * Quote a value for inclusion in a SQL literal. PG-specific branches
   * (XmlData, BitData, Range, ArrayData) fall through to the base dispatch.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting#quote
   */
  override quote(value: unknown): string {
    return pgQuote.call(this, value);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting#quote_string
   * (postgresql/quoting.rb:127-131) — escape-only, so the inherited `quote`
   * dispatches here instead of the abstract backslash-doubling escape.
   */
  override quoteString(s: string): string {
    return pgQuoteString(s);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting#quoted_date.
   * Appends " BC" for proleptic years ≤ 0; `quote` dispatches through here.
   */
  quotedDate(value: Parameters<typeof pgQuotedDate>[0]): string {
    return pgQuotedDate(value);
  }

  override typeCast(value: unknown): unknown {
    return pgTypeCast.call(this, value);
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
    const oid = await this.queryValue(`SELECT ${this.quote(sqlType)}::regtype::oid`, "SCHEMA");
    return this.typeMap.lookup(Number(oid));
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting#quote_default_expression.
   * Routes through the array- and typeMap-aware `pgQuoteDefaultExpression`
   * so DEFAULT clauses on array columns and OID-backed types serialize
   * correctly. Async: a ColumnDefinition (no OID) resolves its cast type via
   * `lookupCastType`'s live regtype query, as Rails does.
   */
  override quoteDefaultExpression(value: unknown, column: unknown): Promise<string> {
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
    const isArray = col?.array === true || col?.options?.array === true;
    const rawSqlType = col?.sqlType ?? col?.type ?? null;
    const self = this;
    const lookup = {
      lookupCastTypeFromColumn(column: {
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
        if (column.oid != null) {
          return self.lookupCastTypeFromColumn(column) as {
            serialize?(v: unknown): unknown;
          } | null;
        }
        // No OID means a ColumnDefinition from a DDL path: Rails resolves its
        // sql_type with the live regtype query (postgresql/quoting.rb:195),
        // which handles typmods and `[]` array suffixes server-side — an
        // array sql_type resolves to the array type's OID directly.
        return self.lookupCastType(column.sqlType ?? "");
      },
    };
    return pgQuoteDefaultExpression.call(
      this,
      value,
      {
        array: isArray,
        sqlType: rawSqlType,
        oid: col?.oid ?? null,
        fmod: col?.fmod ?? null,
        // Rails' uuid branch tests `column.type` (the AR type symbol), not
        // sql_type, so forward it separately from `rawSqlType`.
        type: col?.type ?? null,
      },
      lookup,
    );
  }

  async extensions(): Promise<string[]> {
    // Rails does not filter plpgsql or any built-in extension — the full list
    // (including pg_catalog.plpgsql) is returned, matching PostgreSQLAdapter#extensions.
    const query = `
      SELECT
        pg_extension.extname,
        n.nspname AS schema
      FROM pg_extension
      JOIN pg_namespace n ON pg_extension.extnamespace = n.oid
    `;
    const currentSchema = await this.currentSchema();
    const result = await this.internalExecQuery(query, "SCHEMA", [], {
      allowRetry: true,
      materializeTransactions: false,
    });
    return (result.castValues() as unknown[][]).map((row) => {
      const name = row[0] as string;
      const schema = row[1] === currentSchema ? null : (row[1] as string);
      return [schema, name].filter((part) => part != null).join(".");
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

  /**
   * @missingRailsCall values_at — PERMANENT: Per-entry verified (RFC 0072
   *   converge-pg-extension-cluster-onto-internal-exec-query): Ruby's
   *   `split(".").values_at(-2, -1)` has no JS analogue;
   *   postgresql-adapter.ts#enableExtension expresses the identical
   *   destructuring as `[parts.at(-2) ?? null, parts.at(-1)]`, giving nil-schema
   *   for a bare name.
   */
  async enableExtension(name: string, _options?: Record<string, unknown>): Promise<void> {
    const parts = String(name).split(".");
    const [schema, extName] = [parts.at(-2) ?? null, parts.at(-1)!];
    let sql = `CREATE EXTENSION IF NOT EXISTS "${extName}"`;
    if (schema) sql += ` SCHEMA ${schema}`;
    await this.internalExecQuery(sql);
    await this.reloadTypeMap();
  }

  /**
   * @missingRailsCall values_at — PERMANENT: Per-entry verified (RFC 0072
   *   converge-pg-extension-cluster-onto-internal-exec-query): Ruby's
   *   `split(".").values_at(-2, -1)` discards the schema half;
   *   postgresql-adapter.ts#disableExtension takes `parts.at(-1)` directly,
   *   which is the same value.
   */
  async disableExtension(name: string, options: { force?: "cascade" } = {}): Promise<void> {
    const parts = String(name).split(".");
    const extName = parts.at(-1)!;
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    await this.internalExecQuery(`DROP EXTENSION IF EXISTS "${extName}"${cascade}`);
    // Mirrors Rails' disable_extension, which reloads the type map after the
    // drop; reloadTypeMap also drops the prepared-statement name map so a later
    // query doesn't re-execute a plan that referenced the dropped type's OID.
    await this.reloadTypeMap();
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    this.validateIndexLengthBang(tableName, newName);
    const [schema] = this.extractSchemaQualifiedName(tableName);
    const qualifier = schema ? `${this.quoteTableName(schema)}.` : "";
    await this.execute(
      `ALTER INDEX ${qualifier}${this.quoteColumnName(oldName)} RENAME TO ${this.quoteTableName(newName)}`,
    );
  }

  async foreignTables(): Promise<string[]> {
    const names = await this.queryValues(this.dataSourceSql({ type: "FOREIGN TABLE" }), "SCHEMA");
    return names as string[];
  }

  /**
   * @missingRailsCall any? — PERMANENT: Ruby-ism: `query_values(...).any?` is `names.length
   *   > 0` in TS; `length` is a property access, not a call.
   */
  async foreignTableExists(tableName: string): Promise<boolean> {
    if (!tableName) return false;
    const names = await this.queryValues(
      this.dataSourceSql(tableName, { type: "FOREIGN TABLE" }),
      "SCHEMA",
    );
    return names.length > 0;
  }

  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /**
   * Ruby's `data_source_sql(name = nil, type:)` (schema_statements.rb:1890) is
   * callable with the kwargs alone, and TypeScript cannot skip a leading
   * positional, so the options object may arrive in its place.
   *
   * @internal
   */
  dataSourceSql(options: { type?: string }): string;
  /** @internal */
  dataSourceSql(
    nameOrOptions?: string | null | { type?: string },
    options: { type?: string } = {},
  ): string {
    const kwargsOnly = nameOrOptions != null && typeof nameOrOptions === "object";
    const name = kwargsOnly ? null : nameOrOptions;
    const opts = kwargsOnly ? nameOrOptions : options;
    const scope = this.quotedScope(name, { type: opts.type });
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
    let schema: string | null;
    [schema, name] = this.extractSchemaQualifiedName(name ?? "");
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
      name: name ? this.quote(name) : null,
      type,
    };
  }

  /** @internal */
  referenceNameForTable(tableName: string): string {
    const [, table] = this.extractSchemaQualifiedName(tableName);
    return singularize(table);
  }

  async renameTable(tableName: string, newName: string): Promise<void> {
    this.validateTableLengthBang(newName);
    await this.clearCacheBang();
    await this.schemaCache.clearDataSourceCacheBang(tableName);
    await this.schemaCache.clearDataSourceCacheBang(newName);
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} RENAME TO ${this.quoteTableName(newName)}`,
    );
    // Rails reads max_identifier_length here, which lazily runs the SHOW query
    // on first use; warm the memo so the truncation limit is the real server
    // value rather than the synchronous fallback.
    const maxIdentifierLength = await this.warmMaxIdentifierLength();
    const result = await this.pkAndSequenceFor(newName);
    if (result) {
      const [pk, seq] = result;
      // postgresql/schema_statements.rb:442-443: PostgreSQL automatically creates an index for
      // PRIMARY KEY with name consisting of truncated table name and "_pkey" suffix fitting into
      // max_identifier_length number of characters.
      const maxPkeyPrefix = maxIdentifierLength - "_pkey".length;
      const idx = `${tableName.slice(0, maxPkeyPrefix)}_pkey`;
      const newIdx = `${newName.slice(0, maxPkeyPrefix)}_pkey`;
      await this.execute(
        `ALTER INDEX ${this.quoteTableName(idx)} RENAME TO ${this.quoteTableName(newIdx)}`,
      );

      // postgresql/schema_statements.rb:448-449: PostgreSQL automatically creates a sequence for
      // PRIMARY KEY with name consisting of truncated table name and "#{primary_key}_seq" suffix
      // fitting into max_identifier_length number of characters.
      const maxSeqPrefix = maxIdentifierLength - `_${pk}_seq`.length;
      if (seq && seq.identifier === `${tableName.slice(0, maxSeqPrefix)}_${pk}_seq`) {
        const newSeq = `${newName.slice(0, maxSeqPrefix)}_${pk}_seq`;
        await this.execute(`ALTER TABLE ${seq.quoted()} RENAME TO ${this.quoteTableName(newSeq)}`);
      }
    }
    await this.renameTableIndexes(tableName, newName);
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
    const createIndex = (await this.buildCreateIndexDefinition(tableName, columns, options))!;
    await this.execute(await this.schemaCreation.accept(createIndex));

    const index = createIndex.index;
    if (index.comment) {
      await this.execute(
        `COMMENT ON INDEX ${this.quoteColumnName(index.name)} IS ${this.quote(index.comment)}`,
      );
    }
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#remove_index
   *
   * Rails hands the `PostgreSQL::Name` itself to `quote_table_name`
   * (postgresql/schema_statements.rb:561), which `to_s`es it; trails'
   * `quoteTableName` takes a string, so `indexToRemove` holds the `to_s`ed name.
   */
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
    if (typeof columnOrOptions === "string" || Array.isArray(columnOrOptions)) {
      columnName = columnOrOptions;
    } else {
      columnName = undefined;
      options = columnOrOptions ?? {};
    }

    let table = Utils.extractSchemaQualifiedName(tableName);
    if (options.name != null) {
      const providedIndex = Utils.extractSchemaQualifiedName(options.name);
      options = { ...options, name: providedIndex.identifier };
      const tableSchema = table.schema;
      if (!tableSchema) table = new Name(providedIndex.schema, table.identifier);
      if (providedIndex.schema && tableSchema && tableSchema !== providedIndex.schema) {
        throw new ArgumentError(
          `Index schema '${providedIndex.schema}' does not match table schema '${tableSchema}'`,
        );
      }
    }

    if (options.ifExists && !(await this.indexExists(tableName, columnName, options))) {
      return;
    }

    // Rails resolves the name against `table.to_s` — the SCHEMA-QUALIFIED name,
    // so a generated index name matches the one addIndex produced for the same
    // argument. Passing the bare identifier here silently misses those.
    const indexToRemove = new Name(
      table.schema,
      await this.indexNameForRemove(table.toString(), columnName, options),
    ).toString();

    await this.execute(
      // `?? ""` is Ruby's `#{nil}` — `index_algorithm` returns nil with no
      // `:algorithm`, so the statement carries the empty slot Rails emits.
      `DROP INDEX ${this.indexAlgorithm(options.algorithm) ?? ""} ${this.quoteTableName(indexToRemove)}`,
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
    await super.addForeignKey(fromTable, toTable, options);
  }

  // Mirrors: ReferentialIntegrity#disable_referential_integrity. Extracted to
  // postgresql/referential-integrity.ts (Rails houses this in the
  // ReferentialIntegrity module, not schema_statements.rb).
  override disableReferentialIntegrity(
    fn: () => Promise<void>,
    scopedTables?: string[],
  ): Promise<void> {
    return disableReferentialIntegrity.call(this, fn, scopedTables);
  }

  // Mirrors: ReferentialIntegrity#check_all_foreign_keys_valid!
  checkAllForeignKeysValidBang = checkAllForeignKeysValidBang;

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
    return `'${pgQuoteString(String(value))}'`;
  }

  /**
   * Map PostgreSQL driver errors to ActiveRecord exception classes by
   * SQLSTATE code, matching Rails'
   * `ConnectionAdapters::PostgreSQL::DatabaseStatements#translate_exception`.
   */
  private _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    if (e instanceof ActiveRecordError) return e;
    const build = (): Error => {
      if (!(e instanceof Error))
        return new StatementInvalid(String(e), { sql, binds, connectionPool: this.pool });
      const code = (e as { code?: string }).code;
      const msg = e.message;
      switch (code) {
        case "23505":
          return new RecordNotUnique(msg, { sql, binds, connectionPool: this.pool });
        case "23503":
          return new InvalidForeignKey(msg, { sql, binds, connectionPool: this.pool });
        case "23502":
          return new NotNullViolation(msg, { sql, binds, connectionPool: this.pool });
        case "22001":
          return new ValueTooLong(msg, { sql, binds, connectionPool: this.pool });
        case "22003":
          return new ActiveRecordRangeError(msg, { sql, binds, connectionPool: this.pool });
        case "40001":
          return new SerializationFailure(msg, { sql, binds, connectionPool: this.pool });
        case "40P01":
          return new Deadlocked(msg, { sql, binds, connectionPool: this.pool });
        case "42P04":
          return new DatabaseAlreadyExists(msg, { sql, binds, connectionPool: this.pool });
        case "55P03":
          return new LockWaitTimeout(msg, { sql, binds, connectionPool: this.pool });
        case "57014":
          return new QueryCanceled(msg, { sql, binds, connectionPool: this.pool });
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
            return new ConnectionNotEstablished(e, { connectionPool: this.pool });
          }
          if (PostgreSQLAdapter._isConnectionError(e)) {
            return new ConnectionFailed(e, { connectionPool: this.pool });
          }
          if (e instanceof pg.DatabaseError && e instanceof StatementInvalid === false) {
            return new StatementInvalid(msg, { sql, binds, connectionPool: this.pool });
          }
          return e;
      }
    };
    const translated = build();
    // `translate_exception`'s result is raised from inside the `rescue`, so Ruby
    // sets `Exception#cause` from `$!` and never names the driver error in the
    // argument list (postgresql_adapter.rb:1015-1055). JS chains nothing at a
    // `throw`; this is the raise-site stand-in for the direct
    // `throw this._translateException(...)` sites, as `translateExceptionClass`
    // is for everything routed through the public translator.
    if (translated !== e && (translated as { cause?: unknown }).cause === undefined) {
      (translated as { cause?: unknown }).cause = e;
    }
    return translated;
  }

  indexName(
    tableName: string,
    options:
      | { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean }
      | string
      | string[],
  ): string {
    // Rails PostgreSQL#index_name strips the schema qualifier and derives the
    // name from the bare table (postgresql/schema_statements.rb), so a
    // `my_schema.values` table indexes as `index_values_on_value` — created in
    // `my_schema` via the schema-qualified table, keeping add/remove symmetric.
    const [, table] = this.extractSchemaQualifiedName(tableName);
    if (typeof options !== "string" && !Array.isArray(options)) {
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
    return this.indexName(table, this.indexNameOptions(options));
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
    options: Parameters<AbstractAdapter["addIndexOptions"]>[2] = {},
  ): Promise<[AbstractIndexDefinition, string | undefined, boolean]> {
    const opts = { ...options };
    if (typeof opts.where === "string") {
      if ((await this.tableExists(tableName)) && (await this.columnExists(tableName, opts.where))) {
        opts.where = this.quoteColumnName(opts.where);
      }
    }
    return super.addIndexOptions(tableName, columnName, opts);
  }

  get schemaCreation(): PgSchemaCreation {
    return new PgSchemaCreation(this);
  }

  /**
   * Mirrors: PostgreSQL::SchemaStatements#create_schema_dumper
   * (postgresql/schema_statements.rb:884-886) — `PostgreSQL::SchemaDumper.create(self, options)`.
   */
  createSchemaDumper(options: Record<string, unknown> = {}): PgSchemaDumper {
    return PgSchemaDumper.create(this, options);
  }

  /** @internal */
  createTableDefinition(name: string, options: Record<string, unknown> = {}): PgTableDefinition {
    return new PgTableDefinition(this, name, options);
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
    return new PgTypeMetadata(
      {
        sqlType,
        type: castType.type(),
        limit: castType.limit ?? null,
        precision: castType.precision ?? null,
        scale: castType.scale ?? null,
      },
      { oid, fmod },
    );
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

    return new Column(columnName, defaultValue, typeMetadata, !notnull, {
      defaultFunction: defaultFunction ?? undefined,
      collation: collation ?? undefined,
      comment: comment || null,
      serial,
      identity: identity || null,
      generated: gen || null,
    });
  }

  /** @internal */
  async addColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<string | [string, () => Promise<void>]> {
    // postgresql/schema_statements.rb:1046-1049 — `return super unless
    // options.key?(:comment)`, else `[super, Proc.new { change_column_comment }]`.
    if (!("comment" in options)) {
      return super.addColumnForAlter(tableName, columnName, type, options);
    }
    return [
      (await super.addColumnForAlter(tableName, columnName, type, options)) as string,
      () => this.changeColumnComment(tableName, columnName, options.comment ?? null),
    ];
  }

  /**
   * @internal postgresql/schema_statements.rb:1051-1056.
   */
  async changeColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): Promise<Array<string | (() => Promise<void>)>> {
    const changeColDef = this.buildChangeColumnDefinition(tableName, columnName, type, options);
    const sqls: Array<string | (() => Promise<void>)> = [
      await this.schemaCreation.accept(changeColDef),
    ];
    if ("comment" in options)
      sqls.push(() => this.changeColumnComment(tableName, columnName, options.comment ?? null));
    return sqls;
  }

  /**
   * @internal
   */
  changeColumnNullForAlter(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): unknown {
    if (default_ == null)
      return `ALTER COLUMN ${this.quoteColumnName(columnName)} ${null_ ? "DROP" : "SET"} NOT NULL`;
    return () => this.changeColumnNull(tableName, columnName, null_, default_);
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
  async addOptionsForIndexColumns(
    quotedColumns: Map<string, string>,
    options: {
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
      length?: number | Record<string, number>;
    } = {},
  ): Promise<Map<string, string>> {
    quotedColumns = this.addIndexOpclass(quotedColumns, options);
    return super.addOptionsForIndexColumns(quotedColumns, options);
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
    const num = /^\(?(-?\d+(?:\.\d*)?)\)?(?:::bigint)?$/.exec(defaultExpr);
    if (num) return num[1];
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
   *
   * @missingRailsArgs has_default_function? — PERMANENT: Rails passes the local
   *   `default` (postgresql_adapter.rb:781-782); `default` is a reserved word in
   *   JavaScript and cannot be a binding identifier, so the parameter is spelled
   *   `defaultExpr`. Same value, same position.
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
    return this.transactionStatus !== PQTRANS_INERROR && super.isRetryableQueryError(exception);
  }

  /**
   * True when the PG error is a cached-plan invalidation (SQLSTATE 0A000
   * from RevalidateCachedQuery). Mirrors: PostgreSQLAdapter#is_cached_plan_failure?
   * @internal
   */
  isCachedPlanFailure(pgerror: unknown): boolean {
    if (!(pgerror instanceof Error)) return false;
    const err = pgerror as { code?: string; message?: string };
    if (err.code !== FEATURE_NOT_SUPPORTED) return false;
    // Rails' second half is `result_error_field(PG_DIAG_SOURCE_FUNCTION) ==
    // "RevalidateCachedQuery"` (postgresql_adapter.rb:902-903). node-pg exposes
    // no source-function field, so the server message it emits from that
    // function — "cached plan must not change result type" — stands in for it.
    // Without it every FEATURE_NOT_SUPPORTED (e.g. RETURNING on a view) would
    // be retried as a plan invalidation.
    return typeof err.message === "string" && err.message.includes("cached plan");
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
   *
   * Awaiting `set` puts any eviction's DEALLOCATE before the caller's
   * Bind+Execute, so it lands on an idle client (statement_pool.rb:31).
   *
   * `conn` is unused: Rails calls `conn.prepare nextkey, sql` on it (see below),
   * while node-pg Parses under the name on first Execute. It stays in the
   * signature because Rails' `prepare_statement(sql, binds, conn)` has it.
   * @internal
   *
   * @missingRailsCall translate_exception_class — PERMANENT: Rails rescues around
   *   `conn.prepare`; node-pg has no parse-only call (it Parses under the name
   *   on first Execute), so there is no prepare site here and the Parse error is
   *   translated by `_performQuery` instead.
   */
  async prepareStatement(sql: string, _binds: unknown[], _conn: pg.Client): Promise<string> {
    const pool = this._statements;
    const key = this.sqlKey(sql);
    const existing = pool.get(key);
    if (existing) return existing.name;
    const name = pool.nextKey();
    // Rails issues `conn.prepare nextkey, sql` here; node-pg has no parse-only
    // call — its `{ name, text }` form Parses under the name and Executes in
    // one roundtrip — so the name is allocated here and `perform_query`'s
    // exec_prepared arm carries the text that Parses it on first use. The
    // server-side statement is identical either way; only the roundtrip that
    // creates it differs.
    await pool.set(key, { name });
    return name;
  }

  /**
   * Sync the session timezone variable after `default_timezone` changes.
   * Mirrors: PostgreSQLAdapter#reconfigure_connection_timezone
   * @internal
   *
   * @missingRailsCall raw_execute — CONVERGEABLE (RFC 0073-permanent-connection-checkout-disallowed): Runs as the first step of `_performQuery`,
   *   itself the block already executing inside withRawConnection, so the SET
   *   goes to the acquired client directly rather than re-entering rawExecute's
   *   leaf loop. Root cause (RFC 0106 re-confirmation): Rails'
   *   `with_raw_connection` wraps its body in `@lock.synchronize`
   *   (abstract_adapter.rb:983-984) and `@lock` is a `Monitor`
   *   (abstract_adapter.rb:180-189, `LoadInterlockAwareMonitor < Monitor`),
   *   which is RE-ENTRANT for the owning thread — so Rails nests this call
   *   inside the acquire that is already holding the connection. A JS
   *   promise-based mutex has no thread/fiber identity to key re-entrancy on, so
   *   the nested call deadlocks instead of re-entering. Language shortcoming,
   *   tracked by RFC 0073.
   */
  async reconfigureConnectionTimezone(): Promise<void> {
    // Rails returns early when `variables["timezone"]` was set by the user
    // (postgresql_adapter.rb:1005): configure_connection already applied it and
    // it must never be overridden by the default_timezone SET below.
    const variables = fetch<SessionVariables>(this._config, "variables", {});
    if (variables["timezone"]) return;
    const tz = ActiveRecord.defaultTimezone;
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
   * Mirrors: PostgreSQLAdapter#build_statement_pool (postgresql_adapter.rb:1055)
   * @internal
   */
  buildStatementPool(): StatementPool {
    return new StatementPool(
      this,
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
  addPgEncoders(): void {}

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
  addPgDecoders(): void {}

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

// `include()` installs the module's methods on the prototype at runtime, where the
// class type can't see them, so the `include PostgreSQL::SchemaStatements` surface
// is declared here — the same shape AbstractAdapter uses for `SchemaStatements`.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PostgreSQLAdapter {
  /** Rails' PG `database_version` (`postgresql_adapter.rb`) is the server
   * version *integer*; the inherited getter's `Version | number` is narrowed
   * here by declaration merging rather than by an override Rails does not have. */
  get databaseVersion(): number | Promise<number>;

  /** @internal */
  validateIndexLengthBang(tableName: string, newName: string, internal?: boolean): void;

  enumTypes(): Promise<[string, string[]][]>;

  schemaNames(): Promise<string[]>;

  createSchema(name: string, options?: { force?: boolean; ifNotExists?: boolean }): Promise<void>;

  dropSchema(name: string, options?: { ifExists?: boolean }): Promise<void>;

  schemaExists(name: string): Promise<boolean>;

  currentSchema(): Promise<string>;

  columnsForDistinct(columns: string | string[], orders?: (string | Nodes.Node)[]): string;

  indexes(tableName: string): Promise<IndexDefinition[]>;

  indexNameExists(tableName: string, indexName: string): Promise<boolean>;

  primaryKey(tableName: string): Promise<string | string[] | null>;

  pkAndSequenceFor(tableName: string): Promise<[string, Name | null] | null>;

  columns(tableName: string): Promise<Column[]>;

  changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions & { using?: string; castAs?: string },
  ): Promise<void>;

  createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: AbstractTableDefinition) => void),
    fn?: (t: AbstractTableDefinition) => void,
  ): Promise<void>;

  addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions & {
      comment?: string | null;
      ifNotExists?: boolean;
    },
  ): Promise<void>;

  renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void>;

  changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;

  buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions & { using?: string; castAs?: string },
  ): ChangeColumnDefinition;

  buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined>;

  changeColumnNull(
    tableName: string,
    columnName: string,
    nullable: boolean,
    defaultValue?: unknown,
  ): Promise<void>;

  changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void>;

  changeTableComment(tableName: string, commentOrChanges: CommentOrChanges): Promise<void>;

  /** @internal */
  validateConstraint(tableName: string, constraintName: string): Promise<void>;

  validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string; expression?: string },
  ): Promise<void>;

  validateForeignKey(
    fromTable: string,
    toTable?: string,
    options?: ForeignKeyLookupOptions,
  ): Promise<void>;

  typeToSql(
    type: string,
    options?: {
      limit?: number;
      precision?: number;
      scale?: number;
      array?: boolean;
      enumType?: string;
    },
  ): string;

  foreignKeyColumnFor(tableName: string, columnName?: string): string;

  /** @internal */
  sequenceNameFromParts(tableName: string, columnName: string, suffix: string): string;

  /** @internal */
  assertValidDeferrable(deferrable: unknown): void;

  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | "restrict" | undefined;

  /** @internal */
  extractConstraintDeferrable(
    deferrable: boolean,
    deferred: boolean,
  ): "deferred" | "immediate" | false;

  foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]>;

  quotedIncludeColumnsForIndex(columnNames: string | string[]): Promise<string>;

  /** @internal */
  columnNamesFromColumnNumbers(tableOid: number, columnNumbers: number[]): Promise<string[]>;

  tables(): Promise<string[]>;

  views(): Promise<string[]>;

  tableExists(name: string): Promise<boolean>;

  foreignKeyExists(
    fromTable: string,
    toTable?: string | ForeignKeyLookupOptions,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<boolean>;

  createDatabase(name: string, options?: CreateDatabaseOptions): Promise<void>;

  createEnum(name: string, values: string[], options?: Record<string, unknown>): Promise<void>;

  dropEnum(
    name: string,
    valuesOrOptions?: string[] | { ifExists?: boolean },
    options?: { ifExists?: boolean },
  ): Promise<void>;

  /**
   * @noRailsEquivalent PERMANENT. Rails supports PostgreSQL range *column* types first-class but
   *   ships no range-type DDL helper, because Ruby has `Range` as a core type: a Rails app that
   *   wants a custom range creates it with a raw `execute("CREATE TYPE … AS RANGE")` and leans on
   *   the language for the value side. JavaScript has no Range analogue, so trails cannot lean on
   *   the language the same way — making range support first-class here requires the DDL step to
   *   be explicit adapter surface rather than an incidental raw `execute`. That is a deliberate
   *   trails feature, not unfinished porting, so it is permanent rather than convergeable.
   *   `createRange`/`dropRange` are modelled on the shape of Rails' own enum type-DDL helpers
   *   (`create_enum` postgresql_adapter.rb:541, `drop_enum` :571, `rename_enum` :579,
   *   `add_enum_value` :588, `rename_enum_value` :606, all five stubbed as no-ops on the base at
   *   abstract_adapter.rb:576-593), including their `reload_type_map` epilogue; the
   *   implementation lives at the emitting call site,
   *   connection-adapters/postgresql/schema-statements-class.ts. Deliberately PostgreSQL-only: the
   *   no-op stubs that shadowed these on AbstractAdapter were deleted rather than allowlisted,
   *   since Rails stubs only the enum helpers on the base.
   */
  createRange(name: string, options: { subtype: string; subtypeDiff?: string }): Promise<void>;

  /**
   * @noRailsEquivalent PERMANENT. The teardown half of `createRange` — see that method for the full
   *   reasoning: trails makes PostgreSQL range types first-class, and unlike Ruby (whose core
   *   `Range` lets a Rails app get away with a raw `execute("CREATE TYPE … AS RANGE")`) JavaScript
   *   has no Range analogue to lean on, so the DDL step is deliberate trails surface. Modelled on
   *   Rails' enum type-DDL helpers (`create_enum` postgresql_adapter.rb:541, `drop_enum` :571,
   *   `rename_enum` :579, `add_enum_value` :588, `rename_enum_value` :606, all five stubbed as
   *   no-ops on the base at abstract_adapter.rb:576-593), including their `reload_type_map`
   *   epilogue. Deliberately PostgreSQL-only: the no-op stubs that shadowed these on
   *   AbstractAdapter were deleted rather than allowlisted, since Rails stubs only the enum
   *   helpers on the base.
   */
  dropRange(name: string, options?: { ifExists?: boolean }): Promise<void>;

  renameEnum(name: string, newNameOrOptions: string | { to: string }): Promise<void>;

  addEnumValue(
    name: string,
    value: string,
    options?: { before?: string; after?: string; ifNotExists?: boolean },
  ): Promise<void>;

  renameEnumValue(name: string, options: { from: string; to: string }): Promise<void>;

  dropDatabase(name: string): Promise<void>;

  recreateDatabase(name: string, options?: CreateDatabaseOptions): Promise<void>;

  dropTable(...args: Parameters<AbstractSchemaStatements["dropTable"]>): Promise<void>;

  currentDatabase(): Promise<string>;

  encoding(): Promise<string>;

  collation(): Promise<string>;

  ctype(): Promise<string>;

  schemaSearchPath(): Promise<string>;

  setSchemaSearchPath(searchPath: string | null): Promise<void>;

  clientMinMessages(): Promise<string>;

  setClientMinMessages(level: string): Promise<void>;

  tableComment(tableName: string): Promise<string | null>;

  tablePartitionDefinition(tableName: string): Promise<string | null>;

  inheritedTableNames(tableName: string): Promise<string[]>;

  tableOptions(tableName: string): Promise<Record<string, unknown>>;

  serialSequence(tableName: string, column: string): Promise<string | null>;

  defaultSequenceName(tableName: string, pk?: string | string[]): Promise<string | null>;

  setPkSequenceBang(tableName: string, value: number): Promise<void>;

  resetPkSequenceBang(
    tableName: string,
    pk?: string | null,
    sequence?: string | null,
  ): Promise<void>;

  primaryKeys(tableName: string): Promise<string[]>;

  checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]>;

  exclusionConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown>;

  addExclusionConstraint(
    tableName: string,
    expression: string,
    options?: ExclusionConstraintOptions,
  ): Promise<void>;

  removeExclusionConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): Promise<void>;

  uniqueConstraintOptions(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: Record<string, unknown>,
  ): Record<string, unknown>;

  addUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | null,
    options?: UniqueConstraintOptions,
  ): Promise<void>;

  removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): Promise<void>;

  updateTableDefinition(tableName: string, base?: unknown): PgTable;

  exclusionConstraints(tableName: string): Promise<ExclusionConstraintDefinition[]>;

  uniqueConstraints(tableName: string): Promise<UniqueConstraintDefinition[]>;

  /** @internal */
  exclusionConstraintName(tableName: string, options?: Record<string, unknown>): string;

  /** @internal */
  exclusionConstraintFor(
    tableName: string,
    options?: Record<string, unknown>,
  ): Promise<ExclusionConstraintDefinition | undefined>;

  /** @internal */
  exclusionConstraintForBang(
    tableName: string,
    expression?: string | null,
    options?: Record<string, unknown>,
  ): Promise<ExclusionConstraintDefinition>;

  /** @internal */
  uniqueConstraintName(tableName: string, options?: Record<string, unknown>): string;

  /** @internal */
  uniqueConstraintFor(
    tableName: string,
    options?: Record<string, unknown>,
  ): Promise<UniqueConstraintDefinition | undefined>;

  /** @internal */
  uniqueConstraintForBang(
    tableName: string,
    column?: string | string[] | null,
    options?: Record<string, unknown>,
  ): Promise<UniqueConstraintDefinition>;

  /**
   * Fetch raw column metadata rows from pg_attribute for a table.
   * Mirrors: PostgreSQLAdapter#column_definitions
   * @internal
   */
  columnDefinitions(tableName: string): Promise<
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
  >;
}

export type IndexDefinition = AbstractIndexDefinition;

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
 * PG-flavored StatementPool. Backs the per-connection statement cache;
 * `dealloc` sends `DEALLOCATE` for the evicted name. PG prepared
 * statements are session-scoped, and after the dual-pool collapse the
 * adapter owns exactly one persistent `pg.Client`, so a single
 * StatementPool lives for the connection's lifetime.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::StatementPool
 */
export class StatementPool extends GenericStatementPool<PreparedStatement> {
  private _connection: PostgreSQLAdapter;
  // Per-pool counter. Rails' PG StatementPool uses `@counter` on the
  // pool instance so names are scoped to the session — matches the
  // session-scoped nature of PG prepared statements and lets the
  // adapter own zero state about naming.
  private _counter = 0;
  private _deallocating: Promise<void> = Promise.resolve();

  /** Mirrors: PostgreSQL::StatementPool#initialize (postgresql_adapter.rb:296) */
  constructor(connection: PostgreSQLAdapter, maxSize = 1000) {
    super(maxSize);
    this._connection = connection;
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
   *
   * Rails' `dealloc` blocks, so a `clear` deallocating N entries sends them one
   * at a time. node-pg does not, so each DEALLOCATE chains onto the one before
   * it (`_deallocating`), and that chain is what `[]=` / `clear` hand back.
   */
  protected override dealloc(stmt: PreparedStatement): void | Promise<void> {
    // Rails re-reads `@connection.@raw_connection` here and only sends the
    // DEALLOCATE `if conn.status == PG::CONNECTION_OK` (postgresql_adapter.rb:
    // 308-314) — a reconnect invalidates the whole pool, so a stale handle is
    // simply skipped. `_ending`/`_ended` is node-pg's analogue of a handle that
    // is no longer CONNECTION_OK (see `_rawConnectionFinished`).
    const client = this._connection._rawConnection as (pg.Client & PgClientLiveness) | null;
    if (!client || client._ending === true || client._ended === true) return;
    // Best-effort async cleanup. The server drops prepared statements on
    // session close, so a swallowed failure here is safe — Rails' PG::
    // StatementPool#dealloc likewise rescues PG::InvalidSqlStatementName /
    // connection errors. `pgQuoteColumnName` escapes any embedded `"` instead
    // of raising, so a leaked caller-supplied name can't produce a synchronous
    // throw at the call site.
    const deallocSql = `DEALLOCATE ${pgQuoteColumnName(stmt.name)}`;
    this._deallocating = this._deallocating
      .then(() => {
        if (this._connection._rawConnection === client) this._connection._commandSettled = false;
        return client.query(deallocSql);
      })
      .then(
        () => {},
        () => {},
      );
    return this._deallocating;
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

/**
 * Mirrors the `lock_id.is_a?(Integer) && lock_id.bit_length <= 63` guard shared
 * by PostgreSQLAdapter#get_advisory_lock / #release_advisory_lock
 * (postgresql_adapter.rb:459-471). Ruby's Integer spans both integral JS
 * numeric types, so `number` and `bigint` pass; `bit_length <= 63` is the
 * signed 64-bit range, negatives included (`(-2**63).bit_length == 63`).
 */
function _assertPgAdvisoryLockId(lockId: number | bigint | string): void {
  const isInteger = typeof lockId === "bigint" || Number.isInteger(lockId);
  if (!isInteger || BigInt(lockId) < -(2n ** 63n) || BigInt(lockId) >= 2n ** 63n) {
    throw new ArgumentError("PostgreSQL requires advisory lock ids to be a signed 64 bit integer");
  }
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

(PostgreSQLAdapter.prototype as any).castResult = castResult;
(PostgreSQLAdapter.prototype as any).handleWarnings = handleWarnings;
// Rails' `warning_ignored?` adds the level threshold on top of the base
// adapter's db_warnings_ignore matchers via `super`
// (postgresql/database_statements.rb:225-227); `_abstractIsWarningIgnored` is
// that `super`.
(PostgreSQLAdapter.prototype as any)._abstractIsWarningIgnored =
  AbstractAdapter.prototype.isWarningIgnored;
(PostgreSQLAdapter.prototype as any).isWarningIgnored = pgIsWarningIgnored;
// Mirrors: PostgreSQL::DatabaseStatements#build_truncate_statements (database_statements.rb)
// Combines all table names into a single TRUNCATE TABLE a, b, c statement, so
// the abstract `truncateTables` emits Rails' combined form instead of N per-table ones.
(PostgreSQLAdapter.prototype as any).buildTruncateStatements = pgBuildTruncateStatements;

// `dirties_query_cache` for the write methods this adapter OVERRIDES (Rails
// query_cache.rb:13). Overridden methods must be wrapped on the concrete class,
// not on AbstractAdapter, or the override would run unwrapped. The write methods
// this adapter does NOT override (`execUpdate`/`execDelete`/`execInsertAll`/
// `truncateTables`/`restartDbTransaction`) are wired once on AbstractAdapter.
// `execInsert` is wired on AbstractAdapter too, even though this adapter
// overrides it: the override's `use_insert_returning?` arm delegates to `super`
// (postgresql/database_statements.rb:46-47), so wiring it here as well would
// clear the cache twice for one logical insert.
// Each logical write clears the cache exactly once; the still-lower
// `executeMutation` these funnel through is deliberately NOT wrapped (DDL runs
// through the wired `execute`, as in Rails), and reads route through
// `internalExecQuery` (never tripping the wrapper).
dirtiesQueryCache(PostgreSQLAdapter, "rollbackDbTransaction", "rollbackToSavepoint");
dirtiesQueryCache(PostgreSQLAdapter, "execute");

// Rails: `include PostgreSQL::SchemaStatements` (postgresql_adapter.rb:185).
include(PostgreSQLAdapter, SchemaStatements);

// Mirrors `include PostgreSQL::DatabaseStatements` — `perform_query` is an
// instance method of the adapter, so `raw_execute`'s `this.performQuery(...)`
// dispatch resolves here (postgresql/database_statements.rb:135), which is what
// makes `raw_exec_query` — and so `FutureResult#exec_query` — work on PG.
// `rowMode` is supplied because node-pg decodes a row into one shape or the
// other before the query runs, while `cast_result` reads the positional view
// off the `PG::Result` Rails already has (`result.values`,
// postgresql/database_statements.rb:180). The extracted `performQuery` carries
// the full note; its other callers pass the shape they read.
PostgreSQLAdapter.prototype.performQuery = function (
  this: PostgreSQLAdapter,
  rawConnection,
  sql,
  binds,
  typeCastedBinds,
  options,
) {
  return pgPerformQuery.call(this as never, rawConnection, sql, binds, typeCastedBinds, {
    prepare: options.prepare ?? false,
    notificationPayload: options.notificationPayload ?? {},
    rowMode: "array",
  });
};

// Mirrors `ActiveSupport.run_load_hooks(:active_record_postgresqladapter, self)`
// at the bottom of Rails' postgresql_adapter.rb — lets railtie initializers
// gate behavior on the postgresql adapter being loaded.
runLoadHooks("active_record_postgresqladapter", PostgreSQLAdapter);
