import mysql from "mysql2/promise";
import { rtest } from "@blazetrails/ruby-compat";
import type { MysqlAdapterOptions } from "../connection-adapters/pool-config.js";
import { Date as RubyDate, Temporal, Time } from "@blazetrails/date";
import { BigDecimal, TimeWithZone } from "@blazetrails/activesupport";
import { quotedDate } from "../connection-adapters/abstract/quoting.js";
import { defaultTimezone } from "../active-record.js";

interface QueryOptions {
  as?: "hash" | "array";
  databaseTimezone?: "utc" | "local";
  [key: string]: unknown;
}

type Native = [unknown, mysql.FieldPacket[] | undefined];

export interface Mysql2Result {
  readonly fields: string[];
  readonly size: number;
  toA(): unknown[][];
  free(): void;
}

export interface Mysql2Statement {
  affectedRows: number;
  execute(...args: unknown[]): Promise<Mysql2Result | null>;
  close(): void;
}

const ERRORS = new WeakSet<object>();

function driverError(e: unknown): never {
  const { code, errno, fatal } = (e ?? {}) as { code?: unknown; errno?: unknown; fatal?: unknown };
  if (
    e instanceof Error &&
    (typeof code === "string" || typeof errno === "number" || fatal === true)
  ) {
    ERRORS.add(e);
  }
  throw e;
}

class Result implements Mysql2Result {
  readonly fields: string[];
  private rows: unknown[][];

  constructor(fields: string[], rows: unknown[][]) {
    this.fields = fields;
    this.rows = rows;
  }

  get size(): number {
    return this.rows.length;
  }

  toA(): unknown[][] {
    return this.rows;
  }

  free(): void {
    this.rows = [];
  }
}

class Statement implements Mysql2Statement {
  affectedRows = 0;

  constructor(
    private client: Mysql2Client,
    private sql: string,
  ) {}

  async execute(...args: unknown[]): Promise<Mysql2Result | null> {
    const result = storeResult(
      this.client,
      (await this.client
        .execute(options(this.client, this.sql, this.client.queryOptions) as never, args as never)
        .catch(driverError)) as Native,
    );
    this.affectedRows = result?.size ?? this.client.affectedRows;
    return result;
  }

  close(): void {
    this.client.unprepare(options(this.client, this.sql, this.client.queryOptions) as never);
  }
}

export interface Mysql2Client extends Omit<mysql.Connection, "query" | "prepare"> {
  automaticClose: boolean;
  queryOptions: QueryOptions;
  readTimeout?: number | null;
  affectedRows: number;
  lastId?: number;
  readonly warningCount: number;
  query(sql: string, options?: QueryOptions): Promise<Mysql2Result | null>;
  /** @internal */
  _query(sql: string, options: QueryOptions): Promise<Mysql2Result | null>;
  prepare(sql: string): Mysql2Statement;
  abandonResultsBang(): void;
  setServerOption(value: number): Promise<true>;
}

function options(
  client: Mysql2Client,
  sql: string,
  queryOptions: QueryOptions,
): Record<string, unknown> {
  const typeCast = typeCastFor(client, queryOptions);
  const rowsAsArray = queryOptions.as === "array";
  return client.readTimeout != null
    ? { sql, rowsAsArray, typeCast, timeout: client.readTimeout * 1000 }
    : { sql, rowsAsArray, typeCast };
}

function storeResult(client: Mysql2Client, [rawResult, rawFields]: Native): Mysql2Result | null {
  let result = rawResult as unknown[][] | mysql.ResultSetHeader;
  let fields = rawFields;
  if (Array.isArray(rawFields) && Array.isArray(rawFields[0])) {
    result = (rawResult as unknown[])[0] as unknown[][];
    fields = rawFields[0] as mysql.FieldPacket[];
  } else if (Array.isArray(rawFields) && rawFields[0] === undefined && Array.isArray(rawResult)) {
    result = (rawResult as unknown[])[0] as mysql.ResultSetHeader;
  }
  if (Array.isArray(result)) {
    return new Result(
      (fields ?? []).map((field) => field.name),
      result,
    );
  }
  client.affectedRows = result.affectedRows ?? 0;
  WARNING_COUNT.set(client, result.warningStatus ?? 0);
  if (result.insertId !== undefined) client.lastId = result.insertId;
  return null;
}

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

const COM_SET_OPTION = 0x1b;

type Protocol = {
  clientEncoding: string;
  addCommand(command: object): void;
  writePacket(packet: object): void;
  _resetSequenceId(): void;
};
type Packet = { isError(): boolean; asError(encoding: string): Error };

function setServerOption(this: Mysql2Client, value: number): Promise<true> {
  return new Promise<true>((resolve, reject) => {
    (this as unknown as { connection: Protocol }).connection.addCommand({
      onResult: reject,
      execute(packet: Packet | undefined, connection: Protocol): boolean {
        if (packet === undefined) {
          const buffer = Buffer.from([3, 0, 0, 0, COM_SET_OPTION, value, 0]);
          connection._resetSequenceId();
          connection.writePacket({
            buffer,
            length: () => buffer.length,
            writeHeader: (sequenceId: number) => buffer.writeUInt8(sequenceId, 3),
          });
          return false;
        }
        if (packet.isError()) reject(packet.asError(connection.clientEncoding));
        else resolve(true);
        return true;
      },
    });
  }).catch(driverError);
}

let DEFAULT_QUERY_OPTIONS: QueryOptions | undefined;

export function defaultQueryOptions(): QueryOptions {
  return (DEFAULT_QUERY_OPTIONS ||= {
    as: "hash",
    async: false,
    castBooleans: false,
    symbolizeKeys: false,
    databaseTimezone: "local",
    applicationTimezone: null,
    cacheRows: true,
    connectFlags:
      CLIENT_FLAGS.REMEMBER_OPTIONS |
      CLIENT_FLAGS.LONG_PASSWORD |
      CLIENT_FLAGS.LONG_FLAG |
      CLIENT_FLAGS.TRANSACTIONS |
      CLIENT_FLAGS.PROTOCOL_41 |
      CLIENT_FLAGS.SECURE_CONNECTION |
      CLIENT_FLAGS.CONNECT_ATTRS,
    cast: true,
    defaultFile: null,
    defaultGroup: null,
  });
}

export function query(
  this: Mysql2Client,
  sql: string,
  options: QueryOptions = {},
): Promise<Mysql2Result | null> {
  return this._query(sql, { ...this.queryOptions, ...options });
}

function prepare(this: Mysql2Client, sql: string): Mysql2Statement {
  return new Statement(this, sql);
}

type Field = { type: string; string: () => string | null };
type TypeCast = (field: Field, next: () => unknown) => unknown;

function cast(queryOptions: QueryOptions, field: Field, next: () => unknown): unknown {
  switch (field.type) {
    case "TIMESTAMP":
    case "TIMESTAMP2":
    case "DATETIME":
    case "DATETIME2": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens =
        /^(\d{1,4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?/.exec(raw);
      if (!tokens) return null;
      const [year, month, day, hour, min, sec] = tokens.slice(1, 7).map(Number);
      if (year + month + day + hour + min + sec === 0) return null;
      const msec = Number((tokens[7] ?? "").padEnd(6, "0"));
      const dbTimezone =
        field.type.startsWith("TIMESTAMP") || queryOptions.databaseTimezone === "utc"
          ? "utc"
          : "local";
      const val = Time[dbTimezone](year, month, day, hour, min, sec, msec);
      return queryOptions.databaseTimezone === "utc" ? val.getutc() : val.getlocal();
    }
    case "DATE":
    case "NEWDATE": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens = /^(\d{1,4})-(\d{1,2})-(\d{1,2})/.exec(raw);
      if (!tokens) return null;
      const [year, month, day] = tokens.slice(1, 4).map(Number);
      if (year + month + day === 0) return null;
      return new RubyDate(year, month, day).toDate();
    }
    case "DECIMAL":
    case "NEWDECIMAL": {
      const raw = next();
      if (typeof raw !== "string") return raw;
      if (raw.includes(".")) return new BigDecimal(raw);
      return Number.isSafeInteger(Number(raw)) ? Number(raw) : BigInt(raw);
    }
    case "LONGLONG": {
      const raw = next();
      return typeof raw === "string" ? BigInt(raw) : raw;
    }
    default:
      return next();
  }
}

const TYPE_CAST = new WeakMap<object, TypeCast>();

function typeCastFor(client: object, queryOptions: QueryOptions): TypeCast {
  const typeCast = TYPE_CAST.get(client);
  return (field, next) => cast(queryOptions, field, typeCast ? () => typeCast(field, next) : next);
}

type Execute = (sql: unknown, values?: unknown[]) => unknown;

function bind(value: unknown): unknown {
  if (value instanceof Number) return value.valueOf();
  if (
    value instanceof TimeWithZone ||
    value instanceof Time ||
    value instanceof Temporal.PlainDate
  ) {
    return quotedDate.call({ defaultTimezone: defaultTimezone() }, value);
  }
  return value;
}

const QUERY_OPTIONS = new WeakSet<object>();

const WARNING_COUNT = new WeakMap<object, number>();

const warningCount: PropertyDescriptor = {
  configurable: true,
  get(this: object): number {
    return WARNING_COUNT.get(this) ?? 0;
  },
};

type EofPacket = { offset: number; end: number; isEOF(): boolean; eofWarningCount(): number };
type PacketHandler = { handlePacket?: (packet?: EofPacket) => unknown };

const AUTOMATIC_CLOSE = new WeakMap<object, boolean>();

const automaticClose: PropertyDescriptor = {
  configurable: true,
  get(this: object): boolean {
    return AUTOMATIC_CLOSE.get(this) ?? true;
  },
  set(
    this: { connection?: { stream?: { removeAllListeners?(): unknown; unref?(): unknown } } },
    value: boolean,
  ) {
    AUTOMATIC_CLOSE.set(this, value);
    if (value) return;
    const stream = this.connection?.stream;
    stream?.removeAllListeners?.();
    stream?.unref?.();
  },
};

export function mysql2Client<T extends object>(client: T): T & Mysql2Client {
  if (!QUERY_OPTIONS.has(client)) {
    QUERY_OPTIONS.add(client);
    const queryOptions = { ...defaultQueryOptions() };
    const execute = (client as { execute?: unknown }).execute;
    if (typeof execute === "function") {
      (client as { execute?: Execute }).execute = (sql, values) =>
        (execute as Execute).call(client, sql, values?.map(bind));
    }
    const native = (client as { query?: (options: object) => Promise<Native> }).query;
    const _query = async function (this: Mysql2Client, sql: string, opts: QueryOptions) {
      return storeResult(
        this,
        await native!.call(this, options(this, sql, opts)).catch(driverError),
      );
    };
    for (const [name, value] of Object.entries({
      queryOptions,
      affectedRows: 0,
      _query,
      query,
      prepare,
      abandonResultsBang() {},
      setServerOption,
    })) {
      Object.defineProperty(client, name, { configurable: true, writable: true, value });
    }
    const connection = (client as { connection?: PacketHandler }).connection;
    const handlePacket = connection?.handlePacket;
    if (typeof handlePacket === "function") {
      connection!.handlePacket = function (packet) {
        if (packet?.isEOF() && packet.end - packet.offset >= 5) {
          WARNING_COUNT.set(client, packet.eofWarningCount());
        }
        return handlePacket.call(this, packet);
      };
    }
    Object.defineProperty(client, "warningCount", warningCount);
    const config = (client as { config?: { typeCast?: unknown } }).config;
    if (config) {
      if (typeof config.typeCast === "function") {
        TYPE_CAST.set(client, config.typeCast as TypeCast);
      }
      config.typeCast = (field: Field, next: () => unknown) =>
        typeCastFor(client, (client as unknown as Mysql2Client).queryOptions)(field, next);
    }
  }
  return Object.defineProperty(client, "automaticClose", automaticClose) as T & Mysql2Client;
}

function withoutDefaultIgnoreSpace(list: string[]): string[] {
  return list.some((f) => f.toUpperCase() === "IGNORE_SPACE") ? list : [...list, "-IGNORE_SPACE"];
}

async function newClient(
  config: Omit<mysql.PoolOptions, "flags"> & MysqlAdapterOptions,
): Promise<Mysql2Client> {
  const {
    adapter: _adapter,
    statementLimit: _statementLimit,
    preparedStatements: _preparedStatements,
    advisoryLocks: _advisoryLocks,
    strict: _strict,
    waitTimeout: _wt,
    readTimeout,
    encoding: _encoding,
    collation: _collation,
    variables: _vars,
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

  const client = mysql2Client(
    await mysql
      .createConnection({
        supportBigNumbers: true,
        ...(connOptions as mysql.ConnectionOptions),
        flags: withoutDefaultIgnoreSpace(
          Array.isArray(flags)
            ? flags
            : Object.keys(CLIENT_FLAGS).filter(
                (name) => (Number(flags) & CLIENT_FLAGS[name]) !== 0,
              ),
        ),
      })
      .catch(driverError),
  );
  client.readTimeout = readTimeout;
  return client;
}

export const Mysql2 = {
  Error: class {
    static [Symbol.hasInstance](e: unknown): boolean {
      return typeof e === "object" && e !== null && ERRORS.has(e);
    }
  },
  Client: {
    new: newClient,
    defaultQueryOptions,
    FOUND_ROWS: CLIENT_FLAGS.FOUND_ROWS,
    MULTI_STATEMENTS: CLIENT_FLAGS.MULTI_STATEMENTS,
    OPTION_MULTI_STATEMENTS_ON: 0,
    OPTION_MULTI_STATEMENTS_OFF: 1,
  },
};
