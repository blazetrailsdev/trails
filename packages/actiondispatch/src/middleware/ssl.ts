/**
 * ActionDispatch::SSL
 *
 * Middleware that enforces HTTPS connections.
 * - Redirects HTTP requests to HTTPS
 * - Sets HSTS headers
 * - Sets secure cookies flag
 */

import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString } from "@rails-ts/rack";

export interface SSLOptions {
  redirect?: boolean | { status?: number; body?: string; port?: number };
  hsts?: boolean | HSTSOptions;
  secureCookies?: boolean;
  exclude?: (env: RackEnv) => boolean;
}

export interface HSTSOptions {
  expires?: number;
  subdomains?: boolean;
  preload?: boolean;
}

type RackApp = (env: RackEnv) => Promise<RackResponse>;

const ONE_YEAR = 31536000;

export class SSL {
  private app: RackApp;
  private redirect: boolean;
  private redirectStatus: number;
  private redirectPort: number | undefined;
  private hsts: HSTSOptions | false;
  private secureCookies: boolean;
  private exclude?: (env: RackEnv) => boolean;

  constructor(app: RackApp, options: SSLOptions = {}) {
    this.app = app;
    this.exclude = options.exclude;
    this.secureCookies = options.secureCookies !== false;

    // Redirect config
    if (options.redirect === false) {
      this.redirect = false;
      this.redirectStatus = 301;
    } else if (typeof options.redirect === "object") {
      this.redirect = true;
      this.redirectStatus = options.redirect.status ?? 301;
      this.redirectPort = options.redirect.port;
    } else {
      this.redirect = true;
      this.redirectStatus = 301;
    }

    // HSTS config
    if (options.hsts === false) {
      this.hsts = false;
    } else if (typeof options.hsts === "object") {
      this.hsts = {
        expires: options.hsts.expires ?? ONE_YEAR,
        subdomains: options.hsts.subdomains ?? false,
        preload: options.hsts.preload ?? false,
      };
    } else {
      this.hsts = { expires: ONE_YEAR, subdomains: false, preload: false };
    }
  }

  async call(env: RackEnv): Promise<RackResponse> {
    if (this.exclude?.(env)) {
      return this.app(env);
    }

    const scheme = (env["rack.url_scheme"] as string) || "http";
    const isSSL = scheme === "https" ||
      (env["HTTP_X_FORWARDED_PROTO"] as string)?.split(",")[0]?.trim() === "https";

    if (!isSSL && this.redirect) {
      return this.redirectToHttps(env);
    }

    const [status, headers, body] = await this.app(env);

    // Add HSTS header for HTTPS requests
    if (isSSL && this.hsts) {
      headers["strict-transport-security"] = this.buildHstsHeader();
    }

    // Mark cookies as secure
    if (isSSL && this.secureCookies && headers["set-cookie"]) {
      headers["set-cookie"] = this.flagCookiesAsSecure(headers["set-cookie"]);
    }

    return [status, headers, body];
  }

  private redirectToHttps(env: RackEnv): RackResponse {
    const host = (env["HTTP_HOST"] as string) || (env["SERVER_NAME"] as string) || "localhost";
    const path = (env["PATH_INFO"] as string) || "/";
    const qs = (env["QUERY_STRING"] as string) || "";
    const portSuffix = this.redirectPort ? `:${this.redirectPort}` : "";
    const url = `https://${host.replace(/:\d+$/, "")}${portSuffix}${path}${qs ? "?" + qs : ""}`;

    return [
      this.redirectStatus,
      {
        "content-type": "text/html; charset=utf-8",
        location: url,
      },
      bodyFromString(`<html><body>You are being <a href="${url}">redirected</a>.</body></html>`),
    ];
  }

  private buildHstsHeader(): string {
    const opts = this.hsts as HSTSOptions;
    let header = `max-age=${opts.expires}`;
    if (opts.subdomains) header += "; includeSubDomains";
    if (opts.preload) header += "; preload";
    return header;
  }

  private flagCookiesAsSecure(setCookie: string): string {
    return setCookie.split("\n").map(cookie => {
      if (cookie.toLowerCase().includes("; secure")) return cookie;
      return cookie + "; secure";
    }).join("\n");
  }
}
