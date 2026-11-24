import {
  Addrinfo,
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
  rbProgname,
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

const REDIRECT_SEND_METHODS: Record<string, [string, string]> = {
  isnonblocking: ["asyncIsnonblocking", "syncIsnonblocking"],
  isNonblocking: ["asyncIsnonblocking", "syncIsnonblocking"],
  putCopyData: ["asyncPutCopyData", "syncPutCopyData"],
  putCopyEnd: ["asyncPutCopyEnd", "syncPutCopyEnd"],
  flush: ["asyncFlush", "syncFlush"],
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
  _resultWaiters: (() => void)[] = [];
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
  /** @internal */
  _flushData = false;
  /** @internal */
  _callsToPutCopyData = 0;
  /** @internal */
  _copyIn = false;
  /** @internal */
  _errorMessage = "";
  /** @internal */
  _pollStatus: number = PG.PGRES_POLLING_OK;
  /** @internal */
  _connecting: Promise<void> | null = null;
  /** @internal */
  _connectError: unknown = null;
  /** @internal */
  _ioptsForReset: Record<string, unknown> | null = null;
  declare asyncIsnonblocking: Connection["isnonblocking"];
  declare isNonblocking: Connection["isnonblocking"];
  declare asyncSetnonblocking: Connection["setnonblocking"];

  static setAsyncSendApi(this: { prototype: Connection }, enable: boolean): void {
    const proto = this.prototype as unknown as Record<string, unknown>;
    for (const [ali, [async, sync]] of Object.entries(REDIRECT_SEND_METHODS)) {
      proto[ali] = proto[enable ? async : sync];
    }
  }

  static conndefaults = conndefaults;
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
    const conn = (await (this as unknown as typeof Connection).connectToHosts(connParams)) as T;

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

  /**
   * @internal
   * @missingRailsArgs split — PERMANENT
   * @missingRailsArgs getaddrinfo — PERMANENT
   */
  private static async resolveHosts(
    iopts: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const ihosts = String(iopts.host).split(",");
    const port = String(iopts.port);
    let iports: (string | null)[] = port === "" ? [] : port.split(",");
    if (iports.length == 0) iports = [null];
    if (iports.length == 1) iports = ihosts.map(() => iports[0]);
    if (iports.length != ihosts.length) {
      throw new ConnectionBad(
        `could not match ${iports.length} port numbers to ${ihosts.length} hosts`,
      );
    }

    const dests = (
      await Promise.all(
        ihosts.map(async (mhost, idx) => {
          let hostaddrs: (string | null)[];
          if (!Connection.isHostIsNamedPipe(mhost)) {
            hostaddrs = await Addrinfo.getaddrinfo(mhost, 0).then(
              (ais) => ais.map((ai) => ai.ipAddress),
              () => [""],
            );
          } else {
            hostaddrs = [null];
          }
          return hostaddrs.map((hostaddr) => [hostaddr, mhost, iports[idx]] as const);
        }),
      )
    ).flat();
    return {
      ...iopts,
      hostaddr: dests.map((d) => d[0] ?? "").join(","),
      host: dests.map((d) => d[1]).join(","),
      port: dests.map((d) => d[2] ?? "").join(","),
    };
  }

  /**
   * @internal
   * @missingRailsCall resolve_hosts — PERMANENT
   */
  private static async connectToHosts<T extends Connection>(
    this: { prototype: T } & typeof Connection,
    ...args: unknown[]
  ): Promise<T> {
    const optionString = this.parseConnectArgs(...args);
    let iopts: Record<string, unknown> = {};
    for (const h of Connection.conninfoParse(optionString))
      if (h.val != null) iopts[h.keyword] = h.val;
    const defaults: Record<string, unknown> = {};
    for (const h of Connection.conndefaults()) if (h.val != null) defaults[h.keyword] = h.val;
    iopts = { ...defaults, ...iopts };

    if (
      PG.BUNDLED_LIBPQ_WITH_UNIXSOCKET &&
      String(iopts.host ?? "") === "" &&
      String(iopts.hostaddr ?? "") === ""
    ) {
      iopts.host = "/var/run/postgresql" + ",/run/postgresql" + ",/tmp";
    }

    const ioptsForReset = iopts;
    const conn =
      ((await this.connectStart(iopts)) as T | null) ??
      (() => {
        throw new PgError("Unable to create a new connection");
      })();

    if (conn.status() == PG.CONNECTION_BAD) {
      throw new ConnectionBad(conn.errorMessage() ?? "");
    }

    conn._ioptsForReset = ioptsForReset;
    await conn.asyncConnectOrReset("connectPoll");
    return conn;
  }

  /** @internal */
  private static isHostIsNamedPipe(hostString: string): boolean {
    return hostString === "" || hostString.startsWith("/") || hostString.startsWith("@");
  }

  static conninfoParse(
    conninfo: string,
  ): { keyword: string; compiled: string | null; val: string | null }[] {
    const vals: Record<string, string> = {};
    const uri = /^postgres(?:ql)?:\/\//.test(conninfo);
    const set = (key: string, val: string): void => {
      const keyword = key.replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase());
      if (/[A-Z]/.test(key) || !CONNINFO_KEYWORDS.includes(keyword)) {
        throw new PgError(
          uri ? `invalid URI query parameter: "${key}"\n` : `invalid connection option "${key}"\n`,
        );
      }
      vals[keyword] = val;
    };
    const dec = (token: string): string => {
      try {
        return decodeURIComponent(token);
      } catch {
        throw new PgError(`invalid percent-encoded token: "${token}"\n`);
      }
    };
    if (uri) {
      const m = /^[^:]*:\/\/(?:([^:@/]*)(?::([^@/]*))?@)?([^/?]*)(?:\/([^?]*))?(?:\?(.*))?$/.exec(
        conninfo,
      )!;
      const [, userinfo, password, hostPart, path, query] = m;
      if (userinfo) set("user", dec(userinfo));
      if (password) set("password", dec(password));
      const hosts = hostPart.split(",").map((h) => /^(\[[^\]]*\]|[^:]*)(?::(.*))?$/.exec(h)!);
      if (hosts.some((h) => h[1])) {
        set("host", hosts.map((h) => dec(h[1].replace(/^\[|\]$/g, ""))).join(","));
      }
      if (hosts.some((h) => h[2])) set("port", hosts.map((h) => h[2] ?? "").join(","));
      if (path) set("dbname", dec(path));
      for (const pair of query ? query.split("&") : []) {
        const eq = pair.indexOf("=");
        if (eq < 0) {
          throw new PgError(`missing key/value separator "=" in URI query parameter: "${pair}"\n`);
        }
        if (pair.indexOf("=", eq + 1) >= 0) {
          throw new PgError(`extra key/value separator "=" in URI query parameter: "${pair}"\n`);
        }
        set(dec(pair.slice(0, eq)), dec(pair.slice(eq + 1)));
      }
    } else {
      let cp = 0;
      const isspace = (c: string | undefined): boolean => c != null && /\s/.test(c);
      while (cp < conninfo.length) {
        if (isspace(conninfo[cp])) {
          cp++;
          continue;
        }
        let pname = "";
        while (cp < conninfo.length && conninfo[cp] !== "=" && !isspace(conninfo[cp])) {
          pname += conninfo[cp++];
        }
        while (isspace(conninfo[cp])) cp++;
        if (conninfo[cp] !== "=") {
          throw new PgError(`missing "=" after "${pname}" in connection info string\n`);
        }
        cp++;
        while (isspace(conninfo[cp])) cp++;
        let pval = "";
        if (conninfo[cp] !== "'") {
          while (cp < conninfo.length && !isspace(conninfo[cp])) {
            if (conninfo[cp] === "\\" && cp + 1 < conninfo.length) cp++;
            pval += conninfo[cp++];
          }
        } else {
          cp++;
          for (;;) {
            if (cp >= conninfo.length) {
              throw new PgError("unterminated quoted string in connection info string\n");
            }
            if (conninfo[cp] === "\\" && cp + 1 < conninfo.length) {
              cp++;
              pval += conninfo[cp++];
              continue;
            }
            if (conninfo[cp] === "'") {
              cp++;
              break;
            }
            pval += conninfo[cp++];
          }
        }
        set(pname, pval);
      }
    }
    return CONNINFO_KEYWORDS.map((keyword) => ({
      keyword,
      compiled: COMPILED_DEFAULTS[keyword] ?? null,
      val: vals[keyword] ?? null,
    }));
  }

  static quoteConnstr(value: unknown): string {
    return "'" + (value == null ? "" : String(value)).replace(/[\\']/g, (m) => "\\" + m) + "'";
  }

  static connectHashToString(hash: Record<string, unknown>): string {
    return Object.entries(hash)
      .map(
        ([k, v]) =>
          `${k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}=${Connection.quoteConnstr(v)}`,
      )
      .join(" ");
  }

  static parseConnectArgs(...args: unknown[]): string {
    const last = args.at(-1);
    const hashArg =
      typeof last === "object" && last !== null && Object.getPrototypeOf(last) === Object.prototype
        ? (args.pop() as Record<string, unknown>)
        : {};
    let iopts: Record<string, unknown> = {};

    if (args.length == 1) {
      const first = String(args[0]);
      if (/=/.test(first) || /:\/\//.test(first)) {
        const connString = first;
        for (const h of Connection.conninfoParse(connString))
          if (h.val != null) iopts[h.keyword] = h.val;
      } else {
        iopts[CONNECT_ARGUMENT_ORDER[0]] = args[0];
      }
    } else {
      const max = CONNECT_ARGUMENT_ORDER.length;
      if (args.length > max) {
        throw new ArgumentError(`Extra positional parameter ${max + 1}: ${rbInspect(args[max])}`);
      }
      CONNECT_ARGUMENT_ORDER.forEach((k, i) => {
        const v = args[i];
        if (v != null && v !== false) iopts[k] = v;
      });
      delete iopts.tty;
    }

    iopts = Object.assign(iopts, hashArg);

    if (iopts.fallbackApplicationName == null || iopts.fallbackApplicationName === false) {
      iopts.fallbackApplicationName = PROGRAM_NAME.replace(
        /^(.{30}).{4,}(.{30})$/,
        (_m, a: string, b: string) => a + "..." + b,
      );
    }

    return Connection.connectHashToString(iopts);
  }

  static async connectStart<T extends Connection>(
    this: { prototype: T; parseConnectArgs(...args: unknown[]): string },
    ...args: unknown[]
  ): Promise<T> {
    await _requireEngine();
    const block =
      typeof args.at(-1) === "function" ? (args.pop() as (conn: T) => unknown) : undefined;
    const conninfo = this.parseConnectArgs(...args);
    const rbConn = rbClassNewInstance(this, _conninfoHashOf(conninfo));
    rbConn._connectStart();

    if (rbConn.status() == PG.CONNECTION_BAD) {
      throw new ConnectionBad(rbConn._errorMessage, { connection: rbConn });
    }

    if (block !== undefined) {
      try {
        return (await block(rbConn)) as T;
      } finally {
        await rbConn.finish();
      }
    }
    return rbConn;
  }

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

  syncFlush(): boolean {
    return true;
  }

  flush(): boolean {
    while (this.syncFlush() === false);
    return true;
  }

  declare asyncFlush: Connection["flush"];

  syncPutCopyData(value: unknown, encoder: Coder | null = null): boolean {
    let buffer: unknown = null;
    let pCoder: Coder | null = null;
    if (encoder == null) {
      if (this.encoderForPutCopyData == null) {
        buffer = value;
      } else {
        pCoder = this.encoderForPutCopyData;
      }
    } else {
      if (!(encoder instanceof Coder)) {
        throw new TypeError(`wrong argument type ${rbObjClassname(encoder)} (expected PG::Coder)`);
      }
      pCoder = encoder;
    }

    if (pCoder != null) {
      buffer = (pCoder as Coder & { encode(value: unknown): unknown }).encode(value);
    }

    if (typeof buffer !== "string" && !(buffer instanceof Uint8Array)) {
      throw new TypeError(`wrong argument type ${rbObjClassname(buffer)} (expected String)`);
    }

    const chunk: string | Uint8Array = buffer;
    if (!this._copyIn) {
      throw new PgError("no COPY in progress\n", { connection: this });
    }
    engine!.dispatch(this, (connection) => connection.sendCopyFromChunk(Buffer.from(chunk)), []);
    return true;
  }

  syncPutCopyEnd(str?: string): boolean {
    const errorMessage = str === undefined ? null : stringValue(str);
    if (!this._copyIn) {
      throw new PgError("no COPY in progress\n", { connection: this });
    }
    this._copyIn = false;
    engine!.dispatch(
      this,
      (connection) => {
        if (errorMessage == null) connection.endCopyFrom();
        else connection.sendCopyFail(errorMessage);
      },
      [],
    );
    return true;
  }

  putCopyData(buffer: unknown, encoder: Coder | null = null): boolean {
    let res: boolean;
    while (!(res = this.syncPutCopyData(buffer, encoder))) {
      this.flush();
    }

    if ((this._callsToPutCopyData += 1) > 100) {
      this._callsToPutCopyData = 0;
      res = this.flush();
    }
    return res;
  }

  declare asyncPutCopyData: Connection["putCopyData"];

  putCopyEnd(...args: [string?]): boolean {
    while (!this.syncPutCopyEnd(...args)) {
      this.flush();
    }
    this._callsToPutCopyData = 0;
    return this.flush();
  }

  declare asyncPutCopyEnd: Connection["putCopyEnd"];

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

  setnonblocking(enabled: boolean): null {
    (rbObjSingletonClass(this) as unknown as typeof Connection).setAsyncSendApi(!enabled);
    this.flushData = !enabled;
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

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _connectStart(): void {
    this._errorMessage = "";
    this._connectError = null;
    this._pollStatus = PG.PGRES_POLLING_WRITING;
    this._connecting = this.client.connect().then(
      () => {
        this._pollStatus = PG.PGRES_POLLING_OK;
      },
      (error: unknown) => {
        this._connectError = error;
        this._errorMessage = `${(error as { message?: string })?.message ?? String(error)}\n`;
        this._pollStatus = PG.PGRES_POLLING_FAILED;
      },
    );
  }

  connectPoll(): number {
    if (this._pollStatus === PG.PGRES_POLLING_FAILED) {
      this.bad = true;
    }
    if (this._pollStatus === PG.PGRES_POLLING_WRITING) return PG.PGRES_POLLING_READING;
    return this._pollStatus;
  }

  /** @internal */
  async resetStart2(conninfo: string): Promise<null> {
    const client = this.client;
    await client.end().catch(() => null);

    const conn = engine!.newClient(_conninfoHashOf(conninfo));
    for (const event of client.eventNames()) {
      for (const listener of client.rawListeners(event)) {
        conn.on(event as "error", listener as () => void);
      }
    }
    engine!.listen(this, conn);
    this.connParams = _conninfoHashOf(conninfo);
    this.client = conn;
    this.prepared.clear();
    this.readyForQuery = "I";
    this.bad = false;
    this._pipelineStatus = PG.PQ_PIPELINE_OFF;
    this._cmdQueue = [];
    this._results = [];
    this._submittable = null;
    this._sendError = null;
    this._chunkSize = 0;
    this._copyIn = false;
    this._connectStart();

    if (this.status() == PG.CONNECTION_BAD) {
      throw new ConnectionBad(this._errorMessage, { connection: this });
    }
    return null;
  }

  resetPoll(): number {
    return this.connectPoll();
  }

  errorMessage(): string | null {
    return this._errorMessage;
  }

  hostaddr(): string | null {
    const stream = (
      this.client as unknown as { connection?: { stream?: { remoteAddress?: string } } }
    ).connection?.stream;
    return stream?.remoteAddress ?? null;
  }

  conninfo(): { keyword: string; compiled: string | null; val: string | null }[] {
    return CONNINFO_KEYWORDS.map((keyword) => ({
      keyword,
      compiled: COMPILED_DEFAULTS[keyword] ?? null,
      val: this.connParams[keyword] == null ? null : String(this.connParams[keyword]),
    }));
  }

  conninfoHash(): Record<string, string | null> {
    const hash: Record<string, string | null> = {};
    for (const info of this.conninfo()) hash[info.keyword] = info.val;
    return hash;
  }

  /** @internal */
  set flushData(enabled: boolean) {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`, {
        receiver: this,
      });
    }
    this._flushData = enabled !== false && enabled != null;
  }

  setDefaultEncoding(): null {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`, {
        receiver: this,
      });
    }
    return null;
  }

  status(): number {
    const { _ending, _ended, _queryable } = this.client;
    return this.bad || _ending === true || _ended === true || _queryable === false
      ? PG.CONNECTION_BAD
      : PG.CONNECTION_OK;
  }

  async reset(): Promise<this> {
    const iopts: Record<string, unknown> = this._ioptsForReset ?? _compact(this.conninfoHash());
    const conninfo = (this.constructor as typeof Connection).parseConnectArgs(iopts);
    await this.resetStart2(conninfo);
    await this.asyncConnectOrReset("resetPoll");
    return this;
  }

  /**
   * @internal
   * @missingRailsArgs join — PERMANENT
   * @inventedArm throw — PERMANENT
   */
  private async pollingLoop(pollMeth: "connectPoll" | "resetPoll"): Promise<void> {
    const connectTimeout = this.conninfoHash().connectTimeout;
    const timeo = Number.parseInt(connectTimeout ?? "0", 10) || 0;
    let stopTime: number | undefined;
    if (timeo > 0) {
      const info = this.conninfoHash();
      const hostCount = String(
        (info.hostaddr ?? "") === "" ? (info.host ?? "") : info.hostaddr,
      ).split(",").length;
      stopTime = timeo * hostCount + performance.now() / 1000;
    }
    const iopts = _compact(this.conninfoHash());
    const connectionErrors: string[] = [];
    let pollStatus: number = PG.PGRES_POLLING_WRITING;

    while (!(pollStatus == PG.PGRES_POLLING_OK || pollStatus == PG.PGRES_POLLING_FAILED)) {
      const timeout =
        stopTime === undefined ? undefined : Math.min(timeo, stopTime - performance.now() / 1000);

      const hostcnt = this.removeCurrentHost(iopts);

      let event: boolean | undefined;
      if (timeout === undefined || timeout >= 0) {
        switch (pollStatus) {
          case PG.PGRES_POLLING_READING:
            event = await _waitConnecting(this._connecting, timeout);
            break;
          case PG.PGRES_POLLING_WRITING:
            event = await _waitConnecting(this._connecting, timeout);
            break;
        }
      }

      if (!event) {
        connectionErrors.push((this.errorMessage() ?? "") + "timeout expired");
        if (hostcnt > 0) {
          await this.resetStart2(Connection.parseConnectArgs(iopts));
          pollStatus = PG.PGRES_POLLING_WRITING;
          continue;
        } else {
          await this.finish();
          throw new ConnectionBad(connectionErrors.join("\n"), { connection: this });
        }
      }

      pollStatus = this[pollMeth]();
    }

    if (this.status() != PG.CONNECTION_OK) {
      const msg = this.errorMessage() ?? "";
      await this.finish();
      if (this._connectError != null && connectionErrors.length == 0)
        throw engine!.pgError(this, this._connectError, ConnectionBad);
      throw new ConnectionBad(connectionErrors.map((e) => e + "\n").join("") + msg, {
        connection: this,
      });
    }
  }

  /**
   * @internal
   * @missingRailsArgs split — PERMANENT
   */
  private removeCurrentHost(iopts: Record<string, unknown>): number {
    const ihosts = iopts.host == null ? undefined : String(iopts.host).split(",");
    const ihostaddrs = iopts.hostaddr == null ? undefined : String(iopts.hostaddr).split(",");
    let iports = iopts.port == null ? undefined : String(iopts.port).split(",");
    if (iports?.length == 1) {
      const n = (ihosts ?? ihostaddrs ?? [1]).length;
      iports = Array.from({ length: n }, () => iports![0]);
    }

    const list = (ihosts ?? ihostaddrs ?? iports)!;
    const found = list.findIndex(
      (_, i) =>
        (ihosts ? ihosts[i] == this.host() : true) &&
        (ihostaddrs ? ihostaddrs[i] == this.hostaddr() : true) &&
        (iports ? Number.parseInt(iports[i], 10) == this.port() : true),
    );
    const idx = found < 0 ? null : found;

    if (idx != null) {
      ihosts?.splice(idx, 1);
      ihostaddrs?.splice(idx, 1);
      iports?.splice(idx, 1);

      if (ihosts) Object.assign(iopts, { host: ihosts.join(",") });
      if (ihostaddrs) Object.assign(iopts, { hostaddr: ihostaddrs.join(",") });
      if (iports) Object.assign(iopts, { port: iports.join(",") });
    }

    return (ihosts ?? ihostaddrs ?? iports)!.length;
  }

  /** @internal */
  private async asyncConnectOrReset(pollMeth: "connectPoll" | "resetPoll"): Promise<void> {
    await this.pollingLoop(pollMeth);

    this.syncSetnonblocking(true);
    this.flushData = true;
    this.setDefaultEncoding();
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
      throw new UnableToSend("PQsendQuery no connection to the server\n", { connection: this });
    }
    if (this._cmdQueue.length > 0 || this._results.length > 0) {
      throw new UnableToSend("PQsendQuery another command is already in progress\n", {
        connection: this,
      });
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

  socketIo(): {
    reopen(path: string): void;
    wait(events: number, timeout?: number | null): Promise<unknown>;
  } | null {
    const stream = (
      this.client as unknown as {
        connection?: { stream?: { removeAllListeners?(): unknown; unref?(): unknown } };
      }
    ).connection?.stream;
    if (!stream) return null;
    const connecting = this._connecting;
    return {
      reopen(_path: string): void {
        stream.removeAllListeners?.();
        stream.unref?.();
      },
      async wait(_events: number, timeout: number | null = null): Promise<unknown> {
        if (connecting == null) return this;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const expired = new Promise<null>((resolve) => {
          if (timeout != null) timer = setTimeout(() => resolve(null), timeout * 1000);
        });
        const ret = await Promise.race([connecting.then(() => this), expired]);
        clearTimeout(timer);
        return ret;
      },
    };
  }

  async block(timeout: number | null = null): Promise<boolean> {
    const ready = (): boolean =>
      this._results.length > 0 || this._cmdQueue.length === 0 || this._sendError != null;
    if (!ready()) {
      const ret = await new Promise<boolean>((resolve) => {
        const waiter = (): void => {
          if (ready()) done(true);
        };
        const done = (r: boolean): void => {
          clearTimeout(timer);
          this._resultWaiters = this._resultWaiters.filter((w) => w !== waiter);
          resolve(r);
        };
        const timer = timeout == null ? undefined : setTimeout(() => done(false), timeout * 1000);
        this._resultWaiters.push(waiter);
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

const CONNECT_ARGUMENT_ORDER = ["host", "port", "options", "tty", "dbname", "user", "password"];

const PROGRAM_NAME = rbProgname();

const COMPILED_DEFAULTS: Record<string, string> = {
  channelBinding: "prefer",
  port: "5432",
  sslmode: "prefer",
  sslnegotiation: "postgres",
  sslcompression: "0",
  sslcertmode: "allow",
  sslsni: "1",
  gssencmode: "disable",
  krbsrvname: "postgres",
  gssdelegation: "0",
  targetSessionAttrs: "any",
  loadBalanceHosts: "disable",
};

function conndefaults(): { keyword: string; compiled: string | null; val: string | null }[] {
  return CONNINFO_KEYWORDS.map((keyword) => ({
    keyword,
    compiled: COMPILED_DEFAULTS[keyword] ?? null,
    val: COMPILED_DEFAULTS[keyword] ?? null,
  }));
}

/** @noRailsEquivalent PERMANENT */
function _compact(hash: Record<string, string | null>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(hash)) if (v != null) out[k] = v;
  return out;
}

/** @noRailsEquivalent PERMANENT */
async function _waitConnecting(
  connecting: Promise<void> | null,
  timeout: number | undefined,
): Promise<boolean> {
  if (connecting == null) return true;
  if (timeout === undefined) {
    await connecting;
    return true;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeout * 1000);
  });
  try {
    return await Promise.race([connecting.then(() => true), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** @noRailsEquivalent PERMANENT */
function _conninfoHashOf(conninfo: string): Record<string, unknown> {
  const hash: Record<string, unknown> = {};
  for (const h of Connection.conninfoParse(conninfo)) if (h.val != null) hash[h.keyword] = h.val;
  return hash;
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
Connection.prototype.asyncFlush = Connection.prototype.flush;
Connection.prototype.asyncPutCopyData = Connection.prototype.putCopyData;
Connection.prototype.asyncPutCopyEnd = Connection.prototype.putCopyEnd;
Connection.prototype.escapeString = escapeString;
Connection.prototype.escape = escapeString;
Connection.prototype.escapeBytea = escapeBytea;
Connection.prototype.unescapeBytea = unescapeBytea;
Connection.prototype.quoteIdent = quoteIdent;

PG.Connection = Connection;
