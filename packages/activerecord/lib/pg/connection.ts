import pg from "pg";
import { PGTypeMapByOid } from "../connection-adapters/postgresql/pg-text-decoder.js";
import { ConnectionBad, Error as PGError, ServerError, UnableToSend } from "@blazetrails/pg";
import { PG } from "./pg.js";

export type PGConnection = Connection;

type QueryConfig = string | Record<string, unknown> | null;
type Query = (config: QueryConfig) => Promise<pg.QueryResult | pg.QueryResult[]>;

const OID_BYTEA = 17;
const OID_BYTEA_ARRAY = 1001;

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
  _queryable?: boolean;
  _connectionError?: boolean;
};

export class Connection {
  client: Client;
  connParams: Record<string, unknown>;
  prepared = new Map<string, string>();
  readyForQuery = "I";
  bad = false;
  pendingResult: Promise<{ result: PG.Result } | { error: unknown }> | null = null;
  pendingResultTaken = false;
  typeMapForResults = new PGTypeMapByOid();
  notifies: pg.Notification[] = [];
  notifyWaiter: ((error?: unknown) => void) | null = null;
  parameterStatuses: Record<string, string> = {};

  static conndefaultsHash = conndefaultsHash;
  static connect = connect;

  constructor(connParams: Record<string, unknown> = {}) {
    this.connParams = connParams;
    this.client = new pg.Client(_clientConfig(connParams)) as Client;
    listen(this, this.client);
    if (typeof this.client.on === "function") {
      this.client.on("notification", (notification: pg.Notification) => {
        this.notifies.push(notification);
        this.notifyWaiter?.();
      });
      this.client.on("error", (error: unknown) => this.notifyWaiter?.(error));
      this.client.on("end", () => this.notifyWaiter?.(new ConnectionBad("connection closed")));
    }
  }

  query(...args: unknown[]): Promise<pg.QueryResult> {
    try {
      return Promise.resolve(
        (this.client.query as unknown as (...args: unknown[]) => unknown)(...args),
      ).catch((error: unknown) => {
        throw pgError(this, error);
      }) as Promise<pg.QueryResult>;
    } catch (error) {
      return Promise.reject(pgError(this, error));
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.end();
    } catch (error) {
      throw pgError(this, error);
    }
  }

  async setClientEncoding(encoding: string): Promise<void> {
    await this.query(`SET client_encoding TO '${this.escapeString(encoding)}'`);
  }

  setNoticeReceiver(block: (result: PG.Result) => void): void {
    this.client.removeAllListeners("notice");
    this.client.on("notice", (notice) => {
      block(new PG.Result({ command: "", rowCount: null, oid: 0, fields: [], rows: [] }, notice));
    });
  }

  connect(): Promise<unknown> {
    return this.client.connect().catch((error: unknown) => {
      throw pgError(this, error, ConnectionBad);
    });
  }

  status(): number {
    const { _ending, _ended, _queryable } = this.client;
    return this.bad || _ending === true || _ended === true || _queryable === false
      ? PG.CONNECTION_BAD
      : PG.CONNECTION_OK;
  }

  async reset(): Promise<void> {
    const client = this.client;
    const iopts = _clientConfig(this.connParams);
    const conn = new (client.constructor as new (config: pg.ClientConfig) => Client)(iopts);
    for (const event of client.eventNames()) {
      for (const listener of client.rawListeners(event)) {
        conn.on(event as "error", listener as () => void);
      }
    }
    listen(this, conn);
    this.prepared.clear();
    this.readyForQuery = "I";
    this.bad = false;
    this.pendingResult = null;
    this.pendingResultTaken = false;
    await client
      .end()
      .then(() => conn.connect())
      .catch((error: unknown) => {
        throw pgError(this, error, ConnectionBad);
      });
    this.client = conn;
  }

  transactionStatus(): number {
    if (this.client._activeQuery != null) return PG.PQTRANS_ACTIVE;
    switch (this.readyForQuery) {
      case "T":
        return PG.PQTRANS_INTRANS;
      case "E":
        return PG.PQTRANS_INERROR;
      default:
        return PG.PQTRANS_IDLE;
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
        handleError: (error: unknown) => reject(pgError(this, error)),
        handleReadyForQuery: () => {
          this.prepared.set(stmtName, sql);
          resolve();
        },
      };
      this.query(submittable).catch(reject);
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
      }).catch((error: unknown) => {
        throw pgError(this, error);
      }),
    );
  }

  async asyncExec(sql: string | null): Promise<PG.Result> {
    return result(
      await (this.query as unknown as Query)(
        sql != null ? { text: sql, rowMode: "array", types: types(this) } : sql,
      ).catch((error: unknown) => {
        throw pgError(this, error);
      }),
    );
  }

  exec(sql: string | null): Promise<PG.Result> {
    return this.asyncExec(sql);
  }

  isFinished(): boolean {
    return this.client._ending === true || this.client._ended === true;
  }

  escapeIdentifier(str: string): string {
    return `"${str.replace(/"/g, '""')}"`;
  }

  escapeString(str: string): string {
    const escaped = str.replace(/'/g, "''");
    return this.parameterStatuses["standard_conforming_strings"] === "off"
      ? escaped.replace(/\\/g, "\\\\")
      : escaped;
  }

  async waitForNotify(
    timeout: number | null = null,
    block?: (relname: string, bePid: number, extra: string | undefined) => unknown,
  ): Promise<string | null> {
    if (this.notifies.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = timeout == null ? undefined : setTimeout(() => done(), timeout * 1000);
        const done = (error?: unknown): void => {
          clearTimeout(timer);
          this.notifyWaiter = null;
          if (error === undefined) resolve();
          else reject(error);
        };
        this.notifyWaiter = done;
      });
    }
    const notification = this.notifies.shift();
    if (notification === undefined) return null;
    block?.(notification.channel, notification.processId, notification.payload);
    return notification.channel;
  }

  sendQuery(sql: string): void {
    if (this.client._ending === true) {
      throw new ConnectionBad("connection is closed", { connection: this });
    }
    if (this.bad) {
      throw new UnableToSend("no connection to the server\n", { connection: this });
    }
    if (this.pendingResult != null) {
      throw new UnableToSend("another command is already in progress\n", { connection: this });
    }
    this.pendingResult = this.asyncExec(sql).then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
    this.pendingResultTaken = false;
  }

  async getLastResult(): Promise<PG.Result | null> {
    const pending = this.pendingResult;
    if (pending == null) return null;
    if (this.pendingResultTaken) {
      await pending;
      return null;
    }
    this.pendingResultTaken = true;
    try {
      const settled = await pending;
      if ("error" in settled) throw settled.error;
      return settled.result;
    } finally {
      if (this.pendingResult === pending) this.pendingResult = null;
    }
  }

  async execParams(sql: string | null, params: unknown[]): Promise<PG.Result> {
    return result(
      await (this.query as unknown as Query)({
        text: sql,
        values: params.map(param),
        rowMode: "array",
        types: types(this),
      }).catch((error: unknown) => {
        throw pgError(this, error);
      }),
    );
  }

  unescapeBytea(value: string | Uint8Array): Uint8Array {
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
    if (connection == null) throw new ConnectionBad("connection is closed", { connection: this });
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
    connection.on(
      "parameterStatus",
      (message: { parameterName: string; parameterValue: string }) => {
        conn.parameterStatuses[message.parameterName] = message.parameterValue;
      },
    );
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

function pgError(conn: Connection, error: unknown, klass?: typeof PGError): unknown {
  if (
    !(error instanceof Error) ||
    error instanceof PGError ||
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  ) {
    return error;
  }
  const { _ending, _ended, _queryable, _connectionError } = conn.client;
  let wrapped: PGError;
  if (klass != null) {
    wrapped = new klass(`${error.message}\n`, { connection: conn });
  } else if (error instanceof pg.DatabaseError) {
    wrapped = new ServerError(error.message, {
      connection: conn,
      result: new PG.Result({ command: "", rowCount: null, oid: 0, fields: [], rows: [] }, error),
    });
  } else if (conn.bad) {
    wrapped = new ConnectionBad("no connection to the server\n", { connection: conn });
  } else if (_ending === true) {
    wrapped = new ConnectionBad("connection is closed", { connection: conn });
  } else if (_ended === true || _queryable === false || _connectionError === true) {
    wrapped = new ConnectionBad(`${error.message}\n`, { connection: conn });
  } else {
    wrapped = new UnableToSend(`${error.message}\n`, { connection: conn });
  }
  wrapped.cause = error;
  if (wrapped instanceof ConnectionBad || (error as { severity?: string }).severity === "FATAL") {
    conn.bad = true;
  }
  return wrapped;
}

function result(raw: pg.QueryResult | pg.QueryResult[]): PG.Result {
  return new PG.Result(Array.isArray(raw) ? raw[raw.length - 1] : raw);
}

export function escapeBytea(value: Buffer | Uint8Array | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "binary") : Buffer.from(value);
  return `\\x${buffer.toString("hex")}`;
}

export function unescapeBytea(value: string | Uint8Array): Uint8Array {
  const strtext = typeof value === "string" ? value : Buffer.from(value).toString("latin1");
  const buffer: number[] = [];
  if (strtext[0] === "\\" && strtext[1] === "x") {
    let s = 2;
    while (s < strtext.length) {
      const v1 = getHex(strtext[s++]);
      if (s >= strtext.length || v1 === -1) continue;
      const v2 = getHex(strtext[s++]);
      if (v2 !== -1) buffer.push((v1 << 4) | v2);
    }
  } else {
    for (let i = 0; i < strtext.length; ) {
      if (strtext[i] === "\\") {
        i++;
        if (strtext[i] === "\\") buffer.push(strtext.charCodeAt(i++));
        else if (
          /[0-3]/.test(strtext[i] ?? "") &&
          /[0-7]/.test(strtext[i + 1] ?? "") &&
          /[0-7]/.test(strtext[i + 2] ?? "")
        ) {
          buffer.push(parseInt(strtext.slice(i, i + 3), 8));
          i += 3;
        }
      } else {
        buffer.push(strtext.charCodeAt(i++));
      }
    }
  }
  return Uint8Array.from(buffer);
}

function getHex(c: string): number {
  return /^[0-9a-fA-F]$/.test(c) ? parseInt(c, 16) : -1;
}

const STRING_OIDS = new Set([
  114, 600, 718, 1017, 1082, 1114, 1115, 1182, 1183, 1184, 1185, 1186, 1187, 1270, 3802,
]);

function pgTypeParser(oid: number, format?: string): unknown {
  if (format === "binary") return pg.types.getTypeParser(oid, "binary");
  if (STRING_OIDS.has(oid)) return (v: unknown) => v;
  return pg.types.getTypeParser(oid, "text");
}

const CONNINFO_KEYWORDS = [
  "service",
  "user",
  "password",
  "passfile",
  "channelBinding",
  "connectTimeout",
  "dbname",
  "host",
  "hostaddr",
  "port",
  "clientEncoding",
  "options",
  "applicationName",
  "fallbackApplicationName",
  "keepalives",
  "keepalivesIdle",
  "keepalivesInterval",
  "keepalivesCount",
  "tcpUserTimeout",
  "sslmode",
  "sslnegotiation",
  "sslcompression",
  "sslcert",
  "sslkey",
  "sslcertmode",
  "sslpassword",
  "sslrootcert",
  "sslcrl",
  "sslcrldir",
  "sslsni",
  "requirepeer",
  "requireAuth",
  "sslMinProtocolVersion",
  "sslMaxProtocolVersion",
  "gssencmode",
  "krbsrvname",
  "gsslib",
  "gssdelegation",
  "replication",
  "targetSessionAttrs",
  "loadBalanceHosts",
];

/** @internal */
function conndefaults(): { keyword: string; val: string | null }[] {
  return CONNINFO_KEYWORDS.map((keyword) => ({ keyword, val: null }));
}

export function conndefaultsHash(): Record<string, string | null> {
  const hash: Record<string, string | null> = {};
  for (const info of conndefaults()) {
    hash[info.keyword] = info.val;
  }
  return hash;
}

/** @noRailsEquivalent PERMANENT */
function _clientConfig(connParams: Record<string, unknown>): pg.ClientConfig {
  const seconds = (value: unknown): number | undefined =>
    value == null ? undefined : Number(value) * 1000;
  const sslmode = connParams.sslmode as string | undefined;
  let ssl: pg.ClientConfig["ssl"];
  if (sslmode === "disable") ssl = false;
  else if (sslmode === "require" || (sslmode == null && connParams.requiressl != null)) {
    ssl = { rejectUnauthorized: false };
  } else if (sslmode === "verify-ca" || sslmode === "verify-full") ssl = true;
  return {
    user: connParams.user as string | undefined,
    database: connParams.dbname as string | undefined,
    password: connParams.password as string | undefined,
    host: connParams.host as string | undefined,
    port: connParams.port == null ? undefined : Number(connParams.port),
    options: connParams.options as string | undefined,
    client_encoding: connParams.clientEncoding as string | undefined,
    application_name: connParams.applicationName as string | undefined,
    fallback_application_name: connParams.fallbackApplicationName as string | undefined,
    connectionTimeoutMillis: seconds(connParams.connectTimeout),
    keepAlive: connParams.keepalives == null ? undefined : String(connParams.keepalives) !== "0",
    keepAliveInitialDelayMillis: seconds(connParams.keepalivesIdle),
    ...(connParams.replication == null ? {} : { replication: connParams.replication }),
    ssl,
    types: { getTypeParser: pgTypeParser as pg.CustomTypesConfig["getTypeParser"] },
  };
}

export async function connect(connParams: Record<string, unknown>): Promise<Connection> {
  const conn = new Connection(connParams);
  await conn.connect();
  return conn;
}
