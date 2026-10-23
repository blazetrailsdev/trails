import mysql from "mysql2/promise";
import {
  hasKey,
  kernelInteger,
  Rational,
  rbProgname,
  rtest,
  toI,
  toS,
  warn,
} from "@blazetrails/ruby-compat";
import { Date as RubyDate, DateTime, Temporal, Time } from "@blazetrails/date";
import { BigDecimal, TimeWithZone } from "@blazetrails/activesupport";
import { quotedDate } from "../connection-adapters/abstract/quoting.js";
import { defaultTimezone } from "../active-record.js";
import { DRIVER_ERRORS, Error as Mysql2Error } from "./error.js";
import { Result } from "./result.js";
import { Statement } from "./statement.js";

export interface QueryOptions {
  as?: "hash" | "array";
  databaseTimezone?: "utc" | "local";
  applicationTimezone?: "utc" | "local" | null;
  cast?: boolean;
  castBooleans?: boolean;
  symbolizeKeys?: boolean;
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

type Handshake = { _handshakePacket?: { serverVersion?: string } };

function serverVersion(client: object | undefined): number {
  const conn = client as (Handshake & { connection?: Handshake }) | undefined;
  const version = ((conn?.connection ?? conn)?._handshakePacket?.serverVersion ?? "").replace(
    /^5\.5\.5-/,
    "",
  );
  const [major, minor, patch] = (/(\d+)\.(\d+)\.(\d+)/.exec(version) ?? [0, 0, 0, 0])
    .slice(1)
    .map(Number);
  return major * 10000 + minor * 100 + patch;
}

/** @noRailsEquivalent PERMANENT */
export function driverError(e: unknown, client?: object): never {
  const { code, errno, fatal, sqlState } = (e ?? {}) as {
    code?: unknown;
    errno?: unknown;
    fatal?: unknown;
    sqlState?: string;
  };
  if (!(e instanceof globalThis.Error)) throw e;
  if (typeof errno === "number" && errno > 0) {
    const error = Mysql2Error.newWithArgs(
      e.message,
      serverVersion(client),
      errno,
      sqlState ?? null,
    );
    error.cause = e;
    throw error;
  }
  if (typeof code === "string" || fatal === true) DRIVER_ERRORS.add(e);
  throw e;
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

/** @noRailsEquivalent PERMANENT */
export function options(
  client: Mysql2Client,
  sql: string,
  queryOptions: QueryOptions,
): Record<string, unknown> {
  INVALID_DATE.delete(client);
  const typeCast = typeCastFor(client, queryOptions);
  const rowsAsArray = queryOptions.as === "array";
  return client.readTimeout != null
    ? { sql, rowsAsArray, typeCast, timeout: client.readTimeout * 1000 }
    : { sql, rowsAsArray, typeCast };
}

/** @noRailsEquivalent PERMANENT */
export function storeResult(
  client: Mysql2Client,
  [rawResult, rawFields]: Native,
): Mysql2Result | null {
  let result = rawResult as unknown[][] | mysql.ResultSetHeader;
  let fields = rawFields;
  if (Array.isArray(rawFields) && Array.isArray(rawFields[0])) {
    result = (rawResult as unknown[])[0] as unknown[][];
    fields = rawFields[0] as mysql.FieldPacket[];
  } else if (Array.isArray(rawFields) && rawFields[0] === undefined && Array.isArray(rawResult)) {
    result = (rawResult as unknown[])[0] as mysql.ResultSetHeader;
  }
  const error = INVALID_DATE.get(client);
  INVALID_DATE.delete(client);
  if (Array.isArray(result)) {
    return new Result(
      (fields ?? []).map((field) => field.name),
      result,
      error,
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
  }).catch((e: unknown) => driverError(e, this));
}

let DEFAULT_QUERY_OPTIONS: QueryOptions | undefined;

export function defaultQueryOptions(): QueryOptions {
  return (DEFAULT_QUERY_OPTIONS ||= {
    as: "hash",
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

type Field = {
  type: string;
  name: string;
  length?: number;
  string: (encoding?: string) => string | null;
  buffer: () => Uint8Array | null;
};
type TypeCast = (field: Field, next: () => unknown) => unknown;

const MYSQL2_MAX_TIME = 315578267999;
const MYSQL2_MIN_TIME = 2678400;

function cast(
  client: object,
  queryOptions: QueryOptions,
  field: Field,
  next: () => unknown,
): unknown {
  if (!rtest(queryOptions.cast)) return field.string();
  switch (field.type) {
    case "BIT": {
      if (rtest(queryOptions.castBooleans) && field.length === 1) {
        const raw = field.buffer();
        return raw === null ? null : raw[0] === 1;
      }
      return next();
    }
    case "TINY":
      if (rtest(queryOptions.castBooleans) && field.length === 1) {
        const raw = field.string();
        return raw === null ? null : raw !== "0";
      }
    // eslint-disable-next-line no-fallthrough
    case "SHORT":
    case "LONG":
    case "INT24":
    case "LONGLONG":
    case "YEAR": {
      const raw = next();
      return typeof raw === "string" ? BigInt(raw) : raw;
    }
    case "DECIMAL":
    case "NEWDECIMAL": {
      const raw = next();
      if (typeof raw !== "string") return raw;
      if (!raw.includes(".")) {
        return Number.isSafeInteger(Number(raw)) ? Number(raw) : BigInt(raw);
      } else if (Number(raw) === 0) {
        return new BigDecimal("0.0");
      } else {
        return new BigDecimal(raw);
      }
    }
    case "FLOAT":
    case "DOUBLE": {
      const columnToDouble = next();
      if (columnToDouble === 0) {
        return 0.0;
      } else {
        return columnToDouble;
      }
    }
    case "TIME": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?/.exec(raw);
      if (!tokens) return null;
      const [hour, min, sec] = tokens.slice(1, 4).map(Number);
      const msec = Number((tokens[4] ?? "").padEnd(6, "0"));
      let val = Time[queryOptions.databaseTimezone!](2000, 1, 1, hour, min, sec, msec);
      if (queryOptions.applicationTimezone != null) {
        if (queryOptions.applicationTimezone === "local") {
          val = val.getlocal();
        } else {
          val = val.getutc();
        }
      }
      return val;
    }
    case "TIMESTAMP":
    case "DATETIME": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens =
        /^(\d{1,4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?/.exec(raw);
      if (!tokens) return null;
      const [year, month, day, hour, min, sec] = tokens.slice(1, 7).map(Number);
      const seconds =
        year * 31557600 + month * 2592000 + day * 86400 + hour * 3600 + min * 60 + sec;
      if (seconds === 0) return null;
      if (month < 1 || day < 1) {
        if (!INVALID_DATE.has(client)) {
          INVALID_DATE.set(
            client,
            new Mysql2.Error(`Invalid date in field '${field.name}': ${raw}`),
          );
        }
        return null;
      }
      if (seconds < MYSQL2_MIN_TIME || seconds > MYSQL2_MAX_TIME) {
        let offset: number | Rational = 0;
        if (queryOptions.databaseTimezone === "local") {
          offset = Mysql2.Client.localOffset();
        }
        let val = new DateTime(year, month, day, hour, min, sec, offset);
        if (queryOptions.applicationTimezone != null) {
          if (queryOptions.applicationTimezone === "local") {
            offset = Mysql2.Client.localOffset();
            val = val.newOffset(offset);
          } else {
            val = val.newOffset(0);
          }
        }
        return val.toDatetime();
      }
      const msec = Number((tokens[7] ?? "").padEnd(6, "0"));
      let val = Time[queryOptions.databaseTimezone!](year, month, day, hour, min, sec, msec);
      if (queryOptions.applicationTimezone != null) {
        if (queryOptions.applicationTimezone === "local") {
          val = val.getlocal();
        } else {
          val = val.getutc();
        }
      }
      return val;
    }
    case "DATE":
    case "NEWDATE": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens = /^(\d{1,4})-(\d{1,2})-(\d{1,2})/.exec(raw);
      if (!tokens) return null;
      const [year, month, day] = tokens.slice(1, 4).map(Number);
      if (year + month + day === 0) return null;
      if (month < 1 || day < 1) {
        if (!INVALID_DATE.has(client)) {
          INVALID_DATE.set(
            client,
            new Mysql2.Error(`Invalid date in field '${field.name}': ${raw}`),
          );
        }
        return null;
      }
      return new RubyDate(year, month, day).toDate();
    }
    case "JSON":
      return field.string("utf8");
    default:
      return next();
  }
}

const TYPE_CAST = new WeakMap<object, TypeCast>();

/** @noRailsEquivalent PERMANENT */
const INVALID_DATE = new WeakMap<object, Error>();

function typeCastFor(client: object, queryOptions: QueryOptions): TypeCast {
  const typeCast = TYPE_CAST.get(client);
  return (field, next) =>
    cast(client, queryOptions, field, typeCast ? () => typeCast(field, next) : next);
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
        await native!
          .call(this, options(this, sql, opts))
          .catch((e: unknown) => driverError(e, this)),
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

type Options = Record<string, unknown>;
type Wrapper = {
  queryOptions: QueryOptions;
  readTimeout: number | null;
  connectTimeout?: number;
  automaticClose?: boolean;
} & Options;

const NOT_DRIVER_OPTIONS =
  "adapter statementLimit preparedStatements advisoryLocks strict waitTimeout encoding collation variables connectionLimit queueLimit waitForConnections username user pass password host hostname port database dbname db socket sock flags connectAttrs reconnect connectTimeout localInfile readTimeout writeTimeout secureAuth initCommand automaticClose enableCleartextPlugin defaultAuth".split(
    " ",
  );

const CLIENT_ONLY_FLAGS = ["SSL_VERIFY_SERVER_CERT", "REMEMBER_OPTIONS"];

/** @noRailsEquivalent PERMANENT */
async function connect(
  this: Wrapper,
  user: string | null,
  pass: string | null,
  host: string | null,
  port: number | null,
  database: string | null,
  socket: string | null,
  flags: number,
  connAttrs: Record<string, string>,
): Promise<Mysql2Client> {
  const config: Options = { supportBigNumbers: true, ...this.queryOptions };
  for (const key of [...NOT_DRIVER_OPTIONS, ...Object.keys(defaultQueryOptions())]) {
    delete config[key];
  }
  const args = { user, password: pass, host, port, database, socketPath: socket };
  for (const [key, value] of Object.entries(args)) if (value != null) config[key] = value;
  if (this.connectTimeout != null) config.connectTimeout = this.connectTimeout * 1000;
  config.connectAttributes = connAttrs;
  config.flags = Object.keys(CLIENT_FLAGS).filter(
    (name) => !CLIENT_ONLY_FLAGS.includes(name) && (flags & CLIENT_FLAGS[name]) !== 0,
  );
  if ((flags & CLIENT_FLAGS.IGNORE_SPACE) === 0) (config.flags as string[]).push("-IGNORE_SPACE");
  if ((flags & CLIENT_FLAGS.COMPRESS) !== 0) config.compress = true;

  const client = mysql2Client(
    await mysql.createConnection(config as mysql.ConnectionOptions).catch(driverError),
  );
  client.queryOptions = this.queryOptions;
  client.readTimeout = this.readTimeout;
  if (this.automaticClose != null) client.automaticClose = this.automaticClose;
  return client;
}

/** @noRailsEquivalent PERMANENT */
export async function initialize(this: Wrapper, opts: Options = {}): Promise<Mysql2Client> {
  if (opts === null || typeof opts !== "object" || Array.isArray(opts)) {
    throw new Mysql2Error("Options parameter must be a Hash");
  }

  opts = { ...opts };
  this.readTimeout = null;
  this.queryOptions = { ...defaultQueryOptions() };
  Object.assign(this.queryOptions, opts);

  if (!hasKey(opts, "connectTimeout")) opts.connectTimeout = 120;

  for (const key of [
    ...["reconnect", "connectTimeout", "localInfile", "readTimeout", "writeTimeout"],
    ...["defaultFile", "defaultGroup", "secureAuth", "initCommand", "automaticClose"],
    ...["enableCleartextPlugin", "defaultAuth"],
  ]) {
    if (!hasKey(opts, key)) continue;

    switch (key) {
      case "reconnect":
      case "localInfile":
      case "secureAuth":
      case "automaticClose":
      case "enableCleartextPlugin":
        this[key] = rtest(opts[key]);
        break;
      case "connectTimeout":
      case "readTimeout":
      case "writeTimeout":
        if (opts[key] != null) this[key] = kernelInteger(opts[key]);
        break;
      default:
        this[key] = opts[key];
    }
  }

  let flags: number;
  if (Array.isArray(opts.flags)) {
    flags = parseFlagsArray(opts.flags, this.queryOptions.connectFlags as number);
  } else if (typeof opts.flags === "string") {
    flags = parseFlagsArray(opts.flags.split(" "), this.queryOptions.connectFlags as number);
  } else if (typeof opts.flags === "number") {
    flags = (this.queryOptions.connectFlags as number) | opts.flags;
  } else {
    flags = this.queryOptions.connectFlags as number;
  }

  if (rtest(opts.sslverify)) flags |= CLIENT_FLAGS.SSL_VERIFY_SERVER_CERT;

  if (
    ["user", "pass", "hostname", "dbname", "db", "sock"].some((k) => hasKey(this.queryOptions, k))
  ) {
    warn("============= WARNING FROM mysql2 =============");
    warn(
      "The options :user, :pass, :hostname, :dbname, :db, and :sock are deprecated and will be removed at some point in the future.",
    );
    warn(
      "Instead, please use :username, :password, :host, :port, :database, :socket, :flags for the options.",
    );
    warn("============= END WARNING FROM mysql2 =========");
  }

  let user = (rtest(opts.username) ? opts.username : opts.user) as string | null | undefined;
  let pass = (rtest(opts.password) ? opts.password : opts.pass) as string | null | undefined;
  let host = (rtest(opts.host) ? opts.host : opts.hostname) as string | null | undefined;
  let port = opts.port as number | null | undefined;
  let database = (
    rtest(opts.database) ? opts.database : rtest(opts.dbname) ? opts.dbname : opts.db
  ) as string | null | undefined;
  let socket = (rtest(opts.socket) ? opts.socket : opts.sock) as string | null | undefined;

  if (user != null) user = String(user);
  if (pass != null) pass = String(pass);
  if (host != null) host = String(host);
  if (port != null) port = Number(toI(port));
  if (database != null) database = String(database);
  if (socket != null) socket = String(socket);
  const connAttrs = parseConnectAttrs(opts.connectAttrs as Options | null | undefined);

  return connect.call(
    this,
    user ?? null,
    pass ?? null,
    host ?? null,
    port ?? null,
    database ?? null,
    socket ?? null,
    flags,
    connAttrs,
  );
}

export function parseFlagsArray(flags: string[], initial = 0): number {
  return flags.reduce((memo, f) => {
    const fneg = f.startsWith("-") ? f.slice(1) : null;
    if (fneg != null && /^\w+$/.test(fneg) && Object.hasOwn(CLIENT_FLAGS, fneg)) {
      return memo & ~CLIENT_FLAGS[fneg];
    } else if (f != null && /^\w+$/.test(f) && Object.hasOwn(CLIENT_FLAGS, f)) {
      return memo | CLIENT_FLAGS[f];
    } else {
      warn(`Unknown MySQL connection flag: '${f}'`);
      return memo;
    }
  }, initial);
}

export function parseConnectAttrs(connAttrs: Options | null | undefined): Record<string, string> {
  if (CLIENT_FLAGS.CONNECT_ATTRS === 0) return {};

  connAttrs ||= {};
  if (!rtest(connAttrs.program_name)) connAttrs.program_name = rbProgname();
  const hash: Record<string, string> = {};
  for (const [key, value] of Object.entries(connAttrs)) {
    hash[toS(key)] = toS(value);
  }
  return hash;
}

export const Mysql2 = {
  Error: Mysql2Error,
  Client: {
    new: (opts?: object) => initialize.call({} as Wrapper, opts as Options | undefined),
    /** @internal */
    localOffset(): Rational {
      return new Rational(Time.local(2010).utcOffset, 86400);
    },
    defaultQueryOptions,
    COMPRESS: CLIENT_FLAGS.COMPRESS,
    FOUND_ROWS: CLIENT_FLAGS.FOUND_ROWS,
    MULTI_STATEMENTS: CLIENT_FLAGS.MULTI_STATEMENTS,
    OPTION_MULTI_STATEMENTS_ON: 0,
    OPTION_MULTI_STATEMENTS_OFF: 1,
  },
};
