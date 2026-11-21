import {
  ArgumentError,
  LoadError,
  rbClassNewInstance,
  stringValue,
} from "@blazetrails/ruby-compat";
import { ConnectionBad, Error as PgError, UnableToSend } from "./exceptions.js";
import { PG } from "./namespaces.js";
import type { Result } from "./result.js";
import type { TypeMapByClass } from "./type-map-by-class.js";
import { TypeMapByOid } from "./type-map-by-oid.js";
import type * as NodePg from "./engine/node-pg.js";

let engine: typeof NodePg | null = null;

/** @noRailsEquivalent PERMANENT */
async function _requireEngine(): Promise<typeof NodePg> {
  try {
    return (engine ??= await import("./engine/node-pg.js"));
  } catch (error) {
    const { code, cause } = error as { code?: string; cause?: { code?: string } };
    if (code !== "ERR_MODULE_NOT_FOUND" && cause?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    const loadError = new LoadError("cannot load such file -- pg");
    loadError.path = "pg";
    throw loadError;
  }
}

export class Connection {
  client: NodePg.Client;
  connParams: Record<string, unknown>;
  prepared = new Map<string, string>();
  readyForQuery = "I";
  bad = false;
  pendingResult: Promise<{ result: Result } | { error: unknown }> | null = null;
  pendingResultTaken = false;
  typeMapForResults = new TypeMapByOid();
  typeMapForQueries: TypeMapByClass | null = null;
  notifies: NodePg.Notification[] = [];
  notifyWaiter: ((error?: unknown) => void) | null = null;
  parameterStatuses: Record<string, string> = {};
  sversion = 0;
  noticeReceiver: ((result: Result) => void) | null = null;

  static conndefaultsHash = conndefaultsHash;
  static escapeString = escapeString;
  static escape = escapeString;
  static escapeBytea = escapeBytea;
  static unescapeBytea = unescapeBytea;
  static quoteIdent = quoteIdent;

  static async new<T extends Connection>(
    this: { prototype: T },
    connParams?: Record<string, unknown>,
  ): Promise<T>;
  static async new<T extends Connection, R>(
    this: { prototype: T },
    connParams: Record<string, unknown>,
    block: (conn: T) => R | Promise<R>,
  ): Promise<R>;
  static async new<T extends Connection, R>(
    this: { prototype: T },
    connParams: Record<string, unknown> = {},
    block?: (conn: T) => R | Promise<R>,
  ): Promise<T | R> {
    await _requireEngine();
    const conn = rbClassNewInstance(this, connParams);
    await conn.connect();

    if (block !== undefined) {
      try {
        return await block(conn);
      } finally {
        await conn.finish();
      }
    }
    return conn;
  }

  static connect = Connection.new;

  protected constructor(connParams: Record<string, unknown> = {}) {
    this.connParams = connParams;
    this.client = engine!.newClient(connParams);
    engine!.listen(this, this.client);
    if (typeof this.client.on === "function") {
      this.client.on("notification", (notification: NodePg.Notification) => {
        this.notifies.push(notification);
        this.notifyWaiter?.();
      });
      this.client.on("error", (error: unknown) => this.notifyWaiter?.(error));
      this.client.on("end", () => this.notifyWaiter?.(new ConnectionBad("connection closed")));
    }
  }

  declare query: Connection["asyncExec"];
  declare exec: Connection["asyncExec"];

  async finish(): Promise<void> {
    if (this.isFinished()) throw new ConnectionBad("connection is closed", { connection: this });
    try {
      await this.client.end();
    } catch (error) {
      throw engine!.pgError(this, error);
    }
  }
  close(): Promise<void> {
    return this.finish();
  }

  async setClientEncoding(encoding: string): Promise<void> {
    await this.query(`SET client_encoding TO '${this.escapeString(encoding)}'`);
  }

  setNoticeReceiver(
    block: ((result: Result) => void) | null = null,
  ): ((result: Result) => void) | null {
    const oldProc = this.noticeReceiver;
    this.client.removeAllListeners("notice");
    if (block != null) {
      this.client.on("notice", (notice) => {
        block(engine!.emptyResult(notice));
      });
    }
    this.noticeReceiver = block;
    return oldProc;
  }

  serverVersion(): number {
    if (this.status() === PG.CONNECTION_BAD) return 0;
    return this.sversion;
  }

  connect(): Promise<unknown> {
    return this.client.connect().catch((error: unknown) => {
      throw engine!.pgError(this, error, ConnectionBad);
    });
  }

  status(): number {
    const { _ending, _ended, _queryable } = this.client;
    return this.bad || _ending === true || _ended === true || _queryable === false
      ? PG.CONNECTION_BAD
      : PG.CONNECTION_OK;
  }

  async reset(): Promise<this> {
    const client = this.client;
    const iopts = engine!._clientConfig(this.connParams);
    const conn = new (client.constructor as new (config: typeof iopts) => NodePg.Client)(iopts);
    for (const event of client.eventNames()) {
      for (const listener of client.rawListeners(event)) {
        conn.on(event as "error", listener as () => void);
      }
    }
    engine!.listen(this, conn);
    this.prepared.clear();
    this.readyForQuery = "I";
    this.bad = false;
    this.pendingResult = null;
    this.pendingResultTaken = false;
    await client
      .end()
      .then(() => conn.connect())
      .catch((error: unknown) => {
        throw engine!.pgError(this, error, ConnectionBad);
      });
    this.client = conn;
    return this;
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

  prepare(stmtName: string, sql: string): Promise<Result> {
    return new Promise((resolve, reject) => {
      const submittable = {
        name: stmtName,
        text: sql,
        submit(connection: { parse(q: object): void; sync(): void }): null {
          connection.parse({ name: stmtName, text: sql });
          connection.sync();
          return null;
        },
        handleError: (error: unknown) => reject(engine!.pgError(this, error)),
        handleReadyForQuery: () => {
          this.prepared.set(stmtName, sql);
          resolve(engine!.emptyResult());
        },
      };
      engine!.submit(this, submittable).catch(reject);
    });
  }

  execPrepared(stmtName: string, params: unknown[]): Promise<Result> {
    return engine!.execute(this, this.prepared.get(stmtName), params, stmtName);
  }

  asyncExec(sql: string | null): Promise<Result> {
    return engine!.execute(this, sql);
  }

  isFinished(): boolean {
    return this.client._ending === true || this.client._ended === true;
  }

  escapeIdentifier(string: unknown): string {
    if (this.client._ending === true) {
      throw new ConnectionBad("connection is closed", { connection: this });
    }
    const str = stringValue(string);
    if (str.includes("\0")) throw new ArgumentError("string contains null byte");
    if (/\p{Surrogate}/u.test(str)) {
      throw new PgError("invalid multibyte character\n", { connection: this });
    }

    let escaped = '"';
    for (const c of str) {
      if (c === '"') escaped += '"';
      escaped += c;
    }
    return escaped + '"';
  }

  declare escapeString: typeof escapeString;
  declare escape: typeof escapeString;
  declare escapeBytea: typeof escapeBytea;
  declare unescapeBytea: typeof unescapeBytea;
  declare quoteIdent: typeof quoteIdent;

  async waitForNotify(
    timeout: number | null = null,
    block?: (relname: string, bePid: number, extra: string | null) => unknown,
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
    block?.(notification.channel, notification.processId, notification.payload || null);
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

  async getLastResult(): Promise<Result | null> {
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

  execParams(sql: string | null, params: unknown[]): Promise<Result> {
    return engine!.execute(this, sql, params);
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
      const cl = new (connection.constructor as new () => NodePg.Protocol)();
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

function escapeString(this: Connection | typeof Connection, string: string): string {
  const std =
    this instanceof Connection
      ? this.parameterStatuses["standard_conforming_strings"] !== "off"
      : false;
  let result = "";
  for (const c of stringValue(string)) {
    if (c === "'" || (c === "\\" && !std)) result += c;
    result += c;
  }
  return result;
}

function escapeBytea(this: Connection | typeof Connection, str: Uint8Array | string): string {
  const from = typeof str === "string" ? Buffer.from(str, "binary") : Buffer.from(str);
  if (this instanceof Connection) {
    const std = this.parameterStatuses["standard_conforming_strings"] !== "off";
    return `${std ? "" : "\\"}\\x${from.toString("hex")}`;
  }
  let to = "";
  for (const c of from) {
    if (c < 0x20 || c > 0x7e) {
      to += "\\\\" + c.toString(8).padStart(3, "0");
    } else if (c === 0x27) {
      to += "''";
    } else if (c === 0x5c) {
      to += "\\\\\\\\";
    } else {
      to += String.fromCharCode(c);
    }
  }
  return to;
}

function quoteIdent(this: Connection | typeof Connection, strOrArray: unknown): string {
  if (Array.isArray(strOrArray)) {
    return strOrArray.map((entry) => quoteIdentifier(stringValue(entry))).join(".");
  }
  return quoteIdentifier(stringValue(strOrArray));
}

/** @internal */
function quoteIdentifier(value: string): string {
  let out = '"';
  for (const c of value) {
    if (c === '"') out += '"';
    else if (c === "\0") throw new ArgumentError("string contains null byte");
    out += c;
  }
  return out + '"';
}

function unescapeBytea(
  this: Connection | typeof Connection,
  value: string | Uint8Array,
): Uint8Array {
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

Connection.prototype.exec = Connection.prototype.asyncExec;
Connection.prototype.query = Connection.prototype.asyncExec;
Connection.prototype.escapeString = escapeString;
Connection.prototype.escape = escapeString;
Connection.prototype.escapeBytea = escapeBytea;
Connection.prototype.unescapeBytea = unescapeBytea;
Connection.prototype.quoteIdent = quoteIdent;

PG.Connection = Connection;
