/**
 * ActionDispatch::HostAuthorization
 *
 * Middleware that guards against DNS rebinding attacks by
 * only allowing requests to specified hosts.
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";

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
    if (this.hosts.length === 0) return this.app(env);

    const host = this.extractHost(env);
    const blocked = this.blockedHosts(env, host);

    if (blocked.length === 0 || this.isExcluded(env)) {
      this.markAsAuthorized(env, host);
      return this.app(env);
    }

    env["action_dispatch.blocked_hosts"] = blocked;
    if (this.responseApp) return this.responseApp(env);
    return this.blockedResponse(host);
  }

  private extractHost(env: RackEnv): string {
    const httpHost = env["HTTP_HOST"] as string | undefined;
    if (httpHost) return httpHost.replace(/:\d+$/, "").toLowerCase();
    return ((env["SERVER_NAME"] as string) || "localhost").toLowerCase();
  }

  /** @internal */
  private blockedHosts(env: RackEnv, host: string): string[] {
    const out: string[] = [];
    if (!this.isAuthorized(host)) out.push(host);
    const forwarded = (env["HTTP_X_FORWARDED_HOST"] as string | undefined)
      ?.split(/,\s?/)
      .pop()
      ?.trim();
    if (forwarded) {
      const normalized = forwarded.replace(/:\d+$/, "").toLowerCase();
      if (!this.isAuthorized(normalized)) out.push(normalized);
    }
    return out;
  }

  /** @internal */
  private isExcluded(env: RackEnv): boolean {
    return Boolean(this.exclude?.(env));
  }

  /** @internal */
  private markAsAuthorized(env: RackEnv, host: string): void {
    env["action_dispatch.authorized_host"] = host;
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
