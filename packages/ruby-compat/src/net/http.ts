import { Errno } from "../errno.js";
import { getHttpAsync, type HttpClientConnection } from "../http-adapter.js";
import { IOError } from "../io-error.js";
import { NotImplementedError } from "../not-implemented-error.js";
import { OpenSSL } from "../openssl.js";
import { Socket } from "../socket.js";
import { Timeout } from "../timeout.js";
import type { HTTP as URIHTTP } from "../uri/http.js";
import { Net, OpenTimeout, ReadTimeout } from "./protocol.js";
import type { HTTPRequest } from "./http/request.js";
import { Post } from "./http/requests.js";
import { HTTPResponse } from "./http/response.js";
import "./http/responses.js";

/**
 * `Net::HTTP` (`vendor/ruby/v3.3.11/lib/net/http.rb:722`), the client
 * `ActionMailbox::Relayer` posts with, over the HTTP adapter's `connect`. Only
 * what `Relayer#client` and `#post` call is ported.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class HTTP {
  /** @noRailsEquivalent PERMANENT */
  static Post = Post;

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
  private _readTimeout: number | null = 60;
  private _useSsl = false;
  private _started = false;
  private _socket: HttpClientConnection | null = null;

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
    this._readTimeout = sec;
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

    const adapter = await getHttpAsync();
    if (adapter.connect === undefined) {
      throw new NotImplementedError("the HTTP adapter has no client connect");
    }
    this._socket = await Timeout.timeout(this.openTimeout, OpenTimeout, null, async () => {
      try {
        return await adapter.connect!({
          host: connAddr,
          port: connPort,
          useSsl: this.isUseSsl(),
          verifyPeer: this.verifyMode !== OpenSSL.SSL.VERIFY_NONE,
        });
      } catch (e) {
        const error = _rsockSysFail(e, connAddr, connPort);
        error.message = `Failed to open TCP connection to ${connAddr}:${connPort} (${error.message})`;
        throw error;
      }
    });
  }

  /** @noRailsEquivalent PERMANENT */
  doFinish(): void {
    this._started = false;
    this._socket?.close();
    this._socket = null;
  }

  /** @noRailsEquivalent PERMANENT */
  async post(
    path: string | URIHTTP,
    data: string | Uint8Array,
    initheader: Record<string, string> | null = null,
    dest: unknown = null,
  ): Promise<HTTPResponse> {
    return this.sendEntity(path, data, initheader, dest, Post);
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
    dest: unknown,
    type: typeof Post,
  ): Promise<HTTPResponse> {
    let res: HTTPResponse | null = null;
    await this.request(new type(path, initheader), data, (r) => {
      r.readBody(dest);
      res = r;
    });
    return res!;
  }

  /**
   * @missingRailsCall beginTransport — CONVERGEABLE ruby-compat-net-http-full-transport
   * @missingRailsCall endTransport — CONVERGEABLE ruby-compat-net-http-full-transport
   * @missingRailsCall isKindOf — CONVERGEABLE ruby-compat-net-http-full-transport
   * @missingRailsCall setUri — CONVERGEABLE ruby-compat-net-http-full-transport
   * @noRailsEquivalent PERMANENT
   */
  async transportRequest(
    req: HTTPRequest,
    block?: (res: HTTPResponse) => unknown,
  ): Promise<HTTPResponse> {
    try {
      if (req.get("host") == null) req.set("host", this.addrPort());
      const sock = await Timeout.timeout(this._readTimeout, null, null, () =>
        this._socket!.request(req.method, req.path, req.toHash(), req.body),
      ).catch((e: unknown) => {
        throw e instanceof Timeout.Error ? new ReadTimeout() : e;
      });
      const res = HTTPResponse.readNew(sock);
      await res.readingBody(sock, req.isResponseBodyPermitted(), () => block?.(res));
      return res;
    } catch (exception) {
      this._socket?.close();
      throw exception;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  addrPort(): string {
    let addr = this.address;
    if (addr.includes(":")) addr = `[${addr}]`;
    const defaultPort = this.isUseSsl() ? HTTP.httpsDefaultPort() : HTTP.httpDefaultPort();
    return defaultPort === this.port ? addr : `${addr}:${this.port}`;
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
