/**
 * ActionDispatch::HostAuthorization
 *
 * Middleware that guards against DNS rebinding attacks by
 * only allowing requests to specified hosts.
 */

import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString } from "@rails-ts/rack";

export interface HostAuthorizationOptions {
  hosts: (string | RegExp)[];
  exclude?: (env: RackEnv) => boolean;
  responseApp?: (env: RackEnv) => Promise<RackResponse>;
}

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export class HostAuthorization {
  private app: RackApp;
  private hosts: (string | RegExp)[];
  private exclude?: (env: RackEnv) => boolean;
  private responseApp?: (env: RackEnv) => Promise<RackResponse>;

  constructor(app: RackApp, options: HostAuthorizationOptions) {
    this.app = app;
    this.hosts = options.hosts;
    this.exclude = options.exclude;
    this.responseApp = options.responseApp;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    if (this.exclude?.(env)) {
      return this.app(env);
    }

    const host = this.extractHost(env);

    if (this.isAuthorized(host)) {
      return this.app(env);
    }

    if (this.responseApp) {
      return this.responseApp(env);
    }

    return this.blockedResponse(host);
  }

  private extractHost(env: RackEnv): string {
    const httpHost = env["HTTP_HOST"] as string | undefined;
    if (httpHost) return httpHost.replace(/:\d+$/, "").toLowerCase();
    return ((env["SERVER_NAME"] as string) || "localhost").toLowerCase();
  }

  private isAuthorized(host: string): boolean {
    if (this.hosts.length === 0) return true;

    for (const allowed of this.hosts) {
      if (typeof allowed === "string") {
        if (allowed === host) return true;
        // Support wildcard subdomains: .example.com
        if (allowed.startsWith(".") && host.endsWith(allowed)) return true;
        if (allowed.startsWith(".") && host === allowed.slice(1)) return true;
      } else {
        if (allowed.test(host)) return true;
      }
    }
    return false;
  }

  private blockedResponse(host: string): RackResponse {
    return [
      403,
      { "content-type": "text/plain; charset=utf-8" },
      bodyFromString(`Blocked host: ${host}`),
    ];
  }
}
