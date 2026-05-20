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

export interface SSLOptions {
  redirect?: boolean | { status?: number; port?: number };
  hsts?: boolean | HSTSOptions;
  secureCookies?: boolean;
  exclude?: (env: RackEnv) => boolean;
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
  private redirect: boolean;
  private redirectPort: number | undefined;
  private hsts: Required<HSTSOptions>;
  private secureCookies: boolean;
  private sslDefaultRedirectStatus: number | undefined;
  private redirectStatusOverride: number | undefined;
  private exclude?: (env: RackEnv) => boolean;

  static defaultHstsOptions(): Required<HSTSOptions> {
    return { expires: HSTS_EXPIRES_IN, subdomains: true, preload: false };
  }

  constructor(app: RackApp, options: SSLOptions = {}) {
    this.app = app;
    this.exclude = options.exclude;
    this.secureCookies = options.secureCookies !== false;
    this.sslDefaultRedirectStatus = options.sslDefaultRedirectStatus;

    if (options.redirect === false) {
      this.redirect = false;
    } else if (typeof options.redirect === "object") {
      this.redirect = true;
      this.redirectStatusOverride = options.redirect.status;
      this.redirectPort = options.redirect.port;
    } else {
      this.redirect = true;
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
    if (this.exclude?.(env)) {
      return this.app(env);
    }

    const scheme = (env["rack.url_scheme"] as string) || "http";
    const isSSL =
      scheme === "https" ||
      (env["HTTP_X_FORWARDED_PROTO"] as string)?.split(",")[0]?.trim() === "https";

    if (!isSSL && this.redirect) {
      return this.redirectToHttps(env);
    }

    const [status, headers, body] = await this.app(env);

    if (isSSL) {
      this.setHstsHeaderBang(headers);
    }

    if (isSSL && this.secureCookies && headers["set-cookie"]) {
      this.flagCookiesAsSecureBang(headers);
    }

    return [status, headers, body];
  }

  private redirectToHttps(env: RackEnv): RackResponse {
    const location = this.httpsLocationFor(env);
    return [
      this.redirectStatusOverride ?? this.redirectionStatus(env),
      { "content-type": "text/html; charset=utf-8", location },
      bodyFromString(
        `<html><body>You are being <a href="${location}">redirected</a>.</body></html>`,
      ),
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
    const hostNoPort = httpHost.replace(/:\d+$/, "");
    const port = this.redirectPort;
    const path = (env["PATH_INFO"] as string) || "/";
    const qs = (env["QUERY_STRING"] as string) || "";
    let location = `https://${hostNoPort}`;
    if (port && port !== 80 && port !== 443) location += `:${port}`;
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
