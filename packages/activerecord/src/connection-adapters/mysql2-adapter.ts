import mysql from "mysql2/promise";
import { ArgumentError } from "@blazetrails/activemodel";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import type { MysqlAdapterOptions } from "./pool-config.js";
import {
  AbstractMysqlAdapter,
  StatementPool as MysqlStatementPool,
} from "./abstract-mysql-adapter.js";
import { StringType, ImmutableStringType } from "@blazetrails/activemodel";
import { Text as TextType } from "../type/text.js";
import { isRubyTruthy } from "../ruby-truthy.js";
import { TypeMap } from "../type/type-map.js";
import * as Type from "../type.js";
import { UnsignedInteger } from "../type/unsigned-integer.js";
import { AbstractAdapter, RAW_CONNECTION_DEPRECATION_MESSAGE } from "./abstract-adapter.js";
import { deprecator } from "../deprecator.js";
import {
  AdapterError,
  AdapterTimeout,
  ConnectionFailed,
  ConnectionNotEstablished,
  DatabaseConnectionError,
  NoDatabaseError,
} from "../errors.js";
import { Result } from "../result.js";
import { ExplainPrettyPrinter } from "./mysql/explain-pretty-printer.js";
import {
  affectedRows as mysql2AffectedRows,
  executeBatch as mysql2ExecuteBatch,
  isMultiStatementsEnabled as mysql2IsMultiStatementsEnabled,
  lastInsertedId as mysql2LastInsertedId,
  castResult as mysql2CastResult,
  performQuery as mysql2PerformQuery,
  type Mysql2RawResult,
} from "./mysql2/database-statements.js";
import { ActiveRecord } from "../ar-config.js";
import { temporalTypeCast, TEMPORAL_POOL_OPTIONS } from "./mysql/temporal-type-cast.js";
import { SchemaDumper as MysqlSchemaDumper } from "./mysql/schema-dumper.js";
import { abandonRawSocket } from "./abandon-raw-socket.js";
import { parseMysqlName as mysqlParseName } from "./mysql/schema-statements.js";

let mysql2TypeMap: TypeMap | null = null;

export class Mysql2Adapter extends AbstractMysqlAdapter implements DatabaseAdapter {
  static override readonly ADAPTER_NAME = "Mysql2";

  static readonly ER_BAD_DB_ERROR = 1049;
  static readonly ER_DBACCESS_DENIED_ERROR = 1044;
  static readonly ER_ACCESS_DENIED_ERROR = 1045;
  static readonly ER_CONN_HOST_ERROR = 2003;
  static readonly ER_UNKNOWN_HOST_ERROR = 2005;

  /** @internal */
  static override initializeTypeMap(m: TypeMap): void {
    super.initializeTypeMap(m);
    m.registerType(/char/i, undefined, (sqlType) => {
      const limit = this.extractLimit(sqlType);
      return Type.lookup("string", { adapter: "mysql2", limit });
    });
    m.registerType(/^enum/i, Type.lookup("string", { adapter: "mysql2" }));
    m.registerType(/^set/i, Type.lookup("string", { adapter: "mysql2" }));
  }

  static override get TYPE_MAP(): TypeMap {
    return (mysql2TypeMap ??= (() => {
      const m = new TypeMap();
      Mysql2Adapter.initializeTypeMap(m);
      return m;
    })());
  }

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

  override isConnected(): boolean {
    const conn = this._rawConnection as
      | (mysql.Connection & {
          connection: { _closing?: boolean; stream?: { destroyed?: boolean } };
        })
      | null;
    return !(
      conn == null ||
      conn.connection._closing === true ||
      conn.connection.stream?.destroyed === true
    );
  }

  private get _rawConnection(): mysql.Connection | null {
    return this._connection as unknown as mysql.Connection | null;
  }
  private set _rawConnection(value: mysql.Connection | null) {
    this._connection = value as unknown as AbstractAdapter | null;
  }
  private _connectingPromise: Promise<mysql.Connection> | null = null;
  private _connectGeneration = 0;
  private _connectingPromiseGen = -1;
  private _discardedConnectGenerations = new Set<number>();
  private _endingClient: Promise<void> | null = null;
  private _permanentlyClosed = false;
  private _isFakeConnection = false;
  private _poolConfig: mysql.PoolOptions & MysqlAdapterOptions;
  private _connectionConfigured = false;
  declare _statements: MysqlStatementPool | null;

  _databaseTimezone: "utc" | "local" = "utc";

  _affectedRowsBeforeWarnings = 0;

  /** @internal */
  override translateException(
    exception: unknown,
    { message, sql, binds }: { message: string; sql: string; binds: unknown[] },
  ): unknown {
    if (isMysql2DriverTimeout(exception)) {
      return new AdapterTimeout(message, { sql, binds, connectionPool: this.pool });
    } else if (isMysql2ConnectionError(exception)) {
      if (/MySQL client is not connected/i.test((exception as Error).message)) {
        return new ConnectionNotEstablished(exception as Error, { connectionPool: this.pool });
      } else {
        return new ConnectionFailed(message, { sql, binds, connectionPool: this.pool });
      }
    } else {
      return super.translateException(exception, { message, sql, binds });
    }
  }

  private _getStmtPool(): MysqlStatementPool {
    if (!this._statements) {
      this._statements = this.buildStatementPool();
    }
    return this._statements;
  }

  _trackPrepared(conn: mysql.Connection, sql: string): void {
    const pool = this._getStmtPool();
    if (pool.get(sql)) return;
    void pool.set(sql, {
      sql,
      key: pool.nextKey(),
      close(): void {
        try {
          (conn as unknown as { unprepare: (sql: string) => void }).unprepare(sql);
        } catch {}
      },
    });
  }

  /** @internal */
  _clientForTest(): mysql.Connection | null {
    return this._rawConnection;
  }

  private _database: string | undefined;

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
  /** @deprecated */
  constructor(rawConnection: mysql.Connection, deprecatedConfig?: Record<string, unknown> | null);
  /** @missingRailsCall push — PERMANENT */
  constructor(
    config: string | (mysql.PoolOptions & MysqlAdapterOptions) | mysql.Connection,
    deprecatedConfig?: Record<string, unknown> | null,
  ) {
    const deprecatedRawConnection = Mysql2Adapter._isDeprecatedRawConnectionArg(config);
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
      this._poolConfig = { flags: ["FOUND_ROWS"] };
      this._isFakeConnection = true;
      return;
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
          url.searchParams.delete("wait_timeout");
          uri = url.toString();
        }
      } catch {}
      if (waitTimeout !== undefined) this._config.waitTimeout = waitTimeout;
      this._poolConfig = { uri, waitTimeout, flags: ["FOUND_ROWS"] };
      return;
    }
    const {
      statementLimit: _statementLimit,
      preparedStatements,
      advisoryLocks,
      strict,
      waitTimeout,
      variables,
      _fakeConnection: fake,
      ...mysqlConfig
    } = config as mysql.PoolOptions & MysqlAdapterOptions;
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
    const inputFlags = mysqlConfig.flags;
    const resolvedFlags: string[] = Array.isArray(inputFlags)
      ? inputFlags.includes("FOUND_ROWS")
        ? inputFlags
        : [...inputFlags, "FOUND_ROWS"]
      : ["FOUND_ROWS"];
    const {
      username: railsUsername,
      socket: railsSocket,
      ...mysqlDriverConfig
    } = mysqlConfig as typeof mysqlConfig & {
      username?: string;
      socket?: string;
    };
    this._poolConfig = {
      ...mysqlDriverConfig,
      ...(isRubyTruthy(railsUsername) ? { user: railsUsername } : {}),
      ...(isRubyTruthy(railsSocket) ? { socketPath: railsSocket } : {}),
      flags: resolvedFlags,
      strict,
      waitTimeout,
      variables,
    };
    const _charset = mysqlConfig.charset ?? (mysqlConfig as { encoding?: string }).encoding;
    const _collation = (mysqlConfig as { collation?: string }).collation;
    const SAFE_CHARSET_RE = /^[A-Za-z0-9_]+$/;
    if (_charset && !SAFE_CHARSET_RE.test(_charset)) {
      throw new Error(`Invalid MySQL charset: ${JSON.stringify(_charset)}`);
    }
    if (_collation && !SAFE_CHARSET_RE.test(_collation)) {
      throw new Error(`Invalid MySQL collation: ${JSON.stringify(_collation)}`);
    }
    if (fake) {
      this._isFakeConnection = true;
    }
  }

  override async internalExecQuery(
    sql: string,
    name: string | null = "SQL",
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean },
  ): Promise<Result> {
    sql = this.preprocessQuery(sql);
    const typeCastedBinds = this.typeCastedBinds(binds ?? []) ?? [];
    return await this.log(sql, name, binds ?? [], typeCastedBinds, false, (payload) =>
      this.withRawConnection({ allowRetry: options?.allowRetry ?? false }, async (conn) => {
        const mysqlConn = conn as unknown as mysql.Connection;
        const raw = await this.performQuery(mysqlConn, sql, binds ?? [], typeCastedBinds, {
          prepare: options?.prepare ?? false,
          notificationPayload: payload,
        });
        return this.castResult(raw);
      }),
    );
  }

  async supportsJson(): Promise<boolean> {
    if (await this.isMariadb()) return false;
    return (await this.databaseVersion).compare("5.7.8") >= 0;
  }

  supportsComments(): boolean {
    return true;
  }

  supportsCommentsInCreate(): boolean {
    return true;
  }

  supportsSavepoints(): boolean {
    return true;
  }

  supportsLazyTransactions(): boolean {
    return true;
  }

  override errorNumber(exception: Error & { errno?: number }): number | null {
    return exception.errno ?? null;
  }

  /** @internal */
  isTextType(type: string): boolean {
    return (
      Mysql2Adapter.TYPE_MAP.lookup(type) instanceof StringType ||
      Mysql2Adapter.TYPE_MAP.lookup(type) instanceof TextType
    );
  }

  private async _ensureClient(): Promise<mysql.Connection> {
    if (this._rawConnection) return this._rawConnection;
    if (this._connectingPromise && this._connectingPromiseGen === this._connectGeneration) {
      return this._connectingPromise;
    }
    if (this._permanentlyClosed) throw new Error("Mysql2Adapter: connection is closed");
    if (this._isFakeConnection) throw new Error("Mysql2Adapter: fake connection has no client");
    const gen = this._connectGeneration;
    this._connectingPromiseGen = gen;
    this._connectingPromise = Mysql2Adapter.newClient({
      ...this._poolConfig,
      initSql: "SET time_zone = '+00:00'",
    }).then(
      async (conn): Promise<mysql.Connection> => {
        if (this._connectGeneration !== gen) {
          if (this._connectingPromiseGen === gen) this._connectingPromise = null;
          const discardErr = new ConnectionNotEstablished(
            "Mysql2Adapter: connection was closed during connect",
          );
          if (this._discardedConnectGenerations.delete(gen)) {
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
        this._rawConnection = conn;
        this._statements = null;
        return conn;
      },
      (err) => {
        if (this._connectingPromiseGen === gen) this._connectingPromise = null;
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

  private async getConn(): Promise<mysql.Connection> {
    await this.awaitRawConnectionReady();
    return this._ensureClient();
  }

  /** @internal */
  protected override async awaitRawConnectionReady(): Promise<void> {
    if (this._rawConnection === null && !this._permanentlyClosed && !this._isFakeConnection) {
      await this.connectBang();
    }
  }

  /** @internal */
  executeBatch = mysql2ExecuteBatch;

  /** @internal */
  lastInsertedId(result: Result): Promise<unknown> {
    return mysql2LastInsertedId.call(this as never, result);
  }

  /** @internal */
  isMultiStatementsEnabled = mysql2IsMultiStatementsEnabled;

  /** @internal */
  declare performQuery: typeof mysql2PerformQuery;

  /** @internal */
  declare castResult: typeof mysql2CastResult;

  /** @internal */
  affectedRows(rawResult: Mysql2RawResult): number {
    return mysql2AffectedRows.call(this as any, rawResult);
  }

  async executeMutation(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
  ): Promise<number> {
    sql = this.preprocessQuery(sql);
    const typeCastedBinds = this.typeCastedBinds(binds) ?? [];
    return await this.log(sql, name, binds, typeCastedBinds, false, (payload) =>
      this.withRawConnection({}, async (conn) => {
        const mysqlConn = conn as unknown as mysql.Connection;
        const raw = await this.performQuery(mysqlConn, sql, binds, typeCastedBinds, {
          prepare: false,
          notificationPayload: payload,
        });
        const affected = this.affectedRows(raw);

        if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
          if (affected > 1) {
            return affected;
          }
          return raw.insertId ?? 0;
        }

        return affected;
      }),
    );
  }

  override isSavepointErrorsInvalidateTransactions(): boolean {
    return true;
  }

  override async internalExecute(
    sql: string,
    name: string | null = "SQL",
    binds: unknown[] = [],
    {
      materializeTransactions = true,
      allowRetry = false,
      prepare: prepareOption = false,
      async = false,
    }: {
      materializeTransactions?: boolean;
      allowRetry?: boolean;
      prepare?: boolean;
      async?: boolean;
    } = {},
  ): Promise<Mysql2RawResult> {
    sql = this.preprocessQuery(sql);
    try {
      if (materializeTransactions) {
        await this.materializeTransactions();
      }
      const typeCastedBinds = this.typeCastedBinds(binds) ?? [];
      return await this.log(sql, name, binds, typeCastedBinds, async, (payload) =>
        this.withRawConnection({ materializeTransactions: false, allowRetry }, async (rawConn) => {
          const conn = rawConn as unknown as mysql.Connection;
          const rawResult = await this.performQuery(conn, sql, binds, typeCastedBinds, {
            prepare: prepareOption,
          });
          payload.row_count = rawResult.affectedRows;
          return rawResult;
        }),
      );
    } finally {
      if (materializeTransactions) this.dirtyCurrentTransaction();
    }
  }

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

  createSchemaDumper(options: Record<string, unknown> = {}): MysqlSchemaDumper {
    const dumper = MysqlSchemaDumper.create(this as unknown as DatabaseAdapter, options);
    dumper.connection = this;
    return dumper;
  }

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

  /** @internal */
  async connect(): Promise<void> {
    try {
      await this._ensureClient();
    } catch (ex) {
      if (ex instanceof ConnectionNotEstablished) throw ex.setPool(this.pool);
      throw ex;
    }
  }

  /** @internal */
  override async reconnect(): Promise<void> {
    if (this._permanentlyClosed) throw new Error("Mysql2Adapter: client is permanently closed");
    return this.lock.synchronize(async () => {
      this._connectGeneration++;
      this._connectionConfigured = false;
      this._statements = null;
      this._endRawConnection();
      this._rawConnection = null;
      await this._ensureClient();
    });
  }

  override async disconnectBang(): Promise<void> {
    await this.lock.synchronize(async () => {
      await super.disconnectBang();
      this._connectGeneration++;
      this._connectionConfigured = false;
      this._statements = null;
      this._endRawConnection();
      this._rawConnection = null;
    });
  }

  /** @internal */
  private _endRawConnection(): void {
    const ending = this._rawConnection?.end().catch(() => {});
    if (!ending) return;
    this._endingClient = this._endingClient ? this._endingClient.then(() => ending) : ending;
  }

  override discardBang(): void {
    if (this._connectingPromise && this._connectingPromiseGen === this._connectGeneration) {
      this._discardedConnectGenerations.add(this._connectGeneration);
    }
    this._connectGeneration++;
    super.discardBang();
    this._connectionConfigured = false;
    this._statements = null;
    abandonRawSocket(this._rawConnection);
    this._rawConnection = null;
  }

  async close(): Promise<void> {
    this._permanentlyClosed = true;
    this._connectGeneration++;
    this._connectionConfigured = false;
    this._statements = null;
    if (this._rawConnection) {
      await this._rawConnection.end();
      this._rawConnection = null;
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

  override emptyInsertStatementValue(): string {
    return "VALUES ()";
  }

  /** @internal */
  _testOnlyPoolFlags(): string[] | undefined {
    return this._poolConfig.flags;
  }

  get raw(): mysql.Connection {
    if (!this._rawConnection) {
      throw new Error(
        this._permanentlyClosed
          ? "Mysql2Adapter: connection is permanently closed"
          : "Mysql2Adapter: connection not yet established — call execute() or await active() first",
      );
    }
    return this._rawConnection;
  }

  /** @internal */
  override async configureConnection(): Promise<void> {
    this._databaseTimezone = ActiveRecord.defaultTimezone;
    if (this._connectionConfigured || !this._rawConnection) return;
    this._connectionConfigured = true;
    await super.configureConnection();
    await this.loadEscapeState();
  }

  /** @internal */
  override async fullVersion(): Promise<string | null> {
    return (await this.databaseVersion).fullVersionString;
  }

  /** @internal */
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

  static async newClient(
    config: mysql.PoolOptions & MysqlAdapterOptions,
  ): Promise<mysql.Connection> {
    const {
      typeCast: userTypeCast,
      adapter: _adapter,
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
        adapter?: string;
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

    let conn: mysql.Connection;
    try {
      conn = await mysql.createConnection({
        supportBigNumbers: true,
        ...(connOptions as mysql.ConnectionOptions),
        flags: withoutDefaultIgnoreSpace(connOptions.flags),
        multipleStatements: true,
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
}

/** @internal */
function withoutDefaultIgnoreSpace(flags: string | string[] | undefined): string[] {
  const list = Array.isArray(flags)
    ? flags
    : String(flags ?? "")
        .split(/\s*,+\s*/)
        .filter(Boolean);
  return list.some((f) => f.toUpperCase() === "IGNORE_SPACE") ? list : [...list, "-IGNORE_SPACE"];
}

/** @internal */
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

/** @internal */
function isMysql2DriverTimeout(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const errno = (e as { errno?: number }).errno;
  if (typeof errno === "number" && errno > 0) return false;
  const code = (e as { code?: string }).code;
  return code === "PROTOCOL_SEQUENCE_TIMEOUT" || code === "ETIMEDOUT";
}

/** @internal */
function isMysql2ConnectionError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const errno = (e as { errno?: number }).errno;
  if (typeof errno === "number" && errno > 0) return false;
  const code = (e as { code?: string }).code;
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

(Mysql2Adapter.prototype as unknown as { castResult: typeof mysql2CastResult }).castResult =
  mysql2CastResult;

Mysql2Adapter.prototype.performQuery = mysql2PerformQuery;

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
