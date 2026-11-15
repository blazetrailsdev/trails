import { warn } from "../kernel-warn.js";
import { StandardError } from "../standard-error.js";
import { ArgumentError } from "../argument-error.js";
import { EOFError } from "../eof-error.js";
import { Errno } from "../errno.js";
import { getHttpAsync, type HttpClientSocket, type HttpDebugOutput } from "../http-adapter.js";
import { IOError } from "../io-error.js";
import { NotImplementedError } from "../not-implemented-error.js";
import { OpenSSL } from "../openssl.js";
import { Resolv } from "../resolv.js";
import { Socket } from "../socket.js";
import { Timeout } from "../timeout.js";
import { kernelCatch } from "../kernel-catch.js";
import type { HTTP as URIHTTP } from "../uri/http.js";
import { BufferedIO, Net, OpenTimeout, ReadTimeout } from "./protocol.js";
import type { HTTPRequest } from "./http/request.js";
import {
  Get,
  Head,
  Post,
  Put,
  Delete,
  Options,
  Trace,
  Patch,
  Propfind,
  Proppatch,
  Mkcol,
  Copy,
  Move,
  Lock,
  Unlock,
} from "./http/requests.js";
import { HTTPResponse } from "./http/response.js";
import { HTTPInformation } from "./http/responses.js";

/** @noRailsEquivalent PERMANENT — `Net::HTTPBadResponse` (`vendor/ruby/v3.3.11/lib/net/http.rb:31`). */
export class HTTPBadResponse extends StandardError {}
HTTPBadResponse.prototype.name = "Net::HTTPBadResponse";

/**
 * `Net::HTTPHeaderSyntaxError` (`vendor/ruby/v3.3.11/lib/net/http.rb:32`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class HTTPHeaderSyntaxError extends StandardError {}

HTTPHeaderSyntaxError.prototype.name = "Net::HTTPHeaderSyntaxError";

/**
 * `Net::HTTP` (`vendor/ruby/v3.3.11/lib/net/http.rb:722`), the client
 * `ActionMailbox::Relayer` posts with, over the HTTP adapter's `connect`. Only
 * what `Relayer#client` and `#post` call is ported.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class HTTP {
  /** @noRailsEquivalent PERMANENT */
  static Get = Get;
  /** @noRailsEquivalent PERMANENT */
  static Head = Head;
  /** @noRailsEquivalent PERMANENT */
  static Post = Post;
  /** @noRailsEquivalent PERMANENT */
  static Put = Put;
  /** @noRailsEquivalent PERMANENT */
  static Delete = Delete;
  /** @noRailsEquivalent PERMANENT */
  static Options = Options;
  /** @noRailsEquivalent PERMANENT */
  static Trace = Trace;
  /** @noRailsEquivalent PERMANENT */
  static Patch = Patch;
  /** @noRailsEquivalent PERMANENT */
  static Propfind = Propfind;
  /** @noRailsEquivalent PERMANENT */
  static Proppatch = Proppatch;
  /** @noRailsEquivalent PERMANENT */
  static Mkcol = Mkcol;
  /** @noRailsEquivalent PERMANENT */
  static Copy = Copy;
  /** @noRailsEquivalent PERMANENT */
  static Move = Move;
  /** @noRailsEquivalent PERMANENT */
  static Lock = Lock;
  /** @noRailsEquivalent PERMANENT */
  static Unlock = Unlock;

  /** @noRailsEquivalent PERMANENT */
  static readonly HTTPVersion = "1.1";

  /** @noRailsEquivalent PERMANENT */
  static readonly IDEMPOTENT_METHODS_ = ["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "TRACE"];

  /** @noRailsEquivalent PERMANENT */
  static defaultPort(): number {
    return HTTP.httpDefaultPort();
  }

  /** @noRailsEquivalent PERMANENT */
  static httpDefaultPort(): number {
    return 80;
  }

  /** @noRailsEquivalent PERMANENT */
  static httpsDefaultPort(): number {
    return 443;
  }

  /** @noRailsEquivalent PERMANENT */
  readonly address: string;
  /** @noRailsEquivalent PERMANENT */
  readonly port: number;
  /** @noRailsEquivalent PERMANENT */
  openTimeout: number | null = 60;
  /** @noRailsEquivalent PERMANENT */
  verifyMode: number | null = null;
  /** @noRailsEquivalent PERMANENT — `attr_accessor :ca_file` (`vendor/ruby/v3.3.11/lib/net/http.rb:1479`). */
  caFile: string | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1487`. */
  cert: unknown = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1490`. */
  certStore: unknown = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1501`. */
  key: unknown = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1508`. */
  sslVersion: string | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1512`. */
  minVersion: string | number | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1516`. */
  maxVersion: string | number | null = null;
  private _writeTimeout: number | null = 60;
  private _debugOutput: HttpDebugOutput | null = null;
  private _readTimeout: number | null = 60;
  private _maxRetries = 1;
  private _currHttpVersion = HTTP.HTTPVersion;
  /** @noRailsEquivalent PERMANENT */
  keepAliveTimeout = 2;
  private _lastCommunicated: number | null = null;
  /** @noRailsEquivalent PERMANENT */
  closeOnEmptyResponse = false;
  /** @noRailsEquivalent PERMANENT */
  responseBodyEncoding: string | false = false;
  /** @noRailsEquivalent PERMANENT */
  ignoreEof = true;
  private _continueTimeout: number | null = null;
  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_address` (`vendor/ruby/v3.3.11/lib/net/http.rb:1241`). */
  proxyAddress: string | null = null;
  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_port` (`vendor/ruby/v3.3.11/lib/net/http.rb:1245`). */
  proxyPort: number | null = null;
  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_user` (`vendor/ruby/v3.3.11/lib/net/http.rb:1249`). */
  proxyUser: string | null = null;
  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_pass` (`vendor/ruby/v3.3.11/lib/net/http.rb:1253`). */
  proxyPass: string | null = null;
  private _useSsl = false;
  private _started = false;
  private _socket: BufferedIO | null = null;

  /** @noRailsEquivalent PERMANENT */
  constructor(address: string, port: number | null = null) {
    this.address = address;
    this.port = port ?? HTTP.defaultPort();
  }

  /** @noRailsEquivalent PERMANENT */
  get readTimeout(): number | null {
    return this._readTimeout;
  }

  /** @noRailsEquivalent PERMANENT */
  set readTimeout(sec: number | null) {
    if (this._socket) this._socket.readTimeout = sec;
    this._readTimeout = sec;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1306`. */
  get writeTimeout(): number | null {
    return this._writeTimeout;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1367-1370`. */
  set writeTimeout(sec: number | null) {
    if (this._socket) this._socket.writeTimeout = sec;
    this._writeTimeout = sec;
  }

  /** @noRailsEquivalent PERMANENT — `attr_reader :continue_timeout` (`vendor/ruby/v3.3.11/lib/net/http.rb:1374`). */
  get continueTimeout(): number | null {
    return this._continueTimeout;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1380-1383`. */
  set continueTimeout(sec: number | null) {
    if (this._socket) this._socket.continueTimeout = sec;
    this._continueTimeout = sec;
  }

  /**
   * `vendor/ruby/v3.3.11/lib/net/http.rb:1785-1787`.
   *
   * @missingRailsCall proxy_uri — CONVERGEABLE net-http-proxy-from-env-and-connect
   * @noRailsEquivalent PERMANENT
   */
  isProxy(): boolean {
    return !!this.proxyAddress;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1188-1191`. */
  setDebugOutput(output: HttpDebugOutput | null): void {
    if (this.isStarted())
      warn("Net::HTTP#set_debug_output called after HTTP started", { uplevel: 1 });
    this._debugOutput = output;
  }

  /** @noRailsEquivalent PERMANENT */
  get maxRetries(): number {
    return this._maxRetries;
  }

  /** @noRailsEquivalent PERMANENT */
  set maxRetries(retries: number) {
    retries = Math.trunc(retries);
    if (retries < 0) {
      throw new ArgumentError("max_retries should be non-negative integer number");
    }
    this._maxRetries = retries;
  }

  /** @noRailsEquivalent PERMANENT */
  isStarted(): boolean {
    return this._started;
  }

  /** @noRailsEquivalent PERMANENT */
  isUseSsl(): boolean {
    return this._useSsl;
  }

  /** @noRailsEquivalent PERMANENT */
  set useSsl(flag: boolean) {
    flag = flag ? true : false;
    if (this.isStarted() && this._useSsl !== flag) {
      throw new IOError("use_ssl value changed, but session already started");
    }
    this._useSsl = flag;
  }

  /** @noRailsEquivalent PERMANENT */
  async start<R>(block?: (http: this) => R | Promise<R>): Promise<R | this> {
    if (this._started) throw new IOError("HTTP session already opened");
    if (block !== undefined) {
      try {
        await this.doStart();
        return await block(this);
      } finally {
        this.doFinish();
      }
    }
    await this.doStart();
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  async doStart(): Promise<void> {
    await this.connect();
    this._started = true;
  }

  /** @noRailsEquivalent PERMANENT */
  async connect(): Promise<void> {
    const connAddr = this.address;
    const connPort = this.port;

    let sslHostAddress: string | null = null;
    if (!(Resolv.IPv4.Regex.test(connAddr) || Resolv.IPv6.Regex.test(connAddr))) {
      sslHostAddress = connAddr;
    }

    let s: HttpClientSocket | null = null;
    try {
      this.debug(`opening connection to ${connAddr}:${connPort}...`);
      const adapter = await getHttpAsync();
      if (adapter.connect === undefined) {
        throw new NotImplementedError("the HTTP adapter has no client connect");
      }
      s = await Timeout.timeout(this.openTimeout, OpenTimeout, null, async () => {
        try {
          return await adapter.connect!({ host: connAddr, port: connPort });
        } catch (e) {
          const error = _rsockSysFail(e, connAddr, connPort);
          error.message = `Failed to open TCP connection to ${connAddr}:${connPort} (${error.message})`;
          throw error;
        }
      });
      this.debug("opened");
      if (this.isUseSsl()) {
        this.debug(`starting SSL for ${connAddr}:${connPort}...`);
        await this.sslSocketConnect(s, this.openTimeout, {
          sslHostAddress,
          verifyPeer: this.verifyMode !== OpenSSL.SSL.VERIFY_NONE,
        });
        this.debug(`SSL established, protocol: ${s.sslVersion}, cipher: ${s.cipher![0]}`);
      }
      this._socket = new BufferedIO(s, {
        readTimeout: this._readTimeout,
        writeTimeout: this._writeTimeout,
        continueTimeout: this._continueTimeout,
        debugOutput: this._debugOutput,
      });
      this._lastCommunicated = null;
    } catch (exception) {
      if (s) {
        this.debug(`Conn close because of connect error ${(exception as Error).message}`);
        s.close();
      }
      throw exception;
    }
  }

  /**
   * `Net::Protocol#ssl_socket_connect` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:41-56`).
   * The handshake's `connect_nonblock` / `wait_readable` loop is the adapter's
   * `start_ssl`, raced against the remaining `timeout`.
   *
   * @internal @noRailsEquivalent PERMANENT
   */
  private async sslSocketConnect(
    s: HttpClientSocket,
    timeout: number | null,
    sslParameters: Parameters<HttpClientSocket["startSsl"]>[0],
  ): Promise<void> {
    if (timeout != null) {
      if (timeout <= 0) throw new OpenTimeout("execution expired");
      await Timeout.timeout(timeout, OpenTimeout, null, () => s.startSsl(sslParameters));
    } else {
      await s.startSsl(sslParameters);
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1708-1711`. */
  finish(): void {
    if (!this.isStarted()) throw new IOError("HTTP session not yet started");
    this.doFinish();
  }

  /** @noRailsEquivalent PERMANENT */
  doFinish(): void {
    this._started = false;
    this._socket?.close();
    this._socket = null;
  }

  /** @noRailsEquivalent PERMANENT */
  async get(
    path: string | URIHTTP,
    initheader: Record<string, string> | null = null,
    dest: { append(str: Uint8Array): unknown } | null = null,
    block: ((bodySegment: Uint8Array) => unknown) | null = null,
  ): Promise<HTTPResponse> {
    let res: HTTPResponse | null = null;

    await this.request(new Get(path, initheader), null, async (r) => {
      await r.readBody(dest, block);
      res = r;
    });
    return res!;
  }

  /** @noRailsEquivalent PERMANENT */
  async head(
    path: string | URIHTTP,
    initheader: Record<string, string> | null = null,
  ): Promise<HTTPResponse> {
    return this.request(new Head(path, initheader));
  }

  /** @noRailsEquivalent PERMANENT */
  async post(
    path: string | URIHTTP,
    data: string | Uint8Array,
    initheader: Record<string, string> | null = null,
    dest: { append(str: Uint8Array): unknown } | null = null,
    block: ((bodySegment: Uint8Array) => unknown) | null = null,
  ): Promise<HTTPResponse> {
    return this.sendEntity(path, data, initheader, dest, Post, block);
  }

  /** @noRailsEquivalent PERMANENT */
  async requestGet(
    path: string | URIHTTP,
    initheader: Record<string, string> | null = null,
    block?: (res: HTTPResponse) => unknown,
  ): Promise<HTTPResponse> {
    return this.request(new Get(path, initheader), null, block);
  }

  /** @noRailsEquivalent PERMANENT */
  async requestHead(
    path: string | URIHTTP,
    initheader: Record<string, string> | null = null,
    block?: (res: HTTPResponse) => unknown,
  ): Promise<HTTPResponse> {
    return this.request(new Head(path, initheader), null, block);
  }

  /** @noRailsEquivalent PERMANENT */
  async request(
    req: HTTPRequest,
    body: string | Uint8Array | null = null,
    block?: (res: HTTPResponse) => unknown,
  ): Promise<HTTPResponse> {
    if (!this.isStarted()) {
      return (await this.start(async () => {
        if (req.get("connection") == null) req.set("connection", "close");
        return this.request(req, body, block);
      })) as HTTPResponse;
    }
    req.setBodyInternal(body);
    return this.transportRequest(req, block);
  }

  /** @noRailsEquivalent PERMANENT */
  async sendEntity(
    path: string | URIHTTP,
    data: string | Uint8Array,
    initheader: Record<string, string> | null,
    dest: { append(str: Uint8Array): unknown } | null,
    type: typeof Post,
    block: ((bodySegment: Uint8Array) => unknown) | null = null,
  ): Promise<HTTPResponse> {
    let res: HTTPResponse | null = null;
    await this.request(new type(path, initheader), data, async (r) => {
      await r.readBody(dest, block);
      res = r;
    });
    return res!;
  }

  /** @noRailsEquivalent PERMANENT */
  async transportRequest(
    req: HTTPRequest,
    block?: (res: HTTPResponse) => unknown,
  ): Promise<HTTPResponse> {
    let count = 0;
    try {
      let res: HTTPResponse;
      for (;;) {
        try {
          await this.beginTransport(req);
          res = (await kernelCatch("response", async () => {
            try {
              await req.exec(this._socket!, this._currHttpVersion, this.editPath(req.path));
            } catch (e) {
              if (!(e instanceof Errno.EPIPE)) throw e;
            }

            do {
              res = await HTTPResponse.readNew(this._socket!);
              res.decodeContent = req.decodeContent;
              res.bodyEncoding = this.responseBodyEncoding;
              res.ignoreEof = this.ignoreEof;
            } while (res instanceof HTTPInformation);

            res.uri = req.uri;

            return res;
          })) as HTTPResponse;
          await res.readingBody(this._socket!, req.isResponseBodyPermitted(), () => block?.(res));
          break;
        } catch (exception) {
          if (exception instanceof OpenTimeout) throw exception;
          if (
            exception instanceof ReadTimeout ||
            exception instanceof IOError ||
            exception instanceof EOFError ||
            exception instanceof Errno.ECONNRESET ||
            exception instanceof Errno.ECONNABORTED ||
            exception instanceof Errno.EPIPE ||
            exception instanceof Errno.ETIMEDOUT ||
            exception instanceof OpenSSL.SSL.SSLError ||
            exception instanceof Timeout.Error
          ) {
            if (count < this.maxRetries && HTTP.IDEMPOTENT_METHODS_.includes(req.method)) {
              count += 1;
              this._socket?.close();
              this.debug(`Conn close because of error ${(exception as Error).message}, and retry`);
              continue;
            }
            this.debug(`Conn close because of error ${(exception as Error).message}`);
            this._socket?.close();
          }
          throw exception;
        }
      }

      this.endTransport(req, res);
      return res;
    } catch (exception) {
      this.debug(`Conn close because of error ${(exception as Error).message}`);
      this._socket?.close();
      throw exception;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  async beginTransport(req: HTTPRequest): Promise<void> {
    if (this._socket!.isClosed()) {
      await this.connect();
    } else if (this._lastCommunicated != null) {
      if (this._lastCommunicated + this.keepAliveTimeout < performance.now() / 1000) {
        this.debug("Conn close because of keep_alive_timeout");
        this._socket!.close();
        await this.connect();
      } else if (this._socket!.isEof()) {
        this.debug("Conn close because of EOF");
        this._socket!.close();
        await this.connect();
      }
    }

    if (!req.isResponseBodyPermitted() && this.closeOnEmptyResponse) {
      if (req.get("connection") == null) req.set("connection", "close");
    }

    req.updateUri(this.address, this.port, this.isUseSsl());
    if (req.get("host") == null) req.set("host", this.addrPort());
  }

  /** @noRailsEquivalent PERMANENT */
  endTransport(req: HTTPRequest, res: HTTPResponse): void {
    this._currHttpVersion = res.httpVersion;
    this._lastCommunicated = null;
    if (this._socket!.isClosed()) {
      this.debug("Conn socket closed");
    } else if (res.body == null && this.closeOnEmptyResponse) {
      this.debug("Conn close");
      this._socket!.close();
    } else if (this.isKeepAlive(req, res)) {
      this.debug("Conn keep-alive");
      this._lastCommunicated = performance.now() / 1000;
    } else {
      this.debug("Conn close");
      this._socket!.close();
    }
  }

  /** @noRailsEquivalent PERMANENT */
  isKeepAlive(req: HTTPRequest, res: HTTPResponse): boolean {
    if (req.isConnectionClose()) return false;
    if (this._currHttpVersion <= "1.0") {
      return res.isConnectionKeepAlive();
    } else {
      return !res.isConnectionClose();
    }
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1869-1879`. */
  private editPath(path: string): string {
    if (this.isProxy()) {
      if (path.startsWith("ftp://") || this.isUseSsl()) {
        return path;
      } else {
        return `http://${this.addrPort()}${path}`;
      }
    } else {
      return path;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  addrPort(): string {
    let addr = this.address;
    if (addr.includes(":")) addr = `[${addr}]`;
    const defaultPort = this.isUseSsl() ? HTTP.httpsDefaultPort() : HTTP.httpDefaultPort();
    return defaultPort === this.port ? addr : `${addr}:${this.port}`;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:2472-2476`. */
  debug(msg: string): void {
    if (this._debugOutput == null) return;
    this._debugOutput.write(msg);
    this._debugOutput.write("\n");
  }
}

/**
 * `rsock_syserr_fail_host_port` (`vendor/ruby/v3.3.11/ext/socket/socket.c:24-36`)
 * and `rsock_raise_resolution_error` (`ext/socket/raddrinfo.c`), the Ruby
 * error `TCPSocket.open` raises for the host's own.
 *
 * @noRailsEquivalent PERMANENT
 */
function _rsockSysFail(e: unknown, host: string, port: number): Error {
  if (!(e instanceof Error)) throw e;
  const code = (e as { code?: unknown }).code;
  if (code === "ECONNREFUSED") {
    return new Errno.ECONNREFUSED(`connect(2) for "${host}" port ${port}`);
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_NONAME") {
    return new Socket.ResolutionError("getaddrinfo: Name or service not known");
  }
  return e;
}

Net.HTTP = HTTP;
Net.HTTPHeaderSyntaxError = HTTPHeaderSyntaxError;
Net.HTTPBadResponse = HTTPBadResponse;
