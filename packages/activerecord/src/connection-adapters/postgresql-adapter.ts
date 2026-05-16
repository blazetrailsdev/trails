import pg from "pg";
import { type Type, ValueType, ArgumentError } from "@blazetrails/activemodel";
import {
  singularize,
  underscore,
  Notifications,
  getCrypto,
  getErrorReporter,
} from "@blazetrails/activesupport";
import { sql as arelSql, Nodes, Visitors } from "@blazetrails/arel";
import { Result } from "../result.js";
import { HashLookupTypeMap } from "../type/hash-lookup-type-map.js";
import { getDefaultTimezone } from "../type/internal/timezone.js";
import { splitQuotedIdentifier, unquoteIdentifier, Utils } from "./postgresql/utils.js";
import { CHECK_ALL_FOREIGN_KEYS_SQL } from "./postgresql/referential-integrity.js";
import { Column } from "./postgresql/column.js";
import { ExplainPrettyPrinter } from "./postgresql/explain-pretty-printer.js";
import {
  quote as pgQuote,
  typeCast as pgTypeCast,
  quoteTableName as pgQuoteTableName,
  quoteColumnName as pgQuoteColumnName,
  quoteString as pgQuoteString,
  quoteTableNameForAssignment as pgQuoteTableNameForAssignment,
  quoteDefaultExpression as pgQuoteDefaultExpression,
  quotedBinary as pgQuotedBinary,
  columnNameMatcher as pgColumnNameMatcher,
  columnNameWithOrderMatcher as pgColumnNameWithOrderMatcher,
} from "./postgresql/quoting.js";
import { TypeMapInitializer, type PgTypeRow } from "./postgresql/oid/type-map-initializer.js";
import {
  initializeInstanceTypeMap,
  initializeTypeMap as staticInitializeTypeMap,
} from "./postgresql/type-map-init.js";
import { inspectExplainOption } from "../adapter.js";
import type {
  AdapterName,
  DatabaseAdapter,
  ExplainOption,
  PostgreSQLAdapterOptions,
} from "../adapter.js";
import {
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
import { AbstractAdapter } from "./abstract-adapter.js";
import { PostgreSQLSchemaStatements } from "./postgresql/schema-statements-class.js";
import type { SchemaStatements, JoinTableOptions } from "./abstract/schema-statements.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";
import {
  transactionIsolationLevels,
  typeCastedBinds,
  temporalToBindString,
  extractTableRefFromInsertSql,
} from "./abstract/database-statements.js";
import { makeGetTypeParser } from "./postgresql/temporal-type-parsers.js";

const getTemporalTypeParser = makeGetTypeParser(pg.types);
const TEMPORAL_OIDS = new Set([1082, 1083, 1114, 1184, 1266]);
const OID_INTERVAL = 1186;
import {
  READ_QUERY,
  executeBatch as pgExecuteBatch,
  suppressCompositePrimaryKey,
  castResult,
} from "./postgresql/database-statements.js";
import type { CreateDatabaseOptions, PgIndexDefinition } from "./postgresql/schema-statements.js";
import {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
  TableDefinition as PgTableDefinition,
  AlterTable as PgAlterTable,
  Table as PgTable,
  type ExclusionConstraintOptions,
  type UniqueConstraintOptions,
  type SchemaStatementsConstraintLike,
} from "./postgresql/schema-definitions.js";
import { TypeMetadata as PgTypeMetadata } from "./postgresql/type-metadata.js";
import {
  CheckConstraintDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  ColumnDefinition,
  ForeignKeyDefinition,
  TableDefinition as AbstractTableDefinition,
  type ColumnOptions,
  type ColumnType,
  type ReferentialAction,
} from "./abstract/schema-definitions.js";
import { joinTableName as deriveJoinTableName } from "../migration/join-table.js";
import {
  SchemaCreation as PgSchemaCreation,
  _pgGeneratedClause,
} from "./postgresql/schema-creation.js";
import { SchemaDumper as PgSchemaDumper } from "./postgresql/schema-dumper.js";
import type { SchemaSource } from "../schema-dumper.js";
import { pgDatetimeConfig } from "./postgresql/pg-datetime-config.js";

const OID_JSON = 114;
const OID_JSONB = 3802;

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

  /** Mirrors: ActiveRecord.db_warnings_action */
  static dbWarningsAction: "ignore" | "log" | "raise" | "report" | ((w: SQLWarning) => void) =
    "ignore";

  /** Mirrors: AbstractAdapter.db_warnings_ignore */
  static dbWarningsIgnore: (string | RegExp)[] = [];

  static columnNameMatcher(): RegExp {
    return pgColumnNameMatcher();
  }

  static columnNameWithOrderMatcher(): RegExp {
    return pgColumnNameWithOrderMatcher();
  }

  override get active(): boolean {
    return this._driverPool != null;
  }

  // Mirrors Rails' PostgreSQLAdapter#connected? — checks that the raw
  // connection (pool in our case) exists and hasn't been finished.
  override isConnected(): boolean {
    return this._driverPool != null;
  }

  // Mirrors: PostgreSQLAdapter::NATIVE_DATABASE_TYPES (postgresql_adapter.rb:134)
  static readonly NATIVE_DATABASE_TYPES: Record<
    string,
    string | { name?: string; limit?: number }
  > = {
    primaryKey: "bigserial primary key",
    string: { name: "character varying" },
    text: { name: "text" },
    integer: { name: "integer", limit: 4 },
    bigint: { name: "bigint" },
    float: { name: "float" },
    decimal: { name: "decimal" },
    timestamp: { name: "timestamp" },
    timestamptz: { name: "timestamptz" },
    time: { name: "time" },
    date: { name: "date" },
    daterange: { name: "daterange" },
    numrange: { name: "numrange" },
    tsrange: { name: "tsrange" },
    tstzrange: { name: "tstzrange" },
    int4range: { name: "int4range" },
    int8range: { name: "int8range" },
    binary: { name: "bytea" },
    boolean: { name: "boolean" },
    xml: { name: "xml" },
    tsvector: { name: "tsvector" },
    hstore: { name: "hstore" },
    inet: { name: "inet" },
    cidr: { name: "cidr" },
    macaddr: { name: "macaddr" },
    uuid: { name: "uuid" },
    json: { name: "json" },
    jsonb: { name: "jsonb" },
    ltree: { name: "ltree" },
    citext: { name: "citext" },
    point: { name: "point" },
    line: { name: "line" },
    lseg: { name: "lseg" },
    box: { name: "box" },
    path: { name: "path" },
    polygon: { name: "polygon" },
    circle: { name: "circle" },
    bit: { name: "bit" },
    bitVarying: { name: "bit varying" },
    money: { name: "money" },
    interval: { name: "interval" },
    oid: { name: "oid" },
    enum: {},
  };

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
  private _driverPool: pg.Pool | null;
  private _pgPoolOptions: pg.PoolConfig | null = null;
  private _client: pg.PoolClient | null = null;
  private _inTransaction = false;
  private _databaseVersion: number | null = null;
  private _typeMap: HashLookupTypeMap | null = null;
  private _maxIdentifierLength: number | null = null;
  private _useInsertReturning = true;
  private _minMessages = "warning";
  private _warnedOids = new Set<number>();
  private _caseInsensitiveCache: Map<string, boolean> = new Map([["citext", false]]);
  private _sessionVariables: Record<string, string | number | boolean | null | "default"> = {};
  private _configuredClients = new WeakSet<pg.PoolClient>();
  // Per-pg.Client statement pool. PG's prepared statements are
  // session-scoped, so each physical client gets its own pool with
  // its own counter (matching Rails' `PostgreSQL::StatementPool`).
  // The WeakMap lets pg.Pool reap clients without us leaking entries.
  private _statementPools = new WeakMap<pg.PoolClient, StatementPool>();
  // The most recently released txn client. Held via WeakRef so that
  // pg.Pool reaping an idle client can still GC it — strong-holding
  // would defeat the WeakMap design above. Used by `clearCacheBang`
  // to reach the released client's StatementPool when the
  // TransactionManager's `after_failure_actions` hook fires AFTER
  // `rollback()` has nulled `_client`. Lifecycle: set on every
  // `rollback()` (overwriting the previous WeakRef); cleared inside
  // `clearCacheBang` after `reset()` runs. NOT cleared on
  // `beginTransaction` — after-rollback callbacks can open a new
  // transaction before `after_failure_actions` reaches the hook, and
  // nulling the ref there would lose the pointer to the failed client.
  private _lastReleasedTxnClientRef: WeakRef<pg.PoolClient> | null = null;

  private get _lastReleasedTxnClient(): pg.PoolClient | null {
    return this._lastReleasedTxnClientRef?.deref() ?? null;
  }
  private set _lastReleasedTxnClient(client: pg.PoolClient | null) {
    this._lastReleasedTxnClientRef = client == null ? null : new WeakRef(client);
  }
  // Clients tagged for `DEALLOCATE ALL` on the next fresh checkout.
  // Set by the released-client `reset()` branch of `clearCacheBang` —
  // that path drops the local sql→name map but can't fire DEALLOCATE
  // on a released session, so server-side PREPAREs leak. When pg.Pool
  // hands the same physical client back later, `_acquireFreshClient`
  // checks this set and runs `DEALLOCATE ALL` before user code, so
  // any fresh checkout path (e.g. `getClient`, `getAdvisoryLock`,
  // `beginTransaction`) drains those orphans. WeakSet so pg.Pool
  // reaping the client GCs the entry.
  private _clientsNeedingDeallocateAll = new WeakSet<pg.PoolClient>();
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
    // Resize the active transaction client's pool immediately so a
    // mid-session change is visible. Other per-client pools keep the
    // size they were built with (Rails reads `statement_limit` once
    // at pool construction). We can't iterate a WeakMap to retrofit
    // them, and dropping entries would orphan their counter /
    // sql→name mapping while server-side PREPAREd statements still
    // exist on the reusable pg.PoolClient, risking name collisions.
    if (this._client) {
      this._statementPools.get(this._client)?.setMaxSize(value);
    }
  }

  constructor(config: string | (pg.PoolConfig & PostgreSQLAdapterOptions)) {
    super();
    // Rails: `PostgreSQLAdapter` inherits the abstract adapter's
    // `default_prepared_statements = true`.
    this.preparedStatements = true;
    if (typeof config === "string") {
      this._minMessages = "warning";
      this._sessionVariables = {};
      this._pgPoolOptions = {
        connectionString: config,
        types: {
          getTypeParser: (oid: number, format?: string) => {
            // PG interval (OID 1186): return the raw ISO 8601 string so the
            // AR Interval type can Duration.parse() it (Rails sets
            // intervalstyle = iso_8601 per connection).
            if (oid === OID_INTERVAL && format !== "binary") return (v: unknown) => v;
            if ((oid === OID_JSON || oid === OID_JSONB) && format !== "binary")
              return (v: unknown) => v;
            return oid === 1082 && !PostgreSQLAdapter.decodeDates
              ? format === "binary"
                ? pg.types.getTypeParser(oid, "binary")
                : (v: unknown) => v
              : getTemporalTypeParser(oid, format);
          },
        },
      };
      this._driverPool = new pg.Pool(this._pgPoolOptions);
      this._driverPool.on("error", () => {});
      return;
    }
    // Rails' database.yml merges driver connection params + adapter
    // options into one hash; AbstractAdapter#initialize reads
    // `config[:statement_limit]` / `config[:prepared_statements]`
    // and hands the rest to the driver. Validate & apply the
    // adapter-level keys FIRST so an invalid value fails before
    // `pg.Pool` is constructed — otherwise a throw here would leave
    // a live driver pool with no cleanup path on the half-built
    // adapter.
    const {
      statementLimit,
      preparedStatements,
      insertReturning,
      minMessages,
      variables,
      ...pgConfig
    } = config;
    if (statementLimit !== undefined) this.statementLimit = statementLimit;
    if (preparedStatements !== undefined) this.preparedStatements = preparedStatements;
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
    this._pgPoolOptions = {
      ...pgConfig,
      types: {
        getTypeParser(oid: number, format?: string): unknown {
          // Our Temporal parsers handle text-format for the 5 datetime OIDs.
          // When decodeDates is false, skip the date parser (OID 1082) so
          // pg returns the raw string — mirrors Rails' decode_dates flag.
          // PG interval (OID 1186): return raw ISO 8601 string for AR
          // Interval (intervalstyle = iso_8601 is set on connect).
          if (oid === OID_INTERVAL && format !== "binary") {
            const fallback = (v: unknown) => v;
            return userGetTypeParser?.(oid, format) ?? fallback;
          }
          if ((oid === OID_JSON || oid === OID_JSONB) && format !== "binary") {
            const fallback = (v: unknown) => v;
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
    this._driverPool = new pg.Pool(this._pgPoolOptions);
    // Suppress unhandled error events from idle pool clients (e.g. a
    // server-side FATAL from idle_in_transaction_session_timeout or
    // pg_terminate_backend). Without this listener Node emits an
    // uncaughtException; with it the pool quietly removes the dead client.
    this._driverPool.on("error", () => {});
  }

  /**
   * Mirrors: PostgreSQLAdapter#configure_connection. Runs once per new
   * physical connection, tracked by WeakSet so it runs exactly once per
   * client regardless of how many times the client is checked out from
   * the pool. Called (and awaited) inside _acquireFreshClient so errors
   * propagate and misconfigured clients are never handed to user code.
   */
  private async _maybeConfigureConnection(client: pg.PoolClient): Promise<void> {
    if (this._configuredClients.has(client)) return;
    // Mark only after all queries succeed so a partial failure doesn't
    // leave the client flagged as configured on its next checkout.
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
    this._configuredClients.add(client);
    // Attach after successful configuration — avoids duplicate listeners if a
    // SET query fails and the client is re-checked-out before being discarded.
    // Mirrors Rails: postgresql_adapter.rb `unless ActiveRecord.db_warnings_action.nil?`.
    if ((this.constructor as typeof PostgreSQLAdapter).dbWarningsAction !== "ignore") {
      client.on("notice", (msg: { severity?: string; message?: string; code?: string }) => {
        this._noticeReceiverSqlWarnings.push({
          level: msg.severity,
          message: msg.message,
          code: msg.code,
        });
      });
    }
  }

  /**
   * Mirrors: PostgreSQLAdapter.initialize_type_map (class method).
   * Seeds a HashLookupTypeMap with the ~30 known PG types by typname.
   * Exposed as a static so tests and external callers can build their
   * own type_map without instantiating the adapter.
   */
  static initializeTypeMap(m: HashLookupTypeMap): void {
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
      // setDefaultTimezone() is honored consistently with the quoting
      // path.
      initializeInstanceTypeMap(this._typeMap, getDefaultTimezone());
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
    if (oid == null) {
      if (column.sqlType) {
        // Pass the original sqlType + fmod so registerClassWithLimit /
        // numeric / interval factories can still extract limit /
        // precision / scale from the modifier.
        return this.typeMap.lookup(
          normalizeFormatType(column.sqlType),
          column.fmod ?? -1,
          column.sqlType,
        );
      }
      return new ValueType();
    }
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
      return attribute.lower().eq((attribute.relation as any).lower(value));
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
  override async execQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean },
  ): Promise<Result> {
    // Note: we do NOT call materializeTransactions() here. If a lazy tx
    // is pending but un-materialized, a SELECT against an ad-hoc pool
    // client sees pre-tx state — which is correct read-before-write
    // semantics. If the tx HAS begun, `_client` is set and withClient()
    // uses it.

    // Release the query client BEFORE any loadAdditionalTypes call —
    // that path re-enters execute() and acquires its own pooled client,
    // and holding both would consume 2 connections per query during
    // type-map warmup.
    interface ArrayQueryResult {
      fields: Array<{ name: string; dataTypeID: number }>;
      rows: unknown[][];
    }
    // Type-cast bind objects (QueryAttribute) → primitives, then convert
    // Temporal values to SQL strings before pg sees them.
    const castBinds = typeCastedBinds(binds);
    const bindArray = castBinds.map((v) => temporalToBindString(v, "postgres"));
    const rewritten = this.rewriteBinds(sql, bindArray);
    this._noticeReceiverSqlWarnings = [];
    const payload: Record<string, unknown> = {
      sql: rewritten,
      name: name ?? "SQL",
      binds: binds ?? [],
      type_casted_binds: bindArray,
      connection: this,
      row_count: 0,
    };
    const pgResult: ArrayQueryResult = await Notifications.instrumentAsync(
      "sql.active_record",
      payload,
      async () => {
        try {
          const r = await this.withClient(async (client) =>
            // rowMode: "array" returns rows as positional arrays, preserving
            // duplicate column names and matching the field-index order.
            // Delegates to `_runQuery` so prepared-statement caching and
            // in-txn / out-of-txn cached-plan handling stay in one place.
            this._runQuery<ArrayQueryResult>(client, rewritten, bindArray, {
              rowMode: "array",
              prepareOverride: options?.prepare,
              onPrepared: (stmtName) => {
                payload.statement_name = stmtName;
              },
            }),
          );
          payload.row_count = r.rows?.length ?? 0;
          return r;
        } catch (e: any) {
          const translated = this._translateException(e, rewritten, bindArray);
          payload.exception = translated;
          payload.exception_object = translated;
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
    const rowArrays = pgResult.rows as unknown[][];
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
    if (initializer.deferredMultirangeOids.length > 0) {
      await this.loadAdditionalTypes([...new Set(initializer.deferredMultirangeOids)]);
      initializer.retryDeferredMultiranges();
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
   * Get the active client — either the transaction client or a fresh one from
   * the pool. Prefer `withClient` for query paths so ownership is tracked
   * per-acquisition and can't drift when a commit nulls `_client` between
   * acquire and release.
   */
  private async getClient(): Promise<pg.PoolClient> {
    if (this._client) return this._client;
    return this._acquireFreshClient();
  }

  /**
   * Acquire a fresh client from the pool and drain any orphaned
   * server-side prepared statements left by a prior PSCE event. All
   * direct pool checkouts MUST go through this helper so the drain
   * guarantee holds for every code path (getClient, beginTransaction,
   * getAdvisoryLock, etc.).
   *
   * On drain failure, the client is released with the error so node-
   * postgres discards it, then the error propagates — callers don't
   * have a client to release on this path.
   */
  private async _acquireFreshClient(): Promise<pg.PoolClient> {
    if (!this._driverPool) throw new Error("PostgreSQLAdapter: connection is closed");
    const client = await this._driverPool.connect();
    try {
      await this._maybeConfigureConnection(client);
      await this._maybeDrainOrphanedPreparedStatements(client);
    } catch (error) {
      client.release(toError(error));
      throw error;
    }
    return client;
  }

  /**
   * If `client` was tagged for `DEALLOCATE ALL` (by the released-client
   * `reset()` branch in `clearCacheBang`), drain its server-side
   * prepared statements before handing it to user code. Centralized
   * here so EVERY checkout path benefits, by routing all direct
   * `pool.connect()` callers through `_acquireFreshClient` (which
   * calls this).
   *
   * Failure of `DEALLOCATE ALL` propagates: the caller's existing
   * error path will release the (broken) client with the error so
   * node-postgres discards it.
   */
  private async _maybeDrainOrphanedPreparedStatements(client: pg.PoolClient): Promise<void> {
    if (!this._clientsNeedingDeallocateAll.has(client)) return;
    this._clientsNeedingDeallocateAll.delete(client);
    await client.query("DEALLOCATE ALL");
  }

  /**
   * Execute `fn` with a client acquired from the adapter, then return it
   * to the pool on exit. Mirrors Rails' `with_connection do |c| ... end` —
   * the key property is that ownership is decided **at acquisition**
   * (`ownedByTransaction`) and captured in a closure, so a mid-query
   * commit that nulls `this._client` can't flip the release decision.
   * Without this, the earlier symptom — "Release called on client which
   * has already been released to the pool" — surfaced whenever a
   * commit's `this._client.release()` raced with a pending finally in
   * an instrumented query path; both ran `.release()` on the same
   * `pg.PoolClient` reference.
   */
  private async withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const txClient = this._client;
    // Route through getClient() so tests that stub it (see
    // postgresql-adapter.exec-query.test.ts) keep working. getClient's
    // own behavior matches our snapshot: returns `this._client` when
    // set, otherwise a fresh pool connection.
    const client = await this.getClient();
    const ownedByTransaction = client === txClient;
    try {
      return await fn(client);
    } finally {
      if (!ownedByTransaction) client.release();
    }
  }

  /**
   * Look up the statement pool for `client`, lazily creating it.
   * Kept per-client because PG prepared statements are session-
   * scoped — once the client is released back to pg.Pool and
   * re-acquired, the server state may differ.
   */
  private _poolFor(client: pg.PoolClient): StatementPool {
    let pool = this._statementPools.get(client);
    if (!pool) {
      pool = new StatementPool(client, this._statementLimit);
      this._statementPools.set(client, pool);
    }
    // Matches Rails: statement_limit is read at pool construction
    // time. A mid-session change to `adapter.statementLimit` is
    // applied to the currently-active pool by the setter; other
    // per-client pools keep the limit they were built with. Syncing
    // them here would stomp on direct setMaxSize calls from tests or
    // callers that want a tighter bound than the adapter default.
    return pool;
  }

  /**
   * Tear down the statement pool attached to `client`. Called from
   * `close()` only — commit / rollback intentionally keep the pool
   * attached because PG prepared statements are session-scoped, not
   * transaction-scoped (see Rails' PG::StatementPool, which only
   * clears on disconnect). Detaching here stops late DEALLOCATE
   * calls from racing with a released client, AND we drop the
   * WeakMap entry so a later checkout that hands back the same
   * pg.PoolClient wrapper gets a fresh pool.
   */
  private _releaseStatementPool(client: pg.PoolClient): void {
    const pool = this._statementPools.get(client);
    if (!pool) return;
    pool.detach();
    this._statementPools.delete(client);
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
    client: pg.PoolClient,
    sql: string,
    binds: unknown[],
    extra: {
      rowMode?: "array";
      prepareOverride?: boolean;
      onPrepared?: (stmtName: string) => void;
    } = {},
  ): Promise<R> {
    const { prepareOverride, onPrepared, ...queryExtra } = extra;
    const prepare =
      prepareOverride === false ? false : (prepareOverride ?? this._shouldPrepare(binds, client));
    const attempt = async (): Promise<R> => {
      if (prepare) {
        const stmtName = this._preparedNameFor(client, sql);
        onPrepared?.(stmtName);
        return (await client.query({
          name: stmtName,
          text: sql,
          values: binds,
          ...queryExtra,
        })) as R;
      }
      if (queryExtra.rowMode) {
        return (await client.query({ text: sql, values: binds, ...queryExtra })) as R;
      }
      return (await client.query(sql, binds)) as R;
    };
    try {
      return await attempt();
    } catch (e) {
      if (prepare && this._isInvalidCachedPlan(e)) {
        this._poolFor(client).delete(sql);
        if (this._inTransaction) {
          throw new PreparedStatementCacheExpired(
            (e as { message?: string })?.message ?? "cached plan expired",
            { sql, binds, cause: e },
          );
        }
        return await attempt();
      }
      throw e;
    }
  }

  /**
   * Return the prepared-statement name for `sql` on `client`. Names
   * are allocated from the per-pool counter (`StatementPool#nextKey`)
   * so each session has its own `a1`, `a2`, ... sequence. Mirrors
   * Rails' `PostgreSQL::StatementPool#[]` / `#[]=` — present key →
   * cached name, absent → `next_key` + store.
   */
  private _preparedNameFor(client: pg.PoolClient, sql: string): string {
    const pool = this._poolFor(client);
    const existing = pool.get(sql);
    if (existing) return existing.name;
    const name = pool.nextKey();
    pool.set(sql, { name });
    return name;
  }

  /**
   * True when the adapter should try a named prepared statement for
   * this call. Rails' gate: `prepared_statements && !binds.empty?`
   * (there's no point naming an unparameterized statement — the
   * parse cost is the same either way and the name never gets
   * reused without binds).
   */
  private _shouldPrepare(binds: unknown[], client?: pg.PoolClient): boolean {
    if (!this.preparedStatements || binds.length === 0) return false;
    // Gate on the actual pool's maxSize (or the adapter default if
    // no pool exists yet). A direct `pool.setMaxSize(0)` — by a test
    // or an operator shrinking one specific session — must reliably
    // disable preparation for that client, because `StatementPool#set`
    // is a no-op at maxSize=0 and we'd otherwise keep allocating a
    // fresh `a<n>` name per execution and leak server-side PREPAREs.
    const poolLimit = client
      ? (this._statementPools.get(client)?.maxSize ?? this._statementLimit)
      : this._statementLimit;
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
    client: pg.PoolClient,
    sql: string,
    name: string,
    binds: unknown[],
  ): Promise<Result> {
    const castBinds = typeCastedBinds(binds);
    const bindArray = castBinds.map((v) => temporalToBindString(v, "postgres"));
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
        payload.row_count = (r as pg.QueryResult).rowCount ?? 0;
        return r as pg.QueryResult;
      } catch (e: any) {
        const translated = this._translateException(e, rewritten, bindArray);
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      }
    });
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
  ): Promise<Record<string, unknown>[]> {
    this.checkIfWriteQuery(sql);
    await this.materializeTransactions();
    binds = binds.map((v) => temporalToBindString(v, "postgres"));
    const rewritten = this.rewriteBinds(sql, binds);
    // payload.sql is the rewritten SQL (`$1` not `?`) so ExplainSubscriber
    // stores something that can be re-EXPLAIN'd on the same adapter
    // without re-running rewriteBinds.
    const payload: Record<string, unknown> = {
      sql: rewritten,
      name,
      binds,
      type_casted_binds: typeCastedBinds(binds),
      connection: this,
      row_count: 0,
    };
    this._noticeReceiverSqlWarnings = [];
    // Flush inside the instrumented callback so a warning raise is captured by
    // payload.exception — mirrors Rails' handle_warnings inside perform_query (line 166).
    return await Notifications.instrumentAsync("sql.active_record", payload, async () => {
      try {
        return await this.withClient(async (client) => {
          const result = await this._runQuery(client, rewritten, binds);
          payload.row_count = result.rows.length;
          this._flushWarnings(rewritten);
          return result.rows;
        });
      } catch (e: any) {
        const translated = this._translateException(e, rewritten, binds);
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      }
    });
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   *
   * For INSERT, if the statement includes a RETURNING clause the first column
   * of the first returned row is treated as the inserted ID. Otherwise, the
   * `rowCount` is returned.
   */
  async executeMutation(sql: string, binds: unknown[] = [], name: string = "SQL"): Promise<number> {
    this.checkIfWriteQuery(sql);
    await this.materializeTransactions();
    binds = binds.map((v) => temporalToBindString(v, "postgres"));
    const pgSql = this.rewriteBinds(sql, binds);
    this._noticeReceiverSqlWarnings = [];
    // payload.sql records the rewritten SQL — ExplainSubscriber captures
    // something that can be re-EXPLAIN'd without re-running rewriteBinds
    // (and without re-appending RETURNING for bare INSERTs, which isn't
    // part of the logical query).
    const payload: Record<string, unknown> = {
      sql: pgSql,
      name,
      binds,
      type_casted_binds: typeCastedBinds(binds),
      connection: this,
      row_count: 0,
    };
    const m = await Notifications.instrumentAsync("sql.active_record", payload, async () => {
      let rc: number;
      try {
        rc = await this.withClient(async (client) => {
          this.dirtyCurrentTransaction();
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
              if (useSavepoint) await client.query(`SAVEPOINT "${spName}"`);
              const result = await this._runQuery(client, withReturning, binds);
              if (useSavepoint) await client.query(`RELEASE SAVEPOINT "${spName}"`);
              payload.row_count = result.rowCount ?? 0;
              if (result.rows.length > 1) {
                return result.rowCount ?? result.rows.length;
              }
              if (result.rows.length > 0) {
                return result.rows[0][Object.keys(result.rows[0])[0]] as number;
              }
              return result.rowCount ?? 0;
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
                await client.query(`ROLLBACK TO SAVEPOINT "${spName}"`).catch(() => {});
                await client.query(`RELEASE SAVEPOINT "${spName}"`).catch(() => {});
              }
              payload.sql = pgSql;
              const result = await this._runQuery(client, pgSql, binds);
              payload.row_count = result.rowCount ?? 0;
              return result.rowCount ?? 0;
            }
          }

          // For INSERT with explicit RETURNING
          if (upper.startsWith("INSERT") && upper.includes("RETURNING")) {
            const result = await this._runQuery(client, pgSql, binds);
            payload.row_count = result.rowCount ?? 0;
            if (result.rows.length > 0) {
              return result.rows[0][Object.keys(result.rows[0])[0]] as number;
            }
            return result.rowCount ?? 0;
          }

          // For UPDATE/DELETE, return affected rows
          const result = await this._runQuery(client, pgSql, binds);
          payload.row_count = result.rowCount ?? 0;
          return result.rowCount ?? 0;
        });
      } catch (e: any) {
        const translated = this._translateException(e, pgSql, binds);
        payload.exception = translated;
        payload.exception_object = translated;
        throw translated;
      }
      // Flush inside the instrumented callback so a raised SQLWarning is visible
      // to instrumentation subscribers — mirrors handle_warnings inside perform_query.
      this._flushWarnings(payload.sql as string);
      return rc!;
    });
    return m;
  }

  /**
   * Begin a transaction. Acquires a dedicated client from the pool.
   */
  async beginTransaction(): Promise<void> {
    // Force materialization (_lazy: false) so _client is acquired and
    // _inTransaction is set immediately. createSavepoint() uses withClient()
    // which falls back to a fresh pool connection when _client is null,
    // causing "SAVEPOINT can only be used in transaction blocks".
    await this._transactionManager.beginTransaction({ _lazy: false });
  }

  async beginDbTransaction(): Promise<void> {
    this._client = await this._acquireFreshClient();
    try {
      await this._client.query("BEGIN");
      this._inTransaction = true;
    } catch (error) {
      const client = this._client;
      this._client = null;
      this._inTransaction = false;
      client?.release(toError(error));
      throw error;
    }
  }

  async beginDeferredTransaction(): Promise<void> {
    return this.beginDbTransaction();
  }

  /**
   * Commit the current transaction and release the client.
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
    await this._client.query("COMMIT");
    // Keep the per-client StatementPool attached through the pg.Pool
    // checkin/checkout cycle. PG prepared statements are session-
    // scoped, not transaction-scoped (COMMIT/ROLLBACK don't drop
    // them), so detaching here and rebuilding on next checkout would
    // reset the counter → `a1` collides with the still-prepared `a1`
    // on the server. Matches Rails, which only clears its
    // StatementPool on disconnect, not on commit.
    this._client.release();
    this._client = null;
    this._inTransaction = false;
  }

  async commitDbTransaction(): Promise<void> {
    return this.commit();
  }

  /**
   * Rollback the current transaction and release the client.
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
    const releasedClient = this._client;
    let rollbackError: unknown;
    try {
      await this._client.query("ROLLBACK");
    } catch (e) {
      rollbackError = e;
    } finally {
      this._client = null;
      this._inTransaction = false;
      releasedClient.release(
        rollbackError === undefined
          ? undefined
          : rollbackError instanceof Error
            ? rollbackError
            : new Error(String(rollbackError)),
      );
      this._lastReleasedTxnClient = releasedClient;
    }
    if (rollbackError !== undefined) throw rollbackError;
  }

  async rollbackDbTransaction(): Promise<void> {
    return this.execRollbackDbTransaction();
  }

  // Mirrors: DatabaseStatements#exec_rollback_db_transaction (database_statements.rb:78)
  async execRollbackDbTransaction(): Promise<void> {
    this._cancelAnyRunningQuery();
    if (!this._client) throw new Error("No active transaction");
    const releasedClient = this._client;
    let rollbackError: unknown;
    try {
      await this._client.query("ROLLBACK");
    } catch (e) {
      // If ROLLBACK itself throws (e.g. network drop mid-txn), we still
      // have to release the client or the pool leaks. Rethrow after
      // cleanup. Pass the error to release() so pg.Pool discards the
      // (potentially damaged) client instead of returning a bad
      // socket to the idle set.
      rollbackError = e;
    } finally {
      // See commit() — ROLLBACK doesn't drop server-side prepared
      // statements, so we keep the pool attached to the pg.PoolClient
      // for the duration of the connection's life.
      this._client = null;
      this._inTransaction = false;
      // Normalize to Error before passing to release() — node-postgres
      // expects an Error to discard the client, and downstream code
      // (and our own rethrow path) may read `.message`. Matches the
      // pattern in beginDbTransaction's catch.
      releasedClient.release(
        rollbackError === undefined
          ? undefined
          : rollbackError instanceof Error
            ? rollbackError
            : new Error(String(rollbackError)),
      );
      // Retain a reference to the just-released client so a
      // post-rollback `clearCacheBang` (Rails' `after_failure_actions`)
      // can still reach the StatementPool. This reference is dropped
      // by `clearCacheBang` after the cache reset runs; it's NOT
      // cleared by `beginDbTransaction` (after-rollback callbacks can
      // open a new txn before the failure hook fires, and nulling
      // the ref there would lose the pointer to the failed client).
      this._lastReleasedTxnClient = releasedClient;
    }
    if (rollbackError !== undefined) throw rollbackError;
  }

  // Mirrors: DatabaseStatements#exec_restart_db_transaction (database_statements.rb:83)
  async execRestartDbTransaction(): Promise<void> {
    this._cancelAnyRunningQuery();
    await this.execute("ROLLBACK AND CHAIN");
  }

  // Mirrors: PostgreSQL::DatabaseStatements#cancel_any_running_query (database_statements.rb private)
  // Sends a CancelRequest to abort any in-flight query on the transaction connection
  // before issuing ROLLBACK / ROLLBACK AND CHAIN, so the rollback isn't blocked
  // waiting for a long-running query to finish. Best-effort: errors are swallowed.
  private _cancelAnyRunningQuery(): void {
    type PgClientInternals = {
      activeQuery?: unknown;
      processID?: number | null;
      cancel: (target: PgClientInternals, query: unknown) => void;
    };
    const txClient = this._client as (pg.PoolClient & PgClientInternals) | null;
    if (!txClient?.activeQuery || txClient.processID == null) return;
    try {
      // pg.Client.cancel(target, query) opens a fresh raw TCP connection to send
      // the libpq CancelRequest — it does NOT consume a pool slot, so this is
      // safe even when the pool is at max capacity.
      txClient.cancel(txClient, txClient.activeQuery);
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
      await this._client.query(`BEGIN ISOLATION LEVEL ${level}`);
      this._inTransaction = true;
    } catch (error) {
      const client = this._client;
      this._client = null;
      this._inTransaction = false;
      client?.release(toError(error));
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
      throw new Error(`deferred must be "deferred" or "immediate"`);
    }
    const list =
      constraints.length === 0 ? "ALL" : constraints.map((c) => this.quoteTableName(c)).join(", ");
    await this.execute(`SET CONSTRAINTS ${list} ${deferred.toUpperCase()}`);
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(`SAVEPOINT "${name}"`);
    });
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(`RELEASE SAVEPOINT "${name}"`);
    });
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(`ROLLBACK TO SAVEPOINT "${name}"`);
    });
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
    return this.withClient(async (client) => {
      const clause = this._explainStatementClause(options);
      // Rewrite `?` → `$1` the same way execute/execQuery do, so a
      // collected query with driver-neutral placeholders (`?`) can be
      // re-EXPLAIN'd. Bind values pass through to pg as the values
      // array so `EXPLAIN` with parameters doesn't error with
      // "there is no parameter $1".
      const pgBinds = binds.map((v) => temporalToBindString(v, "postgres"));
      const rewritten = this.rewriteBinds(sql, pgBinds);
      const result = await client.query(`${clause} ${rewritten}`, pgBinds);
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
  static nativeDatabaseTypes(): Record<string, string | { name?: string; limit?: number }> {
    const types = {
      ...this.NATIVE_DATABASE_TYPES,
      ...pgDatetimeConfig.nativeDatabaseTypesOverrides,
    };
    types["datetime"] = types[this.datetimeType] ?? { name: "timestamp" };
    return types;
  }

  // Mirrors: PostgreSQLAdapter#native_database_types (postgresql_adapter.rb:400)
  nativeDatabaseTypes(): Record<string, string | { name?: string; limit?: number }> {
    return (this.constructor as typeof PostgreSQLAdapter).nativeDatabaseTypes();
  }

  // Mirrors: PostgreSQLAdapter#set_standard_conforming_strings (postgresql_adapter.rb:412)
  async setStandardConformingStrings(): Promise<void> {
    await this.execute("SET standard_conforming_strings = on");
  }

  // Mirrors: PostgreSQLAdapter#enum_types (postgresql_adapter.rb:518)
  // Returns an array of [fullName, values] pairs for all enum types visible on the search path
  // (current_schemas(false) — all schemas in search_path, not just the current one).
  // Enum types in the default schema are returned without a schema prefix.
  async enumTypes(): Promise<[string, string[]][]> {
    const query = `
      SELECT
        type.typname AS name,
        type.OID AS oid,
        n.nspname AS schema,
        json_agg(enum.enumlabel ORDER BY enum.enumsortorder) AS value
      FROM pg_enum AS enum
      JOIN pg_type AS type ON (type.oid = enum.enumtypid)
      JOIN pg_namespace n ON type.typnamespace = n.oid
      WHERE n.nspname = ANY (current_schemas(false))
      GROUP BY type.OID, n.nspname, type.typname
    `;
    const currentSchema = await this.currentSchema();
    const rows = (await this.schemaQuery(query)) as Array<{
      name: string;
      schema: string;
      value: string[];
    }>;
    return rows.map((row) => {
      const schema = row.schema === currentSchema ? null : row.schema;
      const fullName = [schema, row.name].filter(Boolean).join(".");
      const values: string[] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      return [fullName, values] as [string, string[]];
    });
  }

  // Mirrors: PostgreSQLAdapter#max_identifier_length (postgresql_adapter.rb:620)
  async maxIdentifierLength(): Promise<number> {
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
      this.checkIfWriteQuery(sql);
      await this.materializeTransactions();
      return this.withClient(async (client) => {
        this.dirtyCurrentTransaction();
        return this._instrumentedQueryOnClient(client, sql, name ?? "SQL", binds);
      });
    }
    if (this._useInsertReturning) {
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
    this.checkIfWriteQuery(sql);
    await this.materializeTransactions();
    // currval() is session-scoped: INSERT and SELECT currval(...) must
    // run on the same connection. withClient() pins both to one client.
    return this.withClient(async (client) => {
      this.dirtyCurrentTransaction();
      const insertResult = await this._instrumentedQueryOnClient(client, sql, name ?? "SQL", binds);
      if (!sequenceName) return insertResult;
      const currvalSql = `SELECT currval(${this.quote(sequenceName)})`;
      return this._instrumentedQueryOnClient(client, currvalSql, "SQL", []);
    });
  }

  /** Returns true for raw pg errors that indicate the database doesn't exist (SQLSTATE 3D000). */
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
    await this.withClient(async (client) => {
      await client.query(sql);
    });
  }

  /**
   * Close the connection pool.
   */
  async close(): Promise<void> {
    if (this._advisoryLockClient) {
      this._advisoryLockClient.release();
      this._advisoryLockClient = null;
    }
    if (this._client) {
      this._releaseStatementPool(this._client);
      this._client.release();
      this._client = null;
    }
    // Drop adapter-held references to any remaining pools so late
    // errors can't fire DEALLOCATE against a pool.end()-ed client.
    // The pool objects become unreachable once pg releases the
    // corresponding clients anyway — this is about breaking our
    // own reference, not an explicit detach step per pool.
    this._statementPools = new WeakMap<pg.PoolClient, StatementPool>();
    if (this._driverPool) {
      await this._driverPool.end();
      this._driverPool = null;
    }
  }

  /**
   * Mirrors Rails' private `PostgreSQLAdapter#connect`. Creates a fresh
   * pg.Pool using the stored connection options. Called by `reconnect`
   * after the old pool has been torn down.
   *
   * @internal
   */
  connect(): void {
    if (!this._pgPoolOptions || this._driverPool) return;
    this._driverPool = new pg.Pool(this._pgPoolOptions);
    this._driverPool.on("error", () => {});
  }

  /**
   * Mirrors Rails' private `PostgreSQLAdapter#reconnect`. Fires a
   * non-blocking `pool.end()` on the old pool (fire-and-forget), resets
   * all per-connection state, and immediately creates a fresh pool via
   * `connect()`. Rails resets the single raw PG connection; here the
   * old pool drains asynchronously while the new pool is already live.
   *
   * @internal
   */
  reconnect(): void {
    if (this._advisoryLockClient) {
      this._advisoryLockClient.release();
      this._advisoryLockClient = null;
    }
    if (this._client) {
      this._releaseStatementPool(this._client);
      this._client.release();
      this._client = null;
    }
    this._driverPool?.end().catch(() => {});
    this._driverPool = null;
    this._inTransaction = false;
    this._lastReleasedTxnClient = null;
    this._configuredClients = new WeakSet<pg.PoolClient>();
    this._statementPools = new WeakMap<pg.PoolClient, StatementPool>();
    this._clientsNeedingDeallocateAll = new WeakSet<pg.PoolClient>();
    this.resetTransaction();
    this.connect();
  }

  /**
   * Public override so `AbstractAdapter#verifyBang()` (called by
   * `ConnectionPool` on checkout) actually reconnects the PG pool
   * rather than just clearing the statement cache.
   *
   * @internal
   */
  override reconnectBang(): void {
    this.reconnect();
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#active?` + `AbstractAdapter#verify!`.
   * Pings the server with a lightweight query; on PG::Error (server-side
   * disconnect, timeout, pg_terminate_backend) tears down the pool and
   * reconnects so the next checkout gets a fresh connection.
   *
   * @internal
   */
  override async verifyBang(): Promise<void> {
    if (!this._driverPool) {
      this.reconnect();
      this.verifiedBang();
      return;
    }
    // Use _driverPool.connect() directly rather than _acquireFreshClient():
    // _acquireFreshClient releases the client internally on drain failure,
    // which would cause a double-release in the finally block here. A plain
    // pool checkout + query(";") is sufficient for a liveness ping.
    let client: pg.PoolClient | null = null;
    try {
      client = await this._driverPool.connect();
      await client.query(";");
    } catch {
      this.reconnect();
    } finally {
      if (client) client.release();
    }
    this.verifiedBang();
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#reset!`. Rails issues ROLLBACK (if in
   * a transaction), DISCARD ALL, then re-runs configure_connection on the
   * single raw connection. pg doesn't expose PQreset; the pool equivalent is
   * to fire a best-effort ROLLBACK on the held client (if any), then tear
   * down the entire pool — discarding all physical connections and their
   * session state. The rollback is fire-and-forget so reconnect() always runs
   * even if the connection is already broken, matching Rails' error-tolerant
   * reset semantics. New checkouts are configured on first use via
   * `_maybeConfigureConnection`, matching Rails' `super` call.
   *
   * @internal
   */
  override resetBang(): void {
    if (this._client) {
      this._cancelAnyRunningQuery();
      const client = this._client;
      this._releaseStatementPool(client);
      this._client = null;
      client.query("ROLLBACK").then(
        () => client.release(),
        (err) => client.release(toError(err)),
      );
    }
    this.reconnect();
    super.resetBang();
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#configure_connection`. Applies
   * per-connection settings (standard_conforming_strings, intervalstyle,
   * client_min_messages, session variables). Delegates to the internal
   * `_maybeConfigureConnection` which gates on a WeakSet so each physical
   * client is configured exactly once.
   *
   * @internal
   */
  async configureConnection(client: pg.PoolClient): Promise<void> {
    return this._maybeConfigureConnection(client);
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#disconnect!`. Closes the
   * connection pool and releases any advisory-lock client. Pool teardown
   * is fire-and-forget (we nullify `_driverPool` immediately so no new
   * queries can start; the underlying pg.Pool drains asynchronously).
   */
  override disconnectBang(): void {
    if (this._advisoryLockClient) {
      this._advisoryLockClient.release();
      this._advisoryLockClient = null;
    }
    if (this._client) {
      this._releaseStatementPool(this._client);
      this._client.release();
      this._client = null;
    }
    this._driverPool?.end().catch(() => {});
    this._driverPool = null;
    // Rails' disconnect! calls reset_transaction; super.disconnectBang() does not.
    this._inTransaction = false;
    this._lastReleasedTxnClient = null;
    this._clientsNeedingDeallocateAll = new WeakSet<pg.PoolClient>();
    this.resetTransaction();
    super.disconnectBang();
  }

  /**
   * Mirrors Rails' `PostgreSQLAdapter#discard!`. Used when the process
   * is about to fork or the connection is unrecoverably broken. Rails
   * reopens the raw socket to /dev/null; here we fire a non-blocking
   * `pool.end()` (fire-and-forget) so server-side resources are
   * eventually released, then immediately null all references so no
   * further queries can start.
   */
  override discardBang(): void {
    if (this._advisoryLockClient) {
      this._advisoryLockClient.release();
      this._advisoryLockClient = null;
    }
    if (this._client) {
      this._releaseStatementPool(this._client);
      this._client.release();
      this._client = null;
    }
    this._driverPool?.end().catch(() => {});
    this._driverPool = null;
    this._inTransaction = false;
    this._lastReleasedTxnClient = null;
    this._configuredClients = new WeakSet<pg.PoolClient>();
    this._statementPools = new WeakMap<pg.PoolClient, StatementPool>();
    this._clientsNeedingDeallocateAll = new WeakSet<pg.PoolClient>();
    // Rails' discard! calls reset_transaction; super.discardBang() does not.
    this.resetTransaction();
    super.discardBang();
  }

  /**
   * Test-only accessor for the statement pool attached to the
   * currently-held transaction client. Returns undefined outside a
   * transaction, because without a held client every adapter call
   * grabs a fresh pool. Mirrors Rails' `raw_connection
   * .instance_variable_get(:@statement_pool)` escape hatch used by
   * `PostgreSQL::StatementPoolTest`.
   *
   * @internal
   */
  _statementPoolForTest(): StatementPool | undefined {
    return this._client ? this._statementPools.get(this._client) : undefined;
  }

  /** @internal — pool for the most recently released txn client. */
  _lastReleasedStatementPoolForTest(): StatementPool | undefined {
    // Deref once: the WeakRef behind `_lastReleasedTxnClient` can flip
    // to null between two getter calls if the GC runs between them,
    // and `WeakMap.get(null)` throws (keys must be objects).
    const client = this._lastReleasedTxnClient;
    return client ? this._statementPools.get(client) : undefined;
  }

  /** @internal — the most recently released txn client (deref'd once). */
  _lastReleasedClientForTest(): pg.PoolClient | null {
    return this._lastReleasedTxnClient;
  }

  /** @internal — the currently-held txn client. */
  _currentClientForTest(): pg.PoolClient | null {
    return this._client;
  }

  /** @internal — whether a client is tagged for DEALLOCATE ALL on next checkout. */
  _needsDeallocateAllForTest(client: pg.PoolClient): boolean {
    return this._clientsNeedingDeallocateAll.has(client);
  }

  /**
   * Clear cached prepared statements on the currently-held transaction
   * client. Mirrors Rails' `PostgreSQLAdapter#clear_cache!` which
   * sends DEALLOCATE for each cached entry on the adapter's sole
   * PG::Connection. Rails has exactly one connection per adapter
   * instance; we back multiple via pg.Pool, so "the connection" is
   * ambiguous outside a transaction. Non-active per-client pools are
   * intentionally left attached: resetting the WeakMap would orphan
   * our counter + sql→name map while the server-side PREPAREs still
   * exist, and a later checkout of that same pg.PoolClient would
   * restart the counter at `a1` — colliding with the statement
   * already PREPAREd on that session.
   */
  override clearCacheBang(): void {
    super.clearCacheBang();
    // Always handle the just-released txn client first when set —
    // this is the failure-hook target. After-rollback callbacks may
    // have opened a new transaction (so `_client` is non-null) before
    // `after_failure_actions` reached us; without this branch we'd
    // clear the WRONG pool (the new txn's) and leave the failed
    // session's stale entries behind. Bounded to the failure-hook
    // window: we drop the ref immediately after.
    const lastReleased = this._lastReleasedTxnClient;
    const currentClient = this._client;
    if (lastReleased) {
      try {
        if (lastReleased === currentClient) {
          // pg.Pool handed back the same physical client to the new
          // txn — we own the session again, so prefer full `clear()`
          // which fires DEALLOCATE per entry (cleans up the orphaned
          // server-side PREPAREs that `reset()` would have left).
          this._statementPools.get(lastReleased)?.clear();
        } else {
          // Released client (different from any current txn): we
          // can't fire DEALLOCATE on a session we don't own. We also
          // can't SKIP the reset: the WeakMap-stored pool persists
          // across pg.Pool checkouts of the same physical client. If
          // we left the stale entries in place, a future checkout of
          // this same pg.PoolClient would find the invalidated name
          // in the pool and call `exec_prepared(staleName)`, hitting
          // the same PSCE error again. `reset()` forces re-PREPARE
          // with a fresh name (counter never resets, so no collision
          // with the orphaned server-side statement). Tag the client
          // so the next checkout through `_acquireFreshClient` runs
          // `DEALLOCATE ALL` to drain the orphaned server-side
          // statements left behind by the local-only reset.
          this._statementPools.get(lastReleased)?.reset();
          this._clientsNeedingDeallocateAll.add(lastReleased);
        }
      } finally {
        this._lastReleasedTxnClient = null;
      }
    }
    if (currentClient && currentClient !== lastReleased) {
      // Live txn client (distinct from the failed one we already
      // handled above): full clear() — fires DEALLOCATE per entry
      // (via StatementPool's pg-specific dealloc override).
      this._statementPools.get(currentClient)?.clear();
    }
    // Server-side accumulation note: the released-client `reset()`
    // path above only drops the local sql→name map. Server-side
    // PREPAREs are drained by `_clientsNeedingDeallocateAll` +
    // `DEALLOCATE ALL` on next checkout (any path that goes through
    // `_acquireFreshClient` — getClient / beginTransaction /
    // getAdvisoryLock / etc.). Until that checkout happens, the
    // orphans live on the idle pg.PoolClient.
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
   * Get the underlying pg.Pool instance.
   * Escape hatch for advanced usage.
   */
  get raw(): pg.Pool {
    if (!this._driverPool) throw new Error("PostgreSQLAdapter: connection is closed");
    return this._driverPool;
  }

  // ---------------------------------------------------------------------------
  // Feature support predicates
  // Mirrors: PostgreSQLAdapter supports_* methods
  // ---------------------------------------------------------------------------

  /**
   * Fetch and cache the server version number. Called automatically on
   * the first query via _ensureInitialized(). Version-dependent
   * supports_* methods throw if called before initialization.
   */
  async getDatabaseVersion(): Promise<number> {
    if (this._databaseVersion !== null) return this._databaseVersion;
    // Use raw client directly to avoid re-entering execute() which could
    // interfere with savepoint nesting in test adapters or wrappers.
    await this.withClient(async (client) => {
      const result = await client.query("SHOW server_version_num");
      this._databaseVersion = parseInt(String(result.rows[0]?.server_version_num ?? "0"), 10);
    });
    // Eagerly populate optimizer hints flag
    if (this._hasOptimizerHints === null) {
      try {
        await this.withClient(async (client) => {
          const result = await client.query(
            "SELECT COUNT(*) AS count FROM pg_available_extensions WHERE name = $1",
            ["pg_hint_plan"],
          );
          this._hasOptimizerHints = Number(result.rows[0]?.count) > 0;
        });
      } catch {
        this._hasOptimizerHints = false;
      }
    }
    return this._databaseVersion!;
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

  supportsBulkAlter(): boolean {
    return true;
  }
  supportsIndexSortOrder(): boolean {
    return true;
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
  get arelVisitor(): Visitors.ToSql {
    return new Visitors.PostgreSQLWithBinds(this);
  }

  supportsDdlTransactions(): boolean {
    return true;
  }
  supportsAdvisoryLocks(): boolean {
    return true;
  }

  // Advisory locks are session-scoped — acquire and release must use the
  // same connection. We pin a dedicated client from the pool for the
  // duration of the lock.
  private _advisoryLockClient: pg.PoolClient | null = null;

  async getAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const client = await this._acquireFreshClient();
    try {
      const [sql, param] = _pgAdvisoryLockSql("pg_try_advisory_lock", "locked", lockId);
      const result = await client.query(sql, [param]);
      const locked = result.rows[0]?.locked === true;
      if (locked) {
        this._advisoryLockClient = client;
      } else {
        client.release();
      }
      return locked;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async releaseAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const client = this._advisoryLockClient;
    if (!client) return false;
    try {
      const [sql, param] = _pgAdvisoryLockSql("pg_advisory_unlock", "unlocked", lockId);
      const result = await client.query(sql, [param]);
      return result.rows[0]?.unlocked === true;
    } finally {
      this._advisoryLockClient = null;
      client.release();
    }
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
    const rows = await this.schemaQuery(
      `SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname != 'information_schema' ORDER BY nspname`,
    );
    return rows.map((r) => r.nspname as string);
  }

  async createSchema(
    name: string,
    options: { force?: boolean; ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (options.force && options.ifNotExists) {
      throw new Error("Options `:force` and `:if_not_exists` cannot be used simultaneously.");
    }
    if (options.force) {
      await this.exec(`DROP SCHEMA IF EXISTS ${this.quoteSchemaName(name)} CASCADE`);
    }
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    await this.exec(`CREATE SCHEMA${ifNotExists} ${this.quoteSchemaName(name)}`);
  }

  async dropSchema(
    name: string,
    options: { ifExists?: boolean; cascade?: boolean } = {},
  ): Promise<void> {
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.cascade ? " CASCADE" : "";
    await this.exec(`DROP SCHEMA${ifExists} ${this.quoteSchemaName(name)}${cascade}`);
  }

  async schemaExists(name: string): Promise<boolean> {
    const rows = await this.schemaQuery(
      `SELECT COUNT(*) AS count FROM pg_namespace WHERE nspname = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async currentSchema(): Promise<string> {
    const rows = await this.schemaQuery("SELECT current_schema() AS schema");
    return rows[0].schema as string;
  }

  async dataSourceExists(name: string): Promise<boolean> {
    const { schema, table } = this.parseSchemaQualifiedName(name);
    if (schema) {
      const rows = await this.schemaQuery(
        `SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, table],
      );
      return Number(rows[0].count) > 0;
    }
    const rows = await this.schemaQuery(`SELECT to_regclass($1) AS oid`, [name]);
    return rows[0].oid != null;
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
    return pgQuote(value);
  }

  override typeCast(value: unknown): unknown {
    return pgTypeCast(value);
  }

  columnsForDistinct(columns: string | string[], orders?: (string | Nodes.Node)[]): string {
    const base = Array.isArray(columns) ? columns.join(", ") : columns;
    const visitor = this.arelVisitor;
    // Mirrors Rails two-pass compact_blank: filter blanks before AND after stripping
    // so an order that becomes empty after stripping (e.g. bare "DESC") doesn't
    // consume an alias index slot and shift subsequent aliases.
    const orderColumns = (orders ?? [])
      .map((o) => (typeof o === "string" ? o : visitor.compile(o as Nodes.Node)))
      .filter((o) => o.trim().length > 0)
      .map((o) =>
        o
          .replace(/\s+(?:ASC|DESC)\b/gi, "")
          .replace(/\s+NULLS\s+(?:FIRST|LAST)\b/gi, "")
          .trim(),
      )
      .filter((col) => col.length > 0)
      .map((col, i) => `${col} AS alias_${i}`);
    if (orderColumns.length === 0) return base;
    return [...orderColumns, base].join(", ");
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
    const rows = await this.schemaQuery(
      `SELECT COUNT(*) AS count FROM pg_extension WHERE extname = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async extensionAvailable(name: string): Promise<boolean> {
    const rows = await this.schemaQuery(
      `SELECT COUNT(*) AS count FROM pg_available_extensions WHERE name = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
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
      await this.withClient(async (client) => {
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
  }

  async databaseExists(name: string): Promise<boolean> {
    const rows = await this.schemaQuery(
      `SELECT COUNT(*) AS count FROM pg_database WHERE datname = $1`,
      [name],
    );
    return Number(rows[0].count) > 0;
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    // supportsIndexInclude() reads databaseVersion; ensure it's populated.
    await this.getDatabaseVersion();
    const { schema, table } = this.parseSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    // ix.indnkeyatts was added in PG11 (covering indexes); on older servers
    // INCLUDE columns don't exist, so all indkey columns are key columns.
    const includeFilter = this.supportsIndexInclude() ? `WHERE k < ix.indnkeyatts` : "";

    const rows = await this.schemaQuery(
      `SELECT i.relname AS index_name,
              ix.indisunique AS is_unique,
              am.amname AS using,
              ARRAY(
                SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
                FROM generate_subscripts(ix.indkey, 1) AS k
                ${includeFilter}
                ORDER BY k
              ) AS columns,
              pg_get_indexdef(ix.indexrelid) AS definition,
              ix.indoption AS options,
              t.relname AS table_name
       FROM pg_class t
       JOIN pg_index ix ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_am am ON am.oid = i.relam
       WHERE ${tableCondition}
         AND ix.indisprimary = false
       ORDER BY i.relname`,
      binds,
    );

    return rows.map((row) => {
      const columns = row.columns as string[];
      const def = row.definition as string;

      // Extract the expressions, INCLUDE, NULLS NOT DISTINCT, and WHERE clauses.
      // Mirrors Rails' regex: / USING (\w+?) \((.+?)\)(?: INCLUDE \((.+?)\))?( NULLS NOT DISTINCT)?(?: WHERE (.+))?\z/m
      const defMatch = def.match(
        / USING \w+? \((.+?)\)(?: INCLUDE \((.+?)\))?( NULLS NOT DISTINCT)?(?: WHERE (.+))?$/s,
      );
      const expressions = defMatch?.[1] ?? "";
      const includeStr = defMatch?.[2];
      const nullsNotDistinctStr = defMatch?.[3];
      const whereStr = defMatch?.[4];

      const include = includeStr
        ? includeStr.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
        : undefined;
      const where = whereStr?.trim();
      const nullsNotDistinct = nullsNotDistinctStr ? true : undefined;

      // Parse opclasses and orders from the expressions string.
      // Mirrors Rails regex: /(?<column>\w+)"?\s?(?<opclass>\w+_ops(_\w+)?)?\s?(?<desc>DESC)?\s?(?<nulls>NULLS (?:FIRST|LAST))?/
      const opclassesMap: Record<string, string> = {};
      const ordersMap: Record<string, string> = {};
      const COL_RE = /(\w+)"?\s?(\w+_ops(?:_\w+)?)?\s?(DESC)?\s?(NULLS (?:FIRST|LAST))?/g;
      for (const [, column, opclass, desc, nulls] of expressions.matchAll(COL_RE)) {
        if (opclass) opclassesMap[column] = opclass;
        if (nulls) {
          ordersMap[column] = [desc, nulls].filter(Boolean).join(" ");
        } else if (desc) {
          ordersMap[column] = "desc";
        }
      }

      // concise_options: collapse to a single scalar when all key columns share the same value.
      // `columns` is already key-only because the SQL limits to ix.indnkeyatts.
      let opclasses: Record<string, string> | string | undefined;
      const opclassVals = Object.values(opclassesMap);
      if (opclassVals.length > 0) {
        if (columns.length === opclassVals.length && new Set(opclassVals).size === 1) {
          opclasses = opclassVals[0];
        } else {
          opclasses = opclassesMap;
        }
      }

      let orders: Record<string, string> | string | undefined;
      const orderVals = Object.values(ordersMap);
      if (orderVals.length > 0) {
        if (columns.length === orderVals.length && new Set(orderVals).size === 1) {
          orders = orderVals[0];
        } else {
          orders = ordersMap;
        }
      }

      return {
        table: row.table_name as string,
        name: row.index_name as string,
        unique: row.is_unique as boolean,
        columns,
        using: row.using as string,
        orders,
        opclasses,
        include,
        where,
        nullsNotDistinct,
      };
    });
  }

  async indexNameExists(tableName: string, indexName: string): Promise<boolean> {
    const table = this.pgQuotedScope(tableName, "BASE TABLE");
    const idxName = this.quoteLiteral(indexName);
    const rows = await this.schemaQuery(`
      SELECT COUNT(*) AS cnt
      FROM pg_class t
      INNER JOIN pg_index d ON t.oid = d.indrelid
      INNER JOIN pg_class i ON d.indexrelid = i.oid
      LEFT JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE i.relkind IN ('i', 'I')
        AND i.relname = ${idxName}
        AND t.relname = ${table.name}
        AND n.nspname = ${table.schema}
    `);
    return Number(rows[0].cnt) > 0;
  }

  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const { schema, table } = this.parseSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    // Order by the column's position within the index key array so
    // composite PKs come back in declaration order, not the
    // non-deterministic order pg_attribute happens to yield rows.
    // `array_position(i.indkey, a.attnum)` gives each column's
    // 1-based position inside the index definition.
    const rows = await this.schemaQuery(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE ${tableCondition}
         AND i.indisprimary = true
       ORDER BY array_position(i.indkey, a.attnum)`,
      binds,
    );

    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0].attname as string;
    return rows.map((r) => r.attname as string);
  }

  async pkAndSequenceFor(
    tableName: string,
  ): Promise<[string, { schema: string; name: string }] | null> {
    const { schema, table } = this.parseSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    const rows = await this.schemaQuery(
      `SELECT a.attname AS pk,
              pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(t.relname), a.attname) AS seq,
              pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
              n.nspname AS schema_name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       LEFT JOIN pg_attrdef ad ON ad.adrelid = t.oid AND ad.adnum = a.attnum
       WHERE ${tableCondition}
         AND i.indisprimary = true
       LIMIT 1`,
      binds,
    );

    if (rows.length === 0) return null;

    const pk = rows[0].pk as string;
    const tableSchema = rows[0].schema_name as string;
    let seqSchema: string;
    let seqName: string;

    if (rows[0].seq) {
      const fullSeq = rows[0].seq as string;
      const parts = splitQuotedIdentifier(fullSeq);
      if (parts.length > 1) {
        seqSchema = parts[0];
        seqName = parts[1];
      } else {
        seqSchema = tableSchema;
        seqName = parts[0];
      }
    } else {
      const defaultExpr = rows[0].default_expr as string | null;
      if (defaultExpr) {
        const match = defaultExpr.match(/nextval\('([^']+)'::regclass\)/);
        if (match) {
          const seqRef = match[1];
          const parts = splitQuotedIdentifier(seqRef);
          if (parts.length > 1) {
            seqSchema = parts[0];
            seqName = parts[1];
          } else {
            seqSchema = tableSchema;
            seqName = parts[0];
          }
        } else {
          return null;
        }
      } else {
        return null;
      }
    }

    return [pk, { schema: seqSchema, name: seqName }];
  }

  async resetPkSequence(tableName: string): Promise<void> {
    const result = await this.pkAndSequenceFor(tableName);
    if (!result) return;
    const [pk, seq] = result;
    const qualifiedTable = this.quoteTableName(tableName);
    const qi = (s: string) => this.quoteIdentifier(s);
    const seqName = `${seq.schema}.${seq.name}`;

    const maxRows = await this.schemaQuery(
      `SELECT COALESCE(MAX(${qi(pk)}), 0) AS max_val FROM ${qualifiedTable}`,
    );
    const maxVal = Number(maxRows[0].max_val);
    if (maxVal === 0) {
      await this.schemaQuery(`SELECT setval($1::regclass, 1, false)`, [
        this.quoteTableName(seqName),
      ]);
    } else {
      await this.schemaQuery(`SELECT setval($1::regclass, $2, true)`, [
        this.quoteTableName(seqName),
        maxVal,
      ]);
    }
  }

  async setPkSequence(tableName: string, value: number): Promise<void> {
    const result = await this.pkAndSequenceFor(tableName);
    if (!result) return;
    const [, seq] = result;
    const seqName = `${seq.schema}.${seq.name}`;
    await this.schemaQuery(`SELECT setval($1::regclass, $2)`, [
      this.quoteTableName(seqName),
      value,
    ]);
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    const { schema } = this.parseSchemaQualifiedName(tableName);
    const qualifiedOld = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(oldName)}`
      : this.quoteIdentifier(oldName);
    await this.exec(`ALTER INDEX ${qualifiedOld} RENAME TO ${this.quoteIdentifier(newName)}`);
  }

  async columns(tableName: string): Promise<Column[]> {
    const { schema, table } = this.parseSchemaQualifiedName(tableName);

    let tableCondition: string;
    const binds: unknown[] = [];

    if (schema) {
      binds.push(table, schema);
      tableCondition = `t.relname = $1 AND n.nspname = $2`;
    } else {
      binds.push(tableName);
      tableCondition = `t.oid = to_regclass($1)`;
    }

    const rows = await this.schemaQuery(
      `SELECT a.attname AS name,
              pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
              pg_get_expr(d.adbin, d.adrelid) AS "default",
              a.attnotnull AS notnull,
              (i.indisprimary IS TRUE) AS is_primary,
              a.atttypid AS oid,
              a.atttypmod AS fmod,
              a.attidentity AS identity,
              a.attgenerated AS attgenerated
       FROM pg_attribute a
       JOIN pg_class t ON t.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       LEFT JOIN pg_index i
         ON i.indrelid = a.attrelid
        AND i.indisprimary
        AND a.attnum = ANY(i.indkey)
       WHERE ${tableCondition}
         AND a.attnum > 0
         AND NOT a.attisdropped
       ORDER BY a.attnum`,
      binds,
    );

    // Mirrors Rails' load_additional_types batch call: gather all OIDs not
    // yet in the map and load them in a single pg_type query before building
    // Column objects. This avoids N concurrent queries for wide tables.
    const missingOids = [
      ...new Set(rows.map((r) => Number(r.oid)).filter((oid) => !this.typeMap.has(oid))),
    ];
    if (missingOids.length > 0) {
      await this.loadAdditionalTypes(missingOids);
      // Mirrors Rails' get_oid_type fallback: register any OIDs still absent
      // after the pg_type query so repeated columns() calls don't re-query.
      for (const oid of missingOids) {
        if (!this.typeMap.has(oid)) {
          console.warn(`unknown OID ${oid}: unrecognized column type, treating as generic value.`);
          this.typeMap.registerType(oid, new ValueType());
        }
      }
    }

    return rows.map((r) => {
      const sqlType = r.type as string;
      const oid = Number(r.oid);
      const fmod = Number(r.fmod);
      // All OIDs are now registered (or warned as unknown) by the batch
      // load above. lookupCastTypeFromColumn mirrors Rails' fetch_type_metadata
      // after get_oid_type has pre-populated the map.
      const castType = this.lookupCastTypeFromColumn({ oid, fmod, sqlType });
      const rawDefault = (r.default as string | null) ?? null;
      const identity = (r.identity as string | null) || null;
      const attgenerated = (r.attgenerated as string | null) || null;
      // Mirrors Rails new_column_from_field: generated columns store the
      // generation expression as defaultFunction; regular columns split into
      // literal default vs. default function (nextval, CURRENT_TIMESTAMP, etc.).
      const splitDefault = attgenerated ? null : splitPgDefault(rawDefault);
      const defaultFunction = attgenerated ? rawDefault : (splitDefault?.fn ?? null);
      const rawLiteral = attgenerated ? null : (splitDefault?.literal ?? null);
      const literal = rawLiteral !== null ? castType.deserialize(rawLiteral) : null;
      const isSerial = typeof rawDefault === "string" && rawDefault.startsWith("nextval(");

      return new Column(
        r.name as string,
        literal,
        {
          sqlType,
          type: castType.type(),
          oid,
          fmod,
          limit: castType.limit ?? null,
          precision: castType.precision ?? null,
          scale: castType.scale ?? null,
        },
        !(r.notnull as boolean),
        {
          defaultFunction: defaultFunction ?? undefined,
          primaryKey: r.is_primary as boolean,
          serial: isSerial,
          array: sqlType.endsWith("[]"),
          identity,
          generated: attgenerated,
        },
      );
    });
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): Promise<void> {
    this.clearCacheBang();
    const quotedTable = this.quoteTableName(tableName);
    const pgType = this.typeToSql(type, {
      ...options,
      precision: options.precision ?? undefined,
    });

    const quotedCol = this.quoteIdentifier(columnName);
    let usingClause = "";
    if (options.using) {
      usingClause = ` USING ${options.using}`;
    } else if (options.castAs) {
      const castType = this.typeToSql(options.castAs, {
        limit: options.limit,
        precision: options.precision ?? undefined,
        scale: options.scale,
      });
      if (options.array) {
        usingClause = ` USING ARRAY[CAST(${quotedCol} AS ${castType})]`;
      } else {
        usingClause = ` USING CAST(${quotedCol} AS ${castType})`;
      }
    }

    await this.exec(
      `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} TYPE ${pgType}${usingClause}`,
    );

    if (options.default !== undefined) {
      if (options.default === null) {
        await this.exec(`ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP DEFAULT`);
      } else {
        const defaultExpr = pgQuoteDefaultExpression(
          options.default,
          { array: options.array, sqlType: pgType },
          this.typeMap,
        );
        // pgQuoteDefaultExpression returns " DEFAULT value" — strip the prefix
        const defaultValue = defaultExpr.replace(/^ DEFAULT /, "");
        await this.exec(
          `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT ${defaultValue}`,
        );
      }
    }

    if (options.null !== undefined) {
      if (options.null) {
        await this.exec(`ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP NOT NULL`);
      } else {
        await this.exec(`ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET NOT NULL`);
      }
    }
  }

  // createJoinTable override: bypasses the callback-first createTable API by
  // routing through schemaStatements().createTable, which uses the abstract
  // options-first form and builds a real TableDefinition with correct column
  // options (null: false) and full DSL support for the definer callback.
  async createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: AbstractTableDefinition) => void),
    fn?: (t: AbstractTableDefinition) => void,
  ): Promise<void> {
    let opts: JoinTableOptions = {};
    let definer: ((t: AbstractTableDefinition) => void) | undefined;
    if (typeof options === "function") {
      definer = options;
    } else if (options) {
      opts = options;
      definer = fn;
    }
    const joinName = opts.tableName ?? deriveJoinTableName(table1, table2);
    const { columnOptions = {}, tableName: _t, ...tableOpts } = opts;
    const mergedColOpts = { null: false, index: false, ...columnOptions };
    const t1Ref = this.referenceNameForTable(table1);
    const t2Ref = this.referenceNameForTable(table2);
    const ss = this.schemaStatements(this as unknown as DatabaseAdapter);
    await ss.createTable(joinName, { ...tableOpts, id: false }, (td) => {
      td.references(t1Ref, mergedColOpts);
      td.references(t2Ref, mergedColOpts);
      if (definer) definer(td as unknown as AbstractTableDefinition);
    });
  }

  // SimpleTableBuilder is narrower than TableDefinition; suppress the override error.
  // @ts-expect-error TS2416
  async createTable(
    tableName: string,
    options: { id?: boolean | "uuid" } | ((t: SimpleTableBuilder) => void) = {},
    fn?: (t: SimpleTableBuilder) => void,
  ): Promise<void> {
    const opts = typeof options === "function" ? {} : options;
    const callback = typeof options === "function" ? options : fn;
    const table = new SimpleTableBuilder(this);
    if (opts.id !== false) {
      if (typeof opts.id === "string" && opts.id === "uuid") {
        table.column("id", "uuid default gen_random_uuid() primary key");
      } else {
        table.column("id", "serial primary key");
      }
    }
    if (callback) callback(table);
    const quotedTable = this.quoteTableName(tableName);
    const columnDefs = table.getColumns().map((c) => `${this.quoteIdentifier(c.name)} ${c.type}`);
    await this.exec(`CREATE TABLE ${quotedTable} (${columnDefs.join(", ")})`);
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: string,
    options: {
      comment?: string | null;
      default?: unknown;
      null?: boolean;
      array?: boolean;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
      ifNotExists?: boolean;
    } = {},
  ): Promise<void> {
    const quotedTable = this.quoteTableName(tableName);
    const quotedCol = this.quoteIdentifier(columnName);

    // Mirrors Rails PG `new_column_definition`: when `type == :virtual`,
    // resolve the real type from `options[:type]` and pass `as`/`stored`
    // through to `add_column_options!`. All other options (`null`,
    // `default`, `comment`) flow through the standard pipeline.
    let effectiveType = type;
    let generatedClause = "";
    if (type === "virtual") {
      const opts = options as Record<string, unknown>;
      effectiveType = (opts["type"] as string | undefined) ?? "string";
      generatedClause = _pgGeneratedClause(
        columnName,
        opts["as"] as string | undefined,
        opts["stored"] as boolean | undefined,
      );
    }

    const resolvedPrecision =
      effectiveType === "datetime" && options.precision === undefined
        ? 6
        : (options.precision ?? undefined);
    const pgType = this.typeToSql(effectiveType, {
      ...options,
      precision: resolvedPrecision,
      limit: options.limit ?? undefined,
      scale: options.scale ?? undefined,
    });
    let colSql = `${quotedCol} ${pgType}${generatedClause}`;
    if (options.default !== undefined) {
      const defaultClause = pgQuoteDefaultExpression(
        options.default,
        { array: options.array, sqlType: pgType },
        this.typeMap,
      );
      colSql += options.default === null ? " DEFAULT NULL" : defaultClause;
    }
    if (options.null === false) colSql += " NOT NULL";
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    await this.exec(`ALTER TABLE ${quotedTable} ADD COLUMN${ifNotExists} ${colSql}`);
    if (options.comment !== undefined) {
      await this.changeColumnComment(tableName, columnName, options.comment ?? null);
    }
  }

  async renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void> {
    await this.exec(
      `ALTER TABLE ${this.quoteTableName(tableName)} RENAME COLUMN ${this.quoteIdentifier(columnName)} TO ${this.quoteIdentifier(newColumnName)}`,
    );
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    const quotedTable = this.quoteTableName(tableName);
    const quotedCol = this.quoteIdentifier(columnName);
    const defaultValue =
      defaultOrChanges !== null &&
      typeof defaultOrChanges === "object" &&
      "from" in (defaultOrChanges as object) &&
      "to" in (defaultOrChanges as object)
        ? (defaultOrChanges as { from: unknown; to: unknown }).to
        : defaultOrChanges;
    if (defaultValue == null) {
      await this.exec(`ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP DEFAULT`);
    } else {
      const col = (await this.columns(tableName)).find((c) => (c as Column).name === columnName);
      const clause = pgQuoteDefaultExpression(
        defaultValue,
        {
          array: (col as Column | undefined)?.array,
          sqlType: (col as Column | undefined)?.sqlType ?? undefined,
        },
        this.typeMap,
      );
      const expr = clause.startsWith(" DEFAULT ") ? clause.slice(" DEFAULT ".length) : clause;
      await this.exec(`ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT ${expr}`);
    }
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
    void tableName;
    const cd = new ColumnDefinition(columnName, type as ColumnType, options);
    cd.sqlType = this.typeToSql(type, options);
    return new ChangeColumnDefinition(cd, columnName);
  }

  async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined> {
    const col = (await this.columns(tableName)).find((c) => c.name === columnName);
    if (!col) return undefined;
    const defaultValue =
      defaultOrChanges !== null &&
      typeof defaultOrChanges === "object" &&
      "to" in (defaultOrChanges as object)
        ? (defaultOrChanges as { to: unknown }).to
        : defaultOrChanges;
    const semanticType = (col.type ?? "string") as ColumnType;
    const cd = new ColumnDefinition(columnName, semanticType, { array: col.array || undefined });
    cd.sqlType = col.sqlType ?? undefined;
    return new ChangeColumnDefaultDefinition(cd, defaultValue);
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    nullable: boolean,
    defaultValue: unknown = null,
  ): Promise<void> {
    const quotedTable = this.quoteTableName(tableName);
    const quotedCol = this.quoteIdentifier(columnName);
    if (!nullable && defaultValue != null) {
      const col = (await this.columns(tableName)).find((c) => (c as Column).name === columnName);
      const clause = pgQuoteDefaultExpression(
        defaultValue,
        {
          array: (col as Column | undefined)?.array,
          sqlType: (col as Column | undefined)?.sqlType ?? undefined,
        },
        this.typeMap,
      );
      const expr = clause.startsWith(" DEFAULT ") ? clause.slice(" DEFAULT ".length) : clause;
      await this.exec(
        `UPDATE ${quotedTable} SET ${quotedCol} = ${expr} WHERE ${quotedCol} IS NULL`,
      );
    }
    await this.exec(
      `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} ${nullable ? "DROP" : "SET"} NOT NULL`,
    );
  }

  async changeColumnComment(
    tableName: string,
    columnName: string,
    comment: string | null,
  ): Promise<void> {
    await this.exec(
      `COMMENT ON COLUMN ${this.quoteTableName(tableName)}.${this.quoteIdentifier(columnName)} IS ${this.quote(comment)}`,
    );
  }

  async changeTableComment(tableName: string, comment: string | null): Promise<void> {
    await this.exec(`COMMENT ON TABLE ${this.quoteTableName(tableName)} IS ${this.quote(comment)}`);
  }

  /** @internal */
  async validateConstraint(tableName: string, constraintName: string): Promise<void> {
    await this.exec(
      `ALTER TABLE ${this.quoteTableName(tableName)} VALIDATE CONSTRAINT ${this.quoteIdentifier(constraintName)}`,
    );
  }

  async validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string },
  ): Promise<void> {
    const name = typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name;
    await this.validateConstraint(tableName, name);
  }

  async validateForeignKey(
    fromTable: string,
    toTable?: string,
    options?: { name?: string },
  ): Promise<void> {
    if (options?.name) {
      await this.validateConstraint(fromTable, options.name);
      return;
    }
    if (!toTable) throw new ArgumentError("validateForeignKey requires toTable or options.name");
    const fks = await this.foreignKeys(fromTable);
    const { schema: toSchema, table: toTbl } = this.parseSchemaQualifiedName(toTable);
    const fk = (fks as any[]).find((f) => {
      const { schema: fSchema, table: fTbl } = this.parseSchemaQualifiedName(String(f.toTable));
      if (fTbl !== toTbl) return false;
      // When the FK record has no schema prefix (PostgreSQL omits "public." when it
      // is on the search_path), treat it as matching any schema lookup or "public".
      if (!fSchema) return !toSchema || toSchema === "public";
      return fSchema === toSchema;
    });
    if (!fk) throw new ArgumentError(`No foreign key found from ${fromTable} to ${toTable}`);
    await this.validateConstraint(fromTable, fk.name);
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
    const { limit, array, enumType } = options;
    let sql: string;
    switch (type) {
      case "binary":
        if (limit != null && (limit < 0 || limit > 0x3fffffff)) {
          throw new Error(
            `No binary type has byte size ${limit}. The limit on binary can be at most 1GB - 1 byte.`,
          );
        }
        sql = "bytea";
        break;
      case "text":
        if (limit != null && (limit < 0 || limit > 0x3fffffff)) {
          throw new Error(
            `No text type has byte size ${limit}. The limit on text can be at most 1GB - 1 byte.`,
          );
        }
        sql = "text";
        break;
      case "integer":
        if (limit === 1 || limit === 2) sql = "smallint";
        else if (limit == null || (limit >= 3 && limit <= 4)) sql = "integer";
        else if (limit >= 5 && limit <= 8) sql = "bigint";
        else
          throw new Error(
            `No integer type has byte size ${limit}. Use a numeric with scale 0 instead.`,
          );
        break;
      case "enum":
        if (!enumType) throw new Error("enumType is required for enums");
        sql = enumType;
        break;
      default: {
        const { precision, scale } = options;
        const native = this.nativeDatabaseTypes()[type];
        const baseName = native
          ? typeof native === "string"
            ? native
            : (native.name ?? type)
          : type;
        sql = baseName;
        if (type === "decimal") {
          if (precision != null) {
            sql += scale != null ? `(${precision},${scale})` : `(${precision})`;
          } else if (scale != null) {
            throw new Error(
              "Error adding decimal column: precision cannot be empty if scale is specified",
            );
          }
        } else if (["datetime", "timestamp", "time", "interval"].includes(type)) {
          if (precision != null) {
            if (precision < 0 || precision > 6)
              throw new Error(
                `No ${baseName} type has precision of ${precision}. The allowed range of precision is from 0 to 6`,
              );
            sql += `(${precision})`;
          }
        } else if (type !== "primary_key" && limit != null) {
          sql += `(${limit})`;
        }
      }
    }
    return array && type !== "primary_key" ? `${sql}[]` : sql;
  }

  foreignKeyColumnFor(tableName: string, columnName = "id"): string {
    const { table } = this.parseSchemaQualifiedName(tableName);
    return `${singularize(table)}_${columnName}`;
  }

  /** @internal */
  sequenceNameFromParts(tableName: string, columnName: string, suffix: string): string {
    const maxLen = 63;
    const { table: unqualifiedTable } = this.parseSchemaQualifiedName(tableName);
    let overLength = unqualifiedTable.length + columnName.length + suffix.length + 2 - maxLen;
    let col = columnName;
    let tbl = unqualifiedTable;
    if (overLength > 0) {
      const colMaxLen = Math.floor((maxLen - suffix.length - 2) / 2);
      const newColLen = Math.min(colMaxLen, col.length);
      overLength -= col.length - newColLen;
      col = col.slice(0, newColLen - Math.max(overLength, 0));
    }
    if (overLength > 0) {
      tbl = tbl.slice(0, tbl.length - overLength);
    }
    return `${tbl}_${col}_${suffix}`;
  }

  /** @internal */
  assertValidDeferrable(deferrable: unknown): void {
    if (
      deferrable == null ||
      deferrable === false ||
      deferrable === "immediate" ||
      deferrable === "deferred"
    )
      return;
    throw new ArgumentError(
      `deferrable must be \`"immediate"\` or \`"deferred"\`, got: \`${JSON.stringify(deferrable)}\``,
    );
  }

  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | "restrict" | undefined {
    switch (specifier) {
      case "c":
        return "cascade";
      case "n":
        return "nullify";
      case "r":
        return "restrict";
      default:
        return undefined;
    }
  }

  /** @internal */
  extractConstraintDeferrable(
    deferrable: boolean,
    deferred: boolean,
  ): "deferred" | "immediate" | false {
    return deferrable && (deferred ? "deferred" : "immediate");
  }

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    const scope = this.quotedScope(tableName);
    const rows = await this.schemaQuery(`
      SELECT t2.oid::regclass::text AS to_table, a1.attname AS column, a2.attname AS primary_key,
             c.conname AS name, c.confupdtype AS on_update, c.confdeltype AS on_delete,
             c.convalidated AS valid, c.condeferrable AS deferrable, c.condeferred AS deferred,
             c.conkey, c.confkey, c.conrelid, c.confrelid
      FROM pg_constraint c
      JOIN pg_class t1 ON c.conrelid = t1.oid
      JOIN pg_class t2 ON c.confrelid = t2.oid
      JOIN pg_attribute a1 ON a1.attnum = c.conkey[1] AND a1.attrelid = t1.oid
      JOIN pg_attribute a2 ON a2.attnum = c.confkey[1] AND a2.attrelid = t2.oid
      JOIN pg_namespace t3 ON c.connamespace = t3.oid
      WHERE c.contype = 'f'
        AND t1.relname = ${scope.name!}
        AND t3.nspname = ${scope.schema}
      ORDER BY c.conname
    `);
    return Promise.all(
      rows.map(async (row) => {
        const toTable = unquoteIdentifier(row.to_table as string);
        const conkey = String(row.conkey).replace(/[{}]/g, "").split(",").map(Number);
        const confkey = String(row.confkey).replace(/[{}]/g, "").split(",").map(Number);
        let column: string;
        let primaryKey: string;
        if (conkey.length > 1) {
          const cols = await this.columnNamesFromColumnNumbers(Number(row.conrelid), conkey);
          const pks = await this.columnNamesFromColumnNumbers(Number(row.confrelid), confkey);
          column = cols.join(",");
          primaryKey = pks.join(",");
        } else {
          column = unquoteIdentifier(row.column as string);
          primaryKey = row.primary_key as string;
        }
        return new ForeignKeyDefinition(
          tableName,
          toTable,
          column,
          primaryKey,
          row.name as string,
          this.extractForeignKeyAction(row.on_delete as string),
          this.extractForeignKeyAction(row.on_update as string),
          this.extractConstraintDeferrable(row.deferrable as boolean, row.deferred as boolean),
          (row.valid as boolean) ?? true,
        );
      }),
    );
  }

  async foreignTables(): Promise<string[]> {
    const rows = await this.schemaQuery(this.dataSourceSql(null, { type: "FOREIGN TABLE" }));
    return rows.map((r) => r.relname as string);
  }

  async foreignTableExists(tableName: string): Promise<boolean> {
    if (!tableName) return false;
    const rows = await this.schemaQuery(this.dataSourceSql(tableName, { type: "FOREIGN TABLE" }));
    return rows.length > 0;
  }

  quotedIncludeColumnsForIndex(columnNames: string | string[]): string {
    if (typeof columnNames === "string") return this.quoteIdentifier(columnNames);
    const quoted: Record<string, string> = {};
    for (const name of columnNames) {
      quoted[name] = this.quoteIdentifier(name);
    }
    return Object.values(quoted).join(", ");
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
    const { schema, table } = this.parseSchemaQualifiedName(name ?? "");
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
      schema: schema ? this.quoteLiteral(schema) : "ANY (current_schemas(false))",
      name: table ? this.quoteLiteral(table) : null,
      type,
    };
  }

  /** @internal */
  referenceNameForTable(tableName: string): string {
    const { table } = this.parseSchemaQualifiedName(tableName);
    return singularize(table);
  }

  /** @internal */
  async columnNamesFromColumnNumbers(tableOid: number, columnNumbers: number[]): Promise<string[]> {
    if (columnNumbers.length === 0) return [];
    if (!Number.isSafeInteger(tableOid)) throw new TypeError("tableOid must be a safe integer");
    const safeNums = columnNumbers.map((n) => {
      if (!Number.isSafeInteger(n))
        throw new TypeError("columnNumbers must contain only safe integers");
      return n;
    });
    const rows = await this.schemaQuery(
      `SELECT a.attnum, a.attname FROM pg_attribute a WHERE a.attrelid = ${tableOid} AND a.attnum IN (${safeNums.join(", ")})`,
    );
    const map = Object.fromEntries(rows.map((r) => [Number(r.attnum), r.attname as string]));
    return safeNums.map((n) => map[n]).filter(Boolean);
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    const { schema: oldSchema, table: unqualifiedOld } = this.parseSchemaQualifiedName(oldName);
    const { table: unqualifiedNew } = this.parseSchemaQualifiedName(newName);
    await this.exec(
      `ALTER TABLE ${this.quoteTableName(oldName)} RENAME TO ${this.quoteIdentifier(unqualifiedNew)}`,
    );
    const maxLen = await this.maxIdentifierLength();
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
      await this.exec(
        `ALTER INDEX IF EXISTS ${qualifiedOldIdx} RENAME TO ${this.quoteIdentifier(newIdx)}`,
      );
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

  async tables(): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT tablename FROM pg_tables WHERE schemaname = ANY(current_schemas(false)) ORDER BY tablename`,
    );
    return rows.map((r) => r.tablename as string);
  }

  /**
   * List views visible on the current search_path, including
   * materialized views. Mirrors Rails'
   * `ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaStatements#views`
   * which uses `data_source_sql(type: "VIEW")` — relkind IN ('v','m').
   * Plain `pg_views` would miss materialized views; querying `pg_class`
   * directly catches both.
   */
  async views(): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT c.relname FROM pg_class c
         LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ANY(current_schemas(false))
         AND c.relkind IN ('v', 'm')
         ORDER BY c.relname`,
    );
    return rows.map((r) => r.relname as string);
  }

  /**
   * Tables + views, deduped. Mirrors AbstractAdapter#data_sources. The
   * name is what SchemaCache.addAll queries to build the initial
   * dump — without this method the PG adapter is rejected by
   * DatabaseTasks.dumpSchemaCache's capability check.
   */
  async dataSources(): Promise<string[]> {
    const [tables, views] = await Promise.all([this.tables(), this.views()]);
    return Array.from(new Set([...tables, ...views]));
  }

  /**
   * Table-only existence check (no views). Mirrors Rails'
   * `table_exists?` vs `data_source_exists?` distinction: a table is a
   * data source but a data source isn't always a table. SchemaCache
   * uses dataSourceExists; tableExists is here for callers that
   * specifically need to exclude views (e.g. `drop_table`).
   */
  async tableExists(name: string): Promise<boolean> {
    // Rails' relkind 'r' + 'p' (plain + partitioned tables) — matches
    // `data_source_sql(name, type: "BASE TABLE")` in
    // `PostgreSQL::SchemaStatements#quoted_scope`.
    return this.relkindExists(name, ["r", "p"]);
  }

  /**
   * View-only existence check. Mirrors Rails'
   * `SchemaStatements#view_exists?` which treats both views and
   * materialized views as "view".
   */
  async viewExists(name: string): Promise<boolean> {
    return this.relkindExists(name, ["v", "m"]);
  }

  /**
   * Shared helper for table/view existence checks — lets both
   * methods share Rails' pg_class-based predicate. Uses
   * `SELECT 1 ... LIMIT 1` so the planner short-circuits instead of
   * counting every match.
   */
  private async relkindExists(name: string, relkinds: string[]): Promise<boolean> {
    const { schema, table } = this.parseSchemaQualifiedName(name);
    if (schema) {
      // $1=schema, $2=table, $3..=relkinds
      const relPlaceholders = relkinds.map((_, i) => `$${i + 3}`).join(", ");
      const rows = await this.schemaQuery(
        `SELECT 1 AS one FROM pg_class c
           LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2
           AND c.relkind IN (${relPlaceholders})
           LIMIT 1`,
        [schema, table, ...relkinds],
      );
      return rows.length > 0;
    }
    // $1=table, $2..=relkinds. Bind `table` (the unquoted identifier
    // returned by parseSchemaQualifiedName), not the raw `name`
    // argument — otherwise a quoted input like `"widgets"` gets
    // compared against `relname = '"widgets"'` in pg_class, which
    // never matches (the catalog stores names unquoted).
    const relPlaceholders = relkinds.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await this.schemaQuery(
      `SELECT 1 AS one FROM pg_class c
         LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ANY(current_schemas(false))
         AND c.relname = $1 AND c.relkind IN (${relPlaceholders})
         LIMIT 1`,
      [table, ...relkinds],
    );
    return rows.length > 0;
  }

  // PG addIndex returns the generated SQL string for test/inspection purposes;
  // Rails add_index returns void. Harmonize in a follow-up.
  // @ts-expect-error TS2416 — return type is Promise<string> not Promise<void>
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
    } = {},
  ): Promise<string> {
    const cols = Array.isArray(columns) ? columns : [columns];
    const quotedTable = this.quoteTableName(tableName);

    const indexName =
      options.name ?? `index_${tableName.replace(/[."]/g, "_")}_on_${cols.join("_and_")}`;

    if (options.algorithm && options.algorithm !== "concurrently") {
      throw new Error(`Unknown algorithm: ${options.algorithm}. Only 'concurrently' is supported.`);
    }
    if (options.algorithm === "concurrently" && this._inTransaction) {
      throw new Error("CREATE INDEX CONCURRENTLY cannot run inside a transaction");
    }

    const unique = options.unique ? "UNIQUE " : "";
    const concurrently = options.algorithm === "concurrently" ? "CONCURRENTLY " : "";
    const ifNotExists = options.ifNotExists ? "IF NOT EXISTS " : "";
    const using = options.using ? ` USING ${options.using}` : "";

    const colDefs = cols.map((col) => {
      const isExpression = col.includes("(") || col.includes(" ");
      let result = isExpression ? col : this.quoteIdentifier(col);
      if (options.opclass) {
        const op = options.opclass[col];
        if (op) result += ` ${op}`;
      }
      if (options.order) {
        if (typeof options.order === "string") {
          result += ` ${options.order}`;
        } else {
          const o = options.order[col];
          if (o) result += ` ${o.toUpperCase()}`;
        }
      }
      return result;
    });

    let sql = `CREATE ${unique}INDEX ${concurrently}${ifNotExists}${this.quoteIdentifier(indexName)} ON ${quotedTable}${using} (${colDefs.join(", ")})`;

    if (options.include) {
      sql += ` INCLUDE (${options.include.map((c) => this.quoteIdentifier(c)).join(", ")})`;
    }
    if (options.nullsNotDistinct) {
      sql += " NULLS NOT DISTINCT";
    }
    if (options.where) {
      sql += ` WHERE ${options.where}`;
    }

    await this.exec(sql);
    return sql;
  }

  async removeIndex(
    tableName: string,
    options: { name: string; algorithm?: string },
  ): Promise<void> {
    if (!options.name) {
      throw new Error("Index name is required to remove an index");
    }
    if (options.algorithm && options.algorithm !== "concurrently") {
      throw new Error(`Unknown algorithm: ${options.algorithm}. Only 'concurrently' is supported.`);
    }
    if (options.algorithm === "concurrently" && this._inTransaction) {
      throw new Error("DROP INDEX CONCURRENTLY cannot run inside a transaction");
    }
    const concurrently = options.algorithm === "concurrently" ? " CONCURRENTLY" : "";
    const { schema } = this.parseSchemaQualifiedName(tableName);
    const qualifiedIndex = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(options.name)}`
      : this.quoteIdentifier(options.name);
    await this.exec(`DROP INDEX${concurrently} ${qualifiedIndex}`);
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: {
      column?: string;
      primaryKey?: string;
      name?: string;
      onDelete?: ReferentialAction;
      onUpdate?: ReferentialAction;
      deferrable?: "immediate" | "deferred";
      validate?: boolean;
    } = {},
  ): Promise<void> {
    this.assertValidDeferrable(options.deferrable);
    const { schema: fromSchema, table: fromTbl } = this.parseSchemaQualifiedName(fromTable);
    const { schema: toSchema, table: toTbl } = this.parseSchemaQualifiedName(toTable);

    const column = options.column ?? `${underscore(singularize(toTbl))}_id`;
    const pk = options.primaryKey ?? "id";
    const name = options.name ?? `fk_rails_${fromTbl}_${column}`;

    const qi = (s: string) => this.quoteIdentifier(s);
    const qualifiedFrom = fromSchema ? `${qi(fromSchema)}.${qi(fromTbl)}` : qi(fromTbl);
    const qualifiedTo = toSchema ? `${qi(toSchema)}.${qi(toTbl)}` : qi(toTbl);
    const sc = this.schemaCreation;

    let sql = `ALTER TABLE ${qualifiedFrom} ADD CONSTRAINT ${qi(name)} FOREIGN KEY (${qi(column)}) REFERENCES ${qualifiedTo} (${qi(pk)})`;
    if (options.onDelete) sql += ` ${sc.actionSql("DELETE", options.onDelete)}`;
    if (options.onUpdate) sql += ` ${sc.actionSql("UPDATE", options.onUpdate)}`;
    sql += this.deferrable(options.deferrable);
    if (options.validate === false) sql += " NOT VALID";

    await this.exec(sql);
  }

  async foreignKeyExists(fromTable: string, toTable: string): Promise<boolean> {
    const { schema: fromSchema, table: fromTbl } = this.parseSchemaQualifiedName(fromTable);
    const { schema: toSchema, table: toTbl } = this.parseSchemaQualifiedName(toTable);

    let fromSchemaCondition: string;
    let toSchemaCondition: string;
    const binds: unknown[] = [fromTbl];
    let idx = 1;

    if (fromSchema) {
      idx++;
      fromSchemaCondition = `tc.table_schema = $${idx}`;
      binds.push(fromSchema);
    } else {
      fromSchemaCondition = `tc.table_schema = ANY(current_schemas(false))`;
    }

    binds.push(toTbl);
    idx = binds.length;

    if (toSchema) {
      binds.push(toSchema);
      toSchemaCondition = `tc2.table_schema = $${binds.length}`;
    } else {
      toSchemaCondition = `tc2.table_schema = ANY(current_schemas(false))`;
    }

    const rows = await this.schemaQuery(
      `SELECT COUNT(*) AS count
       FROM information_schema.table_constraints tc
       JOIN information_schema.referential_constraints rc
         ON tc.constraint_name = rc.constraint_name
         AND tc.constraint_schema = rc.constraint_schema
       JOIN information_schema.table_constraints tc2
         ON rc.unique_constraint_name = tc2.constraint_name
         AND rc.unique_constraint_schema = tc2.constraint_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = $1
         AND ${fromSchemaCondition}
         AND tc2.table_name = $${idx}
         AND ${toSchemaCondition}`,
      binds,
    );
    return Number(rows[0].count) > 0;
  }

  // Mirrors: ReferentialIntegrity#check_all_foreign_keys_valid!
  // Rails uses `transaction(requires_new: true)` — a savepoint when already
  // inside a transaction, or a fresh BEGIN otherwise.
  async checkAllForeignKeysValidBang(): Promise<void> {
    if (this.inTransaction || this.isTransactionOpen()) {
      // Materialize any lazy transaction so the savepoint lands inside the
      // real PG transaction (mirrors Rails' transaction(requires_new: true)).
      await this.materializeTransactions();
      // Mirror Rails' savepoint naming: "active_record_#{stack.size}" (transaction.rb:528).
      // Using openTransactions+1 makes repeated calls in the same transaction safe.
      const sp = `active_record_${this.openTransactions + 1}`;
      await this.createSavepoint(sp);
      try {
        await this.execute(CHECK_ALL_FOREIGN_KEYS_SQL);
        await this.releaseSavepoint(sp);
      } catch (e) {
        await this.rollbackToSavepoint(sp);
        await this.releaseSavepoint(sp).catch(() => {});
        throw e;
      }
    } else {
      await this.beginTransaction();
      try {
        await this.execute(CHECK_ALL_FOREIGN_KEYS_SQL);
        await this.commit();
      } catch (e) {
        await this.rollback();
        throw e;
      }
    }
  }

  async createDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    const encoding = options.encoding ?? "utf8";
    let optionString = ` ENCODING = ${this.quoteLiteral(encoding)}`;
    if (options.collation) optionString += ` LC_COLLATE = ${this.quoteLiteral(options.collation)}`;
    if (options.ctype) optionString += ` LC_CTYPE = ${this.quoteLiteral(options.ctype)}`;
    if (options.owner) optionString += ` OWNER = ${this.quoteIdentifier(options.owner)}`;
    if (options.template) optionString += ` TEMPLATE = ${this.quoteIdentifier(options.template)}`;
    if (options.tablespace)
      optionString += ` TABLESPACE = ${this.quoteIdentifier(options.tablespace)}`;
    if (options.connectionLimit != null) {
      const limit = options.connectionLimit;
      if (!Number.isInteger(limit) || (limit < 0 && limit !== -1)) {
        throw new Error(
          `connectionLimit must be -1 (unlimited) or a non-negative integer, got: ${limit}`,
        );
      }
      optionString += ` CONNECTION LIMIT = ${limit}`;
    }
    await this.exec(`CREATE DATABASE ${this.quoteIdentifier(name)}${optionString}`);
  }

  // ---------------------------------------------------------------------------
  // Enum types
  // ---------------------------------------------------------------------------

  async createEnum(
    name: string,
    values: string[],
    _options?: Record<string, unknown>,
  ): Promise<void> {
    const { schema, table: enumName } = this.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(enumName)}`
      : this.quoteIdentifier(enumName);
    const valueList = values.map((v) => this.quoteLiteral(v)).join(", ");
    await this.exec(`CREATE TYPE ${qualifiedName} AS ENUM (${valueList})`);
  }

  async dropEnum(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const { schema, table: enumName } = this.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(enumName)}`
      : this.quoteIdentifier(enumName);
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.exec(`DROP TYPE${ifExists} ${qualifiedName}`);
  }

  // ---------------------------------------------------------------------------
  // Range types
  // ---------------------------------------------------------------------------

  async createRange(
    name: string,
    options: { subtype: string; subtypeDiff?: string },
  ): Promise<void> {
    const { schema, table: rangeName } = this.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(rangeName)}`
      : this.quoteIdentifier(rangeName);
    const quoteQualifiedIdentifier = (identifier: string, param: string) => {
      if (/[\s()]/.test(identifier)) {
        throw new Error(
          `PostgreSQLAdapter#createRange: ${param} must be a simple or schema-qualified identifier ` +
            `(e.g. "float8", "myschema.mytype"). Use the single-word alias instead of "${identifier}".`,
        );
      }
      const parts = splitQuotedIdentifier(identifier);
      if (parts.length === 0 || parts.length > 2) {
        throw new Error(
          `PostgreSQLAdapter#createRange: ${param} must have 1 or 2 dot-separated parts, got ${parts.length}: "${identifier}".`,
        );
      }
      const { schema: s, table: t } = this.parseSchemaQualifiedName(identifier);
      return s ? `${this.quoteIdentifier(s)}.${this.quoteIdentifier(t)}` : this.quoteIdentifier(t);
    };
    const parts = [`SUBTYPE = ${quoteQualifiedIdentifier(options.subtype, "subtype")}`];
    if (options.subtypeDiff) {
      parts.push(`SUBTYPE_DIFF = ${quoteQualifiedIdentifier(options.subtypeDiff, "subtypeDiff")}`);
    }
    await this.exec(`CREATE TYPE ${qualifiedName} AS RANGE (${parts.join(", ")})`);
  }

  async dropRange(name: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const { schema, table: rangeName } = this.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(rangeName)}`
      : this.quoteIdentifier(rangeName);
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.exec(`DROP TYPE${ifExists} ${qualifiedName}`);
  }

  async renameEnum(name: string, newNameOrOptions: string | { to: string }): Promise<void> {
    const newName = typeof newNameOrOptions === "string" ? newNameOrOptions : newNameOrOptions.to;
    const { schema: newSchema } = this.parseSchemaQualifiedName(newName);
    if (newSchema) {
      throw new Error(
        "PostgreSQLAdapter#renameEnum does not support changing enum schema; pass an unqualified type name.",
      );
    }
    const { schema, table: enumName } = this.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(enumName)}`
      : this.quoteIdentifier(enumName);
    await this.exec(`ALTER TYPE ${qualifiedName} RENAME TO ${this.quoteIdentifier(newName)}`);
  }

  async addEnumValue(
    name: string,
    value: string,
    options: { before?: string; after?: string; ifNotExists?: boolean } = {},
  ): Promise<void> {
    const { schema, table: enumName } = this.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(enumName)}`
      : this.quoteIdentifier(enumName);
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    if (options.before && options.after) {
      throw new Error("Cannot specify both `before` and `after` for addEnumValue");
    }
    let position = "";
    if (options.before) {
      position = ` BEFORE ${this.quoteLiteral(options.before)}`;
    } else if (options.after) {
      position = ` AFTER ${this.quoteLiteral(options.after)}`;
    }
    await this.exec(
      `ALTER TYPE ${qualifiedName} ADD VALUE${ifNotExists} ${this.quoteLiteral(value)}${position}`,
    );
  }

  async renameEnumValue(name: string, options: { from: string; to: string }): Promise<void> {
    const { schema, table: enumName } = this.parseSchemaQualifiedName(name);
    const qualifiedName = schema
      ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(enumName)}`
      : this.quoteIdentifier(enumName);
    await this.exec(
      `ALTER TYPE ${qualifiedName} RENAME VALUE ${this.quoteLiteral(options.from)} TO ${this.quoteLiteral(options.to)}`,
    );
  }

  async enumValues(name: string): Promise<string[]> {
    const { schema, table: enumName } = this.parseSchemaQualifiedName(name);
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

  private parseSchemaQualifiedName(name: string): {
    schema: string | null;
    table: string;
  } {
    const pgName = Utils.extractSchemaQualifiedName(name);
    return { schema: pgName.schema, table: pgName.identifier };
  }

  override quoteIdentifier(name: string): string {
    return pgQuoteColumnName(name);
  }

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
    if (value instanceof Uint8Array) return pgQuotedBinary(value);
    if (value instanceof ArrayBuffer) return pgQuotedBinary(new Uint8Array(value));
    if (typeof value === "string") return pgQuotedBinary(value);
    throw new TypeError(
      `quotedBinary expects Uint8Array, ArrayBuffer, Buffer, or string; got ${
        value === null ? "null" : typeof value
      }`,
    );
  }

  private quoteSchemaName(name: string): string {
    return pgQuoteColumnName(name);
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
  }

  async dropDatabase(name: string): Promise<void> {
    await this.exec(`DROP DATABASE IF EXISTS ${this.quoteIdentifier(name)}`);
  }

  async recreateDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<void> {
    await this.dropDatabase(name);
    await this.createDatabase(name, options);
  }

  override schemaStatements(host?: DatabaseAdapter): SchemaStatements {
    return new PostgreSQLSchemaStatements((host ?? this) as unknown as DatabaseAdapter);
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
    const rows = await this.schemaQuery("SELECT current_database() AS name");
    return rows[0].name as string;
  }

  async encoding(): Promise<string> {
    const rows = await this.schemaQuery(
      "SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = current_database()",
    );
    return rows[0].enc as string;
  }

  async collation(): Promise<string> {
    const rows = await this.schemaQuery(
      "SELECT datcollate AS col FROM pg_database WHERE datname = current_database()",
    );
    return rows[0].col as string;
  }

  async ctype(): Promise<string> {
    const rows = await this.schemaQuery(
      "SELECT datctype AS ct FROM pg_database WHERE datname = current_database()",
    );
    return rows[0].ct as string;
  }

  async schemaSearchPath(): Promise<string> {
    const rows = await this.schemaQuery("SHOW search_path");
    return rows[0].search_path as string;
  }

  async setSchemaSearchPath(searchPath: string | null): Promise<void> {
    if (searchPath == null) return;
    // Mirrors Rails' schema_search_path= which uses direct interpolation:
    //   execute("SET search_path TO #{schema_csv}")
    // This means unquoted $user causes a PG parse error (dollar-quoted string),
    // matching Rails' behavior. Use '$user' (with single quotes) for the special token.
    await this.execute(`SET search_path TO ${searchPath}`);
  }

  async clientMinMessages(): Promise<string> {
    const rows = await this.schemaQuery("SHOW client_min_messages");
    return rows[0].client_min_messages as string;
  }

  async setClientMinMessages(level: string): Promise<void> {
    await this.exec(`SET client_min_messages TO ${this.quoteLiteral(level)}`);
  }

  async tableComment(tableName: string): Promise<string | null> {
    const { schema, name } = this.pgQuotedScope(tableName, "BASE TABLE");
    if (!name) return null;
    const rows = await this.schemaQuery(`
      SELECT pg_catalog.obj_description(c.oid, 'pg_class') AS comment
      FROM pg_catalog.pg_class c
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ${name}
        AND c.relkind IN ('r','p')
        AND n.nspname = ${schema}
    `);
    return (rows[0]?.comment as string | null) ?? null;
  }

  async tablePartitionDefinition(tableName: string): Promise<string | null> {
    const { schema, name } = this.pgQuotedScope(tableName, "BASE TABLE");
    if (!name) return null;
    const rows = await this.schemaQuery(`
      SELECT pg_catalog.pg_get_partkeydef(c.oid) AS def
      FROM pg_catalog.pg_class c
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ${name}
        AND c.relkind IN ('r','p')
        AND n.nspname = ${schema}
    `);
    return (rows[0]?.def as string | null) ?? null;
  }

  async inheritedTableNames(tableName: string): Promise<string[]> {
    const { schema, name } = this.pgQuotedScope(tableName, "BASE TABLE");
    if (!name) return [];
    const rows = await this.schemaQuery(`
      SELECT parent.relname AS name
      FROM pg_catalog.pg_inherits i
      JOIN pg_catalog.pg_class child  ON i.inhrelid  = child.oid
      JOIN pg_catalog.pg_class parent ON i.inhparent = parent.oid
      LEFT JOIN pg_namespace n ON n.oid = child.relnamespace
      WHERE child.relname = ${name}
        AND child.relkind IN ('r','p')
        AND n.nspname = ${schema}
      ORDER BY i.inhseqno
    `);
    return rows.map((r) => r.name as string);
  }

  async tableOptions(tableName: string): Promise<Record<string, unknown>> {
    const options: Record<string, unknown> = {};
    const comment = await this.tableComment(tableName);
    if (comment !== null) options.comment = comment;
    const inherited = await this.inheritedTableNames(tableName);
    if (inherited.length > 0) {
      options.options = `INHERITS (${inherited.join(", ")})`;
    }
    if (!options.options && this.supportsNativePartitioning()) {
      const partDef = await this.tablePartitionDefinition(tableName);
      if (partDef) options.options = `PARTITION BY ${partDef}`;
    }
    return options;
  }

  async serialSequence(tableName: string, column: string): Promise<string | null> {
    const rows = await this.schemaQuery(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [
      tableName,
      column,
    ]);
    return (rows[0]?.seq as string | null) ?? null;
  }

  async defaultSequenceName(
    tableName: string,
    pk: string | string[] = "id",
  ): Promise<string | null> {
    if (Array.isArray(pk)) return null;
    try {
      const result = await this.serialSequence(tableName, pk);
      if (!result) return null;
      return Utils.extractSchemaQualifiedName(result).toString();
    } catch {
      return `${tableName}_${pk}_seq`;
    }
  }

  async setPkSequenceBang(tableName: string, value: number): Promise<void> {
    const result = await this.pkAndSequenceFor(tableName);
    if (!result) return;
    const [, seq] = result;
    const seqName = `${seq.schema}.${seq.name}`;
    await this.schemaQuery(`SELECT setval($1::regclass, $2)`, [
      this.quoteTableName(seqName),
      value,
    ]);
  }

  async resetPkSequenceBang(
    tableName: string,
    pk: string | null = null,
    sequence: string | null = null,
  ): Promise<void> {
    if (!pk || !sequence) {
      const result = await this.pkAndSequenceFor(tableName);
      if (!result) return;
      const [defaultPk, defaultSeq] = result;
      pk = pk ?? defaultPk;
      sequence = sequence ?? `${defaultSeq.schema}.${defaultSeq.name}`;
    }
    if (!pk || !sequence) return;
    const quotedSeq = this.quoteTableName(sequence);
    const maxRows = await this.schemaQuery(
      `SELECT MAX(${this.quoteIdentifier(pk)}) AS max_val FROM ${this.quoteTableName(tableName)}`,
    );
    const maxVal = maxRows[0]?.max_val;
    if (maxVal == null) {
      const dbVersion = await this.getDatabaseVersion();
      const minRows =
        dbVersion >= 100000
          ? await this.schemaQuery(
              `SELECT seqmin AS minvalue FROM pg_sequence WHERE seqrelid = $1::regclass`,
              [quotedSeq],
            )
          : await this.schemaQuery(`SELECT min_value AS minvalue FROM ${quotedSeq}`);
      await this.schemaQuery(`SELECT setval($1::regclass, $2, false)`, [
        quotedSeq,
        minRows[0]?.minvalue ?? 1,
      ]);
    } else {
      await this.schemaQuery(`SELECT setval($1::regclass, $2, true)`, [quotedSeq, maxVal]);
    }
  }

  async primaryKeys(tableName: string): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT a.attname AS name
       FROM (
         SELECT indrelid, indkey, generate_subscripts(indkey, 1) idx
           FROM pg_index
          WHERE indrelid = ${this.quoteLiteral(this.quoteTableName(tableName))}::regclass
            AND indisprimary
       ) i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid
        AND a.attnum = i.indkey[i.idx]
       ORDER BY i.idx`,
    );
    return rows.map((r) => r.name as string);
  }

  async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const rows = await this.schemaQuery(
      `SELECT conname, pg_get_constraintdef(c.oid, true) AS constraintdef, c.convalidated AS valid
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'c'
         AND t.relname = ${scope.name!}
         AND n.nspname = ${scope.schema}`,
    );
    return rows.map((row) => {
      const expression = (row.constraintdef as string).match(/CHECK \((.+)\)/s)?.[1] ?? "";
      return new CheckConstraintDefinition(
        tableName,
        expression,
        row.conname as string,
        row.valid as boolean,
      );
    });
  }

  exclusionConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    this.assertValidDeferrable(options.deferrable);
    const opts = { ...options };
    if (!opts.name) {
      opts.name = this.exclusionConstraintName(tableName, { expression, ...opts });
    }
    return opts;
  }

  async addExclusionConstraint(
    tableName: string,
    expression: string,
    options: ExclusionConstraintOptions = {},
  ): Promise<void> {
    const opts = this.exclusionConstraintOptions(tableName, expression, options);
    const name = this.quoteIdentifier(opts.name as string);
    const using = opts.using ? ` USING ${opts.using}` : "";
    const where = opts.where ? ` WHERE (${opts.where})` : "";
    const deferParts = this.deferrable(opts.deferrable as "immediate" | "deferred" | undefined);
    await this.exec(
      `ALTER TABLE ${this.quoteTableName(tableName)} ADD CONSTRAINT ${name} EXCLUDE${using} (${expression})${where}${deferParts}`,
    );
  }

  async removeExclusionConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown> | null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const expression =
      typeof expressionOrOptions === "string" || expressionOrOptions == null
        ? expressionOrOptions
        : null;
    const opts =
      typeof expressionOrOptions === "object" && expressionOrOptions !== null
        ? expressionOrOptions
        : options;
    if (!expression && !opts.name) {
      throw new ArgumentError(
        "Either expression or `name` option must be provided for removeExclusionConstraint.",
      );
    }
    const excl = await this.exclusionConstraintForBang(tableName, expression ?? null, opts);
    await this.exec(
      `ALTER TABLE ${this.quoteTableName(tableName)} DROP CONSTRAINT ${this.quoteIdentifier(excl.name!)}`,
    );
  }

  uniqueConstraintOptions(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    this.assertValidDeferrable(options.deferrable);
    if (columnName && options.usingIndex) {
      throw new Error("Cannot specify both `columnName` and `usingIndex` options.");
    }
    const opts = { ...options };
    if (!opts.name) {
      opts.name = this.uniqueConstraintName(tableName, { column: columnName, ...opts });
    }
    return opts;
  }

  async addUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | null,
    options: UniqueConstraintOptions = {},
  ): Promise<void> {
    if (!columnName && !options.usingIndex) {
      throw new Error("Either columnName or usingIndex must be provided for addUniqueConstraint.");
    }
    const opts = this.uniqueConstraintOptions(tableName, columnName, options);
    const name = this.quoteIdentifier(opts.name as string);
    const deferParts = this.deferrable(opts.deferrable as "immediate" | "deferred" | undefined);
    let constraintSql: string;
    if (opts.usingIndex) {
      constraintSql = `UNIQUE USING INDEX ${this.quoteIdentifier(opts.usingIndex as string)}`;
    } else {
      const cols = Array.isArray(columnName) ? columnName : [columnName!];
      const nullsNotDistinct = opts.nullsNotDistinct ? " NULLS NOT DISTINCT" : "";
      constraintSql = `UNIQUE${nullsNotDistinct} (${cols.map((c) => this.quoteIdentifier(c)).join(", ")})`;
    }
    await this.exec(
      `ALTER TABLE ${this.quoteTableName(tableName)} ADD CONSTRAINT ${name} ${constraintSql}${deferParts}`,
    );
  }

  async removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | Record<string, unknown> | null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const columnName =
      columnNameOrOptions === null ||
      typeof columnNameOrOptions === "string" ||
      Array.isArray(columnNameOrOptions) ||
      columnNameOrOptions === undefined
        ? columnNameOrOptions
        : undefined;
    const opts =
      typeof columnNameOrOptions === "object" &&
      columnNameOrOptions !== null &&
      !Array.isArray(columnNameOrOptions)
        ? columnNameOrOptions
        : options;
    if (!columnName && !opts.name && !opts.usingIndex) {
      throw new ArgumentError(
        "Either `columnName`, `name`, or `usingIndex` option must be provided for removeUniqueConstraint.",
      );
    }
    const uniq = await this.uniqueConstraintForBang(tableName, columnName, opts);
    await this.exec(
      `ALTER TABLE ${this.quoteTableName(tableName)} DROP CONSTRAINT ${this.quoteIdentifier(uniq.name!)}`,
    );
  }

  indexName(tableName: string, options: { column?: string | string[] }): string {
    const normalizedTableName = tableName.replace(/[."]/g, "_");
    const cols = Array.isArray(options.column) ? options.column : [options.column ?? ""];
    return `index_${normalizedTableName}_on_${cols.join("_and_")}`;
  }

  addIndexOptions(
    _tableName: string,
    _columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return { ...options };
  }

  get schemaCreation(): PgSchemaCreation {
    return new PgSchemaCreation(this);
  }

  updateTableDefinition(tableName: string, base: unknown): PgTable {
    return new PgTable(tableName, base as SchemaStatementsConstraintLike);
  }

  createSchemaDumper(source: SchemaSource, _options: unknown = {}): PgSchemaDumper {
    return new PgSchemaDumper(source);
  }

  /** @internal */
  createTableDefinition(name: string, options: Record<string, unknown> = {}): PgTableDefinition {
    return new PgTableDefinition(name, options);
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
    void tableName;
    const [col, type, raw, notnull, oid, fmod, , , identity, gen] = field as [
      string,
      string,
      string | null,
      boolean,
      number,
      number,
      unknown,
      unknown,
      string | null,
      string | null,
    ];
    const meta = await this.fetchTypeMetadata(col, type, Number(oid), Number(fmod));
    const castType = this.lookupCastTypeFromColumn({
      oid: Number(oid),
      fmod: Number(fmod),
      sqlType: type,
    });
    const split = gen ? null : splitPgDefault(raw);
    const rawLiteral = gen ? null : (split?.literal ?? null);
    return new Column(
      col,
      rawLiteral !== null ? castType.deserialize(rawLiteral) : null,
      {
        sqlType: meta.sqlType,
        type: meta.type,
        oid: Number(oid),
        fmod: Number(fmod),
        limit: meta.limit,
        precision: meta.precision,
        scale: meta.scale,
      },
      !notnull,
      {
        defaultFunction: (gen ? raw : split?.fn) ?? undefined,
        serial: typeof raw === "string" && raw.startsWith("nextval("),
        array: type.endsWith("[]"),
        identity: identity || null,
        generated: gen || null,
      },
    );
  }

  /** @internal */
  addColumnForAlter(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): unknown {
    const col = this.createTableDefinition(tableName).newColumnDefinition(
      columnName,
      type,
      options,
    );
    const sql = `ADD COLUMN ${this.schemaCreation.accept(col)}`;
    return "comment" in options
      ? [
          sql,
          () => this.changeColumnComment(tableName, columnName, options.comment as string | null),
        ]
      : sql;
  }

  /** @internal */
  changeColumnForAlter(
    tableName: string,
    columnName: string,
    type: string,
    options: Record<string, unknown> = {},
  ): unknown[] {
    const changeDef = this.buildChangeColumnDefinition(
      tableName,
      columnName,
      type,
      options as Parameters<typeof this.buildChangeColumnDefinition>[3],
    );
    const sqls: unknown[] = [this.schemaCreation.accept(changeDef)];
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
      return `ALTER COLUMN ${this.quoteIdentifier(columnName)} ${nullable ? "DROP" : "SET"} NOT NULL`;
    return () => this.changeColumnNull(tableName, columnName, nullable, defaultValue);
  }

  /** @internal */
  addIndexOpclass(
    quotedColumns: Record<string, string>,
    options: Record<string, unknown> = {},
  ): void {
    const opclasses = options.opclass as Record<string, string> | undefined;
    if (!opclasses) return;
    for (const [name] of Object.entries(quotedColumns)) {
      const opclass = opclasses[name];
      if (opclass) quotedColumns[name] += ` ${opclass}`;
    }
  }

  /** @internal */
  addOptionsForIndexColumns(
    quotedColumns: Record<string, string>,
    options: Record<string, unknown> = {},
  ): Record<string, string> {
    this.addIndexOpclass(quotedColumns, options);
    return quotedColumns;
  }

  async exclusionConstraints(tableName: string): Promise<ExclusionConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const rows = await this.schemaQuery(`
      SELECT conname, pg_get_constraintdef(c.oid) AS constraintdef, c.condeferrable, c.condeferred
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'x'
        AND t.relname = ${scope.name}
        AND n.nspname = ${scope.schema}
    `);
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      const constraintdef = r.constraintdef as string;
      const whereIdx = constraintdef.search(/ WHERE /i);
      let predicate: string | undefined;
      let excludePart = constraintdef;
      if (whereIdx !== -1) {
        predicate = constraintdef.slice(whereIdx + 7);
        excludePart = constraintdef.slice(0, whereIdx);
        predicate = predicate.replace(/ DEFERRABLE(?: INITIALLY (?:IMMEDIATE|DEFERRED))?/i, "");
        // strip outer parentheses added by pg_get_constraintdef
        if (predicate.startsWith("((") && predicate.endsWith("))")) {
          predicate = predicate.slice(1, -1);
        }
      }
      const parts = excludePart.match(/EXCLUDE(?:\s+USING\s+(\S+))?\s+\((.+)\)/s);
      const using = parts?.[1];
      const expression = parts?.[2] ?? "";
      const deferrable = this.extractConstraintDeferrable(
        r.condeferrable as boolean,
        r.condeferred as boolean,
      );
      return new ExclusionConstraintDefinition(tableName, expression, {
        name: r.conname as string,
        using: using as string | undefined,
        where: predicate,
        deferrable: deferrable || undefined,
      });
    });
  }

  async uniqueConstraints(tableName: string): Promise<UniqueConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const rows = await this.schemaQuery(`
      SELECT c.conname, c.conrelid, c.conkey, c.condeferrable, c.condeferred,
             pg_get_constraintdef(c.oid) AS constraintdef
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'u'
        AND t.relname = ${scope.name}
        AND n.nspname = ${scope.schema}
    `);
    return Promise.all(
      rows.map(async (row) => {
        const r = row as Record<string, unknown>;
        const conkey = String(r.conkey).replace(/[{}]/g, "").split(",").map(Number);
        const columns = await this.columnNamesFromColumnNumbers(Number(r.conrelid), conkey);
        const nullsNotDistinct = (r.constraintdef as string).startsWith(
          "UNIQUE NULLS NOT DISTINCT",
        );
        const deferrable = this.extractConstraintDeferrable(
          r.condeferrable as boolean,
          r.condeferred as boolean,
        );
        return new UniqueConstraintDefinition(tableName, columns, {
          name: r.conname as string,
          nullsNotDistinct: nullsNotDistinct || undefined,
          deferrable: deferrable || undefined,
        });
      }),
    );
  }

  /** @internal */
  exclusionConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    if (options.name) return options.name as string;
    const expression = (options.expression as string | undefined) ?? "";
    const identifier = `${tableName}_${expression}_excl`;
    const hashed = getCrypto().createHash("sha256").update(identifier).digest("hex").slice(0, 10);
    return `excl_rails_${hashed}`;
  }

  /** @internal */
  async exclusionConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<ExclusionConstraintDefinition | undefined> {
    const name = this.exclusionConstraintName(tableName, options);
    const scope = this.quotedScope(tableName);
    const rows = await this.schemaQuery(
      `SELECT conname, pg_get_constraintdef(c.oid) AS constraintdef FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'x' AND c.conname = $1 AND t.relname = ${scope.name} AND n.nspname = ${scope.schema}`,
      [name],
    );
    if (rows.length === 0) return undefined;
    const row = rows[0] as Record<string, string>;
    // Split on WHERE first (Rails approach), then extract expression from EXCLUDE clause.
    const [excludePart] = (row.constraintdef as string).split(/ WHERE /i);
    const parts = excludePart.match(/EXCLUDE(?:\s+USING\s+\w+)?\s+\((.+)\)/s);
    return new ExclusionConstraintDefinition(tableName, parts?.[1] ?? "", { name });
  }

  /** @internal */
  async exclusionConstraintForBang(
    tableName: string,
    expression?: string | null,
    options: Record<string, unknown> = {},
  ): Promise<ExclusionConstraintDefinition> {
    const result = await this.exclusionConstraintFor(tableName, {
      ...options,
      expression: expression ?? undefined,
    });
    if (!result)
      throw new ArgumentError(
        `Table '${tableName}' has no exclusion constraint for ${expression ?? JSON.stringify(options)}`,
      );
    return result;
  }

  /** @internal */
  uniqueConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    if (options.name) return options.name as string;
    const columnOrIndex = Array.isArray(options.column)
      ? (options.column as string[])
      : options.column
        ? [options.column as string]
        : options.usingIndex
          ? [options.usingIndex as string]
          : [];
    const identifier = `${tableName}_${columnOrIndex.join("_and_")}_unique`;
    const hashed = getCrypto().createHash("sha256").update(identifier).digest("hex").slice(0, 10);
    return `uniq_rails_${hashed}`;
  }

  /** @internal */
  async uniqueConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<UniqueConstraintDefinition | undefined> {
    const name = this.uniqueConstraintName(tableName, options);
    const scope = this.quotedScope(tableName);
    const rows = await this.schemaQuery(
      `SELECT c.conname, c.conrelid, c.conkey FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'u' AND c.conname = $1 AND t.relname = ${scope.name} AND n.nspname = ${scope.schema}`,
      [name],
    );
    if (rows.length === 0) return undefined;
    const row = rows[0] as Record<string, unknown>;
    const conkey = String(row.conkey).replace(/[{}]/g, "").split(",").map(Number);
    const cols = await this.columnNamesFromColumnNumbers(Number(row.conrelid), conkey);
    return new UniqueConstraintDefinition(tableName, cols, { name });
  }

  /** @internal */
  async uniqueConstraintForBang(
    tableName: string,
    column?: string | string[] | null,
    options: Record<string, unknown> = {},
  ): Promise<UniqueConstraintDefinition> {
    const result = await this.uniqueConstraintFor(tableName, {
      ...options,
      column: column ?? undefined,
    });
    if (!result)
      throw new ArgumentError(
        `Table '${tableName}' has no unique constraint for ${column != null ? JSON.stringify(column) : JSON.stringify(options)}`,
      );
    return result;
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

  private pgQuotedScope(
    name: string,
    _type: "BASE TABLE" | null,
  ): { schema: string; name: string | null } {
    const pgName = Utils.extractSchemaQualifiedName(name);
    const schema = pgName.schema
      ? this.quoteLiteral(pgName.schema)
      : "ANY (current_schemas(false))";
    const quotedName = pgName.identifier ? this.quoteLiteral(pgName.identifier) : null;
    return { schema, name: quotedName };
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
    return this._translateException(exception, opts.sql ?? "", opts.binds ?? []);
  }

  /**
   * True when the error is retryable (not inside a failed transaction).
   * Mirrors: PostgreSQLAdapter#retryable_query_error?
   * @internal
   */
  isRetryableQueryError(_exception: unknown): boolean {
    // Rails checks @raw_connection.transaction_status != PG::PQTRANS_INERROR.
    // node-pg doesn't expose the PG transaction status byte, so we conservatively
    // return true (same as the base class). Callers already guard on open_transactions.
    return true;
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
   * Statement-pool key. Rails scopes this to schema_search_path; here we
   * use a fixed prefix because search_path is set once per connection.
   * Mirrors: PostgreSQLAdapter#sql_key
   * @internal
   */
  sqlKey(sql: string): string {
    return `-${sql}`;
  }

  /**
   * Prepare a statement on the given client, caching by sql_key.
   * Mirrors: PostgreSQLAdapter#prepare_statement
   * @internal
   */
  async prepareStatement(sql: string, _binds: unknown[], client: pg.PoolClient): Promise<string> {
    const pool = this._poolFor(client);
    // Use same cache key as _preparedNameFor so prepared statements created here
    // are visible to / deduped with the internal query path.
    const existing = pool.get(sql);
    if (existing) return existing.name;
    const name = pool.nextKey();
    // PREPARE ... AS avoids executing the statement (node-pg's { name, text } form
    // both prepares and executes in a single roundtrip).
    await client.query(`PREPARE ${pgQuoteColumnName(name)} AS ${sql}`);
    pool.set(sql, { name });
    return name;
  }

  /**
   * Sync the session timezone variable after `default_timezone` changes.
   * Mirrors: PostgreSQLAdapter#reconfigure_connection_timezone
   * @internal
   */
  async reconfigureConnectionTimezone(): Promise<void> {
    const tz = getDefaultTimezone();
    await this.withClient(async (client) => {
      if (tz === "utc") {
        await client.query("SET SESSION timezone TO 'UTC'");
      } else {
        await client.query("SET SESSION timezone TO DEFAULT");
      }
    });
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
    const identityCol = this.supportsIdentityColumns()
      ? "attidentity"
      : `${this.quote("")}::varchar`;
    const generatedCol = this.supportsVirtualColumns()
      ? "attgenerated"
      : `${this.quote("")}::varchar`;
    const rows = await this.schemaQuery(
      `SELECT a.attname, format_type(a.atttypid, a.atttypmod),
              pg_get_expr(d.adbin, d.adrelid), a.attnotnull, a.atttypid, a.atttypmod,
              c.collname, col_description(a.attrelid, a.attnum) AS comment,
              ${identityCol} AS identity,
              ${generatedCol} AS attgenerated
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
         LEFT JOIN pg_type t ON a.atttypid = t.oid
         LEFT JOIN pg_collation c ON a.attcollation = c.oid AND a.attcollation <> t.typcollation
        WHERE a.attrelid = ${this.quote(this.quoteTableName(tableName))}::regclass
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
    );
    return rows.map((r) => ({
      attname: r.attname as string,
      format_type: r.format_type as string,
      pg_get_expr: (r.pg_get_expr as string | null) ?? null,
      attnotnull: r.attnotnull as boolean,
      atttypid: Number(r.atttypid),
      atttypmod: Number(r.atttypmod),
      collname: (r.collname as string | null) ?? null,
      comment: (r.comment as string | null) ?? null,
      identity: (r.identity as string | null) || null,
      attgenerated: (r.attgenerated as string | null) || null,
    }));
  }

  /**
   * Build the per-adapter StatementPool (used on initialization).
   * Mirrors: PostgreSQLAdapter#build_statement_pool
   * @internal
   */
  buildStatementPool(client: pg.PoolClient): StatementPool {
    return new StatementPool(client, this._statementLimit);
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
    // node-pg uses custom type parsers registered at pool construction time
    // via getTypeParser (see constructor). A timezone change only requires
    // a session-level SET so subsequent result sets are interpreted correctly.
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

  /** @internal */
  _driverPoolForTest(): pg.Pool | null {
    return this._driverPool;
  }
}

export type IndexDefinition = PgIndexDefinition;

class SimpleTableBuilder {
  private _columns: { name: string; type: string }[] = [];

  constructor(private _adapter: PostgreSQLAdapter) {}

  column(name: string, type: string): void {
    this._columns.push({ name, type });
  }

  string(name: string, options: { default?: string } = {}): void {
    let type = "character varying";
    if (options.default !== undefined) {
      const escaped = options.default.replace(/'/g, "''");
      type += ` DEFAULT '${escaped}'`;
    }
    this._columns.push({ name, type });
  }

  text(name: string): void {
    this._columns.push({ name, type: "text" });
  }

  integer(name: string): void {
    this._columns.push({ name, type: "integer" });
  }

  int4range(name: string): void {
    this._columns.push({ name, type: "int4range" });
  }

  int8range(name: string): void {
    this._columns.push({ name, type: "int8range" });
  }

  numrange(name: string): void {
    this._columns.push({ name, type: "numrange" });
  }

  daterange(name: string): void {
    this._columns.push({ name, type: "daterange" });
  }

  tsrange(name: string): void {
    this._columns.push({ name, type: "tsrange" });
  }

  tstzrange(name: string): void {
    this._columns.push({ name, type: "tstzrange" });
  }

  boolean(name: string, options: { default?: boolean } = {}): void {
    let type = "boolean";
    if (options.default !== undefined) type += ` DEFAULT ${options.default}`;
    this._columns.push({ name, type });
  }

  datetime(name: string, options: { null?: boolean } = {}): void {
    let type = "timestamp without time zone";
    if (options.null === false) type += " NOT NULL";
    this._columns.push({ name, type });
  }

  virtual(name: string, options: { type?: string; as?: string; stored?: boolean } = {}): void {
    // Mirrors Rails PG `new_column_definition`: resolve `:virtual` → real type,
    // append the GENERATED clause via the shared helper. When `as` is absent
    // the helper returns "" (Rails: a plain column).
    const pgType = this._adapter.typeToSql(options.type ?? "string", {});
    const generatedClause = _pgGeneratedClause(name, options.as, options.stored);
    this._columns.push({ name, type: `${pgType}${generatedClause}` });
  }

  getColumns(): { name: string; type: string }[] {
    return this._columns;
  }
}

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
 * PG-flavored StatementPool. Backs the per-client statement cache;
 * `dealloc` sends `DEALLOCATE` for the evicted name. PG prepared
 * statements are session-scoped, so an instance of this pool is
 * attached per-pg.PoolClient via a WeakMap on the adapter.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::StatementPool
 */
export class StatementPool extends GenericStatementPool<PreparedStatement> {
  private _client: pg.PoolClient | null;
  // Per-pool counter. Rails' PG StatementPool uses `@counter` on the
  // pool instance so names are scoped to the session — matches the
  // session-scoped nature of PG prepared statements and lets the
  // adapter own zero state about naming.
  private _counter = 0;

  constructor(client: pg.PoolClient, maxSize = 1000) {
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
    // Best-effort async cleanup: we don't await DEALLOCATE, but pg
    // still queues it on this client and it runs before later queries
    // on the same connection — eviction doesn't block the caller
    // that triggered it (pg.write path) but it isn't free either.
    // The server also drops prepared statements on session close, so
    // a swallowed failure here is safe. Errors are intentionally
    // ignored — Rails' PG::StatementPool#dealloc likewise rescues
    // PG::InvalidSqlStatementName / connection errors — and the
    // empty `.catch` keeps node from treating a post-close
    // DEALLOCATE as an unhandled rejection.
    // `pgQuoteColumnName` escapes any embedded `"` instead of
    // raising, so a leaked caller-supplied name can't produce a
    // synchronous throw that would escape the `.catch(() => {})`.
    client.query(`DEALLOCATE ${pgQuoteColumnName(stmt.name)}`).catch(() => {});
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
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter::MoneyDecoder
 */
export class MoneyDecoder {
  static decode(value: string): number {
    let str = value.trim();
    let negative = false;
    if (str.startsWith("(") && str.endsWith(")")) {
      negative = true;
      str = str.slice(1, -1).trim();
    }
    const cleaned = str.replace(/[$,\s]/g, "");
    const num = parseFloat(cleaned);
    if (isNaN(num)) return NaN;
    return negative ? -num : num;
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
 * Parse a raw `pg_attrdef` default expression into a literal value or a
 * SQL function expression. Mirrors Rails' PG `extract_value_from_default`
 * / `extract_default_function` split — so schema reflection can carry
 * expression defaults as `defaultFunction` rather than applying them as
 * literal bind values.
 */
function splitPgDefault(raw: string | null): { literal: unknown; fn: string | null } {
  if (raw == null) return { literal: null, fn: null };
  // 'value'::type[] — array literal with a cast; {} is the PG empty-array literal.
  // Return the raw PG array string so the call site can deserialize via the
  // correct cast type (e.g. OID::Array<Integer> returns [4,4,2] not ["4","4","2"]).
  const arrayLiteral = /^'((?:[^']|'')*)'::[\w"\s.(,)]+\[\]$/.exec(raw);
  if (arrayLiteral) {
    const content = arrayLiteral[1].replace(/''/g, "'");
    return { literal: content, fn: null };
  }
  // 'value'::type — quoted literal with an optional cast.
  const quoted = /^'((?:[^']|'')*)'::[\w"\s.]+$/.exec(raw);
  if (quoted) return { literal: quoted[1].replace(/''/g, "'"), fn: null };
  // (N)::type — numeric wrapped in parens with a cast (PG emits this for
  // things like `DEFAULT 150.55::numeric::money`).
  const parenNum = /^\((-?\d+(?:\.\d+)?)\)::[\w"\s.]+$/.exec(raw);
  if (parenNum) return { literal: parenNum[1], fn: null };
  // N::type — bare numeric with a cast.
  const castNum = /^(-?\d+(?:\.\d+)?)::[\w"\s.]+$/.exec(raw);
  if (castNum) return { literal: castNum[1], fn: null };
  // Bare numeric / boolean / NULL literal.
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return { literal: raw, fn: null };
  if (raw === "true" || raw === "false") return { literal: raw === "true", fn: null };
  if (raw === "NULL") return { literal: null, fn: null };
  // Everything else: only treat as a SQL function expression if it matches
  // Rails' has_default_function? regex — a function call, a parenthesized
  // expression with a cast, or CURRENT_DATE/CURRENT_TIMESTAMP. Arithmetic-
  // expression defaults like `(((4 + 4) * 2) / 4)` match none of these and
  // Rails reflects them with both `default` and `default_function` as nil
  // (the DB still applies the default on INSERT).
  if (DEFAULT_FUNCTION_RE.test(raw)) {
    return { literal: null, fn: raw };
  }
  return { literal: null, fn: null };
}

/**
 * Mirrors: PostgreSQLAdapter#has_default_function? regex
 * (postgresql_adapter.rb:786). A function call, parenthesized cast, or
 * CURRENT_DATE/CURRENT_TIMESTAMP — anything else is a literal default or
 * unrecognized expression and does not populate Column#default_function.
 */
const DEFAULT_FUNCTION_RE = /\w+\(.*\)|\(.*\)::\w+|CURRENT_DATE|CURRENT_TIMESTAMP/;

/**
 * Normalize a `pg_catalog.format_type(...)` string to the typname the
 * static type_map is keyed by. PG returns human-friendly forms like
 * "integer" / "character varying(255)" / "bigint", but we register
 * "int4" / "varchar" / "int8". Strip size modifiers and alias common
 * formatted names so the fallback path in lookupCastTypeFromColumn
 * resolves well-known *scalar* types.
 *
 * Array types (e.g. "integer[]") are deliberately left as-is — they
 * don't have a static registration, so the lookup misses and returns
 * ValueType. Mapping them to the scalar typname (int4) would
 * incorrectly deserialize array values with a scalar type.
 */
function normalizeFormatType(sqlType: string): string {
  if (/\[\]\s*$/.test(sqlType)) return sqlType;
  const base = sqlType
    .replace(/\(.*\)/, "")
    .trim()
    .toLowerCase();
  return FORMAT_TYPE_ALIASES[base] ?? base;
}

const FORMAT_TYPE_ALIASES: Record<string, string> = {
  smallint: "int2",
  integer: "int4",
  bigint: "int8",
  real: "float4",
  "double precision": "float8",
  "character varying": "varchar",
  character: "bpchar",
  "timestamp without time zone": "timestamp",
  "timestamp with time zone": "timestamptz",
  "time without time zone": "time",
  "time with time zone": "timetz",
  boolean: "bool",
};
