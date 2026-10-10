import pg from "pg";
import { PGTypeMapByOid } from "../connection-adapters/postgresql/pg-text-decoder.js";
import { connectionBad, pgError } from "./exceptions.js";
import { PG } from "./pg.js";

export interface PGConnection extends pg.Client {
  prepare(stmtName: string, sql: string): Promise<void>;
  execPrepared(stmtName: string, params: unknown[]): Promise<PG.Result>;
  asyncExec(sql: string | null): Promise<PG.Result>;
  execParams(sql: string | null, params: unknown[]): Promise<PG.Result>;
  unescapeBytea(value: string | Uint8Array): Buffer;
  transactionStatus(): number;
  status(): number;
  reset(): Promise<void>;
  cancel(): Promise<string | null>;
  asyncCancel(): Promise<string | null>;
  block(timeout?: number | null): Promise<boolean>;
  socketIo(): { reopen(path: string): void } | null;
  typeMapForResults: PGTypeMapByOid;
}

type QueryConfig = string | Record<string, unknown> | null;
type Query = (config: QueryConfig) => Promise<pg.QueryResult | pg.QueryResult[]>;

const OID_BYTEA = 17;
const OID_BYTEA_ARRAY = 1001;

const PQTRANS_IDLE = 0;
const PQTRANS_ACTIVE = 1;
const PQTRANS_INTRANS = 2;
const PQTRANS_INERROR = 3;

const CONNECTION_OK = 0;
const CONNECTION_BAD = 1;

type Protocol = pg.Connection & {
  connect(portOrPath: string | number, host?: string): void;
  cancel(processID: number, secretKey: number): void;
};
type Client = Omit<pg.Client, "connection"> & {
  connection?: Protocol;
  processID?: number | null;
  secretKey?: number | null;
  _activeQuery?: unknown;
  _ending?: boolean;
  _ended?: boolean;
};

export class Connection {
  client: Client;
  connParams: pg.ClientConfig | undefined;
  prepared = new Map<string, string>();
  readyForQuery = "I";
  typeMapForResults = new PGTypeMapByOid();

  constructor(client: object, connParams?: pg.ClientConfig) {
    this.client = client as Client;
    this.connParams = connParams;
    listen(this, this.client);
    if (typeof this.client.on === "function") this.client.on("error", () => {});
  }

  query(...args: unknown[]): unknown {
    const pending = (this.client.query as unknown as (...args: unknown[]) => unknown)(...args) as
      | { catch?: unknown }
      | null
      | undefined;
    if (typeof pending?.catch !== "function") return pending;
    return (pending as Promise<unknown>).catch(raise);
  }

  connect(): Promise<unknown> {
    return this.client.connect().catch(raise);
  }

  status(): number {
    const { _ending, _ended } = this.client;
    return _ending === true || _ended === true ? CONNECTION_BAD : CONNECTION_OK;
  }

  async reset(): Promise<void> {
    const client = this.client;
    const iopts = this.connParams ?? {
      ...(client as unknown as { connectionParameters: pg.ClientConfig }).connectionParameters,
      password: client.password,
    };
    const conn = new (client.constructor as new (config: pg.ClientConfig) => Client)(iopts);
    for (const event of client.eventNames()) {
      for (const listener of client.rawListeners(event)) {
        conn.on(event as "error", listener as () => void);
      }
    }
    listen(this, conn);
    this.prepared.clear();
    this.readyForQuery = "I";
    await client
      .end()
      .then(() => conn.connect())
      .catch((error: unknown) => {
        void conn.end().catch(() => {});
        return Promise.reject(connectionBad(error));
      });
    this.client = conn;
  }

  transactionStatus(): number {
    if (this.client._activeQuery != null) return PQTRANS_ACTIVE;
    switch (this.readyForQuery) {
      case "T":
        return PQTRANS_INTRANS;
      case "E":
        return PQTRANS_INERROR;
      default:
        return PQTRANS_IDLE;
    }
  }

  prepare(stmtName: string, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const submittable = {
        name: stmtName,
        text: sql,
        submit(connection: { parse(q: object): void; sync(): void }): null {
          connection.parse({ name: stmtName, text: sql });
          connection.sync();
          return null;
        },
        handleError: (error: unknown) => reject(pgError(error)),
        handleReadyForQuery: () => {
          this.prepared.set(stmtName, sql);
          resolve();
        },
      };
      this.query(submittable);
    });
  }

  async execPrepared(stmtName: string, params: unknown[]): Promise<PG.Result> {
    const text = this.prepared.get(stmtName);
    return result(
      await (this.query as unknown as Query)({
        name: stmtName,
        text,
        values: params.map(param),
        rowMode: "array",
        types: types(this),
      }).catch(raise),
    );
  }

  async asyncExec(sql: string | null): Promise<PG.Result> {
    return result(
      await (this.query as unknown as Query)(
        sql != null ? { text: sql, rowMode: "array", types: types(this) } : sql,
      ).catch(raise),
    );
  }

  async execParams(sql: string | null, params: unknown[]): Promise<PG.Result> {
    return result(
      await (this.query as unknown as Query)({
        text: sql,
        values: params.map(param),
        rowMode: "array",
        types: types(this),
      }).catch(raise),
    );
  }

  unescapeBytea(value: string | Uint8Array): Buffer {
    return unescapeBytea(value);
  }

  socketIo(): { reopen(path: string): void } | null {
    const stream = (
      this.client as unknown as {
        connection?: { stream?: { removeAllListeners?(): unknown; unref?(): unknown } };
      }
    ).connection?.stream;
    if (!stream) return null;
    return {
      reopen(_path: string): void {
        stream.removeAllListeners?.();
        stream.unref?.();
      },
    };
  }

  block(timeout: number | null = null): Promise<boolean> {
    if (this.client._activeQuery == null) return Promise.resolve(true);
    const connection = this.client.connection;
    if (connection == null) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const events = ["readyForQuery", "commandComplete", "errorMessage", "end", "error"];
      const done = (ret: boolean): void => {
        clearTimeout(timer);
        for (const event of events) connection.off(event, settle);
        resolve(ret);
      };
      const settle = (): void => done(true);
      const timer = timeout == null ? undefined : setTimeout(() => done(false), timeout * 1000);
      for (const event of events) connection.on(event, settle);
    });
  }

  /**
   * @missingRailsArgs connect — PERMANENT
   * @missingRailsArgs new — PERMANENT
   */
  async cancel(): Promise<string | null> {
    const { processID: bePid, secretKey: beKey, connection, host, port } = this.client;
    if (connection == null) throw connectionBad(new Error("connection is closed"));
    return new Promise<string | null>((resolve) => {
      const cl = new (connection.constructor as new () => Protocol)();
      cl.on("error", (err: unknown) => resolve(String(err)));
      cl.on("end", () => resolve(null));
      cl.once("connect", () => {
        cl.cancel(bePid!, beKey!);
      });
      if (host?.startsWith("/")) {
        cl.connect(`${host}/.s.PGSQL.${port}`);
      } else {
        cl.connect(port, host);
      }
    });
  }

  asyncCancel(): Promise<string | null> {
    return this.cancel();
  }
}

function listen(conn: Connection, client: Client): void {
  const connection = client.connection;
  if (typeof connection?.on === "function") {
    connection.on("readyForQuery", (message: { status?: string }) => {
      if (typeof message?.status === "string") conn.readyForQuery = message.status;
    });
    connection.on("errorMessage", () => {
      if (conn.readyForQuery === "T") conn.readyForQuery = "E";
    });
  }
}

function types(conn: Connection): { getTypeParser(oid: number, format?: string): unknown } {
  return {
    getTypeParser(oid: number, format?: string): unknown {
      if ((oid === OID_BYTEA || oid === OID_BYTEA_ARRAY) && format !== "binary") {
        return (value: unknown) => value;
      }
      const coder = format !== "binary" && conn.typeMapForResults.coders.get(oid);
      if (coder) return (value: string) => coder.decode(value);
      return conn.client.getTypeParser(oid, format as "text");
    },
  };
}

type BinaryParam = { value?: unknown; format?: unknown };

function param(value: unknown): unknown {
  if (value instanceof Number) return value.valueOf();
  if (typeof value === "object" && value !== null && (value as BinaryParam).format === 1) {
    const bytes = (value as BinaryParam).value;
    if (bytes instanceof Uint8Array && Object.keys(value).length === 2) {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
  }
  return value;
}

function raise(error: unknown): never {
  throw pgError(error);
}

function result(raw: pg.QueryResult | pg.QueryResult[]): PG.Result {
  return new PG.Result(Array.isArray(raw) ? raw[raw.length - 1] : raw);
}

export function escapeBytea(value: Buffer | Uint8Array | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "binary") : Buffer.from(value);
  return `\\x${buffer.toString("hex")}`;
}

export function unescapeBytea(value: string | Uint8Array): Buffer {
  if (typeof value !== "string") value = Buffer.from(value).toString("latin1");
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");

  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\") {
      const next = value[i + 1];
      if (next === "\\") {
        bytes.push(0x5c);
        i += 1;
        continue;
      }
      const octal = value.slice(i + 1, i + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        const byte = parseInt(octal, 8);
        if (byte <= 0o377) {
          bytes.push(byte);
          i += 3;
          continue;
        }
      }
    }
    bytes.push(ch.charCodeAt(0));
  }
  return Buffer.from(bytes);
}

const HANDLER: ProxyHandler<Connection> = {
  get(conn, name) {
    const self = name in conn ? conn : conn.client;
    const value: unknown = Reflect.get(self, name);
    return typeof value === "function" ? value.bind(self) : value;
  },
  set(conn, name, value) {
    return Reflect.set(name in conn ? conn : conn.client, name, value);
  },
  has(conn, name) {
    return name in conn || name in conn.client;
  },
  defineProperty(conn, name, descriptor) {
    return Reflect.defineProperty(name in conn ? conn : conn.client, name, descriptor);
  },
  deleteProperty(conn, name) {
    return Reflect.deleteProperty(name in conn ? conn : conn.client, name);
  },
};

const STRING_OIDS = new Set([
  114, 600, 718, 1017, 1082, 1114, 1115, 1182, 1183, 1184, 1185, 1186, 1187, 1270, 3802,
]);

function pgTypeParser(oid: number, format?: string): unknown {
  if (format === "binary") return pg.types.getTypeParser(oid, "binary");
  if (STRING_OIDS.has(oid)) return (v: unknown) => v;
  return pg.types.getTypeParser(oid, "text");
}

const CONNINFO_KEYWORDS: Record<string, string> = {
  user: "user",
  dbname: "database",
  password: "password",
  port: "port",
  host: "host",
  connectionString: "connectionString",
  keepAlive: "keepAlive",
  stream: "stream",
  statementTimeout: "statement_timeout",
  ssl: "ssl",
  queryTimeout: "query_timeout",
  lockTimeout: "lock_timeout",
  keepAliveInitialDelayMillis: "keepAliveInitialDelayMillis",
  idleInTransactionSessionTimeout: "idle_in_transaction_session_timeout",
  applicationName: "application_name",
  fallbackApplicationName: "fallback_application_name",
  connectionTimeoutMillis: "connectionTimeoutMillis",
  types: "types",
  options: "options",
  clientEncoding: "client_encoding",
  binary: "binary",
  replication: "replication",
  enableChannelBinding: "enableChannelBinding",
  connection: "connection",
  Promise: "Promise",
};

export function conndefaultsHash(): Record<string, null> {
  return Object.fromEntries(Object.keys(CONNINFO_KEYWORDS).map((keyword) => [keyword, null]));
}

export async function connect(connParams: Record<string, unknown>): Promise<PGConnection> {
  const config: pg.ClientConfig = Object.fromEntries(
    Object.entries(connParams).map(([key, value]) => [CONNINFO_KEYWORDS[key] ?? key, value]),
  );
  const { getTypeParser } = (config.types ?? {}) as Partial<pg.CustomTypesConfig>;
  config.types = {
    getTypeParser: ((oid: number, format?: string) =>
      getTypeParser?.(oid, format as never) ??
      pgTypeParser(oid, format)) as pg.CustomTypesConfig["getTypeParser"],
  };
  const client = pgConnection(new pg.Client(config), config);
  await client.connect();
  return client;
}

export function pgConnection<T extends object>(
  client: T,
  connParams?: pg.ClientConfig,
): T & PGConnection {
  if (client instanceof Connection) return client as unknown as T & PGConnection;
  return new Proxy(new Connection(client, connParams), HANDLER) as unknown as T & PGConnection;
}
