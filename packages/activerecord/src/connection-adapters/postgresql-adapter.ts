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
  type DefaultExpressionColumn,
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
const PQTRANS_IDLE = 0;
const PQTRANS_ACTIVE = 1;
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;
const PQTRANS_UNKNOWN = 4;
const IDLE_TRANSACTION_STATUSES = [PQTRANS_IDLE, PQTRANS_INTRANS, PQTRANS_INERROR];
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

type SessionVariables = Record<string, string | number | boolean | null | ":default">;

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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE type-registry-key-replaces-per-adapter-overrides
   */
  override get typeRegistryKey(): AdapterName {
    return "postgres";
  }

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
    config: Record<string, unknown> = {},
    options: { includePassword?: boolean } = {},
  ): { env: Record<string, string>; argv: string[] } {
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
      const pgOptions = Object.entries(variables)
        .filter(([, v]) => v !== ":default")
        .map(([name, v]) => `-c ${name}=${String(v).replace(/[ \\]/g, "\\$&")}`)
        .join(" ");
      if (pgOptions) env.PGOPTIONS = pgOptions;
    }
    const argv = this.findCmdAndExec(
      ActiveRecord.databaseCli["postgresql"],
      config.database as string,
    );
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
  private _inTransaction = false;
  private _readyForQueryStatus = "I";
  _commandSettled = true;
  private _typeMap: HashLookupTypeMap | null = null;
  private _maxIdentifierLength: number | null = null;
  private _useInsertReturning = true;
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
    super();
    if (PostgreSQLAdapter._isDeprecatedRawConnectionArg(config)) {
      deprecator().warn(RAW_CONNECTION_DEPRECATION_MESSAGE);
      this._acceptDeprecatedRawConnection(config, deprecatedConfig);
      this._statements = this.buildStatementPool();
      return;
    }
    if (deprecatedConfig != null) {
      throw new ArgumentError(
        "when initializing an Active Record adapter with a config hash, that should be the only argument",
      );
    }
    if (typeof config === "object" && config !== null) {
      this._config = { ...(config as Record<string, unknown>) };
    }
    this.preparedStatements =
      !ActiveRecord.disablePreparedStatements &&
      PostgreSQLAdapter.typeCastConfigToBoolean(
        "preparedStatements" in this._config
          ? this._config.preparedStatements
          : this.defaultPreparedStatements(),
      );
    this._defaultTimezone = PostgreSQLAdapter.validateDefaultTimezone(this._config.defaultTimezone);
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
    if (advisoryLocks !== undefined) {
      this._advisoryLocksEnabled =
        PostgreSQLAdapter.typeCastConfigToBoolean(advisoryLocks) !== false;
    }
    if (insertReturning !== undefined) this._useInsertReturning = insertReturning;
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
        const pgVal = val === true ? "on" : val === false ? "off" : String(val);
        await client.query(`SET SESSION ${key} TO ${this.quoteLiteral(pgVal)}`);
      }
    }
    this._connectionConfigured = true;
    if (!this._typeMapEagerLoaded) {
      this._typeMapEagerLoaded = true;
      await this._eagerLoadAdditionalTypes(client);
    }
  }

  private async _eagerLoadAdditionalTypes(client: pg.Client): Promise<void> {
    this._typeMap = null;
    const initializer = new TypeMapInitializer(this.typeMap);
    for await (const query of this.loadTypesQueries(initializer)) {
      const result = await client.query(query);
      initializer.run(result.rows as unknown as PgTypeRow[]);
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
      this._typeMap = new HashLookupTypeMap();
      initializeInstanceTypeMap(this._typeMap, ActiveRecord.defaultTimezone);
    }
    return this._typeMap;
  }

  private async initializeTypeMap(m: HashLookupTypeMap = this.typeMap): Promise<void> {
    (this.constructor as typeof PostgreSQLAdapter).initializeTypeMap(m);

    const timezone = ActiveRecord.defaultTimezone;
    registerClassWithPrecision(m, "time", TimeType, { timezone });
    registerClassWithPrecision(m, "timestamp", Timestamp, { timezone });
    registerClassWithPrecision(m, "timestamptz", TimestampWithTimeZone);

    await this.loadAdditionalTypes();
  }

  /** @internal */
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

  override lookupCastTypeFromColumn(column: CastableColumn): Type {
    return pgLookupCastTypeFromColumn.call(this, column) as Type;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE async-overrides-of-synchronous-rails-adapter-methods
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
      const type = await this.getOidType(f.dataTypeID, -1, f.name, "");
      columnTypes[i] = type;
      if (!/^\d+$/.test(f.name)) {
        columnTypes[f.name] = type;
      }
    }
    const rowArrays = pgResult.rows;
    return new Result(columns, rowArrays, columnTypes as Record<string, Type>);
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
  }

  async reloadTypeMap(): Promise<void> {
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
        this._statements.reset();
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

  async execute(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
    { allowRetry = false }: { allowRetry?: boolean } = {},
  ): Promise<Record<string, unknown>[]> {
    sql = this.preprocessQuery(sql);
    const bindArray = this.typeCastedBinds(binds) ?? [];
    const rewritten = this.rewriteBinds(sql, bindArray);
    try {
      return await this.log(rewritten, name, binds, bindArray, false, async (payload) => {
        try {
          return await this.withRawConnection({ allowRetry }, async (conn) => {
            const client = conn as unknown as pg.Client;
            const result = await this._performQuery(client, rewritten, binds, bindArray, {
              prepare: false,
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
      this._noticeReceiverSqlWarnings = [];
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
                prepare: false,
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
              if (err instanceof PreparedStatementCacheExpired) throw err;
              if (useSavepoint) {
                this._commandSettled = false;
                await client.query(`ROLLBACK TO SAVEPOINT "${spName}"`).catch(() => {});
                this._commandSettled = false;
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
        const translated = this._translateException(e, pgSql, binds);
        throw translated;
      }
    });
  }

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
      this._client = null;
      this._inTransaction = false;
    }
  }

  async commitDbTransaction(): Promise<void> {
    return this.commit();
  }

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

  async execRestartDbTransaction(): Promise<void> {
    await this._cancelAnyRunningQuery();
    await this.internalExecute("ROLLBACK AND CHAIN", "TRANSACTION", [], {
      allowRetry: false,
      materializeTransactions: true,
    });
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
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

  /** @internal */
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

  async beginIsolatedDbTransaction(isolation: string): Promise<void> {
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

  override isWriteQuery(sql: string): boolean {
    return !READ_QUERY.test(sql);
  }

  /** @internal */
  executeBatch = pgExecuteBatch;

  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
    return arelSql("CURRENT_TIMESTAMP");
  }

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

  async buildExplainClause(options: ExplainOption[] = []): Promise<string> {
    if (options.length === 0) return "EXPLAIN";
    return `EXPLAIN (${options
      .map((option) => (option.startsWith(":") ? option.slice(1) : option))
      .join(", ")
      .toUpperCase()})`;
  }

  static nativeDatabaseTypes(): NativeDatabaseTypes {
    return postgresqlNativeDatabaseTypes(
      this.datetimeType,
      pgDatetimeConfig.nativeDatabaseTypesOverrides,
    );
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
    return this._useInsertReturning;
  }

  override async execInsert(
    sql: string,
    name: string | null = null,
    binds: unknown[] = [],
    pk?: string | false | null,
    sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result> {
    if (this._useInsertReturning || pk === false) {
      return super.execInsert(sql, name, binds, pk, sequenceName, returning);
    }
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

  private lastInsertIdResult = pgLastInsertIdResult;

  /** @internal */
  override returningColumnValues(result: Result): unknown[] | undefined {
    return pgReturningColumnValues(result);
  }

  static async newClient(config: pg.ClientConfig): Promise<pg.Client> {
    const client = new pg.Client(config);
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
        this._commandSettled = false;
        await client.query(sql);
      } catch (e) {
        throw this._translateException(e, sql, []);
      }
    });
  }

  async close(): Promise<void> {
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
    this._statements.reset();
    this._inTransaction = false;
    this._closed = false;
    conn?.end().catch(() => {});
  }

  /** @internal */
  async reconnect(): Promise<void> {
    this._discardRawConnection();
    await this.connect();
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE async-overrides-of-synchronous-rails-adapter-methods
   */
  override async verifyBang(): Promise<void> {
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
      await this.lock.synchronize(() => conn.query(";"));
    } catch {
      await this.reconnectBang({ restoreTransactions: true });
    }
    this.verifiedBang();
  }

  override resetBang(): void {
    if (!this._rawConnection) {
      super.resetBang();
      return;
    }
    const live = this._rawConnection;
    this._connectionConfigured = false;
    void this.lock
      .synchronize(async () => {
        if (this._client) {
          await live.query("ROLLBACK").catch(() => {});
          this._client = null;
          this._inTransaction = false;
        }
        await live.query("DISCARD ALL");
        if (this._rawConnection === live && !this._closed) {
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
        super.resetBang();
      })
      .catch(() => {});
  }

  /**
   * @internal
   * @missingRailsCall internal_execute — CONVERGEABLE sqlite3-and-mysql-bare-missing-rails-call-receipts
   * @missingRailsCall quote — CONVERGEABLE sqlite3-and-mysql-bare-missing-rails-call-receipts
   */
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
    this._statements.reset();
    this._inTransaction = false;
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
    this._statements.reset();
    this._inTransaction = false;
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
  get inTransaction(): boolean {
    return this.openTransactions > 0;
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

  /** @missingRailsCall with_raw_connection — CONVERGEABLE arm-permanent-connection-checkout-disallowed */
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
    return pgQuote.call(this, value);
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

  /**
   * @internal
   * @missingRailsCall query_value — PERMANENT
   * @missingRailsCall quote — PERMANENT
   * @missingRailsCall to_i — PERMANENT
   */
  override lookupCastType(sqlType: string | null): Type {
    if (typeof sqlType === "string") {
      sqlType = sqlType
        .replace(/\([^)]*\)/, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    return super.lookupCastType(sqlType);
  }

  override quoteDefaultExpression(value: unknown, column: unknown): string {
    return pgQuoteDefaultExpression.call(this, value, column as DefaultExpressionColumn);
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
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /** @internal */
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

    const indexToRemove = new Name(
      table.schema,
      await this.indexNameForRemove(table.toString(), columnName, options),
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
    }).deduplicate();
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

  /** @internal */
  extractSchemaQualifiedName(string: string): [string | null, string] {
    const name = Utils.extractSchemaQualifiedName(string);
    return [name.schema, name.identifier];
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
    const parenNum = /^\((-?\d+(?:\.\d+)?)\)(?:::[\w"\s.]+)+$/.exec(defaultExpr);
    if (parenNum) return parenNum[1];
    const castNum = /^(-?\d+(?:\.\d+)?)(?:::[\w"\s.]+)+$/.exec(defaultExpr);
    if (castNum) return castNum[1];
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
  translateException(
    exception: unknown,
    opts: { message?: string; sql?: string; binds?: unknown[] } = {},
  ): Error {
    return this._translateException(exception, opts.sql as string, opts.binds ?? []);
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
    const existing = pool.get(key);
    if (existing) return existing.name;
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

  /** @noRailsEquivalent PERMANENT */
  createRange(name: string, options: { subtype: string; subtypeDiff?: string }): Promise<void>;

  /** @noRailsEquivalent PERMANENT */
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

  /** @internal */
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

  protected override dealloc(stmt: PreparedStatement): void | Promise<void> {
    const client = this._connection._rawConnection as (pg.Client & PgClientLiveness) | null;
    if (!client || client._ending === true || client._ended === true) return;
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

const SERIAL_SEQUENCE_RE = /^nextval\('"?(?<sequenceName>.+_(?<suffix>seq\d*))"?'::regclass\)$/;

(PostgreSQLAdapter.prototype as any).castResult = castResult;
(PostgreSQLAdapter.prototype as any).handleWarnings = handleWarnings;
(PostgreSQLAdapter.prototype as any)._abstractIsWarningIgnored =
  AbstractAdapter.prototype.isWarningIgnored;
(PostgreSQLAdapter.prototype as any).isWarningIgnored = pgIsWarningIgnored;
(PostgreSQLAdapter.prototype as any).buildTruncateStatements = pgBuildTruncateStatements;

dirtiesQueryCache(PostgreSQLAdapter, "rollbackDbTransaction", "rollbackToSavepoint");
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
