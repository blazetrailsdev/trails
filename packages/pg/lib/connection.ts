import {
  ArgumentError,
  FrozenError,
  LoadError,
  rbAnyToS,
  rbClassNewInstance,
  rbInspect,
  rbNum2Int,
  rbObjClassname,
  rbObjRespondTo,
  rbObjSingletonClass,
  TypeError,
  stringValue,
} from "@blazetrails/ruby-compat";
import { Coder } from "./coder.js";
import { ConnectionBad, Error as PgError, UnableToSend } from "./exceptions.js";
import { PG } from "./namespaces.js";
import type { Result } from "./result.js";
import { _pgTypemapAllStrings, TypeMapAllStrings } from "./type-map-all-strings.js";
import type { TypeMap } from "./type-map.js";
import type * as NodePg from "./engine/node-pg.js";

let engine: typeof NodePg | null = null;

/**
 * @missingRailsCall put_copy_data — CONVERGEABLE pg-put-copy-data-and-flush-sync-async-pairs
 * @missingRailsCall put_copy_end — CONVERGEABLE pg-put-copy-data-and-flush-sync-async-pairs
 * @missingRailsCall flush — CONVERGEABLE pg-put-copy-data-and-flush-sync-async-pairs
 */
const REDIRECT_SEND_METHODS: Record<string, [string, string]> = {
  isnonblocking: ["asyncIsnonblocking", "syncIsnonblocking"],
  isNonblocking: ["asyncIsnonblocking", "syncIsnonblocking"],
  pipelineSync: ["asyncPipelineSync", "syncPipelineSync"],
};

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
  /** @internal */
  _pipelineStatus: number = PG.PQ_PIPELINE_OFF;
  /** @internal */
  _cmdQueue: ("query" | "sync")[] = [];
  /** @internal */
  _results: (Result | null)[] = [];
  /** @internal */
  _resultWaiter: (() => void) | null = null;
  /** @internal */
  _submittable: NodePg.PgconnSubmittable | null = null;
  /** @internal */
  _sendError: unknown = null;
  /** @internal */
  _chunkSize = 0;
  typeMapForResults: TypeMap = _pgTypemapAllStrings;
  typeMapForQueries: TypeMap = _pgTypemapAllStrings;
  notifies: NodePg.Notification[] = [];
  notifyWaiter: ((error?: unknown) => void) | null = null;
  parameterStatuses: Record<string, string> = {};
  sversion = 0;
  noticeReceiver: ((result: Result) => void) | null = null;
  _nonblocking = false;
  _encoderForPutCopyData: Coder | null = null;
  _decoderForGetCopyData: Coder | null = null;
  declare asyncIsnonblocking: Connection["isnonblocking"];
  declare isNonblocking: Connection["isnonblocking"];
  declare asyncSetnonblocking: Connection["setnonblocking"];

  static setAsyncSendApi(this: { prototype: Connection }, enable: boolean): void {
    const proto = this.prototype as unknown as Record<string, unknown>;
    for (const [ali, [async, sync]] of Object.entries(REDIRECT_SEND_METHODS)) {
      proto[ali] = proto[enable ? async : sync];
    }
  }

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
    connParams?: Record<string, unknown>,
    block?: (conn: T) => R | Promise<R>,
  ): Promise<T | R>;
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
    if (this.isFinished()) throw new ConnectionBad("connection is closed", { connection: this });
    const serverVersion = this.status() === PG.CONNECTION_BAD ? 0 : this.sversion;
    if (serverVersion === 0) {
      throw new ConnectionBad("PQserverVersion() can't get server version", { connection: this });
    }
    return serverVersion;
  }

  protocolVersion(): number {
    if (this.isFinished()) throw new ConnectionBad("connection is closed", { connection: this });
    const protocolVersion = this.status() === PG.CONNECTION_BAD ? 0 : 3;
    if (protocolVersion == 0) {
      throw new ConnectionBad("PQprotocolVersion() can't get protocol version", {
        connection: this,
      });
    }
    return protocolVersion;
  }

  host(): string | null {
    return this.client.host ?? null;
  }

  port(): number {
    return Number(this.client.port);
  }

  user(): string | null {
    return this.client.user ?? null;
  }

  getClientEncoding(): string {
    return this.parameterStatuses["client_encoding"] ?? "";
  }

  inspect(): string {
    const str = rbAnyToS(this);
    let stats: string;
    if (this.isFinished()) {
      stats = " finished";
    } else {
      const parts: string[] = [];
      if (this.status() != PG.CONNECTION_OK) {
        parts.push(
          ` status=${Object.keys(PG.Constants).find((c) => c.startsWith("CONNECTION_") && PG.Constants[c as keyof typeof PG.Constants] == this.status())}`,
        );
      }
      if (this.transactionStatus() != PG.PQTRANS_IDLE) {
        parts.push(
          ` transaction_status=${Object.keys(PG.Constants).find((c) => c.startsWith("PQTRANS_") && PG.Constants[c as keyof typeof PG.Constants] == this.transactionStatus())}`,
        );
      }
      if (this.isnonblocking()) {
        parts.push(` nonblocking=${this.isnonblocking()}`);
      }
      if (rbObjRespondTo(this, "pipelineStatus") && this.pipelineStatus() != PG.PQ_PIPELINE_OFF) {
        parts.push(
          ` pipeline_status=${Object.keys(PG.Constants).find((c) => c.startsWith("PQ_PIPELINE_") && PG.Constants[c as keyof typeof PG.Constants] == this.pipelineStatus())}`,
        );
      }
      if (this.getClientEncoding() != "UTF8") {
        parts.push(` client_encoding=${this.getClientEncoding()}`);
      }
      if (!(this.typeMapForResults instanceof TypeMapAllStrings)) {
        parts.push(` type_map_for_results=${rbAnyToS(this.typeMapForResults)}`);
      }
      if (!(this.typeMapForQueries instanceof TypeMapAllStrings)) {
        parts.push(` type_map_for_queries=${rbAnyToS(this.typeMapForQueries)}`);
      }
      if (this.encoderForPutCopyData != null) {
        parts.push(` encoder_for_put_copy_data=${rbAnyToS(this.encoderForPutCopyData)}`);
      }
      if (this.decoderForGetCopyData != null) {
        parts.push(` decoder_for_get_copy_data=${rbAnyToS(this.decoderForGetCopyData)}`);
      }
      stats = ` host=${this.host()} port=${this.port()} user=${this.user()}${parts.join("")}`;
    }
    return `${str.slice(0, -1)}${stats}${str.slice(-1)}`;
  }

  flush(): boolean {
    return true;
  }

  syncSetnonblocking(state: unknown): null {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`, {
        receiver: this,
      });
    }
    let arg: boolean;
    if (state === true) arg = true;
    else if (state === false) arg = false;
    else throw new ArgumentError("Boolean value expected");
    this._nonblocking = arg;
    return null;
  }

  syncIsnonblocking(): boolean {
    return this._nonblocking;
  }

  /** @missingRailsCall flush_data= — CONVERGEABLE pg-connection-connect-poll-c-primitives */
  setnonblocking(enabled: boolean): null {
    (rbObjSingletonClass(this) as unknown as typeof Connection).setAsyncSendApi(!enabled);
    return this.syncSetnonblocking(true);
  }

  isnonblocking(): boolean {
    return false;
  }

  set encoderForPutCopyData(encoder: Coder | null) {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`, {
        receiver: this,
      });
    }
    if (encoder != null && !(encoder instanceof Coder)) {
      throw new TypeError(`wrong argument type ${rbObjClassname(encoder)} (expected PG::Coder)`);
    }
    this._encoderForPutCopyData = encoder;
  }

  get encoderForPutCopyData(): Coder | null {
    return this._encoderForPutCopyData;
  }

  set decoderForGetCopyData(decoder: Coder | null) {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`, {
        receiver: this,
      });
    }
    if (decoder != null && !(decoder instanceof Coder)) {
      throw new TypeError(`wrong argument type ${rbObjClassname(decoder)} (expected PG::Coder)`);
    }
    this._decoderForGetCopyData = decoder;
  }

  get decoderForGetCopyData(): Coder | null {
    return this._decoderForGetCopyData;
  }

  pipelineStatus(): number {
    return this._pipelineStatus;
  }

  enterPipelineMode(): null {
    if (this._pipelineStatus != PG.PQ_PIPELINE_OFF) return null;
    if (this._cmdQueue.length > 0 || this._results.length > 0) {
      throw new PgError("cannot enter pipeline mode, connection not idle\n", { connection: this });
    }
    this._pipelineStatus = PG.PQ_PIPELINE_ON;
    return null;
  }

  exitPipelineMode(): null {
    if (this._pipelineStatus == PG.PQ_PIPELINE_OFF) return null;
    if (this._cmdQueue.length > 0 || this._results.length > 0) {
      throw new PgError("cannot exit pipeline mode with uncollected results\n", {
        connection: this,
      });
    }
    this._pipelineStatus = PG.PQ_PIPELINE_OFF;
    return null;
  }

  syncPipelineSync(): null {
    if (this._pipelineStatus == PG.PQ_PIPELINE_OFF) {
      throw new PgError("cannot send pipeline when not in pipeline mode\n", { connection: this });
    }
    engine!.dispatch(this, (connection) => connection.sync(), ["sync"]);
    return null;
  }

  sendPipelineSync(): null {
    if (this._pipelineStatus == PG.PQ_PIPELINE_OFF) {
      throw new PgError("cannot send pipeline when not in pipeline mode\n", { connection: this });
    }
    engine!.dispatch(this, (connection) => connection.sync(), ["sync"]);
    return null;
  }

  sendFlushRequest(): null {
    if (
      this._pipelineStatus == PG.PQ_PIPELINE_OFF &&
      (this._cmdQueue.length > 0 || this._results.length > 0)
    ) {
      throw new PgError("another command is already in progress\n", { connection: this });
    }
    engine!.dispatch(this, (connection) => connection.flush(), []);
    return null;
  }

  pipelineSync(): boolean {
    this.sendPipelineSync();
    return this.flush();
  }

  declare asyncPipelineSync: Connection["pipelineSync"];

  setChunkedRowsMode(chunkSize: unknown): this {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`, {
        receiver: this,
      });
    }
    const size = rbNum2Int(chunkSize);
    if (size <= 0 || this._cmdQueue.length === 0 || this._results.length > 0) {
      throw new PgError("PQsetChunkedRowsMode ", { connection: this });
    }
    this._chunkSize = size;
    return this;
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
    this._pipelineStatus = PG.PQ_PIPELINE_OFF;
    this._cmdQueue = [];
    this._results = [];
    this._submittable = null;
    this._sendError = null;
    this._chunkSize = 0;
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

  closePrepared(stmtName: string | null): Promise<Result> {
    return this._asyncDescribeClosePreparedPortal(stmtName, "S");
  }

  closePortal(portal: string | null): Promise<Result> {
    return this._asyncDescribeClosePreparedPortal(portal, "P");
  }

  syncClosePrepared(stmtName: string | null): Promise<Result> {
    return this._syncDescribeClosePreparedPortal(stmtName, "S");
  }

  syncClosePortal(stmtName: string | null): Promise<Result> {
    return this._syncDescribeClosePreparedPortal(stmtName, "P");
  }

  /** @internal */
  private async _syncDescribeClosePreparedPortal(
    name: string | null,
    type: "S" | "P",
  ): Promise<Result> {
    const stmt = name == null ? "" : stringValue(name);
    let result: unknown = null;
    await new Promise<void>((resolve) => {
      const submittable = {
        submit(connection: { close(msg: object): void; sync(): void }): null {
          connection.close({ type, name: stmt });
          connection.sync();
          return null;
        },
        handleError: (error: unknown) => {
          result = error;
        },
        handleReadyForQuery: () => resolve(),
      };
      engine!.submit(this, submittable).catch((error: unknown) => {
        result = error;
        resolve();
      });
    });
    const rbPgresult = engine!.emptyResult(result);
    if (rbPgresult.resultStatus() === PG.PGRES_FATAL_ERROR) throw engine!.pgError(this, result);
    /** @inventedArm if — PERMANENT */
    if (type === "S") this.prepared.delete(stmt);
    return rbPgresult;
  }

  /** @internal */
  private _asyncDescribeClosePreparedPortal(name: string | null, type: "S" | "P"): Promise<Result> {
    const stmt = name == null ? "" : stringValue(name);
    return new Promise((resolve, reject) => {
      const submittable = {
        submit(connection: { close(msg: object): void; sync(): void }): null {
          connection.close({ type, name: stmt });
          connection.sync();
          return null;
        },
        handleError: (error: unknown) => reject(engine!.pgError(this, error)),
        handleReadyForQuery: () => {
          /** @inventedArm if — PERMANENT */
          if (type === "S") this.prepared.delete(stmt);
          resolve(engine!.emptyResult());
        },
      };
      engine!.submit(this, submittable).catch(reject);
    });
  }

  declare asyncClosePrepared: Connection["closePrepared"];
  declare asyncClosePortal: Connection["closePortal"];

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
    if (this._cmdQueue.length > 0 || this._results.length > 0) {
      throw new UnableToSend("another command is already in progress\n", { connection: this });
    }
    engine!.dispatch(this, (connection) => connection.query(sql), ["query"]);
  }

  sendQueryParams(
    command: string,
    params: unknown[],
    resultFormat: number | null = null,
    typeMap: TypeMap | null = null,
  ): null {
    if (this.client._ending === true) {
      throw new ConnectionBad("connection is closed", { connection: this });
    }
    if (
      this._pipelineStatus == PG.PQ_PIPELINE_OFF &&
      (this._cmdQueue.length > 0 || this._results.length > 0)
    ) {
      throw new UnableToSend("PQsendQueryParams another command is already in progress\n", {
        connection: this,
      });
    }
    const pipeline = this._pipelineStatus != PG.PQ_PIPELINE_OFF;
    const values = engine!.bindValues(this, params, typeMap ?? this.typeMapForQueries);
    const binary = resultFormat != null && rbNum2Int(resultFormat) !== 0;
    engine!.dispatch(
      this,
      (connection) => {
        connection.parse({ text: command, types: [] });
        connection.bind({ values, binary } as never);
        connection.describe({ type: "P", name: "" });
        connection.execute({ portal: "", rows: 0 });
        if (!pipeline) connection.sync();
      },
      ["query"],
    );
    return null;
  }

  syncGetResult(): Result | null {
    const result = this._results.shift() ?? null;
    if (result?.resultStatus() === PG.PGRES_PIPELINE_SYNC) {
      this._pipelineStatus = PG.PQ_PIPELINE_ON;
    }
    return result;
  }

  async getResult(): Promise<Result | null> {
    await this.block();
    return this.syncGetResult();
  }

  async getLastResult(): Promise<Result | null> {
    let prev: Result | null = null;
    let cur: Result | null;
    for (;;) {
      await this.block();
      cur = this.syncGetResult();
      if (cur == null) break;
      prev = cur;
      const status = cur.resultStatus();
      if (
        status === PG.PGRES_COPY_OUT ||
        status === PG.PGRES_COPY_IN ||
        status === PG.PGRES_COPY_BOTH
      ) {
        break;
      }
    }
    if (prev) prev.check();
    return prev;
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

  async block(timeout: number | null = null): Promise<boolean> {
    const ready = (): boolean =>
      this._results.length > 0 || this._cmdQueue.length === 0 || this._sendError != null;
    if (!ready()) {
      const ret = await new Promise<boolean>((resolve) => {
        const done = (r: boolean): void => {
          clearTimeout(timer);
          this._resultWaiter = null;
          resolve(r);
        };
        const timer = timeout == null ? undefined : setTimeout(() => done(false), timeout * 1000);
        this._resultWaiter = () => {
          if (ready()) done(true);
        };
      });
      if (!ret) return false;
    }
    if (this._sendError != null && this._results.length === 0) {
      const error = this._sendError;
      this._sendError = null;
      throw error;
    }
    return true;
  }

  /** @missingRailsArgs new — PERMANENT */
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
Connection.prototype.asyncClosePrepared = Connection.prototype.closePrepared;
Connection.prototype.asyncClosePortal = Connection.prototype.closePortal;
Connection.prototype.asyncIsnonblocking = Connection.prototype.isnonblocking;
Connection.prototype.isNonblocking = Connection.prototype.isnonblocking;
Connection.prototype.asyncSetnonblocking = Connection.prototype.setnonblocking;
Connection.prototype.asyncPipelineSync = Connection.prototype.pipelineSync;
Connection.prototype.escapeString = escapeString;
Connection.prototype.escape = escapeString;
Connection.prototype.escapeBytea = escapeBytea;
Connection.prototype.unescapeBytea = unescapeBytea;
Connection.prototype.quoteIdent = quoteIdent;

PG.Connection = Connection;
