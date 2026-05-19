/**
 * ActionDispatch::Http::URL
 *
 * Port of `actionpack/lib/action_dispatch/http/url.rb`.
 *
 * Provides the class-level URL helpers (extractDomain, urlFor, pathFor, etc.)
 * used by routing to assemble URLs from option hashes. The corresponding
 * instance methods (url, host, port, ...) live on {@link Request}.
 */

import { toParam, toQuery } from "@blazetrails/activesupport";
import { escapeFragment, rackEscape } from "../journey/router/utils.js";

const IP_HOST_REGEXP = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const HOST_REGEXP = /(^[^:]+:\/\/)?(\[[^\]]+\]|[^:]+)(?::(\d+$))?/;
const PROTOCOL_REGEXP = /^([^:]+)(:)?(\/\/)?$/;

export interface UrlOptions {
  host?: string;
  protocol?: string | false | null;
  port?: number | string | null;
  scriptName?: string;
  path?: string;
  trailingSlash?: boolean;
  params?: unknown;
  anchor?: unknown;
  user?: string;
  password?: string;
  onlyPath?: boolean;
  tldLength?: number;
  subdomain?: string | boolean | { toParam(): string };
  domain?: string;
}

function isBlank(s: string): boolean {
  return s.length === 0 || /^\s*$/.test(s);
}

function namedHost(host: string): boolean {
  return !IP_HOST_REGEXP.test(host);
}

function extractDomainFrom(host: string, tldLength: number): string {
  const parts = host.split(".");
  return parts.slice(-(1 + tldLength)).join(".");
}

function extractSubdomainsFrom(host: string, tldLength: number): string[] {
  const parts = host.split(".");
  // Rails: `parts[0..-(tld_length + 2)]` returns `[]` (not the tail) when the
  // host has fewer parts than the TLD requires. JS `Array#slice` with a
  // negative `end` would otherwise drop array *elements* off the end —
  // e.g. `["example", "com"].slice(0, -1) === ["example"]` — so clamp at 0.
  return parts.slice(0, Math.max(0, parts.length - (tldLength + 1)));
}

function addParams(parts: string[], params: unknown): void {
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
  if (query.length > 0) parts.push(`?${query}`);
}

function addAnchor(parts: string[], anchor: unknown): void {
  if (anchor !== null && anchor !== undefined && anchor !== false) {
    const p = toParam(anchor);
    parts.push(`#${escapeFragment(String(p ?? ""))}`);
  }
}

function normalizeProtocol(protocol: string | false | null | undefined): string {
  if (protocol === null || protocol === undefined) {
    return URL.secureProtocol ? "https://" : "http://";
  }
  if (protocol === false || protocol === "//") return "//";
  if (typeof protocol === "string") {
    const m = protocol.match(PROTOCOL_REGEXP);
    if (m) return `${m[1]}://`;
  }
  throw new Error(`Invalid :protocol option: ${JSON.stringify(protocol)}`);
}

function normalizeHost(rawHost: string, options: UrlOptions): string {
  if (!namedHost(rawHost)) return rawHost;

  const tldLength = options.tldLength ?? URL.tldLength;
  const subdomain = options.subdomain ?? true;
  const domain = options.domain;

  let host = "";
  if (subdomain === true) {
    if (domain === null || domain === undefined) return rawHost;
    host += extractSubdomainsFrom(rawHost, tldLength).join(".");
  } else if (subdomain) {
    host += String(toParam(subdomain) ?? "");
  }
  if (host.length > 0) host += ".";
  host += domain ?? extractDomainFrom(rawHost, tldLength);
  return host;
}

function normalizePort(
  port: number | string | null | undefined,
  protocol: string,
): number | string | null {
  if (port === null || port === undefined || port === "") return null;
  const n = typeof port === "string" ? parseInt(port, 10) : port;
  if (protocol === "//") return port;
  if (protocol === "https://") return n === 443 ? null : port;
  return n === 80 ? null : port;
}

function buildHostUrl(
  hostIn: string,
  portIn: number | string | null | undefined,
  protocolIn: string | false | null | undefined,
  options: UrlOptions,
  path: string,
): string {
  let host = hostIn;
  let port = portIn;
  let protocol = protocolIn;

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
    result += `${rackEscape(options.user)}:${rackEscape(options.password)}@`;
  }
  result += host;
  const normalized = normalizePort(port, protocolStr);
  if (normalized !== null) result += `:${normalized}`;
  result += path;
  return result;
}

/**
 * ActionDispatch::Http::URL — class-level helpers.
 *
 * Instance methods (url, host, port, ...) live on {@link Request}.
 */
export const URL = {
  secureProtocol: false as boolean,
  tldLength: 1 as number,

  /**
   * Returns the domain part of a host given the domain level.
   *
   *     URL.extractDomain('www.example.com', 1) // => "example.com"
   *     URL.extractDomain('dev.www.example.co.uk', 2) // => "example.co.uk"
   */
  extractDomain(host: string, tldLength: number): string | null {
    return namedHost(host) ? extractDomainFrom(host, tldLength) : null;
  },

  /**
   * Returns the subdomains of a host as an Array given the domain level.
   *
   *     URL.extractSubdomains('www.example.com', 1) // => ["www"]
   *     URL.extractSubdomains('dev.www.example.co.uk', 2) // => ["dev", "www"]
   */
  extractSubdomains(host: string, tldLength: number): string[] {
    return namedHost(host) ? extractSubdomainsFrom(host, tldLength) : [];
  },

  /**
   * Returns the subdomains of a host as a String given the domain level.
   */
  extractSubdomain(host: string, tldLength: number): string {
    return URL.extractSubdomains(host, tldLength).join(".");
  },

  urlFor(options: UrlOptions): string {
    return options.onlyPath ? URL.pathFor(options) : URL.fullUrlFor(options);
  },

  fullUrlFor(options: UrlOptions): string {
    const { host, protocol, port } = options;
    if (!host) {
      throw new Error(
        "Missing host to link to! Please provide the :host parameter, set default_url_options[:host], or set :only_path to true",
      );
    }
    return buildHostUrl(host, port, protocol, options, URL.pathFor(options));
  },

  pathFor(options: UrlOptions): string {
    let path = (options.scriptName ?? "").replace(/\/$/, "");
    if ("path" in options && options.path !== undefined) path += options.path;
    if (options.trailingSlash && isBlank(path)) path = "/";

    const parts: string[] = [path];
    if ("params" in options) addParams(parts, options.params);
    if ("anchor" in options) addAnchor(parts, options.anchor);
    return parts.join("");
  },
};
