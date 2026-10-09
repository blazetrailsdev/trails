import { ConnectionAdapters } from "../namespaces.js";
import { prepend, type PrependMethod } from "@blazetrails/activesupport";
import mysql from "mysql2/promise";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { MysqlAdapterOptions } from "./pool-config.js";
import type { DatabaseConfigOptions } from "../database-configurations/database-config.js";
import {
  AbstractMysqlAdapter,
  StatementPool as MysqlStatementPool,
} from "./abstract-mysql-adapter.js";
import { StringType, ImmutableStringType } from "@blazetrails/activemodel";
import { Text as TextType } from "../type/text.js";
import { rbModConstSet, rbObjRespondTo, rtest, RuntimeError } from "@blazetrails/ruby-compat";
import { TypeMap } from "../type/type-map.js";
import * as Type from "../type.js";
import { UnsignedInteger } from "../type/unsigned-integer.js";
import {
  AdapterTimeout,
  ConnectionFailed,
  ConnectionNotEstablished,
  DatabaseConnectionError,
  NoDatabaseError,
} from "../errors.js";
import { Result } from "../result.js";
import {
  affectedRows as mysql2AffectedRows,
  executeBatch as mysql2ExecuteBatch,
  isMultiStatementsEnabled as mysql2IsMultiStatementsEnabled,
  lastInsertedId as mysql2LastInsertedId,
  castResult as mysql2CastResult,
  performQuery as mysql2PerformQuery,
  selectAll as mysql2SelectAll,
  type Mysql2RawResult,
} from "./mysql2/database-statements.js";
import { mysql2Client, type Mysql2Client } from "./mysql2/mysql2-client.js";
import { defaultTimezone } from "../active-record.js";

const CLIENT_FLAGS: Record<string, number> = {
  LONG_PASSWORD: 0x00000001,
  FOUND_ROWS: 0x00000002,
  LONG_FLAG: 0x00000004,
  CONNECT_WITH_DB: 0x00000008,
  NO_SCHEMA: 0x00000010,
  COMPRESS: 0x00000020,
  ODBC: 0x00000040,
  LOCAL_FILES: 0x00000080,
  IGNORE_SPACE: 0x00000100,
  PROTOCOL_41: 0x00000200,
  INTERACTIVE: 0x00000400,
  SSL: 0x00000800,
  IGNORE_SIGPIPE: 0x00001000,
  TRANSACTIONS: 0x00002000,
  RESERVED: 0x00004000,
  SECURE_CONNECTION: 0x00008000,
  MULTI_STATEMENTS: 0x00010000,
  MULTI_RESULTS: 0x00020000,
  PS_MULTI_RESULTS: 0x00040000,
  PLUGIN_AUTH: 0x00080000,
  CONNECT_ATTRS: 0x00100000,
  PLUGIN_AUTH_LENENC_CLIENT_DATA: 0x00200000,
  CAN_HANDLE_EXPIRED_PASSWORDS: 0x00400000,
  SESSION_TRACK: 0x00800000,
  MULTI_FACTOR_AUTHENTICATION: 0x10000000,
  SSL_VERIFY_SERVER_CERT: 0x40000000,
  REMEMBER_OPTIONS: 0x80000000,
};
const FOUND_ROWS = CLIENT_FLAGS.FOUND_ROWS;

let mysql2TypeMap: TypeMap | null = null;

export class Mysql2Adapter extends AbstractMysqlAdapter implements DatabaseAdapter {
  static override readonly ADAPTER_NAME = "Mysql2";

  static readonly ER_BAD_DB_ERROR = 1049;
  static readonly ER_DBACCESS_DENIED_ERROR = 1044;
  static readonly ER_ACCESS_DENIED_ERROR = 1045;
  static readonly ER_CONN_HOST_ERROR = 2003;
  static readonly ER_UNKNOWN_HOST_ERROR = 2005;

  /**
   * @inventedArm filter — CONVERGEABLE mysql2-perform-query-takes-rails-control-flow-over-a-gem-shaped-raw-connection
   * @inventedArm if — CONVERGEABLE mysql2-perform-query-takes-rails-control-flow-over-a-gem-shaped-raw-connection
   */
  static async newClient(
    config: Omit<mysql.PoolOptions, "flags"> & MysqlAdapterOptions,
  ): Promise<mysql.Connection> {
    const {
      adapter: _adapter,
      statementLimit: _statementLimit,
      preparedStatements: _preparedStatements,
      advisoryLocks: _advisoryLocks,
      strict: _strict,
      waitTimeout: _wt,
      readTimeout: _readTimeout,
      encoding: _encoding,
      collation: _collation,
      variables: _vars,
      _fakeConnection: _fake,
      connectionLimit: _connLimit,
      queueLimit: _queueLimit,
      waitForConnections: _waitFor,
      username,
      socket,
      flags,
      ...connOptions
    } = config as mysql.PoolOptions &
      MysqlAdapterOptions & {
        adapter?: string;
        connectionLimit?: number;
        queueLimit?: number;
        waitForConnections?: boolean;
        username?: string;
        socket?: string;
      };
    if (rtest(username)) connOptions.user = username;
    if (rtest(socket)) connOptions.socketPath = socket;

    try {
      return await mysql.createConnection({
        supportBigNumbers: true,
        ...(connOptions as mysql.ConnectionOptions),
        flags: withoutDefaultIgnoreSpace(
          Array.isArray(flags)
            ? flags
            : Object.keys(CLIENT_FLAGS).filter(
                (name) => (Number(flags) & CLIENT_FLAGS[name]) !== 0,
              ),
        ).filter((flag) => flag.toUpperCase() !== "-MULTI_STATEMENTS"),
        multipleStatements: true,
      });
    } catch (err) {
      switch ((err as { errno?: number }).errno) {
        case Mysql2Adapter.ER_BAD_DB_ERROR:
          throw NoDatabaseError.dbError(
            (connOptions as { database?: string }).database ?? "unknown",
          );
        case Mysql2Adapter.ER_DBACCESS_DENIED_ERROR:
        case Mysql2Adapter.ER_ACCESS_DENIED_ERROR:
          throw DatabaseConnectionError.usernameError(
            connOptions.user ?? parseUriField(config, "username") ?? "unknown",
          );
        case Mysql2Adapter.ER_CONN_HOST_ERROR:
        case Mysql2Adapter.ER_UNKNOWN_HOST_ERROR:
          throw DatabaseConnectionError.hostnameError(
            connOptions.host ?? parseUriField(config, "hostname") ?? "unknown",
          );
        default:
          throw new ConnectionNotEstablished((err as Error).message, { cause: err });
      }
    }
  }

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

  constructor(
    config: (Omit<mysql.PoolOptions, "flags"> & MysqlAdapterOptions) | DatabaseConfigOptions,
  );
  /** @deprecated */
  constructor(
    rawConnection: mysql.Connection,
    deprecatedLogger?: unknown,
    deprecatedConnectionOptions?: unknown,
    deprecatedConfig?: Record<string, unknown> | null,
  );
  constructor(...args: [unknown, unknown?, unknown?, unknown?]) {
    super(...args);

    this._affectedRowsBeforeWarnings = null;
    this._config.flags ||= 0;

    if (Array.isArray(this._config.flags)) {
      this._config.flags.push("FOUND_ROWS");
    } else {
      this._config.flags = (this._config.flags as number) | FOUND_ROWS;
    }

    this._connectionParameters ||= this._config;
  }

  async supportsJson(): Promise<boolean> {
    return !(await this.isMariadb()) && (await this.databaseVersion).compare("5.7.8") >= 0;
  }

  supportsComments(): boolean {
    return true;
  }
  private _connectingPromise: Promise<mysql.Connection> | null = null;
  private _connectGeneration = 0;
  private _connectingPromiseGen = -1;
  private _discardedConnectGeneration = -1;
  private _endingClient: Promise<void> | null = null;
  declare _statements: MysqlStatementPool | null;

  declare _affectedRowsBeforeWarnings: number | null;

  supportsCommentsInCreate(): boolean {
    return true;
  }

  supportsSavepoints(): boolean {
    return true;
  }

  override isSavepointErrorsInvalidateTransactions(): boolean {
    return true;
  }

  supportsLazyTransactions(): boolean {
    return true;
  }

  override errorNumber(exception: Error & { errno?: number }): number | null {
    if (rbObjRespondTo(exception, "errno")) return exception.errno as number;
    return null;
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

  override async active(): Promise<boolean> {
    if (this.isConnected()) {
      return await this.lock.synchronize(async () => {
        const ping = await this._rawConnection?.ping().then(
          () => true,
          () => false,
        );
        if (ping) {
          this.verifiedBang();
          return true;
        }
        return false;
      });
    }
    return false;
  }

  declare resetBang: AbstractMysqlAdapter["reconnectBang"];

  override async disconnectBang(): Promise<void> {
    await this.lock.synchronize(async () => {
      await super.disconnectBang();
      this._connectGeneration++;
      this._statements = null;
      this._endRawConnection();
      this._rawConnection = null;
      await this._endingClient;
    });
  }

  override discardBang(): void {
    void this.lock.synchronize(() => {
      super.discardBang();
      this._discardedConnectGeneration = this._connectGeneration;
      this._connectGeneration++;
      this._statements = null;
      if (this._rawConnection) this._rawConnection.automaticClose = false;
      this._rawConnection = null;
    });
  }

  /** @internal */
  isTextType(type: string): boolean {
    return (
      Mysql2Adapter.TYPE_MAP.lookup(type) instanceof StringType ||
      Mysql2Adapter.TYPE_MAP.lookup(type) instanceof TextType
    );
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
    return this.lock.synchronize(async () => {
      this._connectGeneration++;
      this._statements = null;
      this._endRawConnection();
      this._rawConnection = null;
      await this._ensureClient();
    });
  }

  /** @internal */
  override async configureConnection(): Promise<void> {
    this._rawConnection!.queryOptions.as = "array";
    this._rawConnection!.queryOptions.databaseTimezone = defaultTimezone();
    await super.configureConnection();
    await this.loadEscapeState();
  }

  /** @internal */
  executeBatch = mysql2ExecuteBatch;

  /** @internal */
  override async fullVersion(): Promise<string | null> {
    return (await this.databaseVersion).fullVersionString;
  }

  /** @internal */
  isMultiStatementsEnabled = mysql2IsMultiStatementsEnabled;

  /** @internal */
  declare performQuery: typeof mysql2PerformQuery;

  /** @internal */
  declare castResult: typeof mysql2CastResult;

  /** @internal */
  override async getFullVersion(): Promise<string | null> {
    type Handshake = { _handshakePacket?: { serverVersion?: string } };
    const conn = (await this.anyRawConnection()) as (Handshake & { connection?: Handshake }) | null;
    return (conn?.connection ?? conn)?._handshakePacket?.serverVersion ?? null;
  }

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

  /** @internal */
  override defaultPreparedStatements(): boolean {
    return false;
  }

  static override get TYPE_MAP(): TypeMap {
    return (mysql2TypeMap ??= (() => {
      const m = new TypeMap();
      Mysql2Adapter.initializeTypeMap(m);
      return m;
    })());
  }

  /** @internal */
  get _rawConnection(): Mysql2Client | null {
    return this._connection as Mysql2Client | null;
  }
  /** @internal */
  set _rawConnection(value: mysql.Connection | null) {
    this._connection = value && mysql2Client(value);
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

  private async _ensureClient(): Promise<mysql.Connection> {
    if (this._rawConnection) return this._rawConnection;
    if (this._connectingPromise && this._connectingPromiseGen === this._connectGeneration) {
      return this._connectingPromise;
    }
    if (rtest(this._config._fakeConnection))
      throw new RuntimeError("Mysql2Adapter: fake connection has no client");
    const gen = this._connectGeneration;
    this._connectingPromiseGen = gen;
    this._connectingPromise = Mysql2Adapter.newClient(
      this._connectionParameters as Omit<mysql.PoolOptions, "flags"> & MysqlAdapterOptions,
    ).then(
      async (conn): Promise<mysql.Connection> => {
        try {
          await conn.query("SET time_zone = '+00:00'");
        } catch (err) {
          conn.end().catch(() => {});
          throw err;
        }
        if (this._connectGeneration !== gen) {
          if (this._connectingPromiseGen === gen) this._connectingPromise = null;
          const discardErr = new ConnectionNotEstablished(
            "Mysql2Adapter: connection was closed during connect",
          );
          if (this._discardedConnectGeneration === gen) {
            mysql2Client(conn).automaticClose = false;
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
        }
        throw translated;
      },
    );
    return this._connectingPromise;
  }

  /** @internal */
  lastInsertedId(result: Result): Promise<unknown> {
    return mysql2LastInsertedId.call(this as never, result);
  }

  /** @internal */
  affectedRows(rawResult: Mysql2RawResult): number {
    return mysql2AffectedRows.call(this as any, rawResult);
  }

  /** @internal */
  private _endRawConnection(): void {
    const ending = this._rawConnection?.end().catch(() => {});
    if (!ending) return;
    this._endingClient = this._endingClient ? this._endingClient.then(() => ending) : ending;
  }
}

/** @internal */
function withoutDefaultIgnoreSpace(list: string[]): string[] {
  return list.some((f) => f.toUpperCase() === "IGNORE_SPACE") ? list : [...list, "-IGNORE_SPACE"];
}

/** @internal */
function parseUriField(
  config: Omit<mysql.PoolOptions, "flags"> & MysqlAdapterOptions,
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

Mysql2Adapter.prototype.resetBang = Mysql2Adapter.prototype.reconnectBang;

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

prepend(Mysql2Adapter.prototype, { selectAll: mysql2SelectAll as PrependMethod });

rbModConstSet(ConnectionAdapters, "Mysql2Adapter", Mysql2Adapter);
