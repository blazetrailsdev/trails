import {
  REQUEST_METHOD,
  SERVER_NAME,
  SERVER_PORT,
  SERVER_PROTOCOL,
  QUERY_STRING,
  PATH_INFO,
  SCRIPT_NAME,
  RACK_URL_SCHEME,
  RACK_INPUT,
  RACK_SESSION,
  RACK_SESSION_OPTIONS,
  RACK_LOGGER,
  HTTP_HOST,
  HTTP_PORT,
  HTTPS,
  HTTP_COOKIE,
  CONTENT_TYPE,
  CONTENT_LENGTH,
  GET,
  POST,
  PUT,
  PATCH,
  DELETE,
  HEAD,
  OPTIONS,
  LINK,
  TRACE,
  UNLINK,
  RACK_REQUEST_QUERY_HASH,
  RACK_REQUEST_QUERY_STRING,
  RACK_REQUEST_FORM_HASH,
  RACK_REQUEST_FORM_INPUT,
  RACK_REQUEST_FORM_VARS,
  RACK_REQUEST_FORM_PAIRS,
  RACK_REQUEST_COOKIE_HASH,
  RACK_REQUEST_COOKIE_STRING,
  HTTP_FORWARDED,
  HTTP_X_FORWARDED_FOR,
  HTTP_X_FORWARDED_PORT,
  HTTP_X_FORWARDED_HOST,
  HTTP_X_FORWARDED_PROTO,
  HTTP_X_FORWARDED_SCHEME,
} from "./constants.js";
import { forwardedValues, getDefaultQueryParser, QueryParser } from "./utils.js";
import * as MediaTypeModule from "./media-type.js";
import { parseMultipart as multipartExtract } from "./multipart.js";

const FORM_DATA_MEDIA_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"];
const PARSEABLE_DATA_MEDIA_TYPES = ["multipart/related", "multipart/mixed"];

function parseCookies(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieStr) return cookies;
  for (const pair of cookieStr.split(/;\s*/)) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.substring(0, eqIdx).trim();
    const val = pair.substring(eqIdx + 1).trim();
    if (key && !(key in cookies)) {
      cookies[key] = val;
    }
  }
  return cookies;
}

const ALLOWED_SCHEMES = ["https", "http", "wss", "ws"] as const;
const FORWARDED_SCHEME_HEADERS: Record<string, string> = {
  proto: HTTP_X_FORWARDED_PROTO,
  scheme: HTTP_X_FORWARDED_SCHEME,
};

function splitHeader(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);
}

function wrapIpv6(address: string): string {
  // Rails: only wrap if not already bracketed and has >1 colon (IPv6 has multiple colons;
  // host:port has exactly one and must not be wrapped).
  if (address && !address.startsWith("[") && address.split(":").length - 1 > 1) {
    return `[${address}]`;
  }
  return address;
}

function splitAuthority(
  authority: string | null | undefined,
): [string | null, string | null, number | null] {
  if (!authority) return [null, null, null];
  const ipv6Match = authority.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (ipv6Match) {
    const addr = ipv6Match[1];
    const port = ipv6Match[2] ? parseInt(ipv6Match[2]) : null;
    return [`[${addr}]`, addr, port];
  }
  const idx = authority.lastIndexOf(":");
  if (idx !== -1) {
    const portStr = authority.substring(idx + 1);
    if (/^\d+$/.test(portStr)) {
      return [authority.substring(0, idx), authority.substring(0, idx), parseInt(portStr)];
    }
  }
  return [authority, authority, null];
}

function allowedScheme(header: string | null | undefined): string | null {
  if (!header) return null;
  return (ALLOWED_SCHEMES as readonly string[]).includes(header) ? header : null;
}

function isTrustedProxy(ip: string): boolean {
  if (!ip) return false;
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1|fd|fc)/i.test(ip.trim());
}

export class Request {
  env: Record<string, any>;

  constructor(env: Record<string, any>) {
    this.env = env;
  }

  dup(): Request {
    return new (this.constructor as typeof Request)({ ...this.env });
  }

  has(key: string): boolean {
    return key in this.env;
  }

  get(key: string, defaultValue?: any): any {
    if (key in this.env) return this.env[key];
    if (typeof defaultValue === "function") return defaultValue();
    return defaultValue;
  }

  set(key: string, value: any): void {
    this.env[key] = value;
  }

  addHeader(key: string, value: string): void {
    const existing = this.env[key];
    if (existing) {
      this.env[key] = existing + "," + value;
    } else {
      this.env[key] = value;
    }
  }

  deleteHeader(key: string): any {
    const val = this.env[key];
    delete this.env[key];
    return val;
  }

  each(callback: (key: string, value: any) => void): void {
    for (const [k, v] of Object.entries(this.env)) {
      callback(k, v);
    }
  }

  get requestMethod(): string {
    return this.env[REQUEST_METHOD];
  }
  get scriptName(): string {
    return this.env[SCRIPT_NAME] || "";
  }
  set scriptName(v: string) {
    this.env[SCRIPT_NAME] = v;
  }
  get pathInfo(): string {
    return this.env[PATH_INFO] || "/";
  }
  set pathInfo(v: string) {
    this.env[PATH_INFO] = v;
  }
  get queryString(): string {
    return this.env[QUERY_STRING] || "";
  }
  get serverProtocol(): string {
    return this.env[SERVER_PROTOCOL];
  }

  get contentType(): string | null {
    const ct = this.env[CONTENT_TYPE] || this.env["CONTENT_TYPE"];
    if (!ct || ct === "") return null;
    return ct;
  }

  get mediaType(): string | null {
    return MediaTypeModule.type(this.contentType);
  }

  get mediaTypeParams(): Record<string, string> {
    return MediaTypeModule.params(this.contentType);
  }

  get contentLength(): number | null {
    const cl = this.env[CONTENT_LENGTH] || this.env["CONTENT_LENGTH"];
    return cl ? parseInt(cl) : null;
  }

  get scheme(): string {
    const scheme = this.env[RACK_URL_SCHEME];
    if (scheme && scheme !== "http" && scheme !== "https") {
      return "http"; // prevent scheme abuse
    }
    return scheme || "http";
  }

  get ssl(): boolean {
    return this.scheme === "https" || this.env[HTTPS] === "on";
  }

  get host(): string {
    const httpHost = this.env[HTTP_HOST];
    if (httpHost) {
      // Strip port from host
      if (httpHost.includes(":")) {
        return httpHost.split(":")[0];
      }
      return httpHost;
    }
    return this.env[SERVER_NAME] || "localhost";
  }

  get port(): number {
    const httpHost = this.env[HTTP_HOST];
    if (httpHost && httpHost.includes(":")) {
      return parseInt(httpHost.split(":")[1]);
    }
    const httpPort = this.env[HTTP_PORT];
    if (httpPort) return parseInt(httpPort);
    const serverPort = this.env[SERVER_PORT];
    if (serverPort && serverPort !== "80" && serverPort !== "443") return parseInt(serverPort);
    return this.ssl ? 443 : 80;
  }

  get serverPort(): number {
    return parseInt(this.env[SERVER_PORT] || "80");
  }

  get authority(): string {
    const p = this.port;
    if ((this.ssl && p === 443) || (!this.ssl && p === 80)) {
      return this.host;
    }
    return `${this.host}:${p}`;
  }

  get serverAuthority(): string {
    const p = this.serverPort;
    return `${this.env[SERVER_NAME]}:${p}`;
  }

  get hostWithPort(): string {
    return this.authority;
  }

  get baseUrl(): string {
    return `${this.scheme}://${this.authority}${this.scriptName}`;
  }

  get url(): string {
    const qs = this.queryString;
    return `${this.baseUrl}${this.pathInfo}${qs ? "?" + qs : ""}`;
  }

  get fullpath(): string {
    const qs = this.queryString;
    return `${this.scriptName}${this.pathInfo}${qs ? "?" + qs : ""}`;
  }

  get referer(): string | null {
    return this.env["HTTP_REFERER"] ?? null;
  }

  get referrer(): string | null {
    return this.referer;
  }

  get userAgent(): string | null {
    return this.env["HTTP_USER_AGENT"] || null;
  }

  get xhr(): boolean {
    return (this.env["HTTP_X_REQUESTED_WITH"] || "").toLowerCase() === "xmlhttprequest";
  }

  get prefetch(): boolean {
    const purpose = (this.env["HTTP_X_MOZ"] || "").toLowerCase();
    const secPurpose = (this.env["HTTP_SEC_PURPOSE"] || "").toLowerCase();
    const purpose2 = (this.env["HTTP_PURPOSE"] || "").toLowerCase();
    return purpose === "prefetch" || secPurpose === "prefetch" || purpose2 === "prefetch";
  }

  get cookies(): Record<string, string> {
    const cookieStr = this.env[HTTP_COOKIE] || "";
    if (this.env[RACK_REQUEST_COOKIE_STRING] === cookieStr && this.env[RACK_REQUEST_COOKIE_HASH]) {
      return this.env[RACK_REQUEST_COOKIE_HASH];
    }
    const parsed = parseCookies(cookieStr);
    this.env[RACK_REQUEST_COOKIE_STRING] = cookieStr;
    this.env[RACK_REQUEST_COOKIE_HASH] = parsed;
    return parsed;
  }

  get GET(): Record<string, any> {
    const qs = this.queryString;
    if (this.env[RACK_REQUEST_QUERY_STRING] === qs && this.env[RACK_REQUEST_QUERY_HASH]) {
      return this.env[RACK_REQUEST_QUERY_HASH];
    }
    const parsed = this.parseQuery(qs, "&");
    this.env[RACK_REQUEST_QUERY_STRING] = qs;
    this.env[RACK_REQUEST_QUERY_HASH] = parsed;
    return parsed;
  }

  get POST(): Record<string, any> {
    if (this.env[RACK_REQUEST_FORM_HASH]) {
      return this.env[RACK_REQUEST_FORM_HASH];
    }

    const input = this.env[RACK_INPUT];
    if (!input) {
      this.env[RACK_REQUEST_FORM_HASH] = {};
      return {};
    }

    const mt = this.mediaType;
    if (!mt || (!FORM_DATA_MEDIA_TYPES.includes(mt) && !mt.startsWith("multipart/"))) {
      this.env[RACK_REQUEST_FORM_HASH] = {};
      return {};
    }

    // Multipart data (form-data, related, mixed, etc.)
    if (mt.startsWith("multipart/")) {
      const parsed = this.parseMultipart();
      this.env[RACK_REQUEST_FORM_HASH] = parsed;
      this.env[RACK_REQUEST_FORM_INPUT] = input;
      return parsed;
    }

    // URL-encoded form data
    let body: string;
    if (typeof input.read === "function") {
      body = input.read() || "";
    } else if (typeof input === "string") {
      body = input;
    } else {
      body = "";
    }

    // Safari sends \0 for empty forms
    if (body === "\0") body = "";

    const parsed = this.parseQuery(body);
    this.env[RACK_REQUEST_FORM_HASH] = parsed;
    this.env[RACK_REQUEST_FORM_VARS] = body;
    this.env[RACK_REQUEST_FORM_INPUT] = input;
    return parsed;
  }

  get formData(): boolean {
    const mt = this.mediaType;
    return mt !== null && FORM_DATA_MEDIA_TYPES.includes(mt);
  }

  get formPairs(): [string, any][] {
    const mt = this.mediaType;
    if (!mt || !FORM_DATA_MEDIA_TYPES.includes(mt)) return [];

    // Multipart: return pairs from parsed POST
    if (mt === "multipart/form-data") {
      if (this.env[RACK_REQUEST_FORM_PAIRS]) {
        return this.env[RACK_REQUEST_FORM_PAIRS];
      }
      const post = this.POST;
      const pairs: [string, any][] = [];
      for (const [key, value] of Object.entries(post)) {
        pairs.push([key, value]);
      }
      this.env[RACK_REQUEST_FORM_PAIRS] = pairs;
      return pairs;
    }

    // URL-encoded
    if (this.env[RACK_REQUEST_FORM_VARS] !== undefined) {
      const body = this.env[RACK_REQUEST_FORM_VARS];
      if (!body) return [];
      return this._parseFormPairs(body);
    }

    const input = this.env[RACK_INPUT];
    if (!input) return [];

    let body: string;
    if (typeof input.read === "function") {
      body = input.read() || "";
    } else {
      body = "";
    }

    if (!body) return [];
    return this._parseFormPairs(body);
  }

  private _parseFormPairs(body: string): [string, string][] {
    const pairs: [string, string][] = [];
    for (const part of body.split("&")) {
      if (!part) continue;
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) {
        pairs.push([decodeURIComponent(part), ""]);
      } else {
        pairs.push([
          decodeURIComponent(part.substring(0, eqIdx)),
          decodeURIComponent(part.substring(eqIdx + 1)),
        ]);
      }
    }
    return pairs;
  }

  get params(): Record<string, any> {
    return { ...this.GET, ...this.POST };
  }

  updateParam(key: string, value: any): void {
    const get = this.GET;
    const post = this.POST;
    if (key in post) {
      post[key] = value;
    } else {
      get[key] = value;
    }
  }

  deleteParam(key: string): any {
    const post = this.POST;
    if (key in post) {
      const val = post[key];
      delete post[key];
      return val;
    }
    const get = this.GET;
    if (key in get) {
      const val = get[key];
      delete get[key];
      return val;
    }
    return undefined;
  }

  get session(): Record<string, any> {
    return this.env[RACK_SESSION] || (this.env[RACK_SESSION] = {});
  }

  get sessionOptions(): Record<string, any> {
    return this.env[RACK_SESSION_OPTIONS] || (this.env[RACK_SESSION_OPTIONS] = {});
  }

  get ip(): string {
    const trustedProxyFn = this.env["rack.request.trusted_proxy"];
    const remoteAddr = this.env["REMOTE_ADDR"] || "127.0.0.1";

    // false means trust nothing - just use REMOTE_ADDR
    if (trustedProxyFn === false) {
      return remoteAddr;
    }

    const trustFn: (ip: string) => boolean =
      trustedProxyFn === true
        ? () => true
        : typeof trustedProxyFn === "function"
          ? trustedProxyFn
          : isTrustedProxy;

    const forwarded = this.env["HTTP_X_FORWARDED_FOR"];
    const clientIp = this.env["HTTP_CLIENT_IP"];

    if (forwarded) {
      const ips = forwarded
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      // Check for spoofing: if client-ip not in forwarded chain and not trusted
      if (clientIp) {
        const clientInForwarded = ips.includes(clientIp);
        if (!clientInForwarded && !trustFn(clientIp)) {
          return clientIp;
        }
      }

      // Find the first untrusted IP from the right
      for (let i = ips.length - 1; i >= 0; i--) {
        if (!trustFn(ips[i])) {
          return ips[i];
        }
      }
    }

    if (clientIp && !trustFn(clientIp)) {
      return clientIp;
    }

    return remoteAddr;
  }

  trustedProxy(ip: string): boolean {
    const trustedProxyFn = this.env["rack.request.trusted_proxy"];
    if (trustedProxyFn === true) return true;
    if (trustedProxyFn === false) return false;
    if (typeof trustedProxyFn === "function") return trustedProxyFn(ip);
    return isTrustedProxy(ip);
  }

  static ipFilter: ((ip: string) => boolean) | null = null;
  static forwardedPriority: Array<"forwarded" | "x_forwarded" | null> = [
    "forwarded",
    "x_forwarded",
  ];
  static xForwardedProtoPriority: Array<"proto" | "scheme" | null> = ["proto", "scheme"];

  get acceptEncoding(): Array<[string, number]> {
    return this.parseHttpAcceptHeader(this.env["HTTP_ACCEPT_ENCODING"]);
  }

  get acceptLanguage(): Array<[string, number]> {
    return this.parseHttpAcceptHeader(this.env["HTTP_ACCEPT_LANGUAGE"]);
  }

  getHttpForwarded(token: string): string[] | null {
    return forwardedValues(this.env[HTTP_FORWARDED])?.[token] ?? null;
  }

  get forwardedFor(): string[] | null {
    const priority = (this.constructor as typeof Request).forwardedPriority;
    for (const type of priority) {
      if (type === "forwarded") {
        const fwd = this.getHttpForwarded("for");
        if (fwd) return fwd.map((a) => splitAuthority(a)[1]!);
      } else if (type === "x_forwarded") {
        const value = this.env[HTTP_X_FORWARDED_FOR];
        if (value) return splitHeader(value).map((a) => splitAuthority(wrapIpv6(a))[1]!);
      }
    }
    return null;
  }

  get forwardedPort(): number[] | null {
    const priority = (this.constructor as typeof Request).forwardedPriority;
    for (const type of priority) {
      if (type === "forwarded") {
        const fwd = this.getHttpForwarded("for");
        if (fwd) return fwd.map((a) => splitAuthority(a)[2]).filter((p): p is number => p !== null);
      } else if (type === "x_forwarded") {
        const value = this.env[HTTP_X_FORWARDED_PORT];
        if (value) return splitHeader(value).map((v) => parseInt(v) || 0);
      }
    }
    return null;
  }

  get forwardedAuthority(): string | null {
    const priority = (this.constructor as typeof Request).forwardedPriority;
    for (const type of priority) {
      if (type === "forwarded") {
        const fwd = this.getHttpForwarded("host");
        if (fwd) return fwd[fwd.length - 1];
      } else if (type === "x_forwarded") {
        const value = this.env[HTTP_X_FORWARDED_HOST];
        if (value) {
          const parts = splitHeader(value);
          return parts.length ? wrapIpv6(parts[parts.length - 1]) : null;
        }
      }
    }
    return null;
  }

  get forwardedScheme(): string | null {
    const priority = (this.constructor as typeof Request).forwardedPriority;
    for (const type of priority) {
      if (type === "forwarded") {
        const fwdProto = this.getHttpForwarded("proto");
        if (fwdProto) {
          const scheme = allowedScheme(fwdProto[fwdProto.length - 1]);
          if (scheme) return scheme;
        }
      } else if (type === "x_forwarded") {
        const xPriority = (this.constructor as typeof Request).xForwardedProtoPriority;
        for (const xType of xPriority) {
          if (!xType) continue;
          const header = FORWARDED_SCHEME_HEADERS[xType];
          if (header) {
            const parts = splitHeader(this.env[header]);
            for (let i = parts.length - 1; i >= 0; i--) {
              const scheme = allowedScheme(parts[i]);
              if (scheme) return scheme;
            }
          }
        }
      }
    }
    return null;
  }

  isGet(): boolean {
    return this.requestMethod === GET;
  }
  isPost(): boolean {
    return this.requestMethod === POST;
  }
  isPut(): boolean {
    return this.requestMethod === PUT;
  }
  isPatch(): boolean {
    return this.requestMethod === PATCH;
  }
  isDelete(): boolean {
    return this.requestMethod === DELETE;
  }
  isHead(): boolean {
    return this.requestMethod === HEAD;
  }
  isOptions(): boolean {
    return this.requestMethod === OPTIONS;
  }
  isLink(): boolean {
    return this.requestMethod === LINK;
  }
  isTrace(): boolean {
    return this.requestMethod === TRACE;
  }
  isUnlink(): boolean {
    return this.requestMethod === UNLINK;
  }

  get logger(): any {
    return this.env[RACK_LOGGER] ?? null;
  }

  get contentCharset(): string | null {
    return this.mediaTypeParams["charset"] ?? null;
  }

  get hostname(): string | null {
    return splitAuthority(this.authority)[1];
  }

  get serverName(): string | null {
    return this.env[SERVER_NAME] ?? null;
  }

  fetchHeader(name: string): any;
  fetchHeader(name: string, block: (key: string) => any): any;
  fetchHeader(name: string, block?: (key: string) => any): any {
    if (Object.hasOwn(this.env, name)) return this.env[name];
    if (block) return block(name);
    const err = new Error(`key not found: "${name}"`);
    err.name = "KeyError";
    throw err;
  }

  eachHeader(callback: (key: string, value: any) => void): void {
    this.each(callback);
  }

  get hostAuthority(): string | null {
    return this.env[HTTP_HOST] ?? null;
  }

  isParseableData(): boolean {
    const mt = this.mediaType;
    return mt !== null && PARSEABLE_DATA_MEDIA_TYPES.includes(mt);
  }

  get path(): string {
    return this.scriptName + this.pathInfo;
  }

  valuesAt(...keys: string[]): any[] {
    const p = this.params;
    return keys.map((k) => p[k]);
  }

  /** @internal */
  defaultSession(): Record<string, any> {
    return {};
  }

  /** @internal */
  parseHttpAcceptHeader(header: string | null | undefined): Array<[string, number]> {
    const parts = (header ?? "").split(",");
    const result: Array<[string, number]> = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [attr, params] = trimmed.split(";", 2);
      const attribute = attr.trim();
      let quality = 1.0;
      if (params) {
        const m = params.trim().match(/^q=([\d.]+)/);
        if (m) quality = parseFloat(m[1]);
      }
      result.push([attribute, quality]);
    }
    return result;
  }

  /** @internal */
  queryParser(): QueryParser {
    return getDefaultQueryParser();
  }

  /** @internal */
  parseQuery(qs: string, separator = "&"): Record<string, any> {
    return this.queryParser().parseNestedQuery(qs, separator);
  }

  /** @internal */
  parseMultipart(): Record<string, any> {
    return multipartExtract(this.env) || {};
  }

  /** @internal */
  expandParamPairs(pairs: Array<[string, any]>): Record<string, any> {
    const parser = this.queryParser();
    const params = parser.makeParams();
    for (const [k, v] of pairs) {
      parser.normalizeParams(params, k, v);
    }
    return params.toParamsHash();
  }

  /** @internal */
  rejectTrustedIpAddresses(ipAddresses: string[]): string[] {
    return ipAddresses.filter((ip) => !this.trustedProxy(ip));
  }
}
