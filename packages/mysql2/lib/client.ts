import mysql from "mysql2/promise";
import {
  BigDecimal,
  File,
  hasKey,
  kernelInteger,
  Rational,
  rbClassNewInstance,
  rbInspect,
  rbObjClassname,
  rbProgname,
  rtest,
  toI,
  toS,
  warn,
} from "@blazetrails/ruby-compat";
import { Date as RubyDate, DateTime, Time } from "@blazetrails/date";
import { Error as Mysql2Error } from "./error.js";
import { Mysql2 } from "./mysql2.js";
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

export interface Mysql2Result<
  Row extends unknown[] | Record<string, unknown> = unknown[] | Record<string, unknown>,
> {
  readonly fields: string[];
  readonly size: number;
  toA(): Row[];
  free(): void;
}

type Handshake = { _handshakePacket?: { serverVersion?: string } };

const CR_SERVER_GONE_ERROR = 2006;

const CR_ERRNOS: Record<string, number> = {
  ENOTFOUND: 2005,
  ECONNREFUSED: 2003,
  EHOSTUNREACH: 2003,
  ENETUNREACH: 2003,
  ETIMEDOUT: 2003,
  ERR_SOCKET_BAD_PORT: 2003,
  ECONNRESET: 2013,
  PROTOCOL_CONNECTION_LOST: 2013,
  PROTOCOL_SEQUENCE_TIMEOUT: 2013,
  EPIPE: CR_SERVER_GONE_ERROR,
  PROTOCOL_ENQUEUE_AFTER_QUIT: CR_SERVER_GONE_ERROR,
  PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR: CR_SERVER_GONE_ERROR,
  PROTOCOL_ENQUEUE_HANDSHAKE_TWICE: CR_SERVER_GONE_ERROR,
  POOL_CLOSED: CR_SERVER_GONE_ERROR,
};

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

const MYSQL2_MYSQL_ENC_NAME_TO_RB = new Set(
  "ascii big5 binary cp1250 cp1251 cp1256 cp1257 cp850 cp852 cp866 cp932 eucjpms euckr gb18030 gb2312 gbk greek hebrew koi8r koi8u latin1 latin2 latin5 latin7 macce macroman sjis tis620 ucs2 ujis utf16 utf16le utf32 utf8 utf8mb3 utf8mb4".split(
    " ",
  ),
);

const COM_SET_OPTION = 0x1b;

type Protocol = {
  clientEncoding: string;
  addCommand(command: object): void;
  writePacket(packet: object): void;
  _resetSequenceId(): void;
  handlePacket?: (packet?: EofPacket) => unknown;
  stream?: { destroyed?: boolean; removeAllListeners?(): unknown; unref?(): unknown };
  _closing?: boolean;
};
type Packet = { isError(): boolean; asError(encoding: string): Error };
type EofPacket = { offset: number; end: number; isEOF(): boolean; eofWarningCount(): number };
type NpmConnection = mysql.Connection & {
  connection?: Protocol;
  config?: { typeCast?: unknown };
} & Handshake;

const MYSQL2_MAX_TIME = 315578267999;
const MYSQL2_MIN_TIME = 2678400;

type Field = {
  type: string;
  name: string;
  length?: number;
  string: (encoding?: string) => string | null;
  buffer: () => Uint8Array | null;
};
type TypeCast = (field: Field, next: () => unknown) => unknown;
function cast(
  client: Client,
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
        client["INVALID_DATE"] ??= new Mysql2.Error(
          `Invalid date in field '${field.name}': ${raw}`,
        );
        return null;
      }
      if (seconds < MYSQL2_MIN_TIME || seconds > MYSQL2_MAX_TIME) {
        let offset: number | Rational = 0;
        if (queryOptions.databaseTimezone === "local") {
          offset = Client["localOffset"]();
        }
        let val = new DateTime(year, month, day, hour, min, sec, offset);
        if (queryOptions.applicationTimezone != null) {
          if (queryOptions.applicationTimezone === "local") {
            offset = Client["localOffset"]();
            val = val.newOffset(offset);
          } else {
            val = val.newOffset(0);
          }
        }
        return val;
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
        client["INVALID_DATE"] ??= new Mysql2.Error(
          `Invalid date in field '${field.name}': ${raw}`,
        );
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

function bind(value: unknown): unknown {
  if (value instanceof Number) return value.valueOf();
  if (value instanceof Time || value instanceof DateTime) {
    return value.strftime("%Y-%m-%d %H:%M:%S.%6N");
  }
  if (value instanceof Temporal.PlainDate) return value.toString();
  return value;
}

type Options = Record<string, unknown>;

const NOT_DRIVER_OPTIONS =
  "adapter statementLimit preparedStatements advisoryLocks strict waitTimeout encoding collation variables connectionLimit queueLimit waitForConnections username user pass password host hostname port database dbname db socket sock flags connectAttrs reconnect connectTimeout localInfile readTimeout writeTimeout secureAuth initCommand automaticClose enableCleartextPlugin defaultAuth".split(
    " ",
  );

const CLIENT_ONLY_FLAGS = ["SSL_VERIFY_SERVER_CERT", "REMEMBER_OPTIONS"];

declare module "./mysql2.js" {
  interface Mysql2Namespace {
    Client: typeof Client;
  }
}

export class Client {
  static readonly COMPRESS = CLIENT_FLAGS.COMPRESS;
  static readonly FOUND_ROWS = CLIENT_FLAGS.FOUND_ROWS;
  static readonly MULTI_STATEMENTS = CLIENT_FLAGS.MULTI_STATEMENTS;
  static readonly OPTION_MULTI_STATEMENTS_ON = 0;
  static readonly OPTION_MULTI_STATEMENTS_OFF = 1;
  static readonly SSL_MODE_DISABLED = 1;
  static readonly SSL_MODE_PREFERRED = 2;
  static readonly SSL_MODE_REQUIRED = 3;
  static readonly SSL_MODE_VERIFY_CA = 4;
  static readonly SSL_MODE_VERIFY_IDENTITY = 5;

  private static _defaultQueryOptions: QueryOptions | undefined;

  queryOptions: QueryOptions;
  readTimeout: number | null;
  affectedRows = 0;
  lastId: number | undefined;
  private _warningCount = 0;
  private _automaticClose = true;
  private connectTimeout: number | undefined;
  private writeTimeout: number | undefined;
  private localInfile: boolean | undefined;
  private reconnect: boolean | undefined;
  private secureAuth: boolean | undefined;
  private enableCleartextPlugin: boolean | undefined;
  private defaultFile: string | undefined;
  private defaultGroup: string | undefined;
  private initCommand: string | undefined;
  private defaultAuth: string | undefined;
  private charsetName: string | undefined;
  private ssl:
    | {
        key: string | null;
        cert: string | null;
        ca: string | null;
        capath: string | null;
        cipher: string | null;
      }
    | undefined;
  private sslMode: number | undefined;
  /** @internal */
  connection!: NpmConnection;
  private INVALID_DATE: Error | undefined;

  static defaultQueryOptions(): QueryOptions {
    return (this._defaultQueryOptions ||= {
      as: "hash",
      castBooleans: false,
      symbolizeKeys: false,
      databaseTimezone: "local",
      applicationTimezone: null,
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

  private connectArgs: Parameters<Client["connect"]>;

  protected constructor(opts: Options = {}) {
    if (opts === null || typeof opts !== "object" || Array.isArray(opts)) {
      throw new Mysql2Error("Options parameter must be a Hash");
    }

    opts = { ...opts };
    this.readTimeout = null;
    this.queryOptions = { ...Client.defaultQueryOptions() };
    Object.assign(this.queryOptions, opts);

    // eslint-disable-next-line blazetrails/ruby-compat-native-required -- opts can hold { k: undefined } for an absent keyword, which hasKey reads as absent
    if (!hasKey(opts, "connectTimeout")) opts.connectTimeout = 120;

    for (const key of [
      ...["reconnect", "connectTimeout", "localInfile", "readTimeout", "writeTimeout"],
      ...["defaultFile", "defaultGroup", "secureAuth", "initCommand", "automaticClose"],
      ...["enableCleartextPlugin", "defaultAuth"],
    ]) {
      // eslint-disable-next-line blazetrails/ruby-compat-native-required -- opts can hold { k: undefined } for an absent keyword, which hasKey reads as absent
      if (!hasKey(opts, key)) continue;

      switch (key) {
        case "reconnect":
          this.setReconnect(rtest(opts[key]));
          break;
        case "localInfile":
          this.setLocalInfile(rtest(opts[key]));
          break;
        case "secureAuth":
          this.setSecureAuth(rtest(opts[key]));
          break;
        case "automaticClose":
          this.automaticClose = rtest(opts[key]);
          break;
        case "enableCleartextPlugin":
          this.setEnableCleartextPlugin(rtest(opts[key]));
          break;
        case "connectTimeout":
          if (opts[key] != null) this.setConnectTimeout(Number(kernelInteger(opts[key])));
          break;
        case "readTimeout":
          if (opts[key] != null) this.setReadTimeout(Number(kernelInteger(opts[key])));
          break;
        case "writeTimeout":
          if (opts[key] != null) this.setWriteTimeout(Number(kernelInteger(opts[key])));
          break;
        case "defaultFile":
          this.setDefaultFile(opts[key] as string | null);
          break;
        case "defaultGroup":
          this.setDefaultGroup(opts[key] as string | null);
          break;
        case "initCommand":
          this.setInitCommand(opts[key] as string | null);
          break;
        case "defaultAuth":
          this.setDefaultAuth(opts[key] as string | null);
          break;
      }
    }

    this.setCharsetName((rtest(opts.encoding) ? opts.encoding : "utf8") as string);

    let mode: number | undefined;
    if (rtest(opts.sslMode)) mode = this.parseSslMode(opts.sslMode);

    const sslOptions = ["sslkey", "sslcert", "sslca", "sslcapath", "sslcipher"].map(
      (k) => (opts[k] ?? null) as string | null,
    );
    // eslint-disable-next-line blazetrails/ruby-compat-native-required -- opts can hold { k: undefined } for an absent keyword, which hasKey reads as absent
    if (sslOptions.some((o) => rtest(o)) || hasKey(opts, "sslverify")) {
      this.sslSet(
        ...(sslOptions as [
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
        ]),
      );
    }
    if (mode != null) this.setSslMode(mode);

    let flags: number;
    if (Array.isArray(opts.flags)) {
      flags = this.parseFlagsArray(opts.flags, this.queryOptions.connectFlags as number);
    } else if (typeof opts.flags === "string") {
      flags = this.parseFlagsArray(opts.flags.split(" "), this.queryOptions.connectFlags as number);
    } else if (typeof opts.flags === "number") {
      flags = (this.queryOptions.connectFlags as number) | opts.flags;
    } else {
      flags = this.queryOptions.connectFlags as number;
    }

    if (rtest(opts.sslverify)) flags |= CLIENT_FLAGS.SSL_VERIFY_SERVER_CERT;

    if (
      // eslint-disable-next-line blazetrails/ruby-compat-native-required -- queryOptions can hold { k: undefined } for an absent keyword, which hasKey reads as absent
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
    // eslint-disable-next-line blazetrails/ruby-compat-native-required -- a database.yml or ENV port is a String; String#to_i answers 0 where Math.trunc answers NaN
    if (port != null) port = Number(toI(port));
    if (database != null) database = String(database);
    if (socket != null) socket = String(socket);
    const connAttrs = this.parseConnectAttrs(opts.connectAttrs as Options | null | undefined);

    this.connectArgs = [
      user ?? null,
      pass ?? null,
      host ?? null,
      port ?? null,
      database ?? null,
      socket ?? null,
      flags,
      connAttrs,
    ];
  }

  static async new<T extends Client>(this: { prototype: T }, opts: object = {}): Promise<T> {
    const client = rbClassNewInstance(this, opts);
    if (
      (client.sslMode === Client.SSL_MODE_VERIFY_CA ||
        client.sslMode === Client.SSL_MODE_VERIFY_IDENTITY) &&
      client.ssl?.ca == null
    ) {
      const sslca = await client.findDefaultCaPath();
      if (sslca !== undefined) {
        const { key = null, cert = null, capath = null, cipher = null } = client.ssl ?? {};
        client.sslSet(key, cert, sslca, capath, cipher);
      }
    }
    await client.connect(...client.connectArgs);
    return client;
  }

  parseSslMode(mode: unknown): number | undefined {
    const m = toS(mode).toUpperCase();
    const modes = Client as unknown as Record<string, number | undefined>;
    if (m.startsWith("SSL_MODE_")) {
      if (Object.hasOwn(Client, m)) return modes[m];
    } else {
      const x = "SSL_MODE_" + m;
      if (Object.hasOwn(Client, x)) return modes[x];
    }
    warn(`Unknown MySQL ssl_mode flag: ${toS(mode)}`);
    return undefined;
  }

  async findDefaultCaPath(): Promise<string | undefined> {
    for (const f of [
      "/etc/ssl/certs/ca-certificates.crt",
      "/etc/pki/tls/certs/ca-bundle.crt",
      "/etc/ssl/ca-bundle.pem",
      "/etc/ssl/cert.pem",
    ]) {
      if (await File.isExistAsync(f)) return f;
    }
    return undefined;
  }

  private setReconnect(value: boolean): boolean {
    return this._mysqlClientOptions("reconnect", value);
  }

  private setLocalInfile(value: boolean): boolean {
    return this._mysqlClientOptions("localInfile", value);
  }

  private setConnectTimeout(value: number): boolean {
    if (value < 0) {
      throw new Mysql2Error(`connect_timeout must be a positive integer, you passed ${value}`);
    }
    return this._mysqlClientOptions("connectTimeout", value);
  }

  private setReadTimeout(value: number): boolean {
    if (value < 0) {
      throw new Mysql2Error(`read_timeout must be a positive integer, you passed ${value}`);
    }
    this.readTimeout = value;
    return this._mysqlClientOptions("readTimeout", value);
  }

  private setWriteTimeout(value: number): boolean {
    if (value < 0) {
      throw new Mysql2Error(`write_timeout must be a positive integer, you passed ${value}`);
    }
    return this._mysqlClientOptions("writeTimeout", value);
  }

  private setCharsetName(value: string): string {
    if (typeof value !== "string") {
      throw new TypeError(`wrong argument type ${rbObjClassname(value)} (expected String)`);
    }
    if (!MYSQL2_MYSQL_ENC_NAME_TO_RB.has(value)) {
      throw new Mysql2Error(`Unsupported charset: '${rbInspect(value)}'`);
    }
    this.charsetName = value;
    return value;
  }

  private sslSet(
    key: string | null,
    cert: string | null,
    ca: string | null,
    capath: string | null,
    cipher: string | null,
  ): this {
    this.ssl = { key, cert, ca, capath, cipher };
    return this;
  }

  private setSslMode(setting: number): number {
    const val = setting;
    if (
      val !== Client.SSL_MODE_DISABLED &&
      val !== Client.SSL_MODE_PREFERRED &&
      val !== Client.SSL_MODE_REQUIRED &&
      val !== Client.SSL_MODE_VERIFY_CA &&
      val !== Client.SSL_MODE_VERIFY_IDENTITY
    ) {
      throw new Mysql2Error(
        `ssl_mode= takes DISABLED, PREFERRED, REQUIRED, VERIFY_CA, VERIFY_IDENTITY, you passed: ${val}`,
      );
    }
    this.sslMode = val;
    return 0;
  }

  private setSecureAuth(value: boolean): boolean {
    return this._mysqlClientOptions("secureAuth", value);
  }

  private setDefaultFile(value: string | null): boolean {
    return this._mysqlClientOptions("defaultFile", value);
  }

  private setDefaultGroup(value: string | null): boolean {
    return this._mysqlClientOptions("defaultGroup", value);
  }

  private setInitCommand(value: string | null): boolean {
    return this._mysqlClientOptions("initCommand", value);
  }

  private setDefaultAuth(value: string | null): boolean {
    return this._mysqlClientOptions("defaultAuth", value);
  }

  private setEnableCleartextPlugin(value: boolean): boolean {
    return this._mysqlClientOptions("enableCleartextPlugin", value);
  }

  private _mysqlClientOptions(opt: string, value: unknown): boolean {
    if (value == null) return false;
    (this as Options)[opt] =
      typeof value === "number" || typeof value === "boolean" ? value : toS(value);
    return true;
  }

  parseFlagsArray(flags: string[], initial = 0): number {
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

  parseConnectAttrs(connAttrs: Options | null | undefined): Record<string, string> {
    if (CLIENT_FLAGS.CONNECT_ATTRS === 0) return {};

    connAttrs ||= {};
    if (!rtest(connAttrs.program_name)) connAttrs.program_name = rbProgname();
    const hash: Record<string, string> = {};
    for (const [key, value] of Object.entries(connAttrs)) {
      hash[toS(key)] = toS(value);
    }
    return hash;
  }

  query(sql: string, options: QueryOptions = {}): Promise<Mysql2Result | null> {
    return this._query(sql, { ...this.queryOptions, ...options });
  }

  private static localOffset(): Rational {
    return new Rational(Time.local(2010).utcOffset, 86400);
  }

  private async connect(
    user: string | null,
    pass: string | null,
    host: string | null,
    port: number | null,
    database: string | null,
    socket: string | null,
    flags: number,
    connAttrs: Record<string, string>,
  ): Promise<void> {
    const config: Options = { supportBigNumbers: true, ...this.queryOptions };
    for (const key of [...NOT_DRIVER_OPTIONS, ...Object.keys(Client.defaultQueryOptions())]) {
      delete config[key];
    }
    const args = { user, password: pass, host, port, database, socketPath: socket };
    for (const [key, value] of Object.entries(args)) if (value != null) config[key] = value;
    if (this.connectTimeout != null) config.connectTimeout = this.connectTimeout * 1000;
    if (this.charsetName != null) config.charset = this.charsetName;
    if (this.secureAuth != null) config.insecureAuth = !this.secureAuth;
    if (this.localInfile === true) flags |= CLIENT_FLAGS.LOCAL_FILES;
    if (this.localInfile === false) flags &= ~CLIENT_FLAGS.LOCAL_FILES;
    if (
      this.ssl !== undefined ||
      (this.sslMode != null &&
        this.sslMode !== Client.SSL_MODE_DISABLED &&
        this.sslMode !== Client.SSL_MODE_PREFERRED)
    ) {
      const { key, cert, ca, cipher } = this.ssl ?? {};
      const ssl: Options = {
        rejectUnauthorized:
          (flags & CLIENT_FLAGS.SSL_VERIFY_SERVER_CERT) !== 0 ||
          this.sslMode === Client.SSL_MODE_VERIFY_CA ||
          this.sslMode === Client.SSL_MODE_VERIFY_IDENTITY,
      };
      if (this.sslMode === Client.SSL_MODE_VERIFY_CA) ssl.checkServerIdentity = () => undefined;
      if (key != null) ssl.key = await File.readAsync(key);
      if (cert != null) ssl.cert = await File.readAsync(cert);
      if (ca != null) ssl.ca = await File.readAsync(ca);
      if (cipher != null) ssl.ciphers = cipher;
      config.ssl = ssl;
    }
    config.connectAttributes = connAttrs;
    config.flags = Object.keys(CLIENT_FLAGS).filter(
      (name) => !CLIENT_ONLY_FLAGS.includes(name) && (flags & CLIENT_FLAGS[name]) !== 0,
    );
    if ((flags & CLIENT_FLAGS.IGNORE_SPACE) === 0) (config.flags as string[]).push("-IGNORE_SPACE");
    if ((flags & CLIENT_FLAGS.COMPRESS) !== 0) config.compress = true;

    const connection = (await (async () =>
      mysql.createConnection(config as mysql.ConnectionOptions))().catch((e: unknown) =>
      this.raiseMysql2Error(e),
    )) as NpmConnection;
    this.connection = connection;
    if (this.initCommand != null) {
      await connection.query(this.initCommand).catch((e: unknown) => this.raiseMysql2Error(e));
    }

    const protocol = connection.connection;
    const handlePacket = protocol?.handlePacket;
    if (typeof handlePacket === "function") {
      protocol!.handlePacket = (packet) => {
        if (packet?.isEOF() && packet.end - packet.offset >= 5) {
          this._warningCount = packet.eofWarningCount();
        }
        return handlePacket.call(protocol, packet);
      };
    }
    if (connection.config) {
      if (typeof connection.config.typeCast === "function") {
        this.connectionTypeCast = connection.config.typeCast as TypeCast;
      }
      connection.config.typeCast = (field: Field, next: () => unknown) =>
        this.typeCast(this.queryOptions)(field, next);
    }
    if (!this._automaticClose) this.automaticClose = false;
  }

  private typeCast(queryOptions: QueryOptions): TypeCast {
    const typeCast = this.connectionTypeCast;
    return (field, next) =>
      cast(this, queryOptions, field, typeCast ? () => typeCast(field, next) : next);
  }

  private connectionTypeCast: TypeCast | undefined;

  private async _query(sql: string, opts: QueryOptions): Promise<Mysql2Result | null> {
    return this.storeResult(
      await (this.connection.query as unknown as (options: object) => Promise<Native>)
        .call(this.connection, this.options(sql, opts))
        .catch((e: unknown) => this.raiseMysql2Error(e)),
    );
  }

  /** @internal */
  options(sql: string, queryOptions: QueryOptions): Record<string, unknown> {
    this.INVALID_DATE = undefined;
    const typeCast = this.typeCast(queryOptions);
    const rowsAsArray = queryOptions.as === "array";
    return this.readTimeout != null
      ? { sql, rowsAsArray, typeCast, timeout: this.readTimeout * 1000 }
      : { sql, rowsAsArray, typeCast };
  }

  /** @internal */
  storeResult([rawResult, rawFields]: Native): Mysql2Result | null {
    let result = rawResult as Array<unknown[] | Record<string, unknown>> | mysql.ResultSetHeader;
    let fields = rawFields;
    if (Array.isArray(rawFields) && Array.isArray(rawFields[0])) {
      result = (rawResult as unknown[])[0] as Array<unknown[] | Record<string, unknown>>;
      fields = rawFields[0] as mysql.FieldPacket[];
    } else if (Array.isArray(rawFields) && rawFields[0] === undefined && Array.isArray(rawResult)) {
      result = (rawResult as unknown[])[0] as mysql.ResultSetHeader;
    }
    const error = this.INVALID_DATE;
    this.INVALID_DATE = undefined;
    if (Array.isArray(result)) {
      return new Result(
        (fields ?? []).map((field) => field.name),
        result,
        error,
      );
    }
    this.affectedRows = result.affectedRows ?? 0;
    this._warningCount = result.warningStatus ?? 0;
    if (result.insertId !== undefined) this.lastId = result.insertId;
    return null;
  }

  /** @internal */
  execute(options: Record<string, unknown>, values: unknown[]): Promise<Native> {
    return (
      this.connection.execute as unknown as (o: object, v: unknown[]) => Promise<Native>
    ).call(this.connection, options, values.map(bind));
  }

  /** @internal */
  unprepare(options: Record<string, unknown>): void {
    this.connection.unprepare(options as never);
  }

  prepare(sql: string): Statement {
    return new Statement(this, sql);
  }

  abandonResultsBang(): void {}

  get warningCount(): number {
    return this._warningCount;
  }

  get automaticClose(): boolean {
    return this._automaticClose;
  }

  set automaticClose(value: boolean) {
    this._automaticClose = value;
    if (value) return;
    const stream = this.connection?.connection?.stream;
    stream?.removeAllListeners?.();
    stream?.unref?.();
  }

  async close(): Promise<void> {
    await this.connection.end();
  }

  isClosed(): boolean {
    const protocol = this.connection.connection;
    return protocol?._closing === true || protocol?.stream?.destroyed === true;
  }

  async ping(): Promise<boolean> {
    return await this.connection.ping().then(
      () => true,
      () => false,
    );
  }

  serverInfo(): { id: number; version: string | null } {
    const handshake = (this.connection?.connection as Handshake | undefined) ?? this.connection;
    const version = handshake?._handshakePacket?.serverVersion ?? null;
    const [major, minor, patch] = (
      /(\d+)\.(\d+)\.(\d+)/.exec((version ?? "").replace(/^5\.5\.5-/, "")) ?? [0, 0, 0, 0]
    )
      .slice(1)
      .map(Number);
    return { id: major * 10000 + minor * 100 + patch, version };
  }

  /** @internal */
  raiseMysql2Error(e: unknown): never {
    if (!(e instanceof globalThis.Error)) throw e;
    const { code, errno, sqlState } = e as { code?: unknown; errno?: unknown; sqlState?: string };
    if (code === "PROTOCOL_SEQUENCE_TIMEOUT" && this.readTimeout != null) {
      const error = new Mysql2Error.TimeoutError(
        `Timeout waiting for a response from the last query. (waited ${this.readTimeout} seconds)`,
      );
      error.cause = e;
      throw error;
    }
    let errorNumber: number | undefined;
    if (typeof errno === "number" && errno > 0) {
      errorNumber = errno;
    } else if (typeof code === "string" && Object.hasOwn(CR_ERRNOS, code)) {
      errorNumber = CR_ERRNOS[code];
    } else if (/add new command when connection is in closed state/i.test(e.message)) {
      errorNumber = CR_SERVER_GONE_ERROR;
    }
    if (errorNumber === undefined) throw e;
    const error = Mysql2Error.newWithArgs(
      e.message,
      this.serverInfo().id,
      errorNumber,
      sqlState ?? "HY000",
    );
    error.cause = e;
    throw error;
  }

  setServerOption(value: number): Promise<true> {
    return new Promise<true>((resolve, reject) => {
      this.connection.connection!.addCommand({
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
    }).catch((e: unknown) => this.raiseMysql2Error(e));
  }
}

Mysql2.Client = Client;

export { Mysql2 };
