import { ConnectionAdapters } from "../namespaces.js";
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
import { include, rbModConstSet, rbObjRespondTo } from "@blazetrails/ruby-compat";
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
  DatabaseStatements as Mysql2DatabaseStatements,
} from "./mysql2/database-statements.js";
import { Mysql2, type Mysql2Client, type Mysql2Result } from "../mysql2/client.js";
import { defaultTimezone } from "../active-record.js";

let mysql2TypeMap: TypeMap | null = null;

export class Mysql2Adapter extends AbstractMysqlAdapter implements DatabaseAdapter {
  static override readonly ADAPTER_NAME = "Mysql2";

  static readonly ER_BAD_DB_ERROR = 1049;
  static readonly ER_DBACCESS_DENIED_ERROR = 1044;
  static readonly ER_ACCESS_DENIED_ERROR = 1045;
  static readonly ER_CONN_HOST_ERROR = 2003;
  static readonly ER_UNKNOWN_HOST_ERROR = 2005;

  static async newClient(
    config: Omit<mysql.PoolOptions, "flags"> & MysqlAdapterOptions,
  ): Promise<Mysql2Client> {
    try {
      return await Mysql2.Client.new(config);
    } catch (err) {
      if (!(err instanceof Mysql2.Error)) throw err;
      switch ((err as { errno?: number }).errno) {
        case Mysql2Adapter.ER_BAD_DB_ERROR:
          throw NoDatabaseError.dbError((config as { database?: string }).database ?? "unknown");
        case Mysql2Adapter.ER_DBACCESS_DENIED_ERROR:
        case Mysql2Adapter.ER_ACCESS_DENIED_ERROR:
          throw DatabaseConnectionError.usernameError(
            (config as { username?: string }).username ??
              config.user ??
              parseUriField(config, "username") ??
              "unknown",
          );
        case Mysql2Adapter.ER_CONN_HOST_ERROR:
        case Mysql2Adapter.ER_UNKNOWN_HOST_ERROR:
          throw DatabaseConnectionError.hostnameError(
            config.host ?? parseUriField(config, "hostname") ?? "unknown",
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
    rawConnection: Mysql2Client,
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
      this._config.flags = (this._config.flags as number) | Mysql2.Client.FOUND_ROWS;
    }

    this._connectionParameters ||= this._config;
  }

  async supportsJson(): Promise<boolean> {
    return !(await this.isMariadb()) && (await this.databaseVersion).compare("5.7.8") >= 0;
  }

  supportsComments(): boolean {
    return true;
  }
  declare _statements: MysqlStatementPool;

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
      await this._rawConnection?.end();
      this._rawConnection = null;
    });
  }

  override discardBang(): void {
    void this.lock.synchronize(() => {
      super.discardBang();
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
      await this._rawConnection?.end();
      this._rawConnection = null;
      await this.connect();
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
  declare _rawConnection: Mysql2Client | null;

  /** @internal */
  _clientForTest(): Mysql2Client | null {
    return this._rawConnection;
  }

  private async _ensureClient(): Promise<unknown> {
    if (this._rawConnection) return this._rawConnection;
    let conn: Mysql2Client;
    try {
      conn = await Mysql2Adapter.newClient(
        this._connectionParameters as Omit<mysql.PoolOptions, "flags"> & MysqlAdapterOptions,
      );
    } catch (err) {
      const translated = err instanceof Error ? err : new ConnectionNotEstablished(String(err));
      if (translated instanceof ConnectionNotEstablished) {
        translated.setPool(this.pool);
      }
      throw translated;
    }
    try {
      await conn.query("SET time_zone = '+00:00'");
    } catch (err) {
      conn.end().catch(() => {});
      throw err;
    }
    this._rawConnection = conn;
    return conn;
  }

  /** @internal */
  lastInsertedId(result: Result): Promise<unknown> {
    return mysql2LastInsertedId.call(this as never, result);
  }

  /** @internal */
  affectedRows(rawResult: Mysql2Result | null): number | null {
    return mysql2AffectedRows.call(this as any, rawResult);
  }
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

include(Mysql2Adapter, Mysql2DatabaseStatements);

rbModConstSet(ConnectionAdapters, "Mysql2Adapter", Mysql2Adapter);
