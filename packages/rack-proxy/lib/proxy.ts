import { Rack, Request, type Headers, type RackResponse } from "@blazetrails/rack";
import {
  capitalize,
  constDefined,
  constGet,
  EOFError,
  Errno,
  InvalidURIError,
  IOError,
  isPlainHash,
  NameError,
  Net,
  OpenSSL,
  kernelURI,
  rbConstGet,
  rbInspect,
  rbModName,
  rbObjIvarDefined,
  rbObjIvarSet,
  rbObjRespondTo,
  SocketError,
  StandardError,
  stringSplit,
  rbFArray,
  Timeout,
  URI,
  HTTP as URIHTTP,
} from "@blazetrails/ruby-compat";

import { HttpStreamingResponse } from "./http-streaming-response.js";

type RackEnv = Record<string, unknown>;
type NetHTTP = InstanceType<typeof Net.HTTP>;
type DebugOutput = Parameters<NetHTTP["setDebugOutput"]>[0];
type NetHTTPRequest = InstanceType<typeof Net.HTTP.Get>;
type RackInput = {
  read(length?: number | null, buffer?: unknown): unknown;
  rewind?(): unknown;
};
type Backend = { host: string | null; port: number | string | null; scheme: string | null };

/** @internal */
export class InvalidRequest extends StandardError {}
InvalidRequest.prototype.name = "Rack::Proxy::InvalidRequest";

/** @internal */
export class RequestBodyStream {
  /** @internal */
  private input: RackInput;
  /** @internal */
  private remaining: number;

  constructor(input: RackInput, length: number) {
    [this.input, this.remaining] = [input, length];
  }

  /** @missingRailsCall clear — PERMANENT */
  async read(
    length: number | null = null,
    buffer: Uint8Array | null = null,
  ): Promise<Uint8Array | null> {
    if (length == null) return this.readRemaining(buffer);

    if (this.remaining === 0) {
      return null;
    }

    let data = (await this.input.read(Math.min(length, this.remaining), buffer)) as
      | string
      | Uint8Array
      | null;
    if (data == null || data.length === 0) {
      throw new InvalidRequest("request body is shorter than Content-Length");
    }
    if (typeof data === "string") data = new TextEncoder().encode(data);
    this.remaining -= data.length;
    return data;
  }

  /** @internal */
  private async readRemaining(buffer: Uint8Array | null): Promise<Uint8Array> {
    const data: Uint8Array[] = [];
    let chunk: Uint8Array | null;
    while ((chunk = await this.read(16_384)) != null) {
      data.push(chunk);
    }
    void buffer;
    return _concat(
      data,
      data.reduce((n, c) => n + c.length, 0),
    );
  }
}

export class Proxy {
  static readonly HOP_BY_HOP_HEADERS: Readonly<Record<string, boolean>> = Object.freeze({
    connection: true,
    "keep-alive": true,
    "proxy-authenticate": true,
    "proxy-authorization": true,
    te: true,
    trailer: true,
    "transfer-encoding": true,
    upgrade: true,
  });

  static readonly BACKEND_ERRORS: readonly (abstract new (...args: never[]) => unknown)[] =
    Object.freeze([
      Errno.ECONNREFUSED,
      Errno.ECONNRESET,
      Errno.ECONNABORTED,
      Errno.EHOSTUNREACH,
      Errno.ENETUNREACH,
      Errno.ETIMEDOUT,
      Errno.EPIPE,
      SocketError,
      Timeout.Error,
      Net.ReadTimeout,
      Net.WriteTimeout,
      IOError,
      OpenSSL.SSL.SSLError,
      Net.ProtocolError,
      Net.HTTPBadResponse,
      Net.HTTPHeaderSyntaxError,
    ]);

  /** @internal */
  static readonly InvalidRequest = InvalidRequest;
  /** @internal */
  static readonly RequestBodyStream = RequestBodyStream;

  static extractHttpRequestHeaders(env: RackEnv): Headers {
    const headers = this.buildHeaderHash(
      Object.entries(env)
        .filter(([k, v]) => /^HTTP_[A-Z0-9_.]+$/m.test(k) && v != null)
        .map(([k, v]): [string, unknown] => [this.reconstructHeaderName(k), v]),
    );

    const connectionNamed = stringSplit(
      String(headers.get("Connection") ?? "").toLowerCase(),
      /,\s*/,
    ).map((s) => s.trim());
    for (const key of headers.keys() as string[]) {
      if (
        Object.hasOwn(Proxy.HOP_BY_HOP_HEADERS, key.toLowerCase()) ||
        connectionNamed.includes(key.toLowerCase())
      ) {
        headers.delete(key);
      }
    }

    const xForwardedFor = [
      ...stringSplit(String(headers.get("X-Forwarded-For") ?? ""), /, +/),
      env["REMOTE_ADDR"],
    ].join(", ");

    return headers.mergeBang({ "X-Forwarded-For": xForwardedFor });
  }

  static normalizeHeaders(headers: Record<string, unknown>): Headers {
    const mapped = Object.entries(headers).map(([k, v]): [string, unknown] => {
      let value: unknown;
      if (Array.isArray(v)) {
        if (v.length === 1) {
          value = v[0] ?? null;
        } else if (constDefined(Rack, "Headers", false)) {
          value = v;
        } else {
          value = v.join("\n");
        }
      } else {
        value = v;
      }
      return [this.titleize(k), value];
    });
    return this.buildHeaderHash(Object.entries(Object.fromEntries(mapped)));
  }

  static buildHeaderHash(pairs: Iterable<[string, unknown]>): Headers {
    if (constDefined(Rack, "Headers", false)) {
      const headers = new (constGet(Rack, "Headers") as typeof Headers)();
      for (const [k, v] of pairs) headers.set(k, v as string);
      return headers;
    } else {
      const HeaderHash = constGet(Rack, "Utils::HeaderHash") as new (
        pairs: Iterable<[string, unknown]>,
      ) => Headers;
      return new HeaderHash(pairs);
    }
  }

  /** @internal */
  protected static reconstructHeaderName(name: string): string {
    return this.titleize(name.replace(/^HTTP_/m, "").replaceAll("_", "-"));
  }

  /** @internal */
  protected static titleize(str: string): string {
    return stringSplit(str, "-")
      .map((s) => capitalize(s, []))
      .join("-");
  }

  /** @internal */
  protected app: unknown;
  /** @internal */
  protected streaming: unknown;
  /** @internal */
  protected backend: unknown;
  /** @internal */
  protected allowDynamicBackend: unknown;
  /** @internal */
  protected readTimeout: unknown;
  /** @internal */
  protected openTimeout: unknown;
  /** @internal */
  protected writeTimeout: unknown;
  /** @internal */
  protected maxResponseLength: unknown;
  /** @internal */
  protected sslVersion: unknown;
  /** @internal */
  protected minVersion: unknown;
  /** @internal */
  protected maxVersion: unknown;
  /** @internal */
  protected cert: unknown;
  /** @internal */
  protected key: unknown;
  /** @internal */
  protected caFile: unknown;
  /** @internal */
  protected certStore: unknown;
  /** @internal */
  protected verifyMode: unknown;
  /** @internal */
  protected username: unknown;
  /** @internal */
  protected password: unknown;
  /** @internal */
  protected stripCredentials: unknown;
  /** @internal */
  protected replaceXForwardedFor: unknown;
  /** @internal */
  protected logger: unknown;
  /** @internal */
  protected opts: Record<string, unknown>;

  constructor(app: unknown = null, opts: Record<string, unknown> = {}) {
    if (isPlainHash(app)) {
      opts = app;
      this.app = null;
    } else {
      this.app = app;
    }

    this.streaming = Object.hasOwn(opts, "streaming") ? opts.streaming : true;
    this.backend = opts.backend != null && opts.backend !== false ? kernelURI(opts.backend) : null;
    this.allowDynamicBackend = Object.hasOwn(opts, "allowDynamicBackend")
      ? opts.allowDynamicBackend
      : false;
    this.readTimeout = Object.hasOwn(opts, "readTimeout") ? opts.readTimeout : 60;
    this.openTimeout = opts.openTimeout;
    this.writeTimeout = opts.writeTimeout;
    this.maxResponseLength = opts.maxResponseLength;
    this.sslVersion = opts.sslVersion;
    this.minVersion = opts.minVersion;
    this.maxVersion = opts.maxVersion;
    this.cert = opts.cert;
    this.key = opts.key;
    this.caFile = opts.caFile;
    this.certStore = opts.certStore;
    this.verifyMode = opts.verifyMode;
    if (this.verifyMode == null || this.verifyMode === false) {
      if (opts.sslVerifyNone != null && opts.sslVerifyNone !== false) {
        this.verifyMode = OpenSSL.SSL.VERIFY_NONE;
      }
    }

    this.username = opts.username;
    this.password = opts.password;

    this.stripCredentials = opts.stripCredentials;
    this.replaceXForwardedFor = opts.replaceXForwardedFor;

    this.logger = opts.logger;

    this.opts = opts;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    return this.rewriteResponse(await this.performRequest(this.rewriteEnv(env)));
  }

  rewriteEnv(env: RackEnv): RackEnv {
    return env;
  }

  rewriteResponse(triplet: RackResponse): RackResponse {
    return triplet;
  }

  isBackendAllowed(backend: unknown): boolean {
    void backend;
    return true;
  }

  /** @internal */
  protected async performRequest(env: RackEnv): Promise<RackResponse> {
    const sourceRequest = new Request(env);
    let code: number;
    let headers: Headers;
    let body: unknown;
    let targetResponse: HttpStreamingResponse | null = null;
    try {
      const fullPath =
        sourceRequest.fullpath === ""
          ? (URI.parse(env["REQUEST_URI"] as string) as InstanceType<typeof URIHTTP>).requestUri()!
          : sourceRequest.fullpath;

      const requestClass = this.netHttpRequestClass(sourceRequest.requestMethod);
      if (requestClass == null) return [501, {}, []];

      const targetRequest = new requestClass(fullPath);

      const requestHeaders = (this.constructor as typeof Proxy).extractHttpRequestHeaders(
        sourceRequest.env,
      );
      if (this.stripCredentials != null && this.stripCredentials !== false) {
        requestHeaders.delete("Cookie");
        requestHeaders.delete("Authorization");
      }
      if (this.replaceXForwardedFor != null && this.replaceXForwardedFor !== false) {
        const remoteAddr = env["REMOTE_ADDR"];
        if (remoteAddr != null && remoteAddr !== false) {
          requestHeaders.set("X-Forwarded-For", remoteAddr as string);
        } else {
          requestHeaders.delete("X-Forwarded-For");
        }
      }
      targetRequest.initializeHttpHeader(Object.fromEntries(requestHeaders.entries()));

      if (rbObjIvarDefined(targetRequest, "@decode_content")) {
        rbObjIvarSet(targetRequest, "@decode_content", false);
      }

      if (targetRequest.isRequestBodyPermitted() && sourceRequest.body != null) {
        const input = sourceRequest.body as RackInput;
        if (rbObjRespondTo(input, "rewind")) await input.rewind!();
        const length = sourceRequest.contentLength;
        if (length != null) {
          if (!/^[0-9]+$/.test(length)) throw new InvalidRequest("invalid Content-Length");

          targetRequest.contentLength = Number.parseInt(length, 10);
          targetRequest.setBodyStream(new RequestBodyStream(input, Number.parseInt(length, 10)));
        } else {
          targetRequest.delete("Content-Length");
          targetRequest.set("Transfer-Encoding", "chunked");
          targetRequest.setBodyStream(input as NetHTTPRequest["bodyStream"]);
        }
        if (sourceRequest.contentType != null)
          targetRequest.contentType = sourceRequest.contentType;
      }

      if (
        this.username != null &&
        this.username !== false &&
        this.password != null &&
        this.password !== false
      ) {
        targetRequest.basicAuth(this.username as string, this.password as string);
      }

      let backend = env["rack.backend"] as Backend | string | false | null | undefined;
      delete env["rack.backend"];
      if (backend == null || backend === false) backend = this.backend as Backend | null;
      if (typeof backend === "string") backend = kernelURI(backend) as Backend;
      if (backend == null) {
        if (!(this.allowDynamicBackend != null && this.allowDynamicBackend !== false)) {
          if (rbObjRespondTo(this.logger, "append")) {
            (this.logger as { append(str: string): unknown }).append(
              `rack-proxy: refusing Host-derived backend ${rbInspect(sourceRequest.host)} ` +
                "(no :backend configured; pass allow_dynamic_backend: true to opt in)\n",
            );
          }
          return [502, {}, []];
        }
        backend = sourceRequest as Backend;
      }
      if (!this.isBackendAllowed(backend)) {
        if (rbObjRespondTo(this.logger, "append")) {
          (this.logger as { append(str: string): unknown }).append(
            `rack-proxy: backend ${rbInspect(backend.host)} refused by backend_allowed?\n`,
          );
        }
        return [502, {}, []];
      }

      const useSsl = backend.scheme === "https" || (this.cert != null && this.cert !== false);
      let readTimeout = env["http.read_timeout"];
      delete env["http.read_timeout"];
      if (readTimeout == null || readTimeout === false) readTimeout = this.readTimeout;

      if (this.streaming != null && this.streaming !== false) {
        targetResponse = new HttpStreamingResponse(
          targetRequest,
          backend.host!,
          backend.port == null ? null : Number(backend.port),
          (http) => this.configureBackendConnection(http, { useSsl, readTimeout }),
        );
        if (this.logger != null && this.logger !== false) targetResponse.logger = this.logger;
        code = await targetResponse.code();
        headers = this.prepareResponseHeaders(
          Object.fromEntries((await targetResponse.headers()).entries()),
          code,
          targetRequest,
        );
        if (this.isResponseBodyPermitted(targetRequest, code)) {
          targetResponse.maxResponseLength = this.maxResponseLength as number | null;
          body = targetResponse;
        } else {
          await targetResponse.close();
          body = [];
        }
      } else {
        const http = new Net.HTTP(
          backend.host!,
          backend.port == null ? null : Number(backend.port),
        );
        this.configureBackendConnection(http, { useSsl, readTimeout });

        await http.start(async () => {
          await http.request(targetRequest, null, async (response) => {
            code = Number.parseInt(response.code, 10);
            headers = this.prepareResponseHeaders(response.toHash(), code, targetRequest);
            body = [];
            if (this.isResponseBodyPermitted(targetRequest, code)) {
              const buffered: Uint8Array[] = [];
              let bytesize = 0;
              await response.readBody(null, (chunk) => {
                this.checkResponseLengthBang(bytesize + chunk.length);
                buffered.push(chunk);
                bytesize += chunk.length;
              });
              if (response.contentLength != null && bytesize !== response.contentLength) {
                throw new EOFError("backend response is shorter than Content-Length");
              }
              if (bytesize !== 0) (body as Uint8Array[]).push(_concat(buffered, bytesize));
            }
          });
        });
      }
    } catch (e) {
      if (e instanceof InvalidURIError || e instanceof InvalidRequest) {
        await targetResponse?.close();
        return [400, {}, []];
      }
      if (
        Proxy.BACKEND_ERRORS.some((klass) => e instanceof klass) ||
        e instanceof HttpStreamingResponse.ResponseTooLarge
      ) {
        await targetResponse?.close();
        if (rbObjRespondTo(this.logger, "append")) {
          (this.logger as { append(str: string): unknown }).append(
            `rack-proxy: backend request failed: ${rbModName((e as Error).constructor)}: ${(e as Error).message}\n`,
          );
        }
        return [502, {}, []];
      }
      throw e;
    }

    return [code!, headers!, body] as unknown as RackResponse;
  }

  /** @internal */
  private isResponseBodyPermitted(request: NetHTTPRequest, code: number): boolean {
    return (
      request.isResponseBodyPermitted() &&
      !Rack.Utils.STATUS_WITH_NO_ENTITY_BODY[code] &&
      code !== 205
    );
  }

  /** @internal */
  private checkResponseLengthBang(length: number | null): void {
    if (
      this.maxResponseLength != null &&
      length != null &&
      length > (this.maxResponseLength as number)
    ) {
      throw new HttpStreamingResponse.ResponseTooLarge(
        `backend response exceeded max_response_length=${this.maxResponseLength}`,
      );
    }
  }

  /** @internal */
  private prepareResponseHeaders(
    rawHeaders: Record<string, unknown>,
    code: number,
    request: NetHTTPRequest,
  ): Headers {
    const headers = (this.constructor as typeof Proxy).buildHeaderHash(
      Object.keys(rawHeaders).map((key): [string, unknown] => [key, rawHeaders[key]]),
    );
    const transferEncoding = headers.get("Transfer-Encoding");
    const contentLength = headers.get("Content-Length");
    if (transferEncoding != null) {
      if (
        contentLength != null ||
        (rbFArray(transferEncoding) as string[]).join(",").trim().toLowerCase() !== "chunked"
      ) {
        throw new Net.HTTPBadResponse("ambiguous or unsupported backend transfer encoding");
      }
    }
    if (contentLength != null) {
      const lengths = (rbFArray(contentLength) as string[]).flatMap((value) =>
        value.split(",").map((v) => v.trim()),
      );
      if (
        !(
          lengths.every((value) => /^[0-9]+$/.test(value)) &&
          new Set(lengths.map((v) => Number.parseInt(v, 10))).size === 1
        )
      ) {
        throw new Net.HTTPBadResponse("invalid backend Content-Length");
      }
      headers.set("Content-Length", Number.parseInt(lengths[0], 10).toString());
      if (this.isResponseBodyPermitted(request, code)) {
        this.checkResponseLengthBang(Number.parseInt(lengths[0], 10));
      }
    }

    const connectionNamed = (rbFArray(headers.get("Connection")) as string[])
      .join(",")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim());
    for (const key of headers.keys() as string[]) {
      if (
        Object.hasOwn(Proxy.HOP_BY_HOP_HEADERS, key.toLowerCase()) ||
        connectionNamed.includes(key.toLowerCase())
      ) {
        headers.delete(key);
      }
    }
    if (Rack.Utils.STATUS_WITH_NO_ENTITY_BODY[code]) {
      headers.delete("Content-Length");
      headers.delete("Content-Type");
    }
    return (this.constructor as typeof Proxy).normalizeHeaders(
      Object.fromEntries(headers.entries()),
    );
  }

  /** @internal */
  private netHttpRequestClass(method: string): typeof Net.HTTP.Get | null {
    try {
      return rbConstGet(Net.HTTP, capitalize(method, []), true, false) as typeof Net.HTTP.Get;
    } catch (e) {
      if (!(e instanceof NameError)) throw e;
      return null;
    }
  }

  /** @internal */
  private configureBackendConnection(
    conn: NetHTTP,
    { useSsl, readTimeout }: { useSsl: boolean; readTimeout: unknown },
  ): NetHTTP {
    conn.useSsl = useSsl;
    conn.maxRetries = 0;
    conn.readTimeout = readTimeout as number | null;
    if (this.openTimeout != null) conn.openTimeout = this.openTimeout as number;
    if (this.writeTimeout != null) conn.writeTimeout = this.writeTimeout as number;

    if (useSsl) {
      conn.verifyMode = (this.verifyMode ?? OpenSSL.SSL.VERIFY_PEER) as number;
      if (this.caFile != null) conn.caFile = this.caFile as string;
      if (this.certStore != null) conn.certStore = this.certStore;
      if (this.minVersion != null) conn.minVersion = this.minVersion as string;
      if (this.maxVersion != null) conn.maxVersion = this.maxVersion as string;
      if (this.sslVersion != null) conn.sslVersion = this.sslVersion as string;
      if (this.cert != null) conn.cert = this.cert;
      if (this.key != null) conn.key = this.key;
    }

    if (this.logger != null && this.logger !== false) {
      conn.setDebugOutput(this.logger as DebugOutput);
    }
    return conn;
  }
}

function _concat(chunks: Uint8Array[], bytesize: number): Uint8Array {
  const data = new Uint8Array(bytesize);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return data;
}

Rack.Proxy = Proxy;
