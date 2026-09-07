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
  executeBatch as mysql2ExecuteBatch,
  isMultiStatementsEnabled as mysql2IsMultiStatementsEnabled,
  lastInsertedId as mysql2LastInsertedId,
  castResult as mysql2CastResult,
  performQuery as mysql2PerformQuery,
  type Mysql2RawResult,
} from "./mysql2/database-statements.js";
import { transactionIsolationLevels } from "./abstract/database-statements.js";
import { ActiveRecord } from "../ar-config.js";
import { temporalTypeCast, TEMPORAL_POOL_OPTIONS } from "./mysql/temporal-type-cast.js";
import { SchemaDumper as MysqlSchemaDumper } from "./mysql/schema-dumper.js";
import { abandonRawSocket } from "./abandon-raw-socket.js";
import { parseMysqlName as mysqlParseName } from "./mysql/schema-statements.js";
import { fetch } from "@blazetrails/ruby-compat";

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
    return this._client !== null;
  }

  private get _client(): mysql.Connection | null {
    return this._connection as unknown as mysql.Connection | null;
  }
  private set _client(value: mysql.Connection | null) {
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
  override _statements: MysqlStatementPool | null = null;

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
      this._statements = new MysqlStatementPool(this._statementLimit);
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
    return this._client;
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
      this._poolConfig = { uri, waitTimeout, flags: ["FOUND_ROWS"] };
      return;
    }
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
    const driverSql = this.mysqlQuote(sql);
    const typeCastedBinds = this.typeCastedBinds(binds ?? []) ?? [];
    return this.log(driverSql, name, binds ?? [], typeCastedBinds, false, async (payload) => {
      try {
        return await this.withRawConnection(
          { allowRetry: options?.allowRetry ?? false },
          async (conn) => {
            const mysqlConn = conn as unknown as mysql.Connection;
            const raw = await this.performQuery(
              mysqlConn,
              driverSql,
              binds ?? [],
              typeCastedBinds,
              {
                prepare: options?.prepare ?? false,
                notificationPayload: payload,
              },
            );
            return this.castResult(raw);
          },
        );
      } catch (e: any) {
        const translated =
          e instanceof MismatchedForeignKey
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, typeCastedBinds)
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, typeCastedBinds);
        throw translated;
      }
    });
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

  /** @internal */
  isTextType(type: string): boolean {
    return (
      Mysql2Adapter.TYPE_MAP.lookup(type) instanceof StringType ||
      Mysql2Adapter.TYPE_MAP.lookup(type) instanceof TextType
    );
  }

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
        this._client = conn;
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
    if (this._client === null && !this._permanentlyClosed && !this._isFakeConnection) {
      await this.connectBang();
    }
  }

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

  private async _translateAndEnrich(e: unknown, sql: string, binds: unknown[]): Promise<Error> {
    let translated = this.translateExceptionClass(e, sql, binds) as Error;
    if (translated instanceof MismatchedForeignKey) {
      translated = translated.setQuery(sql, binds);
    }
    if (translated instanceof MismatchedForeignKey) {
      translated = await this._enrichMismatchedForeignKey(translated);
    }
    if (translated instanceof AdapterError) translated.setConnectionPool(this.pool);
    return translated;
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

  async execute(
    sql: string,
    name: string | null = "SQL",
    { allowRetry = false }: { allowRetry?: boolean } = {},
  ): Promise<Record<string, unknown>[]> {
    sql = this.preprocessQuery(sql);
    const driverSql = this.mysqlQuote(sql);
    return this.log(driverSql, name, [], [], false, async (payload) => {
      try {
        return await this.withRawConnection({ allowRetry }, async (conn) => {
          const mysqlConn = conn as unknown as mysql.Connection;
          const raw = await this.performQuery(mysqlConn, driverSql, [], [], {
            prepare: false,
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
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, [])
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, []);
        throw translated;
      }
    });
  }

  async executeMutation(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
  ): Promise<number> {
    sql = this.preprocessQuery(sql);
    const driverSql = this.mysqlQuote(sql);
    const typeCastedBinds = this.typeCastedBinds(binds) ?? [];
    return this.log(driverSql, name, binds, typeCastedBinds, false, async (payload) => {
      try {
        return await this.withRawConnection({}, async (conn) => {
          const mysqlConn = conn as unknown as mysql.Connection;
          const raw = await this.performQuery(mysqlConn, driverSql, binds, typeCastedBinds, {
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
        });
      } catch (e: any) {
        const translated =
          e instanceof MismatchedForeignKey
            ? await this._translateAndEnrich(e.cause ?? e, driverSql, typeCastedBinds)
            : e instanceof ActiveRecordError
              ? e
              : await this._translateAndEnrich(e, driverSql, typeCastedBinds);
        throw translated;
      }
    });
  }

  async beginDbTransaction(): Promise<void> {
    await this.internalExecute("BEGIN", "TRANSACTION", [], {
      materializeTransactions: false,
      allowRetry: true,
    });
  }

  override isSavepointErrorsInvalidateTransactions(): boolean {
    return true;
  }

  override async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    const level = fetch<string>(transactionIsolationLevels(), isolation);
    await this.withRawConnection({ allowRetry: true, materializeTransactions: false }, async () => {
      await this.internalExecute(`SET TRANSACTION ISOLATION LEVEL ${level}`, "TRANSACTION", [], {
        materializeTransactions: false,
      });
      await this.internalExecute("BEGIN", "TRANSACTION", [], { materializeTransactions: false });
    });
  }

  async beginDeferredTransaction(): Promise<void> {
    return this.beginDbTransaction();
  }

  async commitDbTransaction(): Promise<void> {
    await this.internalExecute("COMMIT", "TRANSACTION", [], {
      allowRetry: false,
      materializeTransactions: true,
    });
  }

  async rollbackDbTransaction(): Promise<void> {
    await this.internalExecute("ROLLBACK", "TRANSACTION", [], {
      allowRetry: false,
      materializeTransactions: true,
    });
  }

  override async internalExecute(
    sql: string,
    name: string | null = "SQL",
    binds: unknown[] = [],
    {
      materializeTransactions = true,
      allowRetry = false,
      prepare: prepareOption = false,
    }: {
      materializeTransactions?: boolean;
      allowRetry?: boolean;
      prepare?: boolean;
    } = {},
  ): Promise<Mysql2RawResult> {
    sql = this.preprocessQuery(sql);
    try {
      if (materializeTransactions) {
        await this.materializeTransactions();
      }
      const driverSql = this.mysqlQuote(sql);
      const typeCastedBinds = this.typeCastedBinds(binds) ?? [];
      return await this.log(driverSql, name, binds, typeCastedBinds, false, async (payload) => {
        try {
          return await this.withRawConnection(
            { materializeTransactions: false, allowRetry },
            async (rawConn) => {
              const conn = rawConn as unknown as mysql.Connection;
              const rawResult = await this.performQuery(conn, driverSql, binds, typeCastedBinds, {
                prepare: prepareOption,
              });
              payload.row_count = rawResult.affectedRows;
              return rawResult;
            },
          );
        } catch (e: any) {
          const translated =
            e instanceof MismatchedForeignKey
              ? await this._translateAndEnrich(e.cause ?? e, driverSql, typeCastedBinds)
              : e instanceof ActiveRecordError
                ? e
                : await this._translateAndEnrich(e, driverSql, typeCastedBinds);
          throw translated;
        }
      });
    } finally {
      if (materializeTransactions) this.dirtyCurrentTransaction();
    }
  }

  async createSavepoint(name: string): Promise<void> {
    await this.internalExecute(`SAVEPOINT \`${name}\``, "TRANSACTION");
  }

  async releaseSavepoint(name: string): Promise<void> {
    await this.internalExecute(`RELEASE SAVEPOINT \`${name}\``, "TRANSACTION");
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    await this.internalExecute(`ROLLBACK TO SAVEPOINT \`${name}\``, "TRANSACTION");
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

  /** @internal */
  async connect(): Promise<void> {
    await this._ensureClient();
  }

  /** @internal */
  override async reconnect(): Promise<void> {
    if (this._permanentlyClosed) throw new Error("Mysql2Adapter: client is permanently closed");
    return this.lock.synchronize(async () => {
      this._connectGeneration++;
      this._closeRawHandle();
      await this._ensureClient();
    });
  }

  override disconnectBang(): void {
    this._connectGeneration++;
    this._closeRawHandle();
    super.disconnectBang();
  }

  /** @internal */
  private _closeRawHandle(): void {
    this._connectionConfigured = false;
    this._statements = null;
    if (this._client) {
      const ending = this._client.end().catch(() => {});
      this._endingClient = this._endingClient ? this._endingClient.then(() => ending) : ending;
      this._client = null;
    }
  }

  override discardBang(): void {
    if (this._connectingPromise && this._connectingPromiseGen === this._connectGeneration) {
      this._discardedConnectGenerations.add(this._connectGeneration);
    }
    this._connectGeneration++;
    super.discardBang();
    this._connectionConfigured = false;
    this._statements = null;
    const conn = this._client;
    this._client = null;
    abandonRawSocket(conn);
  }

  async close(): Promise<void> {
    this._permanentlyClosed = true;
    this._connectGeneration++;
    this._connectionConfigured = false;
    this._statements = null;
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

  override emptyInsertStatementValue(): string {
    return "VALUES ()";
  }

  /** @internal */
  _testOnlyPoolFlags(): string[] | undefined {
    return this._poolConfig.flags;
  }

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
    this._databaseTimezone = ActiveRecord.defaultTimezone;
    if (this._connectionConfigured || !this._client) return;
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

    let conn: mysql.Connection;
    try {
      conn = await mysql.createConnection({
        supportBigNumbers: true,
        ...(connOptions as mysql.ConnectionOptions),
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

  /** @internal */
  private _buildInitSql(): string {
    const { waitTimeout, variables: configVars } = this._poolConfig;
    const vars: Record<string, string | number | boolean | null | ":default"> = {
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

    const DEFAULTS = new Set([":default"]);

    let sqlMode: string | undefined;
    const varSqlMode = vars["sql_mode"];
    if (varSqlMode !== undefined && varSqlMode !== null) {
      delete vars["sql_mode"];
      sqlMode = this.quote(String(varSqlMode));
    } else if (!DEFAULTS.has(this.isStrictMode() as string)) {
      if (isRubyTruthy(this.isStrictMode())) {
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

dirtiesQueryCache(Mysql2Adapter, "rollbackDbTransaction", "rollbackToSavepoint");
dirtiesQueryCache(Mysql2Adapter, "execute");

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
