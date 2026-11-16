import { warn } from "../kernel-warn.js";
import { StandardError } from "../standard-error.js";
import { ArgumentError } from "../argument-error.js";
import { EOFError } from "../eof-error.js";
import { Errno } from "../errno.js";
import type { HttpClientSocket, HttpDebugOutput } from "../http-adapter.js";
import { IOError } from "../io-error.js";
import { OpenSSL } from "../openssl.js";
import { Resolv } from "../resolv.js";
import { TCPSocket } from "../socket.js";
import { Timeout } from "../timeout.js";
import { kernelCatch } from "../kernel-catch.js";
import { HTTP as URIHTTP } from "../uri/http.js";
import { Generic as URIGeneric } from "../uri/generic.js";
import { CGI } from "../cgi.js";
import { Base64 } from "../base64.js";
import { BufferedIO, Net, OpenTimeout, Protocol, ReadTimeout } from "./protocol.js";
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
export class HTTP extends Protocol {
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
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1483`. */
  caPath: string | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1494`. */
  ciphers: string | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1498`. */
  extraChainCert: unknown = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1504`. */
  sslTimeout: number | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1519`. */
  verifyCallback: unknown = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1522`. */
  verifyDepth: number | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1532`. */
  verifyHostname: boolean | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1201`. */
  localHost: string | null = null;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1205`. */
  localPort: number | null = null;
  private _sslContext: InstanceType<typeof OpenSSL.SSL.SSLContext> | null = null;
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
  private _proxyFromEnv = false;
  private _proxyUri: URIGeneric | false | null = null;
  private _proxyAddress: string | null = null;
  private _proxyPort: number | null = null;
  private _proxyUser: string | null = null;
  private _proxyPass: string | null = null;
  private _useSsl = false;
  private _started = false;
  private _ipaddr: string | null = null;
  private _socket: BufferedIO | null = null;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1443-1459`. */
  static SSL_IVNAMES = [
    "caFile",
    "caPath",
    "cert",
    "certStore",
    "ciphers",
    "extraChainCert",
    "key",
    "sslTimeout",
    "sslVersion",
    "minVersion",
    "maxVersion",
    "verifyCallback",
    "verifyDepth",
    "verifyMode",
    "verifyHostname",
  ] as const;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1460-1476`. */
  static SSL_ATTRIBUTES = [
    "caFile",
    "caPath",
    "cert",
    "certStore",
    "ciphers",
    "extraChainCert",
    "key",
    "sslTimeout",
    "sslVersion",
    "minVersion",
    "maxVersion",
    "verifyCallback",
    "verifyDepth",
    "verifyMode",
    "verifyHostname",
  ] as const;

  /** @noRailsEquivalent PERMANENT */
  static _isProxyClass = false;
  /** @noRailsEquivalent PERMANENT */
  static _proxyFromEnv = false;
  /** @noRailsEquivalent PERMANENT */
  static proxyAddress: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  static proxyPort: number | null = null;
  /** @noRailsEquivalent PERMANENT */
  static proxyUser: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  static proxyPass: string | null = null;

  /**
   * `HTTP.Proxy` (`vendor/ruby/v3.3.11/lib/net/http.rb:1736-1757`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static Proxy(
    pAddr: string | null = ":ENV",
    pPort: number | null = null,
    pUser: string | null = null,
    pPass: string | null = null,
  ): typeof HTTP {
    if (!pAddr) return this;

    return class extends this {
      static {
        this._isProxyClass = true;

        if (pAddr === ":ENV") {
          this._proxyFromEnv = true;
          this.proxyAddress = null;
          this.proxyPort = null;
        } else {
          this._proxyFromEnv = false;
          this.proxyAddress = pAddr;
          this.proxyPort = pPort || this.defaultPort();
        }

        this.proxyUser = pUser;
        this.proxyPass = pPass;
      }
    };
  }

  /**
   * `HTTP.proxy_class?` (`vendor/ruby/v3.3.11/lib/net/http.rb:1761-1763`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static isProxyClass(): boolean {
    return Object.hasOwn(this, "_isProxyClass") ? this._isProxyClass : false;
  }

  /**
   * `HTTP.new` (`vendor/ruby/v3.3.11/lib/net/http.rb:1065-1088`) and
   * `#initialize` (`:1093-1131`).
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(
    address: string,
    port: number | null = null,
    pAddr: string | null = ":ENV",
    pPort: number | null = null,
    pUser: string | null = null,
    pPass: string | null = null,
    pNoProxy: string | null = null,
  ) {
    super();
    this.address = address;
    this.port = port ?? HTTP.defaultPort();

    const klass = new.target;
    if (klass.isProxyClass()) {
      this.proxyFromEnv = klass._proxyFromEnv;
      this.setProxyAddress(klass.proxyAddress);
      this.setProxyPort(klass.proxyPort);
      this.setProxyUser(klass.proxyUser);
      this.setProxyPass(klass.proxyPass);
    } else if (pAddr === ":ENV") {
      this.proxyFromEnv = true;
    } else {
      if (pAddr && pNoProxy && !URIGeneric.isUseProxy(address, address, port, pNoProxy)) {
        pAddr = null;
        pPort = null;
      }
      this.setProxyAddress(pAddr);
      this.setProxyPort(pPort || klass.defaultPort());
      this.setProxyUser(pUser);
      this.setProxyPass(pPass);
    }
  }

  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_from_env` (`vendor/ruby/v3.3.11/lib/net/http.rb:1237`). */
  set proxyFromEnv(value: boolean) {
    this._proxyFromEnv = value;
  }

  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_address` (`vendor/ruby/v3.3.11/lib/net/http.rb:1241`). */
  setProxyAddress(value: string | null): void {
    this._proxyAddress = value;
  }

  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_port` (`vendor/ruby/v3.3.11/lib/net/http.rb:1245`). */
  setProxyPort(value: number | null): void {
    this._proxyPort = value;
  }

  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_user` (`vendor/ruby/v3.3.11/lib/net/http.rb:1249`). */
  setProxyUser(value: string | null): void {
    this._proxyUser = value;
  }

  /** @noRailsEquivalent PERMANENT — `attr_writer :proxy_pass` (`vendor/ruby/v3.3.11/lib/net/http.rb:1253`). */
  setProxyPass(value: string | null): void {
    this._proxyPass = value;
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
   * `proxy?` (`vendor/ruby/v3.3.11/lib/net/http.rb:1785-1787`), awaited because
   * `proxy_uri`'s `find_proxy` resolves the address.
   *
   * @noRailsEquivalent PERMANENT
   */
  async isProxy(): Promise<boolean> {
    return !!(this._proxyFromEnv ? await this.proxyUri() : this._proxyAddress);
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1792-1794`. */
  isProxyFromEnv(): boolean {
    return this._proxyFromEnv;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1797-1803`. */
  async proxyUri(): Promise<URIGeneric | null> {
    if (this._proxyUri === false) return null;
    this._proxyUri ||=
      (await new URIHTTP(
        "http",
        null,
        this.address,
        this.port,
        null,
        null,
        null,
        null,
        null,
      ).findProxy()) || false;
    return this._proxyUri || null;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1807-1813`. */
  async proxyAddress(): Promise<string | null> {
    if (this._proxyFromEnv) {
      return (await this.proxyUri())?.hostname ?? null;
    } else {
      return this._proxyAddress;
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1817-1823`. */
  async proxyPort(): Promise<number | null> {
    if (this._proxyFromEnv) {
      return (await this.proxyUri())?.port ?? null;
    } else {
      return this._proxyPort;
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1827-1834`. */
  async proxyUser(): Promise<string | null> {
    if (this._proxyFromEnv) {
      const user = (await this.proxyUri())?.user;
      return user != null ? this.unescape(user) : null;
    } else {
      return this._proxyUser;
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http.rb:1838-1845`. */
  async proxyPass(): Promise<string | null> {
    if (this._proxyFromEnv) {
      const pass = (await this.proxyUri())?.password;
      return pass != null ? this.unescape(pass) : null;
    } else {
      return this._proxyPass;
    }
  }

  /** @internal */
  private unescape(value: string): string {
    return CGI.unescape(value);
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
  get ipaddr(): string | null {
    return this.isStarted() ? this._socket!.io.peeraddr()[3] : this._ipaddr;
  }

  /** @noRailsEquivalent PERMANENT */
  set ipaddr(addr: string | null) {
    if (this.isStarted()) throw new IOError("ipaddr value changed, but session already started");
    this._ipaddr = addr;
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
    if (this.isUseSsl()) {
      this._sslContext = new OpenSSL.SSL.SSLContext();
    }

    let connAddr: string;
    let connPort: number;
    if (await this.isProxy()) {
      connAddr = (await this.proxyAddress())!;
      connPort = (await this.proxyPort())!;
    } else {
      connAddr = this.connAddress();
      connPort = this.port;
    }

    let sslHostAddress: string | null = null;
    if (!(Resolv.IPv4.Regex.test(connAddr) || Resolv.IPv6.Regex.test(connAddr))) {
      sslHostAddress = connAddr;
    }

    let s: HttpClientSocket | null = null;
    try {
      this.debug(`opening connection to ${connAddr}:${connPort}...`);
      s = await Timeout.timeout(this.openTimeout, OpenTimeout, null, async () => {
        try {
          return await TCPSocket.open(connAddr, connPort, this.localHost, this.localPort);
        } catch (e) {
          const error = e as Error;
          error.message = `Failed to open TCP connection to ${connAddr}:${connPort} (${error.message})`;
          throw error;
        }
      });
      this.debug("opened");
      if (this.isUseSsl()) {
        if (await this.isProxy()) {
          const plainSock = new BufferedIO(s, {
            readTimeout: this._readTimeout,
            writeTimeout: this._writeTimeout,
            continueTimeout: this._continueTimeout,
            debugOutput: this._debugOutput,
          });
          let buf =
            `CONNECT ${this.connAddress()}:${this.port} HTTP/${HTTP.HTTPVersion}\r\n` +
            `Host: ${this.address}:${this.port}\r\n`;
          const proxyUser = await this.proxyUser();
          if (proxyUser) {
            const credential = Base64.strictEncode64(`${proxyUser}:${await this.proxyPass()}`);
            buf += `Proxy-Authorization: Basic ${credential}\r\n`;
          }
          buf += "\r\n";
          await plainSock.write(buf);
          (await HTTPResponse.readNew(plainSock)).value();
        }
        const sslParameters: Record<string, unknown> = {};
        HTTP.SSL_IVNAMES.forEach((ivname, i) => {
          const value = this[ivname];
          if (value != null) sslParameters[HTTP.SSL_ATTRIBUTES[i]] = value;
        });
        this._sslContext!.setParams(sslParameters);
        this.debug(`starting SSL for ${connAddr}:${connPort}...`);
        const ssl = new OpenSSL.SSL.SSLSocket(s, this._sslContext!);
        ssl.syncClose = true;
        if (sslHostAddress) ssl.hostname = sslHostAddress;
        await this.sslSocketConnect(ssl, this.openTimeout);
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
              await req.exec(this._socket!, this._currHttpVersion, await this.editPath(req.path));
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
  private async editPath(path: string): Promise<string> {
    if (await this.isProxy()) {
      if (path.startsWith("ftp://") || this.isUseSsl()) {
        return path;
      } else {
        return `http://${this.addrPort()}${path}`;
      }
    } else {
      return path;
    }
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  private connAddress(): string {
    return this._ipaddr ?? this.address;
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

Net.HTTP = HTTP;
Net.HTTPHeaderSyntaxError = HTTPHeaderSyntaxError;
Net.HTTPBadResponse = HTTPBadResponse;
