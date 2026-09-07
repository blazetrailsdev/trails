import type {
  DatabaseConfig,
  DatabaseConfigOptions,
} from "../database-configurations/database-config.js";
import pg from "pg";
import { fetch } from "@blazetrails/ruby-compat";
import { ValueType, ArgumentError, BinaryData, TimeType } from "@blazetrails/activemodel";
import { singularize, runLoadHooks, include } from "@blazetrails/activesupport";
import { Nodes, Visitors } from "@blazetrails/arel";
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
import type { TypeMetadata } from "./postgresql/type-metadata.js";
import {
  quote as pgQuote,
  typeCast as pgTypeCast,
  quoteTableName as pgQuoteTableName,
  quoteColumnName as pgQuoteColumnName,
  quotedDate as pgQuotedDate,
  quoteString as pgQuoteString,
  quoteTableNameForAssignment as pgQuoteTableNameForAssignment,
  quoteDefaultExpression as pgQuoteDefaultExpression,
  type DefaultExpressionColumn,
  quotedBinary as pgQuotedBinary,
  columnNameMatcher as pgColumnNameMatcher,
  columnNameWithOrderMatcher as pgColumnNameWithOrderMatcher,
  lookupCastType as pgLookupCastType,
  lookupCastTypeFromColumn as pgLookupCastTypeFromColumn,
  type CastableColumn,
} from "./postgresql/quoting.js";
import { TypeMapInitializer, type PgTypeRow } from "./postgresql/oid/type-map-initializer.js";
import { Money } from "./postgresql/oid/money.js";
import {
  initializeTypeMap as staticInitializeTypeMap,
  registerClassWithPrecision,
} from "./postgresql/type-map-init.js";
import { Timestamp } from "./postgresql/oid/timestamp.js";
import { TimestampWithTimeZone } from "./postgresql/oid/timestamp-with-time-zone.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { InsertBuilder } from "../insert-all.js";
import type { PostgreSQLAdapterOptions } from "./pool-config.js";
import {
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
  ValueTooLong,
  SQLWarning,
} from "../errors.js";
import { AbstractAdapter, RAW_CONNECTION_DEPRECATION_MESSAGE } from "./abstract-adapter.js";
import { deprecator } from "../deprecator.js";
import { dirtiesQueryCache } from "./abstract/query-cache.js";
import { SchemaStatements, type CreateDatabaseOptions } from "./postgresql/schema-statements.js";
import type { SchemaStatements as AbstractSchemaStatements } from "./abstract/schema-statements.js";
import type {
  CommentOrChanges,
  ValidateConstraintStatements,
  CommentStatements,
  ExtensionStatements,
  EnumStatements,
  UniqueConstraintStatements,
  SchemaNamespaceStatements,
} from "./abstract/schema-statements.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";
import { preprocessQuery } from "./abstract/database-statements.js";
import { makeGetTypeParser } from "./postgresql/temporal-type-parsers.js";

const getTemporalTypeParser = makeGetTypeParser(pg.types);
const TEMPORAL_OIDS = new Set([1082, 1083, 1114, 1184, 1266]);
const OID_INTERVAL = 1186;
const OID_INTERVAL_ARRAY = 1187;
const OID_MONEY = 790;
const VALUE_LIMIT_VIOLATION = "22001";
const NUMERIC_VALUE_OUT_OF_RANGE = "22003";
const NOT_NULL_VIOLATION = "23502";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const SERIALIZATION_FAILURE = "40001";
const DEADLOCK_DETECTED = "40P01";
const DUPLICATE_DATABASE = "42P04";
const LOCK_NOT_AVAILABLE = "55P03";
const QUERY_CANCELED = "57014";

const PQTRANS_IDLE = 0;
const PQTRANS_ACTIVE = 1;
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;
const PQTRANS_UNKNOWN = 4;
const IDLE_TRANSACTION_STATUSES = [PQTRANS_IDLE, PQTRANS_INTRANS, PQTRANS_INERROR];
const FEATURE_NOT_SUPPORTED = "0A000";
import {
  buildTruncateStatements as pgBuildTruncateStatements,
  executeBatch as pgExecuteBatch,
  castResult,
  affectedRows as pgAffectedRows,
  handleWarnings,
  isWarningIgnored as pgIsWarningIgnored,
  lastInsertIdResult as pgLastInsertIdResult,
  performQuery as pgPerformQuery,
  returningColumnValues as pgReturningColumnValues,
  explain as pgExplain,
  isWriteQuery as pgIsWriteQuery,
  execute as pgExecute,
  execInsert as pgExecInsert,
  beginDbTransaction as pgBeginDbTransaction,
  beginIsolatedDbTransaction as pgBeginIsolatedDbTransaction,
  commitDbTransaction as pgCommitDbTransaction,
  execRollbackDbTransaction as pgExecRollbackDbTransaction,
  execRestartDbTransaction as pgExecRestartDbTransaction,
  highPrecisionCurrentTimestamp as pgHighPrecisionCurrentTimestamp,
  buildExplainClause as pgBuildExplainClause,
  setConstraints as pgSetConstraints,
} from "./postgresql/database-statements.js";
import {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
  TableDefinition as PgTableDefinition,
  AlterTable as PgAlterTable,
  type Table as PgTable,
  type ExclusionConstraintOptions,
  type UniqueConstraintOptions,
} from "./postgresql/schema-definitions.js";
import {
  CheckConstraintDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  ForeignKeyDefinition,
  IndexDefinition as AbstractIndexDefinition,
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
  type NativeDatabaseTypes,
} from "./abstract/native-database-types.js";

const OID_JSON = 114;
const OID_JSONB = 3802;

type SessionVariables = Record<string, string | number | boolean | null | ":default">;

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
  static override readonly ADAPTER_NAME = "PostgreSQL";

  static columnNameMatcher(): RegExp {
    return pgColumnNameMatcher();
  }

  static columnNameWithOrderMatcher(): RegExp {
    return pgColumnNameWithOrderMatcher();
  }

  static override quoteColumnName(name: unknown): string {
    return pgQuoteColumnName(name);
  }

  static override quoteTableName(name: unknown): string {
    return pgQuoteTableName(name);
  }

  static override dbconsole(
    config: DatabaseConfig,
    options: { includePassword?: boolean } = {},
  ): { env: Record<string, string>; argv: string[] } {
    const pgConfig = (config as unknown as { configurationHash: DatabaseConfigOptions })
      .configurationHash;

    const env: Record<string, string> = {};
    if (isRubyTruthy(pgConfig.username)) env.PGUSER = String(pgConfig.username);
    if (isRubyTruthy(pgConfig.host)) env.PGHOST = String(pgConfig.host);
    if (isRubyTruthy(pgConfig.port)) env.PGPORT = String(pgConfig.port);
    if (isRubyTruthy(pgConfig.password) && options.includePassword) {
      env.PGPASSWORD = String(pgConfig.password);
    }
    if (isRubyTruthy(pgConfig.sslmode)) env.PGSSLMODE = String(pgConfig.sslmode);
    if (isRubyTruthy(pgConfig.sslcert)) env.PGSSLCERT = String(pgConfig.sslcert);
    if (isRubyTruthy(pgConfig.sslkey)) env.PGSSLKEY = String(pgConfig.sslkey);
    if (isRubyTruthy(pgConfig.sslrootcert)) env.PGSSLROOTCERT = String(pgConfig.sslrootcert);
    const variables = pgConfig.variables as Record<string, unknown> | undefined;
    if (variables) {
      const pgOptions = Object.entries(variables)
        .filter(([, v]) => v !== ":default")
        .map(([name, v]) => `-c ${name}=${String(v).replace(/[ \\]/g, "\\$&")}`)
        .join(" ");
      if (pgOptions) env.PGOPTIONS = pgOptions;
    }
    const argv = this.findCmdAndExec(ActiveRecord.databaseCli["postgresql"], config.database!);
    return { env, argv };
  }

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

  override isConnected(): boolean {
    return this._connection !== null && !this._rawConnectionFinished();
  }

  /** @internal */
  private _rawConnectionFinished(): boolean {
    const client = this._rawConnection as PgClientLiveness | null;
    if (client === null) return false;
    return client._ending === true || client._ended === true;
  }

  static readonly NATIVE_DATABASE_TYPES: NativeDatabaseTypes = POSTGRESQL_NATIVE_DATABASE_TYPES;

  private static _nativeDatabaseTypes?: NativeDatabaseTypes;

  static get datetimeType(): string {
    return pgDatetimeConfig.datetimeType;
  }
  static set datetimeType(v: string) {
    pgDatetimeConfig.datetimeType = v;
  }

  static createUnloggedTables = false;

  static decodeDates = true;

  private static _spCounter = 0;
  /** @internal */
  get _rawConnection(): pg.Client | null {
    return this._connection as unknown as pg.Client | null;
  }
  /** @internal */
  set _rawConnection(value: pg.Client | null) {
    this._connection = value as unknown as AbstractAdapter | null;
  }
  /** @internal */
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

  /** @internal */
  private static _sliceValidConnParams(config: Record<string, unknown>): pg.ClientConfig {
    const sliced: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (value === undefined || value === null) continue;
      if (!PostgreSQLAdapter.VALID_CONN_PARAM_KEYS.has(key)) continue;
      sliced[key] = value;
    }
    return sliced as pg.ClientConfig;
  }

  private _pgClientOptions: pg.ClientConfig | null = null;
  private _client: pg.Client | null = null;
  private _readyForQueryStatus = "I";
  private _typeMap: HashLookupTypeMap | null = null;

  /** @internal */
  _regtypeOids: Map<string, number> = new Map();
  private _maxIdentifierLength: number | null = null;
  private _useInsertReturning: unknown = true;
  private _mappedDefaultTimezone: "utc" | "local" | null = null;
  private _minMessages = "warning";
  private _schemaSearchPathMemo: string | null = null;
  private _warnedOids = new Set<number>();
  private _caseInsensitiveCache: Map<string, boolean> = new Map([["citext", false]]);
  private _connectionConfigured = false;
  private _typeMapEagerLoaded = false;
  /** @internal */
  declare _statements: StatementPool;
  private _closed = false;
  private _closingDriver: Promise<void> | null = null;
  private _acquireGeneration = 0;
  private _acquiringGen = -1;
  private _discardedAcquireGenerations = new Set<number>();
  private _acquiring: Promise<pg.Client> | null = null;
  _noticeReceiverSqlWarnings: SQLWarning[] = [];
  /** @internal */
  private _statementLimit = 1000;

  constructor(config: string | (pg.PoolConfig & PostgreSQLAdapterOptions));
  /** @deprecated */
  constructor(rawConnection: pg.Client, deprecatedConfig?: Record<string, unknown> | null);
  constructor(
    config: string | (pg.PoolConfig & PostgreSQLAdapterOptions) | pg.Client,
    deprecatedConfig?: Record<string, unknown> | null,
  ) {
    const deprecatedRawConnection = PostgreSQLAdapter._isDeprecatedRawConnectionArg(config);
    if (!deprecatedRawConnection && deprecatedConfig != null) {
      throw new ArgumentError(
        "when initializing an Active Record adapter with a config hash, that should be the only argument",
      );
    }
    super(
      deprecatedRawConnection
        ? { ...deprecatedConfig }
        : typeof config === "object" && config !== null
          ? { ...(config as Record<string, unknown>) }
          : {},
    );
    if (deprecatedRawConnection) {
      deprecator().warn(RAW_CONNECTION_DEPRECATION_MESSAGE);
      this._acceptDeprecatedRawConnection(config);
      this._statements = this.buildStatementPool();
      return;
    }
    if (typeof config === "string") {
      this._minMessages = "warning";
      this._pgClientOptions = {
        connectionString: config,
        types: {
          getTypeParser: (oid: number, format?: string) => {
            if (oid === OID_INTERVAL) {
              return format === "binary"
                ? pg.types.getTypeParser(OID_INTERVAL, "binary")
                : (v: unknown) => v;
            }
            if (oid === OID_INTERVAL_ARRAY && format !== "binary") return (v: unknown) => v;
            if ((oid === OID_JSON || oid === OID_JSONB) && format !== "binary")
              return (v: unknown) => v;
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
      this._statements = this.buildStatementPool();
      return;
    }
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
    this._useInsertReturning =
      "insertReturning" in this._config
        ? PostgreSQLAdapter.typeCastConfigToBoolean(this._config.insertReturning)
        : true;
    if (minMessages !== undefined && typeof minMessages !== "string") {
      throw new TypeError(`minMessages must be a string, got ${typeof minMessages}`);
    }
    this._minMessages = minMessages ?? "warning";
    const userGetTypeParser = (
      pgConfig.types as { getTypeParser?: (oid: number, format?: string) => unknown } | undefined
    )?.getTypeParser;
    const { username: railsUsername, ...pgDriverConfig } = pgConfig as typeof pgConfig & {
      username?: string;
    };
    this._pgClientOptions = {
      ...PostgreSQLAdapter._sliceValidConnParams({
        ...pgDriverConfig,
        ...(isRubyTruthy(railsUsername) ? { user: railsUsername } : {}),
      }),
      types: {
        getTypeParser(oid: number, format?: string): unknown {
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
    this._statements = this.buildStatementPool();
  }

  private async _maybeConfigureConnection(client: pg.Client): Promise<void> {
    if (this._connectionConfigured) return;
    await super.configureConnection();
    this._mappedDefaultTimezone = null;
    await client.query("SET standard_conforming_strings = on");
    const variables = fetch<SessionVariables>(this._config, "variables", {});
    await client.query("SET intervalstyle = iso_8601");
    await client.query(`SET client_min_messages TO ${this.quoteLiteral(this._minMessages)}`);
    for (const [key, val] of Object.entries(variables)) {
      if (val === ":default") {
        await client.query(`SET SESSION ${key} TO DEFAULT`);
      } else if (val != null) {
        await client.query(`SET SESSION ${key} TO ${this.quote(val)}`);
      }
    }
    this._connectionConfigured = true;
    if (!this._typeMapEagerLoaded) {
      this._typeMapEagerLoaded = true;
      this._typeMap = null;
      this._regtypeOids.clear();
      await this.initializeTypeMap();
    }
  }

  private _captureRegtypeOids(records: PgTypeRow[]): void {
    for (const row of records) {
      const oid = Number(row.oid);
      for (const name of [row.typname, row.formatType, row.aliasName]) {
        if (name != null) this._regtypeOids.set(name, oid);
      }
    }
  }

  private _attachNoticeListener(client: pg.Client): void {
    if (ActiveRecord.dbWarningsAction == null) return;
    client.on("notice", (msg: { severity?: string; message?: string; code?: string }) => {
      this._noticeReceiverSqlWarnings.push(
        new SQLWarning(msg.message, msg.code ?? null, msg.severity ?? null, undefined, this.pool),
      );
    });
  }

  static initializeTypeMap(m: TypeMap | HashLookupTypeMap): void {
    if (!(m instanceof HashLookupTypeMap)) {
      throw new TypeError("initializeTypeMap expects a HashLookupTypeMap");
    }
    staticInitializeTypeMap(m);
  }

  /** @internal */
  get typeMap(): HashLookupTypeMap {
    if (this._typeMap == null) {
      const m = (this._typeMap = new HashLookupTypeMap());
      (this.constructor as typeof PostgreSQLAdapter).initializeTypeMap(m);
      registerClassWithPrecision(m, "time", TimeType, { timezone: this._defaultTimezone });
      registerClassWithPrecision(m, "timestamp", Timestamp, { timezone: this._defaultTimezone });
      registerClassWithPrecision(m, "timestamptz", TimestampWithTimeZone);
    }
    return this._typeMap;
  }

  private async initializeTypeMap(m: HashLookupTypeMap = this.typeMap): Promise<void> {
    (this.constructor as typeof PostgreSQLAdapter).initializeTypeMap(m);

    registerClassWithPrecision(m, "time", TimeType, { timezone: this._defaultTimezone });
    registerClassWithPrecision(m, "timestamp", Timestamp, { timezone: this._defaultTimezone });
    registerClassWithPrecision(m, "timestamptz", TimestampWithTimeZone);

    await this.loadAdditionalTypes();
  }

  /**
   * @internal
   * @missingRailsCall load_additional_types — CONVERGEABLE pg-get-oid-type-drops-the-on-demand-load-additional-types
   */
  getOidType(oid: number, fmod: number, columnName: string, sqlType: string = ""): ValueType {
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

  /** @missingRailsCall verify! — CONVERGEABLE typecaster-connection-drops-datasource-gate-and-with-connection */
  override lookupCastTypeFromColumn(column: CastableColumn): ValueType {
    if (this._typeMap == null) {
      throw new ConnectionNotEstablished(
        "PostgreSQL type map is not loaded; the connection has not been configured",
      );
    }
    return pgLookupCastTypeFromColumn.call(this, column);
  }

  /** @internal */
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
          const r = await this.withRawConnection(
            {
              materializeTransactions: options?.materializeTransactions ?? true,
              allowRetry: options?.allowRetry ?? false,
            },
            async (conn) => {
              const client = conn as unknown as pg.Client;
              try {
                return await this._performQuery<ArrayQueryResult & pg.QueryResult>(
                  client,
                  rewritten,
                  binds ?? [],
                  bindArray,
                  {
                    prepare: options?.prepare ?? false,
                    notificationPayload: payload,
                    rowMode: "array",
                  },
                );
              } catch (e: any) {
                throw this.translateExceptionClass(e, rewritten, bindArray);
              }
            },
          );
          payload.row_count = r.rows?.length ?? 0;
          return r;
        } catch (e: any) {
          throw this.translateExceptionClass(e, rewritten, bindArray);
        }
      },
    );

    const fields = pgResult.fields ?? [];
    if (fields.length === 0) return Result.fromRowHashes([]);

    const missing = new Set<number>();
    for (const f of fields) {
      if (!this.typeMap.isKey(f.dataTypeID)) missing.add(f.dataTypeID);
    }
    if (missing.size > 0) {
      await this.loadAdditionalTypes([...missing]);
    }

    const columns = fields.map((f) => f.name);
    const columnTypes: Record<string | number, ValueType> = {};
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const type = this.getOidType(f.dataTypeID, -1, f.name, "");
      columnTypes[i] = type;
      if (!/^\d+$/.test(f.name)) {
        columnTypes[f.name] = type;
      }
    }
    const rowArrays = pgResult.rows;
    return new Result(columns, rowArrays, columnTypes as Record<string, ValueType>);
  }

  /** @internal */
  async loadAdditionalTypes(oids?: number[]): Promise<void> {
    const initializer = new TypeMapInitializer(this.typeMap);
    for await (const query of this.loadTypesQueries(initializer, oids)) {
      const result = (await this.internalExecute(query, "SCHEMA", [], {
        allowRetry: true,
        materializeTransactions: false,
      })) as { fields?: Array<{ name: string }>; rows?: unknown[][] };
      const records = new Result(
        (result.fields ?? []).map((f) => f.name),
        result.rows ?? [],
      ).toArray() as unknown as PgTypeRow[];
      this._captureRegtypeOids(records);
      initializer.run(records);
    }
  }

  private async *loadTypesQueries(
    initializer: TypeMapInitializer,
    oids?: number[],
  ): AsyncGenerator<string, void, void> {
    const baseQuery = [
      "SELECT t.oid, t.typname, t.typelem, t.typdelim, t.typinput,",
      '       format_type(t.oid, NULL) AS "formatType",',
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
    yield this.nativeTypeNamesQuery();
  }

  private nativeTypeNamesQuery(): string {
    const names: string[] = [];
    for (const [key, type] of Object.entries(this.nativeDatabaseTypes())) {
      if (key === "primary_key") continue;
      const name = typeof type === "string" ? type : type?.name;
      if (name == null || names.includes(name)) continue;
      names.push(name, `${name}[]`);
    }
    return [
      'SELECT t.oid, t.typname, format_type(t.oid, NULL) AS "formatType",',
      '       a.name AS "aliasName", t.typelem, t.typdelim, t.typinput,',
      "       r.rngsubtype, t.typtype, t.typbasetype",
      `FROM unnest(ARRAY[${names.map((name) => this.quote(name)).join(", ")}]::text[]) AS a(name)`,
      "JOIN pg_type as t ON t.oid = to_regtype(a.name)",
      "LEFT JOIN pg_range as r ON t.oid = r.rngtypid",
    ].join("\n");
  }

  async reloadTypeMap(): Promise<void> {
    return this.lock.synchronize(async () => {
      this._regtypeOids.clear();
      if (this._typeMap) {
        this.typeMap.clear();
      } else {
        this._typeMap = new HashLookupTypeMap();
      }

      await this.initializeTypeMap();
      void this._statements.reset();
    });
  }

  private rewriteBinds(sql: string, binds?: unknown[]): string {
    if (!binds || binds.length === 0) return sql;
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  private async _acquireFreshClient(): Promise<pg.Client> {
    if (this._closed || this._pgClientOptions == null) {
      throw new Error("PostgreSQLAdapter: connection is closed");
    }
    if (this._rawConnection && this._connectionConfigured) {
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
      let newClient: pg.Client;
      try {
        newClient = await PostgreSQLAdapter.newClient(this._pgClientOptions!);
      } catch (error) {
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
    } catch (error) {
      if (this._rawConnection === client) {
        this._rawConnection = null;
        this._connectionConfigured = false;
        this._typeMapEagerLoaded = false;
        void this._statements.reset();
      }
      this._teardownRacedClient(client, acquireGen);
      throw error;
    }
    return client;
  }

  private _teardownRacedClient(client: pg.Client, acquireGen: number): void {
    if (this._discardedAcquireGenerations.has(acquireGen)) {
      abandonRawSocket(client);
    } else {
      client.end().catch(() => {});
    }
  }

  /** @internal */
  protected override async awaitRawConnectionReady(): Promise<void> {
    if (!this._closed && this._rawConnection === null && this._pgClientOptions !== null) {
      await this.connect();
    }
  }

  /** @internal */
  private _performQuery = pgPerformQuery;

  /** @internal */
  declare performQuery: (
    rawConnection: pg.Client,
    sql: string,
    binds: unknown[],
    typeCastedBinds: unknown[],
    options: { prepare: boolean; notificationPayload?: Record<string, unknown> },
  ) => Promise<pg.QueryResult>;

  /** @internal */
  declare handleWarnings: (sql: unknown) => void;

  /** @internal */
  affectedRows(result: pg.QueryResult): number {
    return pgAffectedRows(result);
  }

  async executeMutation(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
  ): Promise<number> {
    sql = this.preprocessQuery(sql);
    const originalBinds = binds;
    binds = this.typeCastedBinds(binds) ?? [];
    const pgSql = this.rewriteBinds(sql, binds);
    return await this.log(pgSql, name, originalBinds, binds, false, async (payload) => {
      try {
        return await this.withRawConnection({}, async (conn) => {
          const client = conn as unknown as pg.Client;
          const upper = sql.trimStart().toUpperCase();

          if (
            this.isUseInsertReturning() &&
            upper.startsWith("INSERT") &&
            !upper.includes("RETURNING")
          ) {
            const withReturning = `${pgSql} RETURNING id`;
            const useSavepoint = this.isInTransaction();
            const spName = useSavepoint ? `_bt_ret_${++PostgreSQLAdapter._spCounter}` : "";
            payload.sql = withReturning;
            try {
              if (useSavepoint) {
                await client.query(`SAVEPOINT "${spName}"`);
              }
              const result = await this._performQuery(client, withReturning, originalBinds, binds, {
                prepare: false,
                notificationPayload: payload,
              });
              if (useSavepoint) {
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
              if (err instanceof PreparedStatementCacheExpired) throw err;
              if (useSavepoint) {
                await client.query(`ROLLBACK TO SAVEPOINT "${spName}"`).catch(() => {});
                await client.query(`RELEASE SAVEPOINT "${spName}"`).catch(() => {});
              }
              payload.sql = pgSql;
              const result = await this._performQuery(client, pgSql, originalBinds, binds, {
                prepare: false,
                notificationPayload: payload,
              });
              const affected = this.affectedRows(result);
              payload.row_count = affected;
              return affected;
            }
          }

          if (upper.startsWith("INSERT") && upper.includes("RETURNING")) {
            const result = await this._performQuery(client, pgSql, originalBinds, binds, {
              prepare: false,
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
            prepare: false,
            notificationPayload: payload,
          });
          const affected = this.affectedRows(result);
          payload.row_count = affected;
          return affected;
        });
      } catch (e: any) {
        throw this.translateExceptionClass(e, pgSql, binds);
      }
    });
  }

  async beginDeferredTransaction(): Promise<void> {
    return this.beginDbTransaction();
  }

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

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  get transactionStatus(): number {
    const client = this._rawConnection as (pg.Client & { _activeQuery?: unknown }) | null;
    if (client == null) return PQTRANS_UNKNOWN;
    if (client._activeQuery != null) return PQTRANS_ACTIVE;
    switch (this._readyForQueryStatus) {
      case "T":
        return PQTRANS_INTRANS;
      case "E":
        return PQTRANS_INERROR;
      default:
        return PQTRANS_IDLE;
    }
  }

  /** @internal */
  private _attachReadyForQueryListener(client: pg.Client): void {
    this._readyForQueryStatus = "I";
    const connection = (client as pg.Client & { connection?: pg.Connection }).connection;
    if (connection == null) return;
    connection.on("readyForQuery", (message: { status?: string }) => {
      if (typeof message?.status === "string") this._readyForQueryStatus = message.status;
    });
    connection.on("errorMessage", () => {
      if (this._readyForQueryStatus === "T") this._readyForQueryStatus = "E";
    });
  }

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
    } catch {}
  }

  /** @internal */
  private _blockUntilCommandSettles(client: pg.Client): Promise<void> {
    if ((client as pg.Client & { _activeQuery?: unknown })._activeQuery == null) {
      return Promise.resolve();
    }
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

  /** @internal */
  executeBatch = pgExecuteBatch;

  override async internalExecute(
    sql: string,
    name: string | null = "SQL",
    binds: unknown[] = [],
    {
      materializeTransactions = true,
      allowRetry = false,
      prepare = false,
    }: {
      materializeTransactions?: boolean;
      allowRetry?: boolean;
      prepare?: boolean;
    } = {},
  ): Promise<unknown> {
    sql = preprocessQuery.call(this as any, sql);
    try {
      if (materializeTransactions) await this.materializeTransactions();
      const hasBinds = binds.length > 0;
      const bindArray = hasBinds ? (this.typeCastedBinds(binds) ?? []) : [];
      const runSql = hasBinds ? this.rewriteBinds(sql, bindArray) : sql;
      const result = await this.log(runSql, name, binds, bindArray, false, (payload) =>
        this.withRawConnection({ materializeTransactions: false, allowRetry }, async (conn) => {
          const client = conn as unknown as pg.Client;
          const runResult = await this._performQuery(client, runSql, binds, bindArray, {
            prepare,
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
      if (materializeTransactions) this.dirtyCurrentTransaction();
    }
  }

  async createSavepoint(name: string): Promise<void> {
    await this.internalExecute(`SAVEPOINT "${name}"`, "TRANSACTION");
  }

  async releaseSavepoint(name: string): Promise<void> {
    await this.internalExecute(`RELEASE SAVEPOINT "${name}"`, "TRANSACTION");
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    await this.internalExecute(`ROLLBACK TO SAVEPOINT "${name}"`, "TRANSACTION");
  }

  static nativeDatabaseTypes(this: typeof PostgreSQLAdapter): NativeDatabaseTypes {
    if (this._nativeDatabaseTypes == null) {
      const types: NativeDatabaseTypes = { ...this.NATIVE_DATABASE_TYPES };
      types["datetime"] = types[this.datetimeType];
      this._nativeDatabaseTypes = types;
    }
    return this._nativeDatabaseTypes;
  }

  nativeDatabaseTypes(): NativeDatabaseTypes {
    return (this.constructor as typeof PostgreSQLAdapter).nativeDatabaseTypes();
  }

  /** @internal */
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

  async setStandardConformingStrings(): Promise<void> {
    await this.internalExecute("SET standard_conforming_strings = on", "SCHEMA");
  }

  /** @missingRailsCall query_value — PERMANENT */
  maxIdentifierLength(): number {
    return this._maxIdentifierLength ?? 63;
  }

  /** @noRailsEquivalent PERMANENT */
  async warmMaxIdentifierLength(): Promise<number> {
    if (this._maxIdentifierLength == null) {
      const value = await this.queryValue("SHOW max_identifier_length", "SCHEMA");
      this._maxIdentifierLength = parseInt(String(value ?? "63"), 10);
    }
    return this._maxIdentifierLength;
  }

  async sessionAuth(user: string): Promise<void> {
    await this.clearCacheBang();
    const quoted = user.toUpperCase() === "DEFAULT" ? "DEFAULT" : pgQuoteColumnName(user);
    await this.internalExecute(`SET SESSION AUTHORIZATION ${quoted}`, undefined, [], {
      materializeTransactions: true,
    });
  }

  isUseInsertReturning(): boolean {
    return this._useInsertReturning != null && this._useInsertReturning !== false;
  }

  private lastInsertIdResult = pgLastInsertIdResult;

  /** @internal */
  override returningColumnValues(result: Result): unknown[] | undefined {
    return pgReturningColumnValues(result);
  }

  static async newClient(connParams: pg.ClientConfig): Promise<pg.Client> {
    const client = new pg.Client(connParams);
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

  async exec(sql: string): Promise<void> {
    await this.withRawConnection({}, async (conn) => {
      const client = conn as unknown as pg.Client;
      try {
        await client.query(sql);
      } catch (e) {
        throw this.translateExceptionClass(e, sql, []);
      }
    });
  }

  async close(): Promise<void> {
    void this._statements.reset();
    this._client = null;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    this._closed = true;
    if (this._acquiring) this._acquireGeneration++;
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._pgClientOptions = null;
    if (conn) await conn.end();
  }

  /** @internal */
  async connect(): Promise<void> {
    await this._acquireFreshClient();
  }

  /** @internal */
  private _discardRawConnection(): void {
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._client = null;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    void this._statements.reset();
    this._closed = false;
    conn?.end().catch(() => {});
  }

  /** @internal */
  async reconnect(): Promise<void> {
    this._discardRawConnection();
    await this.connect();
  }

  override async resetBang(): Promise<void> {
    await this.lock.synchronize(async () => {
      const live = this._rawConnection;
      if (!live) {
        await this.connectBang();
        return;
      }

      if (this.transactionStatus !== PQTRANS_IDLE) {
        await live.query("ROLLBACK");
      }
      await live.query("DISCARD ALL");

      this._connectionConfigured = false;
      this._client = null;

      await super.resetBang();
    });
  }

  /** @internal */
  async configureConnection(): Promise<void> {
    const conn = this._rawConnection;
    if (!conn) return;
    return this._maybeConfigureConnection(conn);
  }

  override disconnectBang(): void {
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._client = null;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    void this._statements.reset();
    if (this._acquiring) this._acquireGeneration++;
    this._closingDriver = conn?.end().catch(() => {}) ?? null;
    this.resetTransaction();
    super.disconnectBang();
  }

  /** @noRailsEquivalent PERMANENT */
  whenClosed(): Promise<void> {
    return this._closingDriver ?? Promise.resolve();
  }

  override discardBang(): void {
    const conn = this._rawConnection;
    this._rawConnection = null;
    this._client = null;
    this._connectionConfigured = false;
    this._typeMapEagerLoaded = false;
    void this._statements.reset();
    this._closed = true;
    if (this._acquiring) this._discardedAcquireGenerations.add(this._acquireGeneration);
    this._acquireGeneration++;
    abandonRawSocket(conn);
    super.discardBang();
  }

  /** @internal */
  _currentClientForTest(): pg.Client | null {
    return this._client;
  }

  /** @internal */
  isInTransaction(): boolean {
    return this.openTransactions() > 0;
  }

  get raw(): pg.Client {
    if (this._rawConnection) return this._rawConnection;
    if (this._closed || this._pgClientOptions == null) {
      throw new Error("PostgreSQLAdapter: connection is closed");
    }
    throw new Error(
      "PostgreSQLAdapter: connection has not been opened yet — run a query first to lazy-connect",
    );
  }

  override async buildInsertSql(insert: InsertBuilder): Promise<string> {
    let sql = `INSERT ${await insert.into()}`;

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

  override async checkVersion(): Promise<void> {
    if ((await this.databaseVersion) < 9_03_00) {
      throw new Error(
        `Your version of PostgreSQL (${await this.databaseVersion}) is too old. Active Record supports PostgreSQL >= 9.3.`,
      );
    }
  }

  /** @internal */
  async _serverVersion(client: pg.Client): Promise<number> {
    const result = await client.query("SHOW server_version_num");
    return parseInt(String(result.rows[0]?.server_version_num ?? "0"), 10);
  }

  async getDatabaseVersion(): Promise<number> {
    return await this.withRawConnection({}, async (conn) => {
      const version = await this._serverVersion(conn as unknown as pg.Client);
      if (version === 0) {
        throw new ConnectionFailed("Could not determine PostgreSQL version");
      }
      return version;
    });
  }

  async postgresqlVersion(): Promise<number> {
    return await this.databaseVersion;
  }

  supportsBulkAlter(): boolean {
    return true;
  }
  async supportsIndexSortOrder(): Promise<boolean> {
    return true;
  }
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

  override quote(value: unknown): string {
    return pgQuote.call(this, value) as string;
  }

  override quoteString(s: string): string {
    return pgQuoteString(s);
  }

  quotedDate(value: Parameters<typeof pgQuotedDate>[0]): string {
    return pgQuotedDate(value);
  }

  override typeCast(value: unknown): unknown {
    return pgTypeCast.call(this, value);
  }

  /** @internal */
  override lookupCastType(sqlType: string | null): ValueType {
    return pgLookupCastType.call(this, sqlType);
  }

  override quoteDefaultExpression(value: unknown, column: unknown): string {
    return pgQuoteDefaultExpression.call(this, value, column as DefaultExpressionColumn) as string;
  }

  async extensions(): Promise<string[]> {
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

  /** @missingRailsCall values_at — PERMANENT */
  async enableExtension(name: string, _options?: Record<string, unknown>): Promise<void> {
    const parts = String(name).split(".");
    const [schema, extName] = [parts.at(-2) ?? null, parts.at(-1)!];
    let sql = `CREATE EXTENSION IF NOT EXISTS "${extName}"`;
    if (schema) sql += ` SCHEMA ${schema}`;
    await this.internalExecQuery(sql);
    await this.reloadTypeMap();
  }

  /** @missingRailsCall values_at — PERMANENT */
  async disableExtension(name: string, options: { force?: "cascade" } = {}): Promise<void> {
    const parts = String(name).split(".");
    const extName = parts.at(-1)!;
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    await this.internalExecQuery(`DROP EXTENSION IF EXISTS "${extName}"${cascade}`);
    await this.reloadTypeMap();
  }

  async enumTypes(): Promise<[string, string[]][]> {
    const query = `
      SELECT
        type.typname AS name,
        type.OID AS oid,
        n.nspname AS schema,
        array_agg(enum.enumlabel ORDER BY enum.enumsortorder) AS value
      FROM pg_enum AS enum
      JOIN pg_type AS type ON (type.oid = enum.enumtypid)
      JOIN pg_namespace n ON type.typnamespace = n.oid
      WHERE n.nspname = ANY (current_schemas(false))
      GROUP BY type.OID, n.nspname, type.typname;
    `;
    const currentSchema = await this.currentSchema();
    const result = await this.internalExecQuery(query, "SCHEMA", [], {
      allowRetry: true,
      materializeTransactions: false,
    });
    const memo = new Map<string, string[]>();
    for (const row of result.castValues() as unknown[][]) {
      const name = row[0] as string;
      const schema = row[2] === currentSchema ? null : (row[2] as string);
      const fullName = [schema, name].filter((part) => part != null).join(".");
      memo.set(fullName, row.at(-1) as string[]);
    }
    return Array.from(memo);
  }

  async createEnum(
    name: string,
    values: string[],
    _options?: Record<string, unknown>,
  ): Promise<void> {
    const sqlValues = values.map((s) => this.quote(s)).join(", ");
    const scope = this.quotedScope(name);
    const query = `
      DO $$
      BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE t.typname = ${scope.name}
              AND n.nspname = ${scope.schema}
          ) THEN
              CREATE TYPE ${this.quoteTableName(name)} AS ENUM (${sqlValues});
          END IF;
      END
      $$;
    `;
    await this.internalExecQuery(query);
    await this.reloadTypeMap();
  }

  async dropEnum(
    name: string,
    values?: string[] | { ifExists?: boolean },
    options: { ifExists?: boolean } = {},
  ): Promise<void> {
    if (values !== null && values !== undefined && !Array.isArray(values)) {
      options = values;
    }
    const query = `
      DROP TYPE${options.ifExists ? " IF EXISTS" : ""} ${this.quoteTableName(name)};
    `;
    await this.internalExecQuery(query);
    await this.reloadTypeMap();
  }

  async renameEnum(name: string, newName?: string | { to: string }): Promise<void> {
    const options: { to?: string } = typeof newName === "object" && newName !== null ? newName : {};
    if (typeof newName !== "string") {
      if (options.to == null) {
        throw new ArgumentError("rename_enum requires two from/to name positional arguments.");
      }
      newName = options.to;
    }
    await this.execQuery(
      `ALTER TYPE ${this.quoteTableName(name)} RENAME TO ${this.quoteTableName(newName)}`,
    );
    await this.reloadTypeMap();
  }

  async addEnumValue(
    typeName: string,
    value: string,
    options: { before?: string; after?: string; ifNotExists?: boolean } = {},
  ): Promise<void> {
    const { before, after } = options;
    let sql = `ALTER TYPE ${this.quoteTableName(typeName)} ADD VALUE`;
    if (options.ifNotExists) sql += " IF NOT EXISTS";
    sql += ` ${this.quote(value)}`;

    if (before != null && after != null) {
      throw new ArgumentError("Cannot have both :before and :after at the same time");
    } else if (before != null) {
      sql += ` BEFORE ${this.quote(before)}`;
    } else if (after != null) {
      sql += ` AFTER ${this.quote(after)}`;
    }

    await this.execute(sql);
    await this.reloadTypeMap();
  }

  async renameEnumValue(
    typeName: string,
    options: { from?: string; to?: string } = {},
  ): Promise<void> {
    if (!((await this.databaseVersion) >= 10_00_00)) {
      throw new ArgumentError("Renaming enum values is only supported in PostgreSQL 10 or later");
    }

    const from = options.from;
    if (from == null) throw new ArgumentError(":from is required");
    const to = options.to;
    if (to == null) throw new ArgumentError(":to is required");

    await this.execute(
      `ALTER TYPE ${this.quoteTableName(typeName)} RENAME VALUE ${this.quote(from)} TO ${this.quote(to)}`,
    );
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

  /** @missingRailsCall any? — PERMANENT */
  async foreignTableExists(tableName: string): Promise<boolean> {
    if (!tableName) return false;
    const names = await this.queryValues(
      this.dataSourceSql(tableName, { type: "FOREIGN TABLE" }),
      "SCHEMA",
    );
    return names.length > 0;
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
    const maxIdentifierLength = await this.warmMaxIdentifierLength();
    const result = await this.pkAndSequenceFor(newName);
    if (result) {
      const [pk, seq] = result;
      const maxPkeyPrefix = maxIdentifierLength - "_pkey".length;
      const idx = `${tableName.slice(0, maxPkeyPrefix)}_pkey`;
      const newIdx = `${newName.slice(0, maxPkeyPrefix)}_pkey`;
      await this.execute(
        `ALTER INDEX ${this.quoteTableName(idx)} RENAME TO ${this.quoteTableName(newIdx)}`,
      );

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
    columnName: string | string[],
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
      include?: string | string[];
      comment?: string;
    } = {},
  ): Promise<void> {
    const createIndex = (await this.buildCreateIndexDefinition(tableName, columnName, options))!;
    await this.execute(await this.schemaCreation.accept(createIndex));

    const index = createIndex.index;
    if (index.comment) {
      await this.execute(
        `COMMENT ON INDEX ${this.quoteColumnName(index.name)} IS ${this.quote(index.comment)}`,
      );
    }
  }

  async removeIndex(
    tableName: string,
    columnName?:
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
    let column: string | string[] | undefined;
    if (typeof columnName === "string" || Array.isArray(columnName)) {
      column = columnName;
    } else {
      column = undefined;
      options = { ...columnName, ...options };
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

    if (options.ifExists && !(await this.indexExists(tableName, column, options))) {
      return;
    }

    const indexToRemove = new Name(
      table.schema,
      await this.indexNameForRemove(table.toString(), column, options),
    ).toString();

    await this.execute(
      `DROP INDEX ${this.indexAlgorithm(options.algorithm) ?? ""} ${this.quoteTableName(indexToRemove)}`,
    );
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    this.assertValidDeferrable(options.deferrable);
    await super.addForeignKey(fromTable, toTable, options);
  }

  override disableReferentialIntegrity(fn: () => Promise<void>): Promise<void> {
    return disableReferentialIntegrity.call(this, fn);
  }

  checkAllForeignKeysValidBang = checkAllForeignKeysValidBang;

  override quoteTableNameForAssignment(_table: string, attr: string): string {
    return pgQuoteTableNameForAssignment(_table, attr);
  }

  override quotedBinary(value: unknown): string {
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

  /** @internal */
  translateException(
    exception: unknown,
    { message, sql, binds }: { message: string; sql: string; binds: unknown[] },
  ): unknown {
    if (
      !(exception instanceof pg.DatabaseError) &&
      !PostgreSQLAdapter._isConnectionError(exception) &&
      !PostgreSQLAdapter._isConnectionClosedBeforeSend(exception)
    ) {
      return exception;
    }

    switch (exception instanceof pg.DatabaseError ? exception.code : undefined) {
      case undefined:
        if (PostgreSQLAdapter._isConnectionClosedBeforeSend(exception)) {
          return new ConnectionNotEstablished(exception as Error, { connectionPool: this.pool });
        } else if (PostgreSQLAdapter._isConnectionError(exception)) {
          return new ConnectionFailed(exception as Error, { connectionPool: this.pool });
        } else {
          return super.translateException(exception, { message, sql, binds });
        }
      case UNIQUE_VIOLATION:
        return new RecordNotUnique(message, { sql, binds, connectionPool: this.pool });
      case FOREIGN_KEY_VIOLATION:
        return new InvalidForeignKey(message, { sql, binds, connectionPool: this.pool });
      case VALUE_LIMIT_VIOLATION:
        return new ValueTooLong(message, { sql, binds, connectionPool: this.pool });
      case NUMERIC_VALUE_OUT_OF_RANGE:
        return new ActiveRecordRangeError(message, { sql, binds, connectionPool: this.pool });
      case NOT_NULL_VIOLATION:
        return new NotNullViolation(message, { sql, binds, connectionPool: this.pool });
      case SERIALIZATION_FAILURE:
        return new SerializationFailure(message, { sql, binds, connectionPool: this.pool });
      case DEADLOCK_DETECTED:
        return new Deadlocked(message, { sql, binds, connectionPool: this.pool });
      case DUPLICATE_DATABASE:
        return new DatabaseAlreadyExists(message, { sql, binds, connectionPool: this.pool });
      case LOCK_NOT_AVAILABLE:
        return new LockWaitTimeout(message, { sql, binds, connectionPool: this.pool });
      case QUERY_CANCELED:
        return new QueryCanceled(message, { sql, binds, connectionPool: this.pool });
      default:
        return super.translateException(exception, { message, sql, binds });
    }
  }

  indexName(
    tableName: string,
    options:
      | { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean }
      | string
      | string[],
  ): string {
    const [, table] = this.extractSchemaQualifiedName(String(tableName));
    return super.indexName(table, options);
  }

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
  async addColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<string | [string, () => Promise<void>]> {
    if (!("comment" in options)) {
      return super.addColumnForAlter(tableName, columnName, type, options);
    }
    return [
      (await super.addColumnForAlter(tableName, columnName, type, options)) as string,
      () => this.changeColumnComment(tableName, columnName, options.comment ?? null),
    ];
  }

  /** @internal */
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

  /** @internal */
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

  /** @internal */
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

  private deferrable(deferrable: "immediate" | "deferred" | undefined): string {
    if (!deferrable) return "";
    return ` DEFERRABLE INITIALLY ${deferrable.toUpperCase()}`;
  }

  /** @internal */
  extractValueFromDefault(defaultExpr: string | null): unknown {
    if (defaultExpr == null) return null;
    const quoted = /^[(B]?'([\s\S]*)'.*::"?([\w. ]+)"?(?:\[\])?$/.exec(defaultExpr);
    if (quoted) {
      if (quoted[1] === "now" && quoted[2] === "date") return null;
      return quoted[1].replace(/''/g, "'");
    }
    if (defaultExpr === "true" || defaultExpr === "false") return defaultExpr;
    const num = /^\(?(-?\d+(?:\.\d*)?)\)?(?:::bigint)?$/.exec(defaultExpr);
    if (num) return num[1];
    if (/^-?\d+$/.test(defaultExpr)) return defaultExpr;
    return null;
  }

  /**
   * @internal
   * @missingRailsArgs has_default_function? — PERMANENT
   */
  extractDefaultFunction(defaultValue: unknown, defaultExpr: string | null): string | null {
    if (defaultExpr != null && this.hasDefaultFunction(defaultValue, defaultExpr)) {
      return defaultExpr;
    }
    return null;
  }

  /** @internal */
  hasDefaultFunction(defaultValue: unknown, defaultExpr: string): boolean {
    return defaultValue == null && DEFAULT_FUNCTION_RE.test(defaultExpr);
  }

  /** @internal */
  isRetryableQueryError(exception: unknown): boolean {
    return this.transactionStatus !== PQTRANS_INERROR && super.isRetryableQueryError(exception);
  }

  /** @internal */
  isCachedPlanFailure(pgerror: unknown): boolean {
    if (!(pgerror instanceof Error)) return false;
    const err = pgerror as { code?: string; message?: string };
    if (err.code !== FEATURE_NOT_SUPPORTED) return false;
    return typeof err.message === "string" && err.message.includes("cached plan");
  }

  /** @internal */
  sqlKey(sql: string): string {
    return `${this._schemaSearchPathMemo ?? ""}-${sql}`;
  }

  /**
   * @internal
   * @missingRailsCall translate_exception_class — PERMANENT
   */
  async prepareStatement(sql: string, _binds: unknown[], _conn: pg.Client): Promise<string> {
    const pool = this._statements;
    const key = this.sqlKey(sql);
    if (pool.isKey(key)) return pool.get(key)!.name;
    const name = pool.nextKey();
    await pool.set(key, { name });
    return name;
  }

  /**
   * @internal
   * @missingRailsCall raw_execute — CONVERGEABLE sqlite3-and-mysql-bare-missing-rails-call-receipts
   */
  async reconfigureConnectionTimezone(): Promise<void> {
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

  /** @internal */
  async columnDefinitions(tableName: string): Promise<unknown[][]> {
    const identity = (await this.supportsIdentityColumns()) ? "attidentity" : this.quote("");
    const attgenerated = (await this.supportsVirtualColumns()) ? "attgenerated" : this.quote("");
    return this.query(
      `  SELECT a.attname, format_type(a.atttypid, a.atttypmod),
             pg_get_expr(d.adbin, d.adrelid), a.attnotnull, a.atttypid, a.atttypmod,
             c.collname, col_description(a.attrelid, a.attnum) AS comment,
             ${identity} AS identity,
             ${attgenerated} as attgenerated
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        LEFT JOIN pg_type t ON a.atttypid = t.oid
        LEFT JOIN pg_collation c ON a.attcollation = c.oid AND a.attcollation <> t.typcollation
       WHERE a.attrelid = ${this.quote(this.quoteTableName(tableName))}::regclass
         AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum`,
      "SCHEMA",
    );
  }

  /** @internal */
  buildStatementPool(): StatementPool {
    return new StatementPool(
      this,
      PostgreSQLAdapter.typeCastConfigToInteger(this._statementLimit) as number,
    );
  }

  /** @internal */
  addPgEncoders(): void {}

  /** @internal */
  async updateTypemapForDefaultTimezone(): Promise<void> {
    const tz = ActiveRecord.defaultTimezone;
    if (this._mappedDefaultTimezone === tz) return;
    this._mappedDefaultTimezone = tz;
    await this.reconfigureConnectionTimezone();
  }

  /** @internal */
  addPgDecoders(): void {}

  /** @internal */
  constructCoder(
    row: { oid: string | number; typname: string },
    coderClass: string | null,
  ): { oid: number; name: string; coderClass: string } | null {
    if (!coderClass) return null;
    return { oid: Number(row.oid), name: row.typname, coderClass };
  }

  /** @internal */
  _rawConnectionForTest(): pg.Client | null {
    return this._rawConnection;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PostgreSQLAdapter {
  get databaseVersion(): number | Promise<number>;

  explain(arel: string, binds?: unknown[], options?: ExplainOption[]): Promise<string>;

  isWriteQuery(sql: string): boolean;

  execute(
    sql: string,
    name?: string | null,
    options?: { allowRetry?: boolean },
  ): Promise<Record<string, unknown>[]>;

  execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string | false | null,
    sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result>;

  beginDbTransaction(): Promise<void>;

  beginIsolatedDbTransaction(isolation: string): Promise<void>;

  commitDbTransaction(): Promise<void>;

  execRollbackDbTransaction(): Promise<void>;

  execRestartDbTransaction(): Promise<void>;

  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral;

  buildExplainClause(options?: ExplainOption[]): Promise<string>;

  setConstraints(
    deferred: "deferred" | "immediate",
    ...constraints: (string | undefined)[]
  ): Promise<void>;

  /** @internal */
  validateIndexLengthBang(tableName: string, newName: string, internal?: boolean): void;

  schemaNames(): Promise<string[]>;

  createSchema(
    schemaName: string,
    options?: { force?: boolean; ifNotExists?: boolean },
  ): Promise<void>;

  dropSchema(schemaName: string, options?: { ifExists?: boolean }): Promise<void>;

  schemaExists(name: string): Promise<boolean>;

  currentSchema(): Promise<string>;

  columnsForDistinct(columns: string | string[], orders?: (string | Nodes.Node)[]): string;

  indexes(tableName: string): Promise<IndexDefinition[]>;

  indexNameExists(tableName: string, indexName: string): Promise<boolean>;

  primaryKey(tableName: string): Promise<string | string[] | null>;

  pkAndSequenceFor(table: string): Promise<[string, Name | null] | null>;

  columns(tableName: string): Promise<Column[]>;

  changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions & { using?: string; castAs?: string },
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
  validateConstraint(tableName: string, constraintName: string | undefined): Promise<void>;

  validateCheckConstraint(
    tableName: string,
    options: string | { name: string; expression?: string },
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

  /** @internal */
  newColumnFromField(tableName: string, field: unknown[], _definitions: unknown): Promise<Column>;

  /** @internal */
  changeColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions & { using?: string; castAs?: string },
  ): Promise<Array<string | (() => Promise<void>)>>;

  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /** @internal */
  dataSourceSql(options: { type?: string }): string;

  /** @internal */
  fetchTypeMetadata(columnName: string, sqlType: string, oid: number, fmod: number): TypeMetadata;

  /** @internal */
  quotedScope(
    name?: string | null,
    options?: { type?: string },
  ): { schema: string; name: string | null; type: string | null };

  /** @internal */
  extractSchemaQualifiedName(string: string): [string | null, string];

  tables(): Promise<string[]>;

  views(): Promise<string[]>;

  tableExists(name: string): Promise<boolean>;

  foreignKeyExists(
    fromTable: string,
    toTable?: string | ForeignKeyLookupOptions,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<boolean>;

  createDatabase(name: string, options?: CreateDatabaseOptions): Promise<void>;

  /** @noRailsEquivalent PERMANENT */
  createRange(name: string, options: { subtype: string; subtypeDiff?: string }): Promise<void>;

  /** @noRailsEquivalent PERMANENT */
  dropRange(name: string, options?: { ifExists?: boolean }): Promise<void>;

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

  serialSequence(table: string, column: string): Promise<string | null>;

  defaultSequenceName(tableName: string, pk?: string | string[]): Promise<string | null>;

  setPkSequenceBang(table: string, value: number): Promise<void>;

  resetPkSequenceBang(
    table: string,
    pk?: string | null,
    sequence?: Name | string | null,
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
    expression?: string | Record<string, unknown> | null,
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
    columnName?: string | string[] | Record<string, unknown> | null,
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
    { expression, ...options }: Record<string, unknown>,
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
    { column, ...options }: Record<string, unknown>,
  ): Promise<UniqueConstraintDefinition>;
}

export type IndexDefinition = AbstractIndexDefinition;

export interface PreparedStatement {
  name: string;
}

export class StatementPool extends GenericStatementPool<PreparedStatement> {
  private _connection: PostgreSQLAdapter;
  private _counter = 0;
  private _deallocating: Promise<void> = Promise.resolve();

  constructor(connection: PostgreSQLAdapter, maxSize = 1000) {
    super(maxSize);
    this._connection = connection;
  }

  nextKey(): string {
    return `a${++this._counter}`;
  }

  protected override dealloc(key: PreparedStatement): void | Promise<void> {
    const client = this._connection._rawConnection as (pg.Client & PgClientLiveness) | null;
    if (!client || client._ending === true || client._ended === true) return;
    const deallocSql = `DEALLOCATE ${pgQuoteColumnName(key.name)}`;
    this._deallocating = this._deallocating
      .then(() => {
        return client.query(deallocSql);
      })
      .then(
        () => {},
        () => {},
      );
    return this._deallocating;
  }
}

export class MoneyDecoder {
  static readonly TYPE = new Money();

  static decode(value: string): string | null {
    return MoneyDecoder.TYPE.deserialize(value) as string | null;
  }
}

function _assertPgAdvisoryLockId(lockId: number | bigint | string): void {
  const isInteger = typeof lockId === "bigint" || Number.isInteger(lockId);
  if (!isInteger || BigInt(lockId) < -(2n ** 63n) || BigInt(lockId) >= 2n ** 63n) {
    throw new ArgumentError("PostgreSQL requires advisory lock ids to be a signed 64 bit integer");
  }
}

const DEFAULT_FUNCTION_RE = /\w+\(.*\)|\(.*\)::\w+|CURRENT_DATE|CURRENT_TIMESTAMP/;

(PostgreSQLAdapter.prototype as any).explain = pgExplain;
(PostgreSQLAdapter.prototype as any).isWriteQuery = pgIsWriteQuery;
(PostgreSQLAdapter.prototype as any).execute = pgExecute;
(PostgreSQLAdapter.prototype as any).execInsert = pgExecInsert;
(PostgreSQLAdapter.prototype as any).beginDbTransaction = pgBeginDbTransaction;
(PostgreSQLAdapter.prototype as any).beginIsolatedDbTransaction = pgBeginIsolatedDbTransaction;
(PostgreSQLAdapter.prototype as any).commitDbTransaction = pgCommitDbTransaction;
(PostgreSQLAdapter.prototype as any).execRollbackDbTransaction = pgExecRollbackDbTransaction;
(PostgreSQLAdapter.prototype as any).execRestartDbTransaction = pgExecRestartDbTransaction;
(PostgreSQLAdapter.prototype as any).highPrecisionCurrentTimestamp =
  pgHighPrecisionCurrentTimestamp;
(PostgreSQLAdapter.prototype as any).buildExplainClause = pgBuildExplainClause;
(PostgreSQLAdapter.prototype as any).setConstraints = pgSetConstraints;
(PostgreSQLAdapter.prototype as any).castResult = castResult;
(PostgreSQLAdapter.prototype as any).handleWarnings = handleWarnings;
(PostgreSQLAdapter.prototype as any)._abstractIsWarningIgnored =
  AbstractAdapter.prototype.isWarningIgnored;
(PostgreSQLAdapter.prototype as any).isWarningIgnored = pgIsWarningIgnored;
(PostgreSQLAdapter.prototype as any).buildTruncateStatements = pgBuildTruncateStatements;

dirtiesQueryCache(PostgreSQLAdapter, "rollbackToSavepoint");
dirtiesQueryCache(PostgreSQLAdapter, "execute");

include(PostgreSQLAdapter, SchemaStatements);

PostgreSQLAdapter.prototype.performQuery = function (
  this: PostgreSQLAdapter,
  rawConnection,
  sql,
  binds,
  typeCastedBinds,
  options,
) {
  return pgPerformQuery.call(this as never, rawConnection, sql, binds, typeCastedBinds, {
    prepare: options.prepare,
    notificationPayload: options.notificationPayload ?? {},
    rowMode: "array",
  });
};

runLoadHooks("active_record_postgresqladapter", PostgreSQLAdapter);
