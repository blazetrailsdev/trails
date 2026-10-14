import { isBlank, mattrAccessor, toParam, toQuery } from "@blazetrails/activesupport";
import { escapeFragment } from "../journey/router/utils.js";
import { Utils as RackUtils } from "@blazetrails/rack";
import { fetch, rbInspect, toI } from "@blazetrails/ruby-compat";

const IP_HOST_REGEXP = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const HOST_REGEXP = /(^[^:]+:\/\/)?(\[[^\]]+\]|[^:]+)(?::(\d+$))?/;
const PROTOCOL_REGEXP = /^([^:]+)(:)?(\/\/)?$/;

/** @noRailsEquivalent PERMANENT */
export interface UrlOptions {
  host?: string;
  protocol?: string | false | null;
  port?: number | string | false | null;
  scriptName?: string;
  path?: string;
  trailingSlash?: boolean;
  params?: unknown;
  anchor?: unknown;
  user?: string;
  password?: string;
  onlyPath?: boolean;
  tldLength?: number;
  subdomain?: string | boolean | null | { toParam(): string };
  domain?: string;
}

/** @internal */
function namedHost(host: string): boolean {
  return !IP_HOST_REGEXP.test(host);
}

/** @internal */
function extractDomainFrom(host: string, tldLength: number): string {
  const parts = host.split(".");
  return parts.slice(-(1 + tldLength)).join(".");
}

/** @internal */
function extractSubdomainsFrom(host: string, tldLength: number): string[] {
  const parts = host.split(".");
  return parts.slice(0, Math.max(0, parts.length - (tldLength + 1)));
}

/** @internal */
function addParams(path: string[], params: unknown): void {
  let hash: Record<string, unknown>;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    hash = { ...(params as Record<string, unknown>) };
  } else {
    hash = { params };
  }
  for (const k of Object.keys(hash)) {
    if (toParam(hash[k]) === null) delete hash[k];
  }
  const query = toQuery(hash);
  if (query.length > 0) path.push(`?${query}`);
}

/** @internal */
function addAnchor(path: string[], anchor: unknown): void {
  if (anchor !== null && anchor !== undefined && anchor !== false) {
    const p = toParam(anchor);
    path.push(`#${escapeFragment(String(p ?? ""))}`);
  }
}

/** @internal */
function normalizeProtocol(protocol: string | false | null | undefined): string {
  if (protocol === null || protocol === undefined) {
    return URL.secureProtocol ? "https://" : "http://";
  }
  if (protocol === false || protocol === "//") return "//";
  if (typeof protocol === "string") {
    const m = protocol.match(PROTOCOL_REGEXP);
    if (m) return `${m[1]}://`;
  }
  throw new Error(`Invalid :protocol option: ${rbInspect(protocol)}`);
}

/** @internal */
function normalizeHost(_host: string, options: UrlOptions): string {
  if (!namedHost(_host)) return _host;

  const tldLength = options.tldLength ?? URL.tldLength;
  const subdomain = fetch<UrlOptions["subdomain"]>(
    options as Record<string, unknown>,
    "subdomain",
    true,
  );
  const domain = options.domain;

  let host = "";
  if (subdomain === true) {
    if (domain === null || domain === undefined) return _host;
    host += extractSubdomainsFrom(_host, tldLength).join(".");
  } else if (subdomain != null && subdomain !== false) {
    host += String(toParam(subdomain) ?? "");
  }
  if (host.length > 0) host += ".";
  host += domain ?? extractDomainFrom(_host, tldLength);
  return host;
}

/** @internal */
function normalizePort(
  port: number | string | false | null | undefined,
  protocol: string,
  block: (normalizedPort: number | string) => void,
): void {
  if (port == null || port === false) return;

  switch (protocol) {
    case "//":
      block(port);
      break;
    case "https://":
      if (toI(port) !== 443) block(port);
      break;
    default:
      if (toI(port) !== 80) block(port);
  }
}

/** @internal */
function buildHostUrl(
  host: string,
  port: number | string | false | null | undefined,
  protocol: string | false | null | undefined,
  options: UrlOptions,
  path: string,
): string {
  const match = host.match(HOST_REGEXP);
  if (match) {
    if (protocol !== false && (protocol === null || protocol === undefined)) {
      protocol = match[1] ?? null;
    }
    host = match[2];
    if (!("port" in options)) port = match[3] ?? null;
  }

  const protocolStr = normalizeProtocol(protocol);
  host = normalizeHost(host, options);

  let result = protocolStr;
  if (options.user && options.password) {
    result += `${RackUtils.escape(options.user)}:${RackUtils.escape(options.password)}@`;
  }
  result += host;
  normalizePort(port, protocolStr, (normalizedPort) => {
    result += `:${normalizedPort}`;
  });
  result += path;
  return result;
}

export class URL {
  declare static secureProtocol: boolean;
  declare static tldLength: number;
  declare secureProtocol: boolean;
  declare tldLength: number;

  static {
    mattrAccessor.call(this, "secureProtocol", { default: false });
    mattrAccessor.call(this, "tldLength", { default: 1 });
  }

  static extractDomain(host: string, tldLength: number): string | null {
    return namedHost(host) ? extractDomainFrom(host, tldLength) : null;
  }

  static extractSubdomains(host: string, tldLength: number): string[] {
    return namedHost(host) ? extractSubdomainsFrom(host, tldLength) : [];
  }

  static extractSubdomain(host: string, tldLength: number): string {
    return URL.extractSubdomains(host, tldLength).join(".");
  }

  static urlFor(options: UrlOptions): string {
    return options.onlyPath ? URL.pathFor(options) : URL.fullUrlFor(options);
  }

  static fullUrlFor(options: UrlOptions): string {
    const { host, protocol, port } = options;
    if (!host) {
      throw new Error(
        "Missing host to link to! Please provide the :host parameter, set default_url_options[:host], or set :only_path to true",
      );
    }
    return buildHostUrl(host, port, protocol, options, URL.pathFor(options));
  }

  static pathFor(options: UrlOptions): string {
    let path = (options.scriptName ?? "").replace(/\/$/, "");
    if ("path" in options && options.path !== undefined) path += options.path;
    if (options.trailingSlash && isBlank(path)) path = "/";

    const parts: string[] = [path];
    if ("params" in options) addParams(parts, options.params);
    if ("anchor" in options) addAnchor(parts, options.anchor);
    return parts.join("");
  }
}
