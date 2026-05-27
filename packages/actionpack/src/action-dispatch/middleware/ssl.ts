/**
 * ActionDispatch::SSL
 *
 * Middleware that enforces HTTPS connections.
 * - Redirects HTTP requests to HTTPS
 * - Sets HSTS headers
 * - Sets secure cookies flag
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";

export interface RedirectOptions {
  status?: number;
  port?: number;
  host?: string;
  body?: string[];
  /** Exclude matching requests from redirect and secure-cookie flagging. */
  exclude?: (env: RackEnv) => boolean;
}

export interface SSLOptions {
  redirect?: boolean | RedirectOptions;
  hsts?: boolean | HSTSOptions;
  secureCookies?: boolean;
  /** Mirrors Rails `ssl_default_redirect_status:` constructor kwarg. */
  sslDefaultRedirectStatus?: number;
}

export interface HSTSOptions {
  expires?: number;
  subdomains?: boolean;
  preload?: boolean;
}

type RackApp = (env: RackEnv) => Promise<RackResponse>;

const HSTS_EXPIRES_IN = 63072000;
const PERMANENT_REDIRECT_REQUEST_METHODS = ["GET", "HEAD"];

export class SSL {
  private app: RackApp;
  private redirectPort: number | undefined;
  private redirectHost: string | undefined;
  private redirectBody: string[] | undefined;
  private redirectExclude: (env: RackEnv) => boolean;
  private hsts: Required<HSTSOptions>;
  private secureCookies: boolean;
  private sslDefaultRedirectStatus: number | undefined;
  private redirectStatusOverride: number | undefined;

  static defaultHstsOptions(): Required<HSTSOptions> {
    return { expires: HSTS_EXPIRES_IN, subdomains: true, preload: false };
  }

  constructor(app: RackApp, options: SSLOptions = {}) {
    this.app = app;
    this.secureCookies = options.secureCookies !== false;
    this.sslDefaultRedirectStatus = options.sslDefaultRedirectStatus;

    if (options.redirect === false) {
      this.redirectExclude = () => true;
    } else if (typeof options.redirect === "object") {
      this.redirectStatusOverride = options.redirect.status;
      this.redirectPort = options.redirect.port;
      this.redirectHost = options.redirect.host;
      this.redirectBody = options.redirect.body;
      this.redirectExclude = options.redirect.exclude ?? (() => false);
    } else {
      this.redirectExclude = () => false;
    }

    this.hsts = this.normalizeHstsOptions(options.hsts);
  }

  /** @internal */
  private normalizeHstsOptions(options: SSLOptions["hsts"]): Required<HSTSOptions> {
    if (options === false) {
      return { ...SSL.defaultHstsOptions(), expires: 0 };
    }
    if (options == null || options === true) {
      return SSL.defaultHstsOptions();
    }
    return { ...SSL.defaultHstsOptions(), ...options };
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const scheme = (env["rack.url_scheme"] as string) || "http";
    const isSSL =
      scheme === "https" ||
      (env["HTTP_X_FORWARDED_PROTO"] as string)?.split(",")[0]?.trim() === "https";

    if (!isSSL) {
      if (!this.redirectExclude(env)) {
        return this.redirectToHttps(env);
      }
      return this.app(env);
    }

    const [status, headers, body] = await this.app(env);

    this.setHstsHeaderBang(headers);

    if (this.secureCookies && !this.redirectExclude(env) && headers["set-cookie"]) {
      this.flagCookiesAsSecureBang(headers);
    }

    return [status, headers, body];
  }

  private redirectToHttps(env: RackEnv): RackResponse {
    const location = this.httpsLocationFor(env);
    const body = this.redirectBody ?? [
      `<html><body>You are being <a href="${location}">redirected</a>.</body></html>`,
    ];
    return [
      this.redirectStatusOverride ?? this.redirectionStatus(env),
      { "content-type": "text/html; charset=utf-8", location },
      bodyFromString(body.join("")),
    ];
  }

  /** @internal */
  private redirectionStatus(env: RackEnv): number {
    const method = (env["REQUEST_METHOD"] as string | undefined) ?? "";
    if (PERMANENT_REDIRECT_REQUEST_METHODS.includes(method)) return 301;
    if (this.sslDefaultRedirectStatus != null) return this.sslDefaultRedirectStatus;
    return 307;
  }

  /** @internal */
  private httpsLocationFor(env: RackEnv): string {
    const httpHost = (env["HTTP_HOST"] as string) || (env["SERVER_NAME"] as string) || "localhost";
    const requestHostNoPort = httpHost.replace(/:\d+$/, "");
    const requestPortMatch = httpHost.match(/:(\d+)$/);
    const requestPort = requestPortMatch ? parseInt(requestPortMatch[1], 10) : 80;

    const host = this.redirectHost ?? requestHostNoPort;
    const port = this.redirectPort ?? requestPort;

    const path = (env["PATH_INFO"] as string) || "/";
    const qs = (env["QUERY_STRING"] as string) || "";
    let location = `https://${host}`;
    if (port !== 80 && port !== 443) location += `:${port}`;
    location += path;
    if (qs) location += `?${qs}`;
    return location;
  }

  /** @internal */
  private setHstsHeaderBang(headers: Record<string, string>): void {
    if (headers["strict-transport-security"]) return;
    headers["strict-transport-security"] = this.buildHstsHeader();
  }

  private buildHstsHeader(): string {
    const opts = this.hsts;
    let header = `max-age=${opts.expires}`;
    if (opts.subdomains) header += "; includeSubDomains";
    if (opts.preload) header += "; preload";
    return header;
  }

  /** @internal */
  private flagCookiesAsSecureBang(headers: Record<string, string>): void {
    const cookies = headers["set-cookie"];
    if (!cookies) return;
    headers["set-cookie"] = cookies
      .split("\n")
      .map((cookie) => (/;\s*secure\s*(;|$)/i.test(cookie) ? cookie : `${cookie}; secure`))
      .join("\n");
  }
}
