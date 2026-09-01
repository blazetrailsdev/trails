import {
  REQUEST_METHOD,
  RACK_METHODOVERRIDE_ORIGINAL_METHOD,
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
  HTTP_X_FORWARDED_SSL,
} from "./constants.js";
import { forwardedValues, getDefaultQueryParser, QueryParser } from "./utils.js";
import { fetch, hasKey } from "@blazetrails/ruby-compat";
import { include } from "@blazetrails/activesupport";
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

function isTrustedProxy(ip: string): boolean {
  if (!ip) return false;
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1|fd|fc)/i.test(ip.trim());
}

/**
 * Mirrors `Rack::Request::Helpers` (`rack/lib/rack/request.rb:149-787`), the
 * module `Rack::Request` and `ActionDispatch::Request` both `include`
 * (`rack/request.rb:790`, `actionpack/lib/action_dispatch/http/request.rb:21`).
 * Modelled as a class module so `include()` carries its accessors.
 */
/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Request::Helpers`; the class/interface merge is how the module's host state surfaces on the type side. */
export interface Helpers {
  /** Supplied by the including class (`Rack::Request::Env#env`). */
  readonly env: Record<string, any>;
  /** Supplied by the including class (`Rack::Request::Env#get_header`). */
  getHeader(name: string): any;
  /** Supplied by the including class (`Rack::Request::Env#set_header`). */
  setHeader(name: string, v: any): any;
  /** Supplied by the including class (`Rack::Request::Env#fetch_header`). */
  fetchHeader(name: string, block?: (key: string) => any): any;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above. */
export abstract class Helpers {
  /** Mirrors `Rack::Request::Helpers#script_name` (`rack/request.rb:191`). */
  get scriptName(): string {
    return this.getHeader(SCRIPT_NAME) || "";
  }
  /** Mirrors `Rack::Request::Helpers#script_name=` (`rack/request.rb:192`). */
  set scriptName(v: string) {
    this.setHeader(SCRIPT_NAME, v);
  }

  /** Mirrors `Rack::Request::Helpers#path_info` (`rack/request.rb:194`). */
  get pathInfo(): string {
    return this.getHeader(PATH_INFO) || "/";
  }
  /** Mirrors `Rack::Request::Helpers#path_info=` (`rack/request.rb:195`). */
  set pathInfo(v: string) {
    this.setHeader(PATH_INFO, v);
  }

  /** Mirrors `Rack::Request::Helpers#request_method` (`rack/request.rb:197`). */
  get requestMethod(): string {
    return this.getHeader(REQUEST_METHOD);
  }

  /** Mirrors `Rack::Request::Helpers#query_string` (`rack/request.rb:198`). */
  get queryString(): string {
    return this.getHeader(QUERY_STRING) || "";
  }

  /** Mirrors `Rack::Request::Helpers#content_length` (`rack/request.rb:199`). */
  get contentLength(): number | null {
    const cl = this.getHeader(CONTENT_LENGTH) || this.getHeader("CONTENT_LENGTH");
    return cl ? parseInt(cl) : null;
  }

  /** Mirrors `Rack::Request::Helpers#logger` (`rack/request.rb:200`). */
  get logger(): any {
    return this.getHeader(RACK_LOGGER) ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#user_agent` (`rack/request.rb:201`). */
  get userAgent(): string | null {
    return this.getHeader("HTTP_USER_AGENT") || null;
  }

  /** Mirrors `Rack::Request::Helpers#referer` (`rack/request.rb:204`). */
  get referer(): string | null {
    return this.getHeader("HTTP_REFERER") ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#referrer` (`rack/request.rb:205`). */
  get referrer(): string | null {
    return this.referer;
  }

  /** Mirrors `Rack::Request::Helpers#session` (`rack/request.rb:207-211`). */
  get session(): Record<string, any> {
    return this.fetchHeader(RACK_SESSION, (k) => this.setHeader(k, this.defaultSession()));
  }

  /** Mirrors `Rack::Request::Helpers#session_options` (`rack/request.rb:213-217`). */
  get sessionOptions(): Record<string, any> {
    return this.fetchHeader(RACK_SESSION_OPTIONS, (k) => this.setHeader(k, {}));
  }

  /** Mirrors `Rack::Request::Helpers#delete?` (`rack/request.rb:220`). */
  isDelete(): boolean {
    return this.requestMethod === DELETE;
  }

  /** Mirrors `Rack::Request::Helpers#get?` (`rack/request.rb:223`). */
  isGet(): boolean {
    return this.requestMethod === GET;
  }

  /** Mirrors `Rack::Request::Helpers#head?` (`rack/request.rb:226`). */
  isHead(): boolean {
    return this.requestMethod === HEAD;
  }

  /** Mirrors `Rack::Request::Helpers#options?` (`rack/request.rb:229`). */
  isOptions(): boolean {
    return this.requestMethod === OPTIONS;
  }

  /** Mirrors `Rack::Request::Helpers#link?` (`rack/request.rb:232`). */
  isLink(): boolean {
    return this.requestMethod === LINK;
  }

  /** Mirrors `Rack::Request::Helpers#patch?` (`rack/request.rb:235`). */
  isPatch(): boolean {
    return this.requestMethod === PATCH;
  }

  /** Mirrors `Rack::Request::Helpers#post?` (`rack/request.rb:238`). */
  isPost(): boolean {
    return this.requestMethod === POST;
  }

  /** Mirrors `Rack::Request::Helpers#put?` (`rack/request.rb:241`). */
  isPut(): boolean {
    return this.requestMethod === PUT;
  }

  /** Mirrors `Rack::Request::Helpers#trace?` (`rack/request.rb:244`). */
  isTrace(): boolean {
    return this.requestMethod === TRACE;
  }

  /** Mirrors `Rack::Request::Helpers#unlink?` (`rack/request.rb:247`). */
  isUnlink(): boolean {
    return this.requestMethod === UNLINK;
  }

  /** Mirrors `Rack::Request::Helpers#scheme` (`rack/request.rb:249-258`). */
  get scheme(): string {
    if (this.getHeader(HTTPS) === "on") {
      return "https";
    } else if (this.getHeader(HTTP_X_FORWARDED_SSL) === "on") {
      return "https";
    } else if (this.forwardedScheme) {
      return this.forwardedScheme;
    } else {
      return this.getHeader(RACK_URL_SCHEME);
    }
  }

  /** Mirrors `Rack::Request::Helpers#authority` (`rack/request.rb:266-268`). */
  get authority(): string {
    const p = this.port;
    if ((this.ssl && p === 443) || (!this.ssl && p === 80)) {
      return this.host;
    }
    return `${this.host}:${p}`;
  }

  /** Mirrors `Rack::Request::Helpers#server_authority` (`rack/request.rb:272-283`). */
  get serverAuthority(): string {
    const p = this.serverPort;
    return `${this.getHeader(SERVER_NAME)}:${p}`;
  }

  /** Mirrors `Rack::Request::Helpers#server_name` (`rack/request.rb:285-287`). */
  get serverName(): string | null {
    return this.getHeader(SERVER_NAME) ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#server_port` (`rack/request.rb:289-291`). */
  get serverPort(): number {
    return parseInt(this.getHeader(SERVER_PORT) || "80");
  }

  /** Mirrors `Rack::Request::Helpers#cookies` (`rack/request.rb:293-306`). */
  get cookies(): Record<string, string> {
    const cookieStr = this.getHeader(HTTP_COOKIE) || "";
    if (
      this.getHeader(RACK_REQUEST_COOKIE_STRING) === cookieStr &&
      this.getHeader(RACK_REQUEST_COOKIE_HASH)
    ) {
      return this.getHeader(RACK_REQUEST_COOKIE_HASH);
    }
    const parsed = parseCookies(cookieStr);
    this.setHeader(RACK_REQUEST_COOKIE_STRING, cookieStr);
    this.setHeader(RACK_REQUEST_COOKIE_HASH, parsed);
    return parsed;
  }

  /** Mirrors `Rack::Request::Helpers#content_type` (`rack/request.rb:308-311`). */
  get contentType(): string | null {
    const ct = this.getHeader(CONTENT_TYPE) || this.getHeader("CONTENT_TYPE");
    if (!ct || ct === "") return null;
    return ct;
  }

  /** Mirrors `Rack::Request::Helpers#xhr?` (`rack/request.rb:313-315`). */
  get xhr(): boolean {
    return (this.getHeader("HTTP_X_REQUESTED_WITH") || "").toLowerCase() === "xmlhttprequest";
  }

  /** Mirrors `Rack::Request::Helpers#host_authority` (`rack/request.rb:318-320`). */
  get hostAuthority(): string | null {
    return this.getHeader(HTTP_HOST) ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#host_with_port` (`rack/request.rb:322-330`). */
  get hostWithPort(): string {
    return this.authority;
  }

  /** Mirrors `Rack::Request::Helpers#host` (`rack/request.rb:333-335`). */
  get host(): string {
    const httpHost = this.getHeader(HTTP_HOST);
    if (httpHost) {
      const [, h] = this.splitAuthority(httpHost);
      return h ?? httpHost;
    }
    return this.getHeader(SERVER_NAME) || "localhost";
  }

  /** Mirrors `Rack::Request::Helpers#hostname` (`rack/request.rb:341-343`). */
  get hostname(): string | null {
    return this.splitAuthority(this.authority)[1];
  }

  /** Mirrors `Rack::Request::Helpers#port` (`rack/request.rb:345-351`). */
  get port(): number {
    const httpHost = this.getHeader(HTTP_HOST);
    if (httpHost) {
      const [, , p] = this.splitAuthority(httpHost);
      if (p !== null) return p;
    }
    const httpPort = this.getHeader(HTTP_PORT);
    if (httpPort) return parseInt(httpPort);
    const serverPort = this.getHeader(SERVER_PORT);
    if (serverPort && serverPort !== "80" && serverPort !== "443") return parseInt(serverPort);
    return this.ssl ? 443 : 80;
  }

  /** Mirrors `Rack::Request::Helpers#forwarded_for` (`rack/request.rb:353-372`). */
  get forwardedFor(): string[] | null {
    for (const type of this.forwardedPriority()) {
      if (type === "forwarded") {
        const forwardedFor = this.getHttpForwarded("for");
        if (forwardedFor)
          return forwardedFor.map((authority) => this.splitAuthority(authority)[1]!);
      } else if (type === "x_forwarded") {
        const value = this.getHeader(HTTP_X_FORWARDED_FOR);
        if (value)
          return this.splitHeader(value).map(
            (authority) => this.splitAuthority(this.wrapIpv6(authority))[1]!,
          );
      }
    }
    return null;
  }

  /** Mirrors `Rack::Request::Helpers#forwarded_port` (`rack/request.rb:374-391`). */
  get forwardedPort(): number[] | null {
    for (const type of this.forwardedPriority()) {
      if (type === "forwarded") {
        const forwarded = this.getHttpForwarded("for");
        if (forwarded)
          return forwarded
            .map((authority) => this.splitAuthority(authority)[2])
            .filter((p): p is number => p !== null);
      } else if (type === "x_forwarded") {
        const value = this.getHeader(HTTP_X_FORWARDED_PORT);
        if (value) return this.splitHeader(value).map((v) => parseInt(v) || 0);
      }
    }
    return null;
  }

  /** Mirrors `Rack::Request::Helpers#forwarded_authority` (`rack/request.rb:393-408`). */
  get forwardedAuthority(): string | null {
    for (const type of this.forwardedPriority()) {
      if (type === "forwarded") {
        const forwarded = this.getHttpForwarded("host");
        if (forwarded) return forwarded[forwarded.length - 1];
      } else if (type === "x_forwarded") {
        const value = this.getHeader(HTTP_X_FORWARDED_HOST);
        if (value) {
          const parts = this.splitHeader(value);
          return parts.length ? this.wrapIpv6(parts[parts.length - 1]) : null;
        }
      }
    }
    return null;
  }

  /** Mirrors `Rack::Request::Helpers#ssl?` (`rack/lib/rack/request.rb:410-412`). */
  get ssl(): boolean {
    return this.scheme === "https" || this.scheme === "wss";
  }

  /** Mirrors `Rack::Request::Helpers#ip` (`rack/request.rb:414-433`). */
  get ip(): string {
    const trustedProxyFn = this.getHeader("rack.request.trusted_proxy");
    const remoteAddr = this.getHeader("REMOTE_ADDR") || "127.0.0.1";

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

    const forwarded = this.getHeader("HTTP_X_FORWARDED_FOR");
    const clientIp = this.getHeader("HTTP_CLIENT_IP");

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

  /** Mirrors `Rack::Request::Helpers#media_type` (`rack/request.rb:441-443`). */
  get mediaType(): string | null {
    return MediaTypeModule.type(this.contentType);
  }

  /** Mirrors `Rack::Request::Helpers#media_type_params` (`rack/request.rb:450-452`). */
  get mediaTypeParams(): Record<string, string> {
    return MediaTypeModule.params(this.contentType);
  }

  /** Mirrors `Rack::Request::Helpers#content_charset` (`rack/request.rb:458-460`). */
  get contentCharset(): string | null {
    return this.mediaTypeParams["charset"] ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#form_data?` (`rack/request.rb:470-475`). */
  get formData(): boolean {
    const type = this.mediaType;
    const meth =
      this.getHeader(RACK_METHODOVERRIDE_ORIGINAL_METHOD) ?? this.getHeader(REQUEST_METHOD);

    return (
      (meth === POST && type === null) || (type !== null && FORM_DATA_MEDIA_TYPES.includes(type))
    );
  }

  /** Mirrors `Rack::Request::Helpers#parseable_data?` (`rack/request.rb:479-481`). */
  isParseableData(): boolean {
    const mt = this.mediaType;
    return mt !== null && PARSEABLE_DATA_MEDIA_TYPES.includes(mt);
  }

  /** Mirrors `Rack::Request::Helpers#GET` (`rack/request.rb:484-497`). */
  get GET(): Record<string, any> {
    const qs = this.queryString;
    if (
      this.getHeader(RACK_REQUEST_QUERY_STRING) === qs &&
      this.getHeader(RACK_REQUEST_QUERY_HASH)
    ) {
      return this.getHeader(RACK_REQUEST_QUERY_HASH);
    }
    const parsed = this.parseQuery(qs, "&");
    this.setHeader(RACK_REQUEST_QUERY_STRING, qs);
    this.setHeader(RACK_REQUEST_QUERY_HASH, parsed);
    return parsed;
  }

  /** Mirrors `Rack::Request::Helpers#POST` (`rack/request.rb:503-551`). */
  get POST(): Record<string, any> {
    if (this.getHeader(RACK_REQUEST_FORM_HASH)) {
      return this.getHeader(RACK_REQUEST_FORM_HASH);
    }

    const input = this.getHeader(RACK_INPUT);
    if (!input) {
      this.setHeader(RACK_REQUEST_FORM_HASH, {});
      return {};
    }

    if (!this.formData && !this.isParseableData()) {
      this.setHeader(RACK_REQUEST_FORM_HASH, {});
      return {};
    }

    const mt = this.mediaType;
    // Multipart data (form-data, related, mixed, etc.)
    if (mt !== null && mt.startsWith("multipart/")) {
      const parsed = this.parseMultipart();
      this.setHeader(RACK_REQUEST_FORM_HASH, parsed);
      this.setHeader(RACK_REQUEST_FORM_INPUT, input);
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
    this.setHeader(RACK_REQUEST_FORM_HASH, parsed);
    this.setHeader(RACK_REQUEST_FORM_VARS, body);
    this.setHeader(RACK_REQUEST_FORM_INPUT, input);
    return parsed;
  }

  /** Mirrors `Rack::Request::Helpers#params` (`rack/request.rb:556-558`). */
  get params(): Record<string, any> {
    return { ...this.GET, ...this.POST };
  }

  /** Mirrors `Rack::Request::Helpers#update_param` (`rack/request.rb:565-578`). */
  updateParam(k: string, v: any): void {
    const get = this.GET;
    const post = this.POST;
    if (k in post) {
      post[k] = v;
    } else {
      get[k] = v;
    }
  }

  /** Mirrors `Rack::Request::Helpers#delete_param` (`rack/request.rb:585-588`). */
  deleteParam(k: string): any {
    const post = this.POST;
    if (k in post) {
      const val = post[k];
      delete post[k];
      return val;
    }
    const get = this.GET;
    if (k in get) {
      const val = get[k];
      delete get[k];
      return val;
    }
    return undefined;
  }

  /** Mirrors `Rack::Request::Helpers#base_url` (`rack/request.rb:590-592`). */
  get baseUrl(): string {
    return `${this.scheme}://${this.authority}${this.scriptName}`;
  }

  /** Mirrors `Rack::Request::Helpers#url` (`rack/request.rb:595-597`). */
  get url(): string {
    const qs = this.queryString;
    return `${this.baseUrl}${this.pathInfo}${qs ? "?" + qs : ""}`;
  }

  /** Mirrors `Rack::Request::Helpers#path` (`rack/request.rb:599-601`). */
  get path(): string {
    return this.scriptName + this.pathInfo;
  }

  /** Mirrors `Rack::Request::Helpers#fullpath` (`rack/request.rb:603-605`). */
  get fullpath(): string {
    const qs = this.queryString;
    return `${this.scriptName}${this.pathInfo}${qs ? "?" + qs : ""}`;
  }

  /** Mirrors `Rack::Request::Helpers#accept_encoding` (`rack/request.rb:607-609`). */
  get acceptEncoding(): Array<[string, number]> {
    return this.parseHttpAcceptHeader(this.getHeader("HTTP_ACCEPT_ENCODING"));
  }

  /** Mirrors `Rack::Request::Helpers#accept_language` (`rack/request.rb:611-613`). */
  get acceptLanguage(): Array<[string, number]> {
    return this.parseHttpAcceptHeader(this.getHeader("HTTP_ACCEPT_LANGUAGE"));
  }

  /** Mirrors `Rack::Request::Helpers#trusted_proxy?` (`rack/request.rb:615-617`). */
  trustedProxy(ip: string): boolean {
    const trustedProxyFn = this.getHeader("rack.request.trusted_proxy");
    if (trustedProxyFn === true) return true;
    if (trustedProxyFn === false) return false;
    if (typeof trustedProxyFn === "function") return trustedProxyFn(ip);
    return isTrustedProxy(ip);
  }

  /** Mirrors `Rack::Request::Helpers#values_at` (`rack/request.rb:620-624`). */
  valuesAt(...keys: string[]): any[] {
    const p = this.params;
    return keys.map((k) => p[k]);
  }

  /**
   * Mirrors `Rack::Request::Helpers#default_session` (`rack/request.rb:628`).
   * @internal
   */
  defaultSession(): Record<string, any> {
    return {};
  }

  /**
   * Mirrors `Rack::Request::Helpers#wrap_ipv6` (`rack/request.rb:631-642`).
   * @internal
   */
  wrapIpv6(host: string): string {
    if (host && !host.startsWith("[") && host.split(":").length - 1 > 1) {
      return `[${host}]`;
    }
    return host;
  }

  /**
   * Mirrors `Rack::Request::Helpers#parse_http_accept_header`
   * (`rack/request.rb:644-665`).
   * @internal
   */
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

  /**
   * Mirrors `Rack::Request::Helpers#get_http_forwarded`
   * (`rack/lib/rack/request.rb:668-670`).
   * @internal
   */
  getHttpForwarded(token: string): string[] | null {
    return forwardedValues(this.getHeader(HTTP_FORWARDED))?.[token] ?? null;
  }

  /**
   * Mirrors `Rack::Request::Helpers#query_parser` (`rack/request.rb:672-674`).
   * @internal
   */
  queryParser(): QueryParser {
    return getDefaultQueryParser();
  }

  /**
   * Mirrors `Rack::Request::Helpers#parse_query` (`rack/request.rb:676-678`).
   * @internal
   */
  parseQuery(qs: string, d = "&"): Record<string, any> {
    return this.queryParser().parseNestedQuery(qs, d);
  }

  /**
   * Mirrors `Rack::Request::Helpers#parse_multipart` (`rack/request.rb:680-682`).
   * @internal
   */
  parseMultipart(): Record<string, any> {
    return multipartExtract(this.env) || {};
  }

  /**
   * Mirrors `Rack::Request::Helpers#expand_param_pairs`
   * (`rack/request.rb:684-692`).
   * @internal
   */
  expandParamPairs(pairs: Array<[string, any]>): Record<string, any> {
    const parser = this.queryParser();
    const params = parser.makeParams();
    for (const [k, v] of pairs) {
      parser.normalizeParams(params, k, v);
    }
    return params.toParamsHash();
  }

  /**
   * Mirrors `Rack::Request::Helpers#split_header` (`rack/request.rb:694-696`).
   * @internal
   */
  splitHeader(value: string | null | undefined): string[] {
    if (!value) return [];
    return value
      .trim()
      .split(/[,\s]+/)
      .filter(Boolean);
  }

  /**
   * Mirrors `Rack::Request::Helpers#split_authority` (`rack/request.rb:737-741`)
   * over the `AUTHORITY` pattern (`rack/request.rb:722-733`).
   * @internal
   */
  splitAuthority(
    authority: string | null | undefined,
  ): [string | null, string | null, number | null] {
    if (!authority) return [null, null, null];
    const ipv6Match = authority.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (ipv6Match) {
      const address = ipv6Match[1];
      const port = ipv6Match[2] ? parseInt(ipv6Match[2]) : null;
      return [`[${address}]`, address, port];
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

  /**
   * Mirrors `Rack::Request::Helpers#reject_trusted_ip_addresses`
   * (`rack/request.rb:743-745`).
   * @internal
   */
  rejectTrustedIpAddresses(ipAddresses: string[]): string[] {
    return ipAddresses.filter((ip) => !this.trustedProxy(ip));
  }

  /**
   * Mirrors `Rack::Request::Helpers#forwarded_scheme`
   * (`rack/lib/rack/request.rb:752-774`).
   * @internal
   */
  get forwardedScheme(): string | null {
    for (const type of this.forwardedPriority()) {
      if (type === "forwarded") {
        const forwardedProto = this.getHttpForwarded("proto");
        if (forwardedProto) {
          const scheme = this.allowedScheme(forwardedProto[forwardedProto.length - 1]);
          if (scheme) return scheme;
        }
      } else if (type === "x_forwarded") {
        for (const xType of this.xForwardedProtoPriority()) {
          const header = xType == null ? undefined : FORWARDED_SCHEME_HEADERS[xType];
          if (header) {
            const parts = this.splitHeader(this.getHeader(header));
            for (let i = parts.length - 1; i >= 0; i--) {
              const scheme = this.allowedScheme(parts[i]);
              if (scheme) return scheme;
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Mirrors `Rack::Request::Helpers#allowed_scheme` (`rack/request.rb:776-778`).
   * @internal
   */
  allowedScheme(header: string | null | undefined): string | null {
    if (!header) return null;
    return (ALLOWED_SCHEMES as readonly string[]).includes(header) ? header : null;
  }

  /**
   * Mirrors `Rack::Request::Helpers#forwarded_priority`
   * (`rack/lib/rack/request.rb:780-782`).
   * @internal
   */
  forwardedPriority(): Array<"forwarded" | "x_forwarded" | null> {
    return Request.forwardedPriority;
  }

  /**
   * Mirrors `Rack::Request::Helpers#x_forwarded_proto_priority`
   * (`rack/lib/rack/request.rb:784-786`).
   * @internal
   */
  xForwardedProtoPriority(): Array<"proto" | "scheme" | null> {
    return Request.xForwardedProtoPriority;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/request.rb:790`); the class/interface merge is how a mixin surfaces on the type side. */
export class Request {
  env: Record<string, any>;

  static ipFilter: ((ip: string) => boolean) | null = null;
  static forwardedPriority: Array<"forwarded" | "x_forwarded" | null> = [
    "forwarded",
    "x_forwarded",
  ];
  static xForwardedProtoPriority: Array<"proto" | "scheme" | null> = ["proto", "scheme"];

  constructor(env: Record<string, any>) {
    this.env = env;
  }

  dup(): Request {
    return new (this.constructor as typeof Request)({ ...this.env });
  }

  has(key: string): boolean {
    return key in this.env;
  }

  /** Mirrors: `Rack::Request::Env#get_header` (`rack/request.rb:100-102`). */
  getHeader(name: string): any {
    return this.env[name];
  }

  get(key: string, defaultValue?: any): any {
    if (key in this.env) return this.env[key];
    if (typeof defaultValue === "function") return defaultValue();
    return defaultValue;
  }

  set(key: string, value: any): void {
    this.env[key] = value;
  }

  addHeader(key: string, v: string): void {
    const existing = this.env[key];
    if (existing) {
      this.env[key] = existing + "," + v;
    } else {
      this.env[key] = v;
    }
  }

  deleteHeader(name: string): any {
    const val = this.env[name];
    delete this.env[name];
    return val;
  }

  each(callback: (key: string, value: any) => void): void {
    for (const [k, v] of Object.entries(this.env)) {
      callback(k, v);
    }
  }

  /**
   * Mirrors: `Rack::Request::Env#fetch_header` (`rack/request.rb:106-108`) —
   * `@env.fetch(name, &block)`. Ruby's block arm of `Hash#fetch` is not ported
   * in `@blazetrails/ruby-compat`, so the miss-with-block case is answered
   * ahead of the delegation rather than through it.
   */
  fetchHeader(name: string): any;
  fetchHeader(name: string, block: (key: string) => any): any;
  fetchHeader(name: string, block?: (key: string) => any): any {
    if (block !== undefined && !hasKey(this.env, name)) return block(name);
    return fetch(this.env, name);
  }

  /** Mirrors: `Rack::Request::Env#set_header` (`rack/request.rb:116-118`). */
  setHeader(name: string, v: any): any {
    return (this.env[name] = v);
  }

  /** Mirrors: `Rack::Request::Env#each_header` (`rack/request.rb:111-113`). */
  eachHeader(callback: (key: string, value: any) => void): void {
    this.each(callback);
  }

  get serverProtocol(): string {
    return this.env[SERVER_PROTOCOL];
  }

  get prefetch(): boolean {
    const purpose = (this.env["HTTP_X_MOZ"] || "").toLowerCase();
    const secPurpose = (this.env["HTTP_SEC_PURPOSE"] || "").toLowerCase();
    const purpose2 = (this.env["HTTP_PURPOSE"] || "").toLowerCase();
    return purpose === "prefetch" || secPurpose === "prefetch" || purpose2 === "prefetch";
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
}

include(Request, Helpers);
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/request.rb:790`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Request extends Omit<Helpers, "env" | "getHeader" | "setHeader" | "fetchHeader"> {}
