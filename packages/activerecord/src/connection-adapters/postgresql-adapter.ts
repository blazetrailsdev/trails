import { ConnectionAdapters } from "../namespaces.js";
import type {
  DatabaseConfig,
  DatabaseConfigOptions,
} from "../database-configurations/database-config.js";
import pg from "pg";
import {
  block,
  excSetupMessage,
  fetch,
  rbModConstSet,
  setEnv,
  valuesAt,
} from "@blazetrails/ruby-compat";
import { ValueType, ArgumentError, BinaryData, TimeType } from "@blazetrails/activemodel";
import {
  classAttribute,
  include,
  runLoadHooks,
  filterMap,
  underscore,
} from "@blazetrails/activesupport";
import { Nodes, Visitors, type ArelNode } from "@blazetrails/arel";
import { IO, rbRegMatchP, rtest, RuntimeError } from "@blazetrails/ruby-compat";
import { Result } from "../result.js";
import * as Type from "../type.js";
import { HashLookupTypeMap } from "../type/hash-lookup-type-map.js";
import type { TypeMap } from "../type/type-map.js";
import { Name } from "./postgresql/utils.js";
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
  unescapeBytea as quotingUnescapeBytea,
  columnNameMatcher as pgColumnNameMatcher,
  columnNameWithOrderMatcher as pgColumnNameWithOrderMatcher,
  lookupCastType as pgLookupCastType,
  lookupCastTypeFromColumn as pgLookupCastTypeFromColumn,
  type CastableColumn,
} from "./postgresql/quoting.js";
import { TypeMapInitializer, type PgTypeRow } from "./postgresql/oid/type-map-initializer.js";
import { Money } from "./postgresql/oid/money.js";
import { BooleanType, FloatType, IntegerType, StringType } from "@blazetrails/activemodel";

import { Array as OidArray } from "./postgresql/oid/array.js";
import { RangeType } from "./postgresql/oid/range.js";
import { Date as OidDate } from "./postgresql/oid/date.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";
import { Json as ArJson } from "../type/json.js";
import { Text as ArText } from "../type/text.js";
import { Bit } from "./postgresql/oid/bit.js";
import { BitVarying } from "./postgresql/oid/bit-varying.js";
import { Bytea } from "./postgresql/oid/bytea.js";
import { pgConnection, type PGConnection } from "../pg/connection.js";
import { pgError } from "../pg/exceptions.js";
import { Cidr } from "./postgresql/oid/cidr.js";
import { DateTime as OidDateTime } from "./postgresql/oid/date-time.js";
import { Decimal } from "./postgresql/oid/decimal.js";
import { Enum } from "./postgresql/oid/enum.js";
import { Hstore } from "./postgresql/oid/hstore.js";
import { Inet } from "./postgresql/oid/inet.js";
import { Interval } from "./postgresql/oid/interval.js";
import { Jsonb } from "./postgresql/oid/jsonb.js";
import { LegacyPoint } from "./postgresql/oid/legacy-point.js";
import { Macaddr } from "./postgresql/oid/macaddr.js";
import { Oid } from "./postgresql/oid/oid.js";
import { Point } from "./postgresql/oid/point.js";
import { SpecializedString } from "./postgresql/oid/specialized-string.js";
import { Uuid } from "./postgresql/oid/uuid.js";
import { Vector } from "./postgresql/oid/vector.js";
import { Xml } from "./postgresql/oid/xml.js";

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
  QueryCanceled,
  RangeError as ActiveRecordRangeError,
  RecordNotUnique,
  SerializationFailure,
  ValueTooLong,
  SQLWarning,
} from "../errors.js";
import { AbstractAdapter, RAW_CONNECTION_DEPRECATION_MESSAGE } from "./abstract-adapter.js";
import { deprecator } from "../deprecator.js";
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
import { PGSimpleDecoder, PGTextDecoder, PGTypeMapByOid } from "./postgresql/pg-text-decoder.js";

type PGDecoderClass = new (options: { oid: number; name: string }) => PGSimpleDecoder;

const STRING_OIDS = new Set([
  114, 600, 718, 1017, 1082, 1114, 1115, 1182, 1183, 1184, 1185, 1186, 1187, 1270, 3802,
]);

function pgTypeParser(oid: number, format?: string): unknown {
  if (format === "binary") return pg.types.getTypeParser(oid, "binary");
  if (STRING_OIDS.has(oid)) return (v: unknown) => v;
  return pg.types.getTypeParser(oid, "text");
}

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
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;

const CONNECTION_OK = 0;

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
  query as pgQuery,
  isWriteQuery as pgIsWriteQuery,
  execute as pgExecute,
  execInsert as pgExecInsert,
  beginDbTransaction as pgBeginDbTransaction,
  beginIsolatedDbTransaction as pgBeginIsolatedDbTransaction,
  commitDbTransaction as pgCommitDbTransaction,
  execRollbackDbTransaction as pgExecRollbackDbTransaction,
  execRestartDbTransaction as pgExecRestartDbTransaction,
  cancelAnyRunningQuery as pgCancelAnyRunningQuery,
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
} from "./abstract/schema-definitions.js";
import { SchemaCreation as PgSchemaCreation } from "./postgresql/schema-creation.js";
import { SchemaDumper as PgSchemaDumper } from "./postgresql/schema-dumper.js";
import { pgDatetimeConfig } from "./postgresql/pg-datetime-config.js";
import { PG } from "../pg/pg.js";
import { type NativeDatabaseTypes } from "./abstract/native-database-types.js";
import { databaseCli, defaultTimezone } from "../active-record.js";
import { dbWarningsAction } from "../active-record.js";

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

  static async newClient(connParams: pg.ClientConfig): Promise<pg.Client> {
    const client = pgConnection(new pg.Client(connParams), connParams.stream);
    const { database, user, host } = client;
    try {
      await client.connect();
      client.on("error", () => {});
      return client;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      pgError(error);
      if (database === "postgres") {
        throw new ConnectionNotEstablished(error.message);
      } else if (database && error.message.includes(database)) {
        throw NoDatabaseError.dbError(database);
      } else if (user && error.message.includes(user)) {
        throw DatabaseConnectionError.usernameError(user);
      } else if (host && error.message.includes(host)) {
        throw DatabaseConnectionError.hostnameError(host);
      } else {
        throw new ConnectionNotEstablished(error.message);
      }
    }
  }

  static override dbconsole(
    config: DatabaseConfig,
    options: { includePassword?: boolean } = {},
  ): never {
    const pgConfig = (config as unknown as { configurationHash: DatabaseConfigOptions })
      .configurationHash;

    if (rtest(pgConfig.username)) setEnv("PGUSER", String(pgConfig.username));
    if (rtest(pgConfig.host)) setEnv("PGHOST", String(pgConfig.host));
    if (rtest(pgConfig.port)) setEnv("PGPORT", String(pgConfig.port));
    if (rtest(pgConfig.password) && rtest(options.includePassword)) {
      setEnv("PGPASSWORD", String(pgConfig.password));
    }
    if (rtest(pgConfig.sslmode)) setEnv("PGSSLMODE", String(pgConfig.sslmode));
    if (rtest(pgConfig.sslcert)) setEnv("PGSSLCERT", String(pgConfig.sslcert));
    if (rtest(pgConfig.sslkey)) setEnv("PGSSLKEY", String(pgConfig.sslkey));
    if (rtest(pgConfig.sslrootcert)) setEnv("PGSSLROOTCERT", String(pgConfig.sslrootcert));
    if (rtest(pgConfig.variables)) {
      setEnv(
        "PGOPTIONS",
        filterMap(
          Object.entries(pgConfig.variables as Record<string, unknown>),
          ([name, value]) => {
            if (value !== ":default") {
              return `-c ${name}=${String(value).replace(/[ \\]/g, "\\$&")}`;
            }
          },
        ).join(" "),
      );
    }
    return this.findCmdAndExec(databaseCli()["postgresql"], config.database!);
  }

  static get datetimeType(): string {
    return pgDatetimeConfig.datetimeType;
  }
  static set datetimeType(v: string) {
    pgDatetimeConfig.datetimeType = v;
  }

  supportsBulkAlter(): boolean {
    return true;
  }

  async supportsIndexSortOrder(): Promise<boolean> {
    return true;
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

  static readonly NATIVE_DATABASE_TYPES: NativeDatabaseTypes = {
    primary_key: "bigserial primary key",
    string: { name: "character varying" },
    text: { name: "text" },
    integer: { name: "integer", limit: 4 },
    bigint: { name: "bigint" },
    float: { name: "float" },
    decimal: { name: "decimal" },
    datetime: {},
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
    bit_varying: { name: "bit varying" },
    money: { name: "money" },
    interval: { name: "interval" },
    oid: { name: "oid" },
    enum: {},
  };

  private static _nativeDatabaseTypes?: NativeDatabaseTypes;

  async supportsExpressionIndex(): Promise<boolean> {
    return true;
  }

  declare static createUnloggedTables: boolean;
  declare static isCreateUnloggedTables: () => boolean;

  static {
    classAttribute.call(this, "createUnloggedTables", { default: false });
  }

  static decodeDates = true;

  supportsTransactionIsolation(): boolean {
    return true;
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

  supportsForeignKeys(): boolean {
    return true;
  }

  /** @internal */
  declare protected _connectionParameters: pg.ClientConfig;
  private _typeMap: HashLookupTypeMap | null = null;
  /** @internal */
  _typeMapForResults = new PGTypeMapByOid();

  /** @internal */
  _regtypeOids: Map<string, number> = new Map();
  private _maxIdentifierLength: number | null = null;
  private _useInsertReturning: unknown = true;
  private _mappedDefaultTimezone: "utc" | "local" | null = null;
  private timestampDecoder: PGSimpleDecoder | null = null;
  private _minMessages = "warning";
  private _schemaSearchPathMemo: string | null = null;
  private _caseInsensitiveCache: Record<string, boolean> | null = null;
  /** @internal */
  declare _statements: StatementPool;
  _noticeReceiverSqlWarnings: SQLWarning[] = [];

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

  /** @internal */
  performQuery = pgPerformQuery;

  /** @internal */
  declare handleWarnings: (sql: unknown) => void;

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
  executeBatch = pgExecuteBatch;

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
      this._acceptDeprecatedRawConnection(pgConnection(config as pg.Client));
      return;
    }
    if (typeof config === "string") {
      this._minMessages = "warning";
      this._connectionParameters = {
        connectionString: config,
        types: {
          getTypeParser: (oid: number, format?: string) => pgTypeParser(oid, format),
        },
      };
      return;
    }
    const {
      statementLimit: _statementLimit,
      preparedStatements,
      insertReturning,
      advisoryLocks,
      minMessages,
      variables,
      ...pgConfig
    } = config as pg.PoolConfig & PostgreSQLAdapterOptions;
    this._useInsertReturning =
      "insertReturning" in this._config
        ? PostgreSQLAdapter.typeCastConfigToBoolean(this._config.insertReturning)
        : true;
    this._minMessages = minMessages ?? "warning";
    const userGetTypeParser = (
      pgConfig.types as { getTypeParser?: (oid: number, format?: string) => unknown } | undefined
    )?.getTypeParser;
    const { username: railsUsername, ...pgDriverConfig } = pgConfig as typeof pgConfig & {
      username?: string;
    };
    this._connectionParameters = {
      ...PostgreSQLAdapter._sliceValidConnParams({
        ...pgDriverConfig,
        ...(rtest(railsUsername) ? { user: railsUsername } : {}),
      }),
      types: {
        getTypeParser(oid: number, format?: string): unknown {
          return userGetTypeParser?.(oid, format) ?? pgTypeParser(oid, format);
        },
      },
    };
  }

  override isConnected(): boolean {
    return this._connection !== null && !this._rawConnectionFinished();
  }

  override async active(): Promise<boolean> {
    const rawConnection = this._rawConnection;
    if (!rawConnection) return false;
    try {
      await rawConnection.query(";");
      this.verifiedBang();
      return true;
    } catch {
      return false;
    }
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
      this._statements.reset();
    });
  }

  override async resetBang(): Promise<void> {
    await this.lock.synchronize(async () => {
      const live = this._rawConnection;
      if (!live) {
        await this.connectBang();
        return;
      }

      if (live.transactionStatus() !== PQTRANS_IDLE) {
        await live.query("ROLLBACK");
      }
      await live.query("DISCARD ALL");

      await super.resetBang();
    });
  }

  override async disconnectBang(): Promise<void> {
    await this.lock.synchronize(async () => {
      await super.disconnectBang();
      try {
        await this._rawConnection?.end();
      } catch {}
      this._rawConnection = null;
    });
  }

  override discardBang(): void {
    super.discardBang();
    try {
      this._rawConnection?.socketIo()?.reopen(IO.NULL);
    } catch {}
    this._rawConnection = null;
  }

  nativeDatabaseTypes(): NativeDatabaseTypes {
    return (this.constructor as typeof PostgreSQLAdapter).nativeDatabaseTypes();
  }

  private lastInsertIdResult = pgLastInsertIdResult;

  static nativeDatabaseTypes(this: typeof PostgreSQLAdapter): NativeDatabaseTypes {
    if (this._nativeDatabaseTypes == null) {
      const types: NativeDatabaseTypes = { ...this.NATIVE_DATABASE_TYPES };
      types["datetime"] = types[this.datetimeType];
      this._nativeDatabaseTypes = types;
    }
    return this._nativeDatabaseTypes;
  }

  async setStandardConformingStrings(): Promise<void> {
    await this.internalExecute("SET standard_conforming_strings = on", "SCHEMA");
  }

  supportsDdlTransactions(): boolean {
    return true;
  }

  supportsAdvisoryLocks(): boolean {
    return true;
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

  async getAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    _assertPgAdvisoryLockId(lockId);
    return (await this.queryValue(`SELECT pg_try_advisory_lock(${lockId})`)) === true;
  }

  async releaseAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    _assertPgAdvisoryLockId(lockId);
    return (await this.queryValue(`SELECT pg_advisory_unlock(${lockId})`)) === true;
  }

  async enableExtension(name: string, _options?: Record<string, unknown>): Promise<void> {
    let schema: string | undefined;
    [schema, name] = valuesAt(String(name).split("."), -2, -1) as [string | undefined, string];
    let sql = `CREATE EXTENSION IF NOT EXISTS "${name}"`;
    if (schema != null) sql += ` SCHEMA ${schema}`;
    await this.internalExecQuery(sql);
    await this.reloadTypeMap();
  }

  async disableExtension(name: string, options: { force?: "cascade" } = {}): Promise<void> {
    let _schema: string | undefined;
    [_schema, name] = valuesAt(String(name).split("."), -2, -1) as [string | undefined, string];
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    await this.internalExecQuery(`DROP EXTENSION IF EXISTS "${name}"${cascade}`);
    await this.reloadTypeMap();
  }

  async extensionAvailable(name: string): Promise<boolean> {
    return (
      (await this.queryValue(
        `SELECT true FROM pg_available_extensions WHERE name = ${this.quote(name)}`,
        "SCHEMA",
      )) === true
    );
  }
  async extensionEnabled(name: string): Promise<boolean> {
    return (
      (await this.queryValue(
        `SELECT installed_version IS NOT NULL FROM pg_available_extensions WHERE name = ${this.quote(name)}`,
        "SCHEMA",
      )) === true
    );
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
  async renameEnum(
    name: string,
    newName: string | { to?: string } | null = null,
    options: { to?: string } = {},
  ): Promise<void> {
    if (typeof newName === "object" && newName !== null) {
      options = newName;
      newName = null;
    }
    newName ??= fetch<string>(
      options,
      "to",
      block(() => {
        throw new ArgumentError("rename_enum requires two from/to name positional arguments.");
      }),
    );

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

    const from = fetch<string>(
      options,
      "from",
      block(() => {
        throw new ArgumentError(":from is required");
      }),
    );
    const to = fetch<string>(
      options,
      "to",
      block(() => {
        throw new ArgumentError(":to is required");
      }),
    );

    await this.execute(
      `ALTER TYPE ${this.quoteTableName(typeName)} RENAME VALUE ${this.quote(from)} TO ${this.quote(to)}`,
    );
    await this.reloadTypeMap();
  }
  /** @missingRailsCall query_value — PERMANENT */
  maxIdentifierLength(): number {
    return this._maxIdentifierLength ?? 63;
  }
  async sessionAuth(user: string): Promise<void> {
    await this.clearCacheBang();
    await this.internalExecute(`SET SESSION AUTHORIZATION ${user}`, undefined, [], {
      materializeTransactions: true,
    });
  }
  isUseInsertReturning(): boolean {
    return this._useInsertReturning != null && this._useInsertReturning !== false;
  }
  async getDatabaseVersion(): Promise<number> {
    return await this.withRawConnection({}, async (conn) => {
      const version = await this._serverVersion(conn as pg.Client);
      if (version === 0) {
        throw new ConnectionFailed("Could not determine PostgreSQL version");
      }
      return version;
    });
  }
  async postgresqlVersion(): Promise<number> {
    return await this.databaseVersion;
  }
  override defaultIndexType(index: IndexDefinition): boolean {
    return index.using === "btree" || super.defaultIndexType(index);
  }
  override async buildInsertSql(insert: InsertBuilder): Promise<string> {
    let sql = `INSERT ${insert.into()} ${await insert.valuesList()}`;

    if (insert.skipDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO NOTHING`;
    } else if (insert.updateDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO UPDATE SET `;
      const raw = insert.rawUpdateSql();
      if (raw) {
        sql += raw.toString();
      } else {
        sql += insert.touchModelTimestampsUnless(
          (column) =>
            `${insert.model.quotedTableName()}.${column} IS NOT DISTINCT FROM excluded.${column}`,
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
      throw new RuntimeError(
        `Your version of PostgreSQL (${await this.databaseVersion}) is too old. Active Record supports PostgreSQL >= 9.3.`,
      );
    }
  }
  static override initializeTypeMap(m: TypeMap | HashLookupTypeMap): void {
    m.registerType("int2", new IntegerType({ limit: 2 }));
    m.registerType("int4", new IntegerType({ limit: 4 }));
    m.registerType("int8", new IntegerType({ limit: 8 }));
    m.registerType("oid", new Oid());
    m.registerType("float4", new FloatType({ limit: 24 }));
    m.registerType("float8", new FloatType());
    m.registerType("text", new ArText());
    this.registerClassWithLimit(m, "varchar", StringType);
    m.aliasType("char", "varchar");
    m.aliasType("name", "varchar");
    m.aliasType("bpchar", "varchar");
    m.registerType("bool", new BooleanType());
    this.registerClassWithLimit(m, "bit", Bit);
    this.registerClassWithLimit(m, "varbit", BitVarying);
    m.registerType("date", new OidDate());
    m.registerType("money", new Money());
    m.registerType("bytea", new Bytea());
    m.registerType("point", new Point());
    m.registerType("hstore", new Hstore());
    m.registerType("json", new ArJson());
    m.registerType("jsonb", new Jsonb());
    m.registerType("cidr", new Cidr());
    m.registerType("inet", new Inet());
    m.registerType("uuid", new Uuid());
    m.registerType("xml", new Xml());
    m.registerType("tsvector", new SpecializedString("tsvector"));
    m.registerType("macaddr", new Macaddr());
    m.registerType("citext", new SpecializedString("citext"));
    m.registerType("ltree", new SpecializedString("ltree"));
    m.registerType("line", new SpecializedString("line"));
    m.registerType("lseg", new SpecializedString("lseg"));
    m.registerType("box", new SpecializedString("box"));
    m.registerType("path", new SpecializedString("path"));
    m.registerType("polygon", new SpecializedString("polygon"));
    m.registerType("circle", new SpecializedString("circle"));

    m.registerType("numeric", undefined, (_: unknown, fmod: unknown, sqlType: unknown) => {
      const precision = this.extractPrecision(sqlType as string);
      const scale = this.extractScale(sqlType as string);

      if (fmod != null && (((fmod as number) - 4) & 0xffff) === 0) {
        return new DecimalWithoutScale({ precision });
      } else {
        return new Decimal({ precision, scale });
      }
    });

    m.registerType("interval", undefined, (...args: unknown[]) => {
      const precision = this.extractPrecision(args.at(-1) as string);
      return new Interval({ precision });
    });
  }
  /** @internal */
  get typeMap(): HashLookupTypeMap {
    return this._typeMap!;
  }
  private async initializeTypeMap(m: HashLookupTypeMap = this.typeMap): Promise<void> {
    (this.constructor as typeof PostgreSQLAdapter).initializeTypeMap(m);

    (this.constructor as typeof PostgreSQLAdapter).registerClassWithPrecision(m, "time", TimeType, {
      timezone: this._defaultTimezone,
    });
    (this.constructor as typeof PostgreSQLAdapter).registerClassWithPrecision(
      m,
      "timestamp",
      Timestamp,
      { timezone: this._defaultTimezone },
    );
    (this.constructor as typeof PostgreSQLAdapter).registerClassWithPrecision(
      m,
      "timestamptz",
      TimestampWithTimeZone,
    );

    await this.loadAdditionalTypes();
  }
  /** @internal */
  extractValueFromDefault(default_: string | null): string | null {
    let m: RegExpExecArray | null;
    if ((m = /^[(B]?'([\s\S]*)'.*::"?([\w. ]+)"?(?:\[\])?$/.exec(default_!))) {
      if (m[1] === "now" && m[2] === "date") {
        return null;
      } else {
        return m[1].replace(/''/g, "'");
      }
    } else if (default_ === "true" || default_ === "false") {
      return default_;
    } else if ((m = /^\(?(-?\d+(\.\d*)?)\)?(::bigint)?$/.exec(default_!))) {
      return m[1];
    } else if ((m = /^-?\d+$/.exec(default_!))) {
      return m[1];
    } else {
      return null;
    }
  }
  /** @internal */
  extractDefaultFunction(defaultValue: unknown, default_: string | null): string | null {
    return this.hasDefaultFunction(defaultValue, default_) ? default_ : null;
  }
  /** @internal */
  hasDefaultFunction(defaultValue: unknown, default_: string | null): boolean {
    return !rtest(defaultValue) && rbRegMatchP(DEFAULT_FUNCTION_RE, default_);
  }
  /** @internal */
  translateException(
    exception: unknown,
    { message, sql, binds }: { message: string; sql: string; binds: unknown[] },
  ): unknown {
    if (!(exception instanceof Error)) return exception;
    const noConnection =
      /connection is closed/i.test(exception.message) ||
      /no connection to the server/i.test(exception.message);
    if (
      !(exception instanceof pg.DatabaseError) &&
      !(exception instanceof PG.ConnectionBad) &&
      !noConnection
    ) {
      return exception;
    }

    switch (exception instanceof pg.DatabaseError ? exception.code : undefined) {
      case undefined:
        if (noConnection) {
          return new ConnectionNotEstablished(exception, { connectionPool: this.pool });
        } else if (exception instanceof PG.ConnectionBad) {
          if (PG.ConnectionBad.isLibpq(exception)) {
            return new ConnectionFailed(exception, { connectionPool: this.pool });
          } else {
            return new ConnectionNotEstablished(exception, { connectionPool: this.pool });
          }
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
  /** @internal */
  isRetryableQueryError(exception: unknown): boolean {
    return (
      this._rawConnection?.transactionStatus() !== PQTRANS_INERROR &&
      super.isRetryableQueryError(exception)
    );
  }
  /** @internal */
  async getOidType(
    oid: number,
    fmod: number,
    columnName: string,
    sqlType: string = "",
  ): Promise<ValueType> {
    if (!this.typeMap.isKey(oid)) {
      await this.loadAdditionalTypes([oid]);
    }

    return this.typeMap.fetch(oid, fmod, sqlType, () => {
      console.warn(
        `unknown OID ${oid}: failed to recognize type of '${columnName}'. It will be treated as String.`,
      );
      const castType = Type.defaultValue();
      this.typeMap.registerType(oid, castType);
      return castType;
    });
  }
  /**
   * @internal
   * @inventedArm _captureRegtypeOids — PERMANENT
   */
  async loadAdditionalTypes(oids?: number[]): Promise<void> {
    const initializer = new TypeMapInitializer(this.typeMap);
    await this.loadTypesQueries(initializer, oids, async (query) => {
      const records = (await this.internalExecute(query, "SCHEMA", [], {
        allowRetry: true,
        materializeTransactions: false,
      })) as PgTypeRow[];
      this._captureRegtypeOids(records);
      initializer.run(records);
    });
  }
  /** @inventedArm nativeTypeNamesQuery — PERMANENT */
  private async loadTypesQueries(
    initializer: TypeMapInitializer,
    oids: number[] | null | undefined,
    block: (query: string) => Promise<void>,
  ): Promise<void> {
    const query = [
      "SELECT t.oid, t.typname, t.typelem, t.typdelim, t.typinput,",
      '       format_type(t.oid, NULL) AS "formatType",',
      "       r.rngsubtype, t.typtype, t.typbasetype",
      "FROM pg_type as t",
      "LEFT JOIN pg_range as r ON t.oid = r.rngtypid",
    ].join("\n");

    if (oids != null) {
      await block(`${query}\nWHERE t.oid IN (${oids.join(", ")})`);
    } else {
      await block(`${query}\n${initializer.queryConditionsForKnownTypeNames()}`);
      await block(`${query}\n${initializer.queryConditionsForKnownTypeTypes()}`);
      await block(`${query}\n${initializer.queryConditionsForArrayTypes()}`);
      await block(this.nativeTypeNamesQuery());
    }
  }
  /** @internal */
  isCachedPlanFailure(pgerror: unknown): boolean {
    try {
      return (
        (pgerror as pg.DatabaseError).code === FEATURE_NOT_SUPPORTED &&
        (pgerror as pg.DatabaseError).routine === "RevalidateCachedQuery"
      );
    } catch {
      return false;
    }
  }

  /** @internal */
  isInTransaction(): boolean {
    return this.openTransactions() > 0;
  }

  /** @internal */
  sqlKey(sql: string | null): string {
    return `${this._schemaSearchPathMemo ?? ""}-${sql}`;
  }

  /** @internal */
  async prepareStatement(
    sql: string | null,
    binds: unknown[],
    conn: PGConnection,
  ): Promise<string> {
    const sqlKey = this.sqlKey(sql);
    if (!this._statements.isKey(sqlKey)) {
      const nextkey = this._statements.nextKey();
      try {
        await conn.prepare(nextkey, sql as string);
      } catch (e) {
        throw excSetupMessage(await this.translateExceptionClass(e, sql, binds), e);
      }
      this._statements.set(sqlKey, { name: nextkey });
    }
    return this._statements.get(sqlKey)!.name;
  }
  /**
   * @internal
   * @missingRailsName connectionParameters — PERMANENT
   */
  async connect(): Promise<void> {
    try {
      this._rawConnection = (await (this.constructor as typeof PostgreSQLAdapter).newClient(
        this._connectionParameters,
      )) as PGConnection;
    } catch (ex) {
      if (ex instanceof ConnectionNotEstablished) throw ex.setPool(this.pool);
      throw ex;
    }
  }

  /** @internal */
  async reconnect(): Promise<void> {
    try {
      await this._rawConnection?.reset();
    } catch (error) {
      if (!(error instanceof PG.ConnectionBad)) throw error;
      this._rawConnection = null;
    }

    if (!this._rawConnection) await this.connect();
  }

  /** @internal */
  async configureConnection(): Promise<void> {
    await super.configureConnection();

    if (rtest(this._config.encoding)) {
      await this._rawConnection!.query(
        `SET client_encoding TO ${this._rawConnection!.escapeLiteral(String(this._config.encoding))}`,
      );
    }

    await this.setClientMinMessages(this._minMessages);
    await this.setSchemaSearchPath(
      (this._config.schemaSearchPath ?? this._config.schemaOrder ?? null) as string | null,
    );

    if (dbWarningsAction() != null) {
      this._rawConnection!.removeAllListeners("notice");
      this._rawConnection!.on(
        "notice",
        (result: { severity?: string; message?: string; code?: string }) => {
          const message = result.message;
          const code = result.code ?? null;
          const level = result.severity ?? null;
          this._noticeReceiverSqlWarnings.push(
            new SQLWarning(message, code, level, undefined, this.pool),
          );
        },
      );
    }

    await this.setStandardConformingStrings();

    const variables = fetch<SessionVariables>(this._config, "variables", {});

    await this.internalExecute("SET intervalstyle = iso_8601", "SCHEMA");

    for (const [k, v] of Object.entries(variables)) {
      if (v === ":default") {
        await this.internalExecute(`SET SESSION ${k} TO DEFAULT`, "SCHEMA");
      } else if (v != null) {
        await this.internalExecute(`SET SESSION ${k} TO ${this.quote(v)}`, "SCHEMA");
      }
    }

    this.addPgEncoders();
    await this.addPgDecoders();

    await this.reloadTypeMap();
  }

  /** @internal */
  async reconfigureConnectionTimezone(): Promise<void> {
    const variables = fetch<SessionVariables>(this._config, "variables", {});

    if (rtest(variables["timezone"])) return;

    if (this.defaultTimezone === "utc") {
      await this.rawExecute("SET SESSION timezone TO 'UTC'", "SCHEMA");
    } else {
      await this.rawExecute("SET SESSION timezone TO DEFAULT", "SCHEMA");
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
  override arelVisitor(): Visitors.ToSql {
    return new Visitors.PostgreSQL(this);
  }
  /** @internal */
  buildStatementPool(): StatementPool {
    return new StatementPool(
      this,
      PostgreSQLAdapter.typeCastConfigToInteger(this._config.statementLimit) as number,
    );
  }
  /** @internal */
  override async canPerformCaseInsensitiveComparisonFor(column: {
    sqlType?: string | null;
  }): Promise<boolean> {
    this._caseInsensitiveCache ??= { citext: false };
    const caseInsensitiveCache = this._caseInsensitiveCache;
    return fetch<boolean | Promise<boolean>>(
      caseInsensitiveCache,
      column.sqlType as string,
      block(async () => {
        const sql = `
          SELECT exists(
            SELECT * FROM pg_proc
            WHERE proname = 'lower'
              AND proargtypes = ARRAY[${this.quote(column.sqlType)}::regtype]::oidvector
          ) OR exists(
            SELECT * FROM pg_proc
            INNER JOIN pg_cast
              ON ARRAY[casttarget]::oidvector = proargtypes
            WHERE proname = 'lower'
              AND castsource = ${this.quote(column.sqlType)}::regtype
          )`;
        const result = (await this.internalExecute(sql, "SCHEMA", [], {
          allowRetry: true,
          materializeTransactions: false,
        })) as PG.Result;
        return (caseInsensitiveCache[column.sqlType as string] = result.getvalue(0, 0) as boolean);
      }),
    );
  }

  private _hasPgHintPlan?: boolean;

  /** @internal */
  addPgEncoders(): void {}

  /** @internal */
  async updateTypemapForDefaultTimezone(): Promise<true | undefined> {
    if (
      this._rawConnection != null &&
      this._mappedDefaultTimezone !== defaultTimezone() &&
      this.timestampDecoder != null
    ) {
      const decoderClass =
        defaultTimezone() === "utc"
          ? PGTextDecoder.TimestampUtc
          : PGTextDecoder.TimestampWithoutTimeZone;

      this.timestampDecoder = new decoderClass({ ...this.timestampDecoder.toH() });
      this._rawConnection.typeMapForResults.addCoder(this.timestampDecoder);

      this._mappedDefaultTimezone = defaultTimezone();

      await this.reconfigureConnectionTimezone();

      return true;
    }
  }

  /** @internal */
  async addPgDecoders(): Promise<void> {
    this._mappedDefaultTimezone = null;
    this.timestampDecoder = null;

    const codersByName: Record<string, PGDecoderClass> = {
      int2: PGTextDecoder.Integer,
      int4: PGTextDecoder.Integer,
      int8: PGTextDecoder.Integer,
      oid: PGTextDecoder.Integer,
      float4: PGTextDecoder.Float,
      float8: PGTextDecoder.Float,
      numeric: PGTextDecoder.Numeric,
      bool: PGTextDecoder.Boolean,
      timestamp: PGTextDecoder.TimestampUtc,
      timestamptz: PGTextDecoder.TimestampWithTimeZone,
    };
    if (PostgreSQLAdapter.decodeDates) codersByName["date"] = PGTextDecoder.Date;

    const knownCoderTypes = Object.keys(codersByName).map((n) => this.quote(n));
    const query = `SELECT t.oid, t.typname
FROM pg_type as t
WHERE t.typname IN (${knownCoderTypes.join(", ")})
`;
    const result = (await this.internalExecute(query, "SCHEMA", [], {
      allowRetry: true,
      materializeTransactions: false,
    })) as { oid: string | number; typname: string }[];
    const coders = filterMap(result, (row) => this.constructCoder(row, codersByName[row.typname]));

    const map = new PGTypeMapByOid();
    coders.forEach((coder) => map.addCoder(coder));
    this._rawConnection!.typeMapForResults = map;

    this._typeMapForResults = new PGTypeMapByOid();
    this._typeMapForResults.defaultTypeMap = map;
    this._typeMapForResults.addCoder(new PGTextDecoder.Bytea({ oid: 17, name: "bytea" }));
    this._typeMapForResults.addCoder(new MoneyDecoder({ oid: 790, name: "money" }));

    this.timestampDecoder = coders.find((coder) => coder.name === "timestamp") ?? null;
    await this.updateTypemapForDefaultTimezone();
  }

  /** @internal */
  constructCoder(
    row: { oid: string | number; typname: string },
    coderClass: PGDecoderClass | undefined,
  ): PGSimpleDecoder | undefined {
    if (!coderClass) return;
    return new coderClass({ oid: Number(row.oid), name: row.typname });
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

  /** @internal */
  private _rawConnectionFinished(): boolean {
    const client = this._rawConnection as PgClientLiveness | null;
    if (client === null) return false;
    return client._ending === true || client._ended === true;
  }

  /** @internal */
  get _rawConnection(): PGConnection | null {
    return this._connection as PGConnection | null;
  }
  /** @internal */
  set _rawConnection(value: PGConnection | null) {
    this._connection = value && pgConnection(value);
  }

  /** @internal */
  private static _sliceValidConnParams(config: Record<string, unknown>): pg.ClientConfig {
    const sliced: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (value === undefined || value === null) continue;
      const param = PostgreSQLAdapter.VALID_CONN_PARAM_KEYS.has(key) ? key : underscore(key);
      if (!PostgreSQLAdapter.VALID_CONN_PARAM_KEYS.has(param)) continue;
      if (param !== key && config[param] != null) continue;
      sliced[param] = value;
    }
    return sliced as pg.ClientConfig;
  }

  private _captureRegtypeOids(records: PgTypeRow[]): void {
    for (const row of records) {
      const oid = Number(row.oid);
      for (const name of [row.typname, row.formatType, row.aliasName]) {
        if (name != null) this._regtypeOids.set(name, oid);
      }
    }
  }

  override lookupCastTypeFromColumn(column: CastableColumn): ValueType {
    return pgLookupCastTypeFromColumn.call(this, column);
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

  /** @internal */
  affectedRows(result: PG.Result): number {
    return pgAffectedRows(result);
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

  /** @noRailsEquivalent PERMANENT */
  async warmMaxIdentifierLength(): Promise<number> {
    if (this._maxIdentifierLength == null) {
      const value = await this.queryValue("SHOW max_identifier_length", "SCHEMA");
      this._maxIdentifierLength = parseInt(String(value ?? "63"), 10);
    }
    return this._maxIdentifierLength;
  }

  /** @internal */
  override returningColumnValues(result: Result): unknown[] | undefined {
    return pgReturningColumnValues(result);
  }

  /** @internal */
  async _serverVersion(client: pg.Client): Promise<number> {
    const result = await client.query("SHOW server_version_num");
    return parseInt(String(result.rows[0]?.server_version_num ?? "0"), 10);
  }

  checkAllForeignKeysValidBang = checkAllForeignKeysValidBang;

  override quote(value: unknown): string {
    return pgQuote.call(this, value) as string;
  }

  override quoteString(s: string): string {
    return pgQuoteString(s);
  }

  quotedDate(value: Parameters<typeof pgQuotedDate>[0]): string {
    return pgQuotedDate.call(this, value);
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

  override disableReferentialIntegrity(fn: () => Promise<void>): Promise<void> {
    return disableReferentialIntegrity.call(this, fn);
  }

  override quoteTableNameForAssignment(_table: string, attr: string): string {
    return pgQuoteTableNameForAssignment(_table, attr);
  }

  override quotedBinary(value: BinaryData): string {
    return pgQuotedBinary(value);
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

  private deferrable(deferrable: "immediate" | "deferred" | undefined): string {
    if (!deferrable) return "";
    return ` DEFERRABLE INITIALLY ${deferrable.toUpperCase()}`;
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

  isWriteQuery(sql: string | null): boolean;

  unescapeBytea: typeof quotingUnescapeBytea;

  query(sql: string, name?: string | null): Promise<unknown[][]>;

  execute(
    sql: string | null,
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

  beginDbTransaction(): Promise<unknown>;

  beginIsolatedDbTransaction(isolation: string): Promise<void>;

  commitDbTransaction(): Promise<unknown>;

  execRollbackDbTransaction(): Promise<void>;

  execRestartDbTransaction(): Promise<void>;

  /** @internal */
  cancelAnyRunningQuery(): Promise<void>;

  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral;

  buildExplainClause(options?: ExplainOption[]): Promise<string>;

  setConstraints(
    deferred: "deferred" | "immediate",
    ...constraints: (string | undefined)[]
  ): Promise<void>;

  renameTable(tableName: string, newName: string, options?: Record<string, unknown>): Promise<void>;
  addIndex(
    tableName: string,
    columnName: string | string[],
    options?: {
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
    },
  ): Promise<unknown>;
  removeIndex(
    tableName: string,
    columnName?:
      | string
      | string[]
      | { name?: string; column?: string | string[]; algorithm?: string; ifExists?: boolean },
    options?: {
      name?: string;
      column?: string | string[];
      algorithm?: string;
      ifExists?: boolean;
    },
  ): Promise<unknown>;
  indexName(
    tableName: string,
    options:
      | { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean }
      | string
      | string[],
  ): string;
  foreignTables(): Promise<string[]>;
  foreignTableExists(tableName: string): Promise<boolean | undefined>;
  createSchemaDumper(options: Record<string, unknown>): PgSchemaDumper;
  addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options?: Parameters<AbstractSchemaStatements["addIndexOptions"]>[2],
  ): Promise<[IndexDefinition, string | undefined, boolean]>;
  get schemaCreation(): PgSchemaCreation;
  /** @internal */
  createTableDefinition(name: string, options?: Record<string, unknown>): PgTableDefinition;
  /** @internal */
  createAlterTable(name: string): PgAlterTable;
  /** @internal */
  referenceNameForTable(tableName: string): string;
  /** @internal */
  addColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<string | [string, () => Promise<void>]>;
  /** @internal */
  changeColumnNullForAlter(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): unknown;
  /** @internal */
  addIndexOpclass(
    quotedColumns: Map<string, string>,
    options?: { opclass?: string | Record<string, string> },
  ): Map<string, string>;
  /** @internal */
  addOptionsForIndexColumns(
    quotedColumns: Map<string, string>,
    options?: {
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
      length?: number | Record<string, number>;
    },
  ): Promise<Map<string, string>>;
  schemaNames(): Promise<string[]>;

  createSchema(
    schemaName: string,
    options?: { force?: boolean; ifNotExists?: boolean },
  ): Promise<void>;

  dropSchema(schemaName: string, options?: { ifExists?: boolean }): Promise<void>;

  schemaExists(name: string): Promise<boolean>;

  currentSchema(): Promise<string>;

  columnsForDistinct(columns: string | string[], orders?: (string | ArelNode)[]): string;

  indexes(tableName: string): Promise<IndexDefinition[]>;

  indexNameExists(tableName: string, indexName: string): Promise<boolean>;

  primaryKey(tableName: string): Promise<string | string[] | null>;

  pkAndSequenceFor(table: string): Promise<[string, Name | null] | null>;

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
  ): Promise<unknown>;

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
    null_: boolean,
    default_?: unknown,
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
    options?: { name?: string; expression?: string | null; validate?: boolean },
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
  fetchTypeMetadata(
    columnName: string,
    sqlType: string,
    oid: number,
    fmod: number,
  ): Promise<TypeMetadata>;

  /** @internal */
  quotedScope(
    name?: string | null,
    options?: { type?: string },
  ): { schema: string; name?: string; type?: string };

  /** @internal */
  extractSchemaQualifiedName(string: string): [string | null, string];

  createDatabase(name: string, options?: CreateDatabaseOptions): Promise<unknown>;

  dropDatabase(name: string): Promise<void>;

  recreateDatabase(name: string, options?: CreateDatabaseOptions): Promise<unknown>;

  dropTable(...args: Parameters<AbstractSchemaStatements["dropTable"]>): Promise<unknown>;

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

  serialSequence(table: string, column: string | null): Promise<string | null>;

  defaultSequenceName(tableName: string, pk?: string | string[] | null): Promise<string | null>;

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

  constructor(connection: PostgreSQLAdapter, maxSize = 1000) {
    super(maxSize);
    this._connection = connection;
  }

  nextKey(): string {
    return `a${++this._counter}`;
  }

  protected override async dealloc(key: PreparedStatement): Promise<void> {
    try {
      const conn = this._connection._rawConnection;
      if (conn) {
        if (conn.status() === CONNECTION_OK) {
          await conn.query(`DEALLOCATE ${pgQuoteColumnName(key.name)}`);
        }
      }
    } catch {}
  }
}

export class MoneyDecoder extends PGSimpleDecoder {
  static readonly TYPE = new Money();

  decode(value: string): string | null {
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
PostgreSQLAdapter.prototype.query = pgQuery;
PostgreSQLAdapter.prototype.unescapeBytea = quotingUnescapeBytea;
(PostgreSQLAdapter.prototype as any).isWriteQuery = pgIsWriteQuery;
PostgreSQLAdapter.prototype.execute = pgExecute;
(PostgreSQLAdapter.prototype as any).execInsert = pgExecInsert;
(PostgreSQLAdapter.prototype as any).beginDbTransaction = pgBeginDbTransaction;
(PostgreSQLAdapter.prototype as any).beginIsolatedDbTransaction = pgBeginIsolatedDbTransaction;
(PostgreSQLAdapter.prototype as any).commitDbTransaction = pgCommitDbTransaction;
(PostgreSQLAdapter.prototype as any).execRollbackDbTransaction = pgExecRollbackDbTransaction;
(PostgreSQLAdapter.prototype as any).execRestartDbTransaction = pgExecRestartDbTransaction;
(PostgreSQLAdapter.prototype as any).cancelAnyRunningQuery = pgCancelAnyRunningQuery;
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

include(PostgreSQLAdapter, SchemaStatements);

Type.addModifier({ array: true }, OidArray, { adapter: "postgresql" });
Type.addModifier({ range: true }, RangeType, { adapter: "postgresql" });

Type.register("bit", Bit, { adapter: "postgresql" });
Type.register("bit_varying", BitVarying, { adapter: "postgresql" });
Type.register("binary", Bytea, { adapter: "postgresql" });
Type.register("cidr", Cidr, { adapter: "postgresql" });
Type.register("date", OidDate, { adapter: "postgresql" });
Type.register("datetime", OidDateTime, { adapter: "postgresql" });
Type.register("decimal", Decimal, { adapter: "postgresql" });
Type.register("enum", Enum, { adapter: "postgresql" });
Type.register("hstore", Hstore, { adapter: "postgresql" });
Type.register("inet", Inet, { adapter: "postgresql" });
Type.register("interval", Interval, { adapter: "postgresql" });
Type.register("jsonb", Jsonb, { adapter: "postgresql" });
Type.register("money", Money, { adapter: "postgresql" });
Type.register("point", Point, { adapter: "postgresql" });
Type.register("legacy_point", LegacyPoint, { adapter: "postgresql" });
Type.register("uuid", Uuid, { adapter: "postgresql" });
Type.register("vector", Vector, { adapter: "postgresql" });
Type.register("xml", Xml, { adapter: "postgresql" });

rbModConstSet(ConnectionAdapters, "PostgreSQLAdapter", PostgreSQLAdapter);

runLoadHooks("active_record_postgresqladapter", PostgreSQLAdapter);
