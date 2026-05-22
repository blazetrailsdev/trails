/**
 * ActionDispatch::HostAuthorization
 *
 * Middleware that guards against DNS rebinding attacks by
 * only allowing requests to specified hosts.
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { Request } from "../http/request.js";
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

/**
 * Minimal IPAddr-style host matcher. Supports literal IPv4/IPv6 addresses
 * and CIDR notation. Used so allowlists can contain entries like
 * `IPAddr.new("0.0.0.0/0")` from Rails' ALLOWED_HOSTS_IN_DEVELOPMENT.
 */
export class IPAddr {
  readonly family: "v4" | "v6";
  private readonly network: bigint;
  private readonly mask: bigint;

  constructor(spec: string) {
    const [addr, prefixStr] = spec.split("/");
    if (addr.includes(":")) {
      this.family = "v6";
      const full = parseIpv6(addr);
      const prefix = parsePrefix(prefixStr, 128, spec);
      this.mask = prefixToMask(prefix, 128);
      this.network = full & this.mask;
    } else {
      this.family = "v4";
      const full = parseIpv4(addr);
      const prefix = parsePrefix(prefixStr, 32, spec);
      this.mask = prefixToMask(prefix, 32);
      this.network = full & this.mask;
    }
  }

  /** Returns true when `host` is an IP literal of the same family within this network. */
  includes(host: string): boolean {
    try {
      if (this.family === "v4") {
        if (host.includes(":")) return false;
        return (parseIpv4(host) & this.mask) === this.network;
      }
      const stripped = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
      if (!stripped.includes(":")) return false;
      return (parseIpv6(stripped) & this.mask) === this.network;
    } catch {
      return false;
    }
  }
}

function parsePrefix(prefixStr: string | undefined, bits: number, spec: string): number {
  if (prefixStr === undefined) return bits;
  if (!/^\d+$/.test(prefixStr)) throw new Error(`invalid IP prefix: ${spec}`);
  const n = Number.parseInt(prefixStr, 10);
  if (n < 0 || n > bits) throw new Error(`invalid IP prefix: ${spec}`);
  return n;
}

function prefixToMask(prefix: number, bits: number): bigint {
  if (prefix === 0) return 0n;
  if (prefix === bits) return (1n << BigInt(bits)) - 1n;
  const full = (1n << BigInt(bits)) - 1n;
  return full ^ ((1n << BigInt(bits - prefix)) - 1n);
}

function parseIpv4(addr: string): bigint {
  const parts = addr.split(".");
  if (parts.length !== 4) throw new Error(`invalid IPv4: ${addr}`);
  let out = 0n;
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(`invalid IPv4: ${addr}`);
    out = (out << 8n) | BigInt(n);
  }
  return out;
}

const HEXTET_RE = /^[0-9a-f]{1,4}$/i;

function parseIpv6(addr: string): bigint {
  const doubleColonCount = addr.split("::").length - 1;
  if (doubleColonCount > 1) throw new Error(`invalid IPv6: ${addr}`);
  let head: string;
  let tail: string;
  let collapsed: boolean;
  if (doubleColonCount === 1) {
    const [h, t] = addr.split("::");
    head = h;
    tail = t ?? "";
    collapsed = true;
  } else {
    head = addr;
    tail = "";
    collapsed = false;
  }
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  // IPv4-embedded IPv6 (e.g. ::ffff:127.0.0.1): convert the final IPv4
  // dotted-quad into two hextets before counting groups.
  const last =
    tailParts.length > 0 ? tailParts[tailParts.length - 1] : headParts[headParts.length - 1];
  if (last && last.includes(".")) {
    const v4 = parseIpv4(last);
    const hi = Number(v4 >> 16n).toString(16);
    const lo = Number(v4 & 0xffffn).toString(16);
    const target = tailParts.length > 0 ? tailParts : headParts;
    target.splice(target.length - 1, 1, hi, lo);
  }
  const groupCount = headParts.length + tailParts.length;
  let all: string[];
  if (collapsed) {
    const missing = 8 - groupCount;
    if (missing < 1) throw new Error(`invalid IPv6: ${addr}`);
    all = [...headParts, ...Array(missing).fill("0"), ...tailParts];
  } else {
    if (groupCount !== 8) throw new Error(`invalid IPv6: ${addr}`);
    all = headParts;
  }
  let out = 0n;
  for (const p of all) {
    if (!HEXTET_RE.test(p)) throw new Error(`invalid IPv6: ${addr}`);
    out = (out << 16n) | BigInt(Number.parseInt(p, 16));
  }
  return out;
}

/** @internal */
export const ALLOWED_HOSTS_IN_DEVELOPMENT: (string | RegExp | IPAddr)[] = [
  ".localhost",
  ".test",
  new IPAddr("0.0.0.0/0"),
  new IPAddr("::/0"),
];

export type HostPermission = string | RegExp | IPAddr;

/**
 * Rails: ActionDispatch::HostAuthorization::Permissions.
 *
 * Normalizes the configured host allowlist into anchored regexes (with
 * optional trailing port) and matches incoming hosts against them.
 *
 * @internal
 */
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
        if (allowed.includes(extractHostname(host))) return true;
      } else if (allowed.test(host)) {
        return true;
      }
    }
    return false;
  }
}

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

function sanitizeRegexp(host: RegExp): RegExp {
  return new RegExp(`^(?:${host.source})${PORT_REGEX}?$`, host.flags.replace(/[gym]/g, ""));
}

function sanitizeString(host: string): RegExp {
  if (host.startsWith(".")) {
    return new RegExp(`^${SUBDOMAIN_REGEX}?${escapeRegExp(host.slice(1))}${PORT_REGEX}?$`, "i");
  }
  return new RegExp(`^${escapeRegExp(host)}${PORT_REGEX}?$`, "i");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  exclude?: (env: RackEnv) => boolean;
  responseApp?: (env: RackEnv) => Promise<RackResponse>;
}

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export class HostAuthorization {
  private app: RackApp;
  private permissions: Permissions;
  private exclude?: (env: RackEnv) => boolean;
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

    if (blocked.length === 0 || this.isExcluded(env)) {
      this.markAsAuthorized(env, request);
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

    const forwardedHeader = env["HTTP_X_FORWARDED_HOST"] as string | undefined;
    const forwarded = forwardedHeader?.split(/,\s?/).pop()?.trim();
    if (forwarded && !this.permissions.allows(forwarded)) out.push(forwarded);
    return out;
  }

  /** @internal Invokes the `exclude` predicate with the original Rack env so mutations are visible to downstream middleware (the `Request` constructed in `call` clones its env). */
  private isExcluded(env: RackEnv): boolean {
    return Boolean(this.exclude?.(env));
  }

  /** @internal Sets `action_dispatch.authorized_host` from `Request#rawHostWithPort` (port stripped). */
  private markAsAuthorized(env: RackEnv, request: Request): void {
    env["action_dispatch.authorized_host"] = stripPort(request.rawHostWithPort);
  }
}

/**
 * Strip a trailing `:port` from `host` without corrupting unbracketed
 * IPv6 literals. IPv6 addresses with a port arrive bracketed
 * (`[::1]:3000`); an unbracketed multi-colon string is the IPv6 address
 * itself with no port suffix.
 *
 * @internal
 */
function stripPort(host: string): string {
  if (host.startsWith("[")) return host.replace(/\]:\d+$/, "]");
  const colons = (host.match(/:/g) ?? []).length;
  if (colons > 1) return host;
  return host.replace(/:\d+$/, "");
}

/**
 * Default Rack app invoked when {@link HostAuthorization} blocks a request.
 *
 * Mirrors Rails `ActionDispatch::HostAuthorization::DefaultResponseApp`:
 * picks `text/plain` for XHR requests and `text/html` otherwise, logs the
 * blocked hosts via the request's logger, and renders a DebugView-style
 * body when `action_dispatch.show_detailed_exceptions` is set.
 */
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

/**
 * Render the blocked-host HTML body. Mirrors Rails'
 * `templates/rescues/blocked_host.html.erb` line-for-line — the ActionView
 * template stack isn't ported yet, so the .erb is reproduced inline.
 *
 * @internal
 */
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

/**
 * Render the blocked-host plain-text body. Mirrors Rails'
 * `templates/rescues/blocked_host.text.erb`.
 *
 * @internal
 */
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
