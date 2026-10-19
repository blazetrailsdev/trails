import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { isBlank, type Logger } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/actionview";
import { Request } from "../http/request.js";
import { IPAddr, regexpEscape, rbEqq, rbFSend, rtest } from "@blazetrails/ruby-compat";
import { DebugView } from "./debug-view.js";

/** @internal */
export const PORT_REGEX = "(?::\\d+)";
/** @internal */
export const SUBDOMAIN_REGEX = "(?:[a-z0-9-]+\\.)";
/** @internal */
export const IPV4_HOSTNAME = `(?<host>\\d+\\.\\d+\\.\\d+\\.\\d+)${PORT_REGEX}?`;
/** @internal */
export const IPV6_HOSTNAME = "(?<host>[a-f0-9]*:[a-f0-9.:]+)";
/** @internal */
export const IPV6_HOSTNAME_WITH_PORT = `\\[${IPV6_HOSTNAME}\\]${PORT_REGEX}`;
/** @internal */
export const VALID_IP_HOSTNAME: RegExp[] = [
  new RegExp(`^${IPV4_HOSTNAME}$`, "i"),
  new RegExp(`^${IPV6_HOSTNAME}$`, "i"),
  new RegExp(`^${IPV6_HOSTNAME_WITH_PORT}$`, "i"),
];

/** @internal */
export const ALLOWED_HOSTS_IN_DEVELOPMENT: (string | RegExp | IPAddr)[] = [
  ".localhost",
  ".test",
  new IPAddr("0.0.0.0/0"),
  new IPAddr("::/0"),
];

export type HostPermission =
  | string
  | RegExp
  | IPAddr
  | ((host: string) => unknown)
  | { caseEquals(host: string): unknown };

/** @internal */
export class Permissions {
  private readonly hosts: Exclude<HostPermission, string>[];

  constructor(hosts: HostPermission[] | HostPermission | undefined | null) {
    this.hosts = sanitizeHosts(hosts);
  }

  empty(): boolean {
    return this.hosts.length === 0;
  }

  allows(host: string): boolean {
    return this.hosts.some((allowed) => {
      if (allowed instanceof IPAddr) {
        try {
          return rbEqq(allowed, extractHostname(host));
        } catch {
          return false;
        }
      } else {
        return rbEqq(allowed, host);
      }
    });
  }
}

/** @internal */
function sanitizeHosts(
  hosts: HostPermission[] | HostPermission | undefined | null,
): Exclude<HostPermission, string>[] {
  const arr = hosts == null ? [] : Array.isArray(hosts) ? hosts : [hosts];
  return arr.map((host) => {
    if (host instanceof RegExp) return sanitizeRegexp(host);
    if (typeof host === "string") return sanitizeString(host);
    return host;
  });
}

/** @internal */
function sanitizeRegexp(host: RegExp): RegExp {
  return new RegExp(`^(?:${host.source})${PORT_REGEX}?$`, host.flags.replace(/[gym]/g, ""));
}

/** @internal */
function sanitizeString(host: string): RegExp {
  if (host.startsWith(".")) {
    return new RegExp(`^${SUBDOMAIN_REGEX}?${regexpEscape(host.slice(1))}${PORT_REGEX}?$`, "i");
  }
  return new RegExp(`^${regexpEscape(host)}${PORT_REGEX}?$`, "i");
}

/** @internal */
export function extractHostname(host: string): string {
  for (const re of VALID_IP_HOSTNAME) {
    const m = host.match(re);
    if (m?.groups?.["host"]) return m.groups["host"];
  }
  return host;
}

export interface HostAuthorizationOptions {
  exclude?: (request: Request) => boolean;
  responseApp?: (env: RackEnv) => Promise<RackResponse>;
}

type RackApp =
  | ((env: RackEnv) => Promise<RackResponse>)
  | { call(env: RackEnv): Promise<RackResponse> };

export class HostAuthorization {
  private app: RackApp;
  private permissions: Permissions;
  private exclude?: (request: Request) => boolean;
  private responseApp: RackApp;

  constructor(
    app: RackApp,
    hosts: HostPermission[] | HostPermission | null | undefined,
    { exclude, responseApp }: HostAuthorizationOptions = {},
  ) {
    this.app = app;
    this.permissions = new Permissions(hosts);
    this.exclude = exclude;

    this.responseApp = responseApp ?? new DefaultResponseApp();
  }

  async call(env: RackEnv): Promise<RackResponse> {
    if (this.permissions.empty()) return rbFSend(this.app, "call", env) as Promise<RackResponse>;

    const request = new Request(env);
    const blocked = this.blockedHosts(request);

    if (blocked.length === 0 || this.isExcluded(request)) {
      this.markAsAuthorized(request);
      return rbFSend(this.app, "call", env) as Promise<RackResponse>;
    }

    env["action_dispatch.blocked_hosts"] = blocked;
    return rbFSend(this.responseApp, "call", env) as Promise<RackResponse>;
  }

  /** @internal */
  private blockedHosts(request: Request): string[] {
    const out: string[] = [];
    const env = request.env;
    const originHost =
      (env["HTTP_HOST"] as string | undefined) ??
      (env["SERVER_NAME"] as string | undefined) ??
      "localhost";
    if (!this.permissions.allows(originHost)) out.push(originHost);

    const forwardedHost = request.xForwardedHost?.split(/,\s?/).at(-1);
    if (!(isBlank(forwardedHost) || this.permissions.allows(forwardedHost!)))
      out.push(forwardedHost!);
    return out;
  }

  /** @internal */
  private isExcluded(request: Request): boolean {
    return Boolean(this.exclude && this.exclude.call(null, request));
  }

  /** @internal */
  private markAsAuthorized(request: Request): void {
    request.setHeader("action_dispatch.authorized_host", request.host);
  }
}

export class DefaultResponseApp {
  static readonly RESPONSE_STATUS = 403;

  async call(env: RackEnv): Promise<RackResponse> {
    const request = new Request(env);
    const format = request.xhr ? "text/plain" : "text/html";
    this.logError(request);
    return this.response(format, String(await this.responseBody(request)));
  }

  /** @internal */
  private responseBody(request: Request): ReturnType<DebugView["render"]> {
    if (!rtest(request.getHeader("action_dispatch.show_detailed_exceptions"))) return "";

    const template = new DebugView({ hosts: request.env["action_dispatch.blocked_hosts"] });
    return template.render({ template: "rescues/blocked_host", layout: "rescues/layout" });
  }

  /** @internal */
  private response(format: string, body: string): RackResponse {
    const bytes = Buffer.byteLength(body, "utf8");
    return [
      DefaultResponseApp.RESPONSE_STATUS,
      {
        "content-type": `${format}; charset=utf-8`,
        "content-length": String(bytes),
      },
      [body],
    ];
  }

  /** @internal */
  private logError(request: Request): void {
    const logger = this.availableLogger(request);
    if (!logger) return;
    const blocked = (request.env["action_dispatch.blocked_hosts"] as string[]) ?? [];
    logger.error(
      `[ActionDispatch::HostAuthorization::DefaultResponseApp] Blocked hosts: ${blocked.join(", ")}`,
    );
  }

  /** @internal */
  private availableLogger(request: Request): Logger | null {
    return (request.logger as Logger | null | undefined) ?? (Base.logger as Logger | null);
  }
}
