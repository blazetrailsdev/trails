import { Rack, type Headers, type RackResponse } from "@blazetrails/rack";
import {
  capitalize,
  constDefined,
  constGet,
  isPlainHash,
  OpenSSL,
  kernelURI,
  stringSplit,
} from "@blazetrails/ruby-compat";

type RackEnv = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Proxy {
  /** @internal */
  performRequest(env: RackEnv): Promise<RackResponse>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
}

Rack.Proxy = Proxy;
