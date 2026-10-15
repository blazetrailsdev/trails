import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString, CONTENT_TYPE, SET_COOKIE } from "@blazetrails/rack";
import { fetch, merge, rbFSend, toI } from "@blazetrails/ruby-compat";
import { LOCATION, STRICT_TRANSPORT_SECURITY } from "../constants.js";
import { Request } from "../http/request.js";

export interface RedirectOptions {
  status?: number;
  port?: number;
  host?: string;
  body?: string[];
  exclude?: (request: Request) => boolean;
}

export interface SSLOptions {
  redirect?: false | null | RedirectOptions;
  hsts?: boolean | HSTSOptions | null;
  secureCookies?: boolean;
  sslDefaultRedirectStatus?: number | null;
}

export interface HSTSOptions {
  expires?: number | { toI(): number | bigint };
  subdomains?: boolean;
  preload?: boolean;
}

type RackApp =
  | ((env: RackEnv) => Promise<RackResponse>)
  | { call(env: RackEnv): Promise<RackResponse> };

const HSTS_EXPIRES_IN = 63072000;
const PERMANENT_REDIRECT_REQUEST_METHODS = ["GET", "HEAD"];

export class SSL {
  private app: RackApp;
  private redirect: false | null | RedirectOptions;
  private exclude: (request: Request) => boolean;
  private secureCookies: boolean;
  private hstsHeader: string;
  private sslDefaultRedirectStatus: number | null;

  static defaultHstsOptions(): Required<HSTSOptions> {
    return { expires: HSTS_EXPIRES_IN, subdomains: true, preload: false };
  }

  constructor(
    app: RackApp,
    {
      redirect = {},
      hsts = {},
      secureCookies = true,
      sslDefaultRedirectStatus = null,
    }: SSLOptions = {},
  ) {
    this.app = app;

    this.redirect = redirect;

    const exclude = this.redirect != null && this.redirect !== false && this.redirect.exclude;
    this.exclude =
      exclude != null && exclude !== false
        ? exclude
        : () => this.redirect == null || this.redirect === false;
    this.secureCookies = secureCookies;

    this.hstsHeader = this.buildHstsHeader(this.normalizeHstsOptions(hsts));
    this.sslDefaultRedirectStatus = sslDefaultRedirectStatus;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const request = new Request(env);

    if (request.ssl) {
      const [status, headers, body] = await (rbFSend(
        this.app,
        "call",
        env,
      ) as Promise<RackResponse>);
      this.setHstsHeaderBang(headers);
      if (this.secureCookies && !this.exclude(request)) this.flagCookiesAsSecureBang(headers);
      return [status, headers, body];
    } else {
      if (!this.exclude(request)) return this.redirectToHttps(request);
      return rbFSend(this.app, "call", env) as Promise<RackResponse>;
    }
  }

  /** @internal */
  private setHstsHeaderBang(headers: Record<string, string | string[]>): void {
    headers[STRICT_TRANSPORT_SECURITY] ??= this.hstsHeader;
  }

  /** @internal */
  private normalizeHstsOptions(options: SSLOptions["hsts"]): Required<HSTSOptions> {
    switch (options) {
      case false:
        return merge<unknown>(SSL.defaultHstsOptions(), { expires: 0 }) as Required<HSTSOptions>;
      case null:
      case undefined:
      case true:
        return SSL.defaultHstsOptions();
      default:
        return merge<unknown>(
          SSL.defaultHstsOptions(),
          options as Record<string, unknown>,
        ) as Required<HSTSOptions>;
    }
  }

  /** @internal */
  private buildHstsHeader(hsts: Required<HSTSOptions>): string {
    let value = `max-age=${toI(hsts.expires)}`;
    if (hsts.subdomains) value += "; includeSubDomains";
    if (hsts.preload) value += "; preload";
    return value;
  }

  /** @internal */
  private flagCookiesAsSecureBang(headers: Record<string, string | string[]>): void {
    const cookies = headers[SET_COOKIE];
    if (cookies == null) return;

    headers[SET_COOKIE] = [cookies].flat().map((cookie) => {
      if (!/;\s*secure\s*(;|$)/i.test(cookie)) {
        return `${cookie}; secure`;
      } else {
        return cookie;
      }
    });
  }

  /** @internal */
  private redirectToHttps(request: Request): RackResponse {
    const redirect = this.redirect as RedirectOptions;
    return [
      fetch<number>(redirect as Record<string, unknown>, "status", this.redirectionStatus(request)),
      {
        [CONTENT_TYPE]: "text/html; charset=utf-8",
        [LOCATION]: this.httpsLocationFor(request),
      },
      bodyFromString((redirect.body ?? []).join("")),
    ];
  }

  /** @internal */
  private redirectionStatus(request: Request): number {
    if (PERMANENT_REDIRECT_REQUEST_METHODS.includes(request.rawRequestMethod)) {
      return 301;
    } else if (this.sslDefaultRedirectStatus != null) {
      return this.sslDefaultRedirectStatus;
    } else {
      return 307;
    }
  }

  /** @internal */
  private httpsLocationFor(request: Request): string {
    const redirect = this.redirect as RedirectOptions;
    const host = redirect.host ?? request.host;
    const port = redirect.port ?? request.port;

    let location = `https://${host}`;
    if (port !== 80 && port !== 443) location += `:${port}`;
    location += request.fullpath;
    return location;
  }
}
