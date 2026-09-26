import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { isBlank } from "@blazetrails/activesupport";
import { Request } from "../http/request.js";
import { IPAddr, regexpEscape } from "@blazetrails/ruby-compat";
import type { Logger } from "./debug-exceptions.js";

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

export type HostPermission = string | RegExp | IPAddr;

/** @internal */
export class Permissions {
  private readonly hosts: (RegExp | IPAddr)[];

  constructor(hosts: HostPermission[] | HostPermission | undefined | null) {
    this.hosts = sanitizeHosts(hosts);
  }

  empty(): boolean {
    return this.hosts.length === 0;
  }

  allows(host: string): boolean {
    for (const allowed of this.hosts) {
      if (allowed instanceof IPAddr) {
        try {
          if (allowed.includes(extractHostname(host))) return true;
        } catch {
          continue;
        }
      } else if (allowed.test(host)) {
        return true;
      }
    }
    return false;
  }
}

/** @internal */
function sanitizeHosts(
  hosts: HostPermission[] | HostPermission | undefined | null,
): (RegExp | IPAddr)[] {
  const arr = hosts == null ? [] : Array.isArray(hosts) ? hosts : [hosts];
  return arr.map((h) => {
    if (h instanceof IPAddr) return h;
    if (h instanceof RegExp) return sanitizeRegexp(h);
    return sanitizeString(h);
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
  hosts: HostPermission[];
  exclude?: (request: Request) => boolean;
  responseApp?: (env: RackEnv) => Promise<RackResponse>;
}

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export class HostAuthorization {
  private app: RackApp;
  private permissions: Permissions;
  private exclude?: (request: Request) => boolean;
  private responseApp: (env: RackEnv) => Promise<RackResponse>;

  constructor(app: RackApp, options: HostAuthorizationOptions) {
    this.app = app;
    this.permissions = new Permissions(options.hosts);
    this.exclude = options.exclude;
    const defaultApp = new DefaultResponseApp();
    this.responseApp = options.responseApp ?? ((env) => defaultApp.call(env));
  }

  async call(env: RackEnv): Promise<RackResponse> {
    if (this.permissions.empty()) return this.app(env);

    const request = new Request(env);
    const blocked = this.blockedHosts(request);

    if (blocked.length === 0 || this.isExcluded(request)) {
      this.markAsAuthorized(request);
      return this.app(env);
    }

    env["action_dispatch.blocked_hosts"] = blocked;
    return this.responseApp(env);
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
    return this.response(format, this.responseBody(request, format));
  }

  /** @internal */
  private responseBody(request: Request, format: string): string {
    if (!request.env["action_dispatch.show_detailed_exceptions"]) return "";
    const blocked = (request.env["action_dispatch.blocked_hosts"] as string[]) ?? [];
    return format === "text/plain"
      ? renderBlockedHostText(blocked)
      : renderBlockedHostHtml(blocked);
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
      bodyFromString(body),
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
    const explicit = request.logger as Logger | undefined;
    if (explicit && typeof explicit.error === "function") return explicit;
    const rack = request.env["rack.logger"] as Logger | undefined;
    if (rack && typeof rack.error === "function") return rack;
    return null;
  }
}

/** @internal */
function renderBlockedHostHtml(hosts: string[]): string {
  const joined = escapeHtml(hosts.join(", "));
  const lines = hosts.map((host) => `    config.hosts << "${escapeHtml(host)}"`).join("\n");
  return [
    "<header>",
    `  <h1>Blocked hosts: ${joined}</h1>`,
    "</header>",
    '<main role="main" id="container">',
    "  <h2>To allow requests to these hosts, make sure they are valid hostnames (containing only numbers, letters, dashes and dots), then add the following to your environment configuration:</h2>",
    "  <pre>",
    lines,
    "  </pre>",
    '  <p>For more details view: <a href="https://guides.rubyonrails.org/configuring.html#actiondispatch-hostauthorization">the Host Authorization guide</a></p>',
    "</main>",
  ].join("\n");
}

/** @internal */
function renderBlockedHostText(hosts: string[]): string {
  const lines = hosts.map((host) => `  config.hosts << "${host}"`).join("\n");
  return [
    `Blocked hosts: ${hosts.join(", ")}`,
    "",
    "To allow requests to these hosts, make sure they are valid hostnames (containing only numbers, letters, dashes and dots), then add the following to your environment configuration:",
    "",
    lines,
    "",
    "For more details on host authorization view: https://guides.rubyonrails.org/configuring.html#actiondispatch-hostauthorization",
  ].join("\n");
}

/** @internal */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
