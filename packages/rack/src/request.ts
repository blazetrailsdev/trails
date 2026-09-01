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
  HTTPS,
  HTTP_COOKIE,
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
  RACK_REQUEST_FORM_ERROR,
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
import {
  forwardedValues,
  getDefaultQueryParser,
  parseCookiesHeader,
  QueryParser,
  unescape,
} from "./utils.js";
import { fetch, hasKey } from "@blazetrails/ruby-compat";
import { include } from "@blazetrails/activesupport";
import * as MediaTypeModule from "./media-type.js";
import { parseMultipart as multipartExtract, ParamList } from "./multipart.js";

// ipv6 extracted from resolv stdlib, simplified
// to remove numbered match group creation.
// Mirrors the `ipv6` union at `rack/request.rb:700-720`.
const ipv6 = [
  /(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}/,
  /(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?::(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?/,
  /(?:[0-9A-Fa-f]{1,4}:){6,6}\d+\.\d+\.\d+\.\d+/,
  /(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?::(?:[0-9A-Fa-f]{1,4}:)*\d+\.\d+\.\d+\.\d+/,
  /[Ff][Ee]80(?::[0-9A-Fa-f]{1,4}){7}%[-0-9A-Za-z._~]+/,
  /[Ff][Ee]80:(?:(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?::(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?|:(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?)?:[0-9A-Fa-f]{1,4}%[-0-9A-Za-z._~]+/,
]
  .map((r) => r.source)
  .join("|");

/**
 * Mirrors the private `AUTHORITY` constant (`rack/request.rb:722-735`). Ruby's
 * `[[:graph:]&&[^\[\]]]` is a printable non-space character that is not a
 * square bracket.
 */
const AUTHORITY = new RegExp(
  "^(?<host>" +
    // Match IPv6 as a string of hex digits and colons in square brackets
    "\\[(?<address>" +
    ipv6 +
    ")\\]" +
    "|" +
    // Match any other printable string (except square brackets) as a hostname
    "(?<address>[^\\[\\]\\s\\x00-\\x20\\x7f]*?)" +
    ")" +
    "(:(?<port>\\d+))?$",
);

const FORM_DATA_MEDIA_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"];
const PARSEABLE_DATA_MEDIA_TYPES = ["multipart/related", "multipart/mixed"];

/**
 * Default ports depending on scheme. Used to decide whether or not to include
 * the port in a generated URI. Mirrors
 * `Rack::Request::Helpers::DEFAULT_PORTS` (`rack/request.rb:168`).
 */
const DEFAULT_PORTS: Record<string, number | undefined> = { http: 80, https: 443, coffee: 80 };

const ALLOWED_SCHEMES = ["https", "http", "wss", "ws"] as const;
const FORWARDED_SCHEME_HEADERS: Record<string, string> = {
  proto: HTTP_X_FORWARDED_PROTO,
  scheme: HTTP_X_FORWARDED_SCHEME,
};

const validIpv4Octet = "\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9]?[0-9])";

/** Mirrors the `trusted_proxies` union at `rack/request.rb:48-57`. */
const trustedProxies = new RegExp(
  [
    `^127(?:${validIpv4Octet}){3}$`,
    "^::1$",
    "^f[cd][0-9a-f]{2}(?::[0-9a-f]{0,4}){0,7}$",
    `^10(?:${validIpv4Octet}){3}$`,
    `^172\\.(1[6-9]|2[0-9]|3[01])(?:${validIpv4Octet}){2}$`,
    `^192\\.168(?:${validIpv4Octet}){2}$`,
    "^localhost$|^unix($|:)",
  ].join("|"),
  "i",
);

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
  /** Mirrors `Rack::Request::Helpers#body` (`rack/request.rb:190`). */
  get body(): any {
    return this.getHeader(RACK_INPUT);
  }

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
    return this.getHeader(PATH_INFO) ?? "";
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
    return this.getHeader(QUERY_STRING) ?? "";
  }

  /** Mirrors `Rack::Request::Helpers#content_length` (`rack/request.rb:199`). */
  get contentLength(): string | null {
    return this.getHeader("CONTENT_LENGTH") ?? null;
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
  get authority(): string | null {
    return this.forwardedAuthority ?? this.hostAuthority ?? this.serverAuthority;
  }

  /** Mirrors `Rack::Request::Helpers#server_authority` (`rack/request.rb:272-283`). */
  get serverAuthority(): string | null {
    const host = this.serverName;
    const port = this.serverPort;

    if (host != null) {
      if (port != null) {
        return `${host}:${port}`;
      } else {
        return host;
      }
    }
    return null;
  }

  /** Mirrors `Rack::Request::Helpers#server_name` (`rack/request.rb:285-287`). */
  get serverName(): string | null {
    return this.getHeader(SERVER_NAME) ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#server_port` (`rack/request.rb:289-291`). */
  get serverPort(): string | null {
    return this.getHeader(SERVER_PORT) ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#cookies` (`rack/request.rb:293-306`). */
  get cookies(): Record<string, string> {
    const hash: Record<string, string> = this.fetchHeader(RACK_REQUEST_COOKIE_HASH, (key) =>
      this.setHeader(key, {}),
    );

    const string = this.getHeader(HTTP_COOKIE);

    if (string !== this.getHeader(RACK_REQUEST_COOKIE_STRING)) {
      for (const key of Object.keys(hash)) delete hash[key];
      Object.assign(hash, parseCookiesHeader(string));
      this.setHeader(RACK_REQUEST_COOKIE_STRING, string);
    }

    return hash;
  }

  /** Mirrors `Rack::Request::Helpers#content_type` (`rack/request.rb:308-311`). */
  get contentType(): string | null {
    const contentType = this.getHeader("CONTENT_TYPE");
    return contentType == null || contentType === "" ? null : contentType;
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
  hostWithPort(authority: string | null = this.authority): string | null {
    const [host, , port] = this.splitAuthority(authority);

    if (port === (DEFAULT_PORTS[this.scheme] ?? null)) {
      return host ?? null;
    } else {
      return authority;
    }
  }

  /** Mirrors `Rack::Request::Helpers#host` (`rack/request.rb:333-335`). */
  get host(): string | null {
    return this.splitAuthority(this.authority)[0] ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#hostname` (`rack/request.rb:341-343`). */
  get hostname(): string | null {
    return this.splitAuthority(this.authority)[1] ?? null;
  }

  /** Mirrors `Rack::Request::Helpers#port` (`rack/request.rb:345-351`). */
  get port(): number | string | null {
    let port: number | null | undefined = null;
    const authority = this.authority;
    if (authority != null) {
      [, , port] = this.splitAuthority(authority);
    }

    return port ?? this.forwardedPort?.at(-1) ?? DEFAULT_PORTS[this.scheme] ?? this.serverPort;
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
  get ip(): string | null {
    const remoteAddresses = this.splitHeader(this.getHeader("REMOTE_ADDR"));
    const externalAddresses = this.rejectTrustedIpAddresses(remoteAddresses);

    if (externalAddresses.length !== 0) {
      return externalAddresses[externalAddresses.length - 1];
    }

    const forwardedFor = this.forwardedFor;
    if (forwardedFor && forwardedFor.length !== 0) {
      const external = this.rejectTrustedIpAddresses(forwardedFor);
      return external[external.length - 1] ?? forwardedFor[0];
    }

    return remoteAddresses[0] ?? null;
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

  /**
   * Returns the data received in the query string.
   *
   * Mirrors `Rack::Request::Helpers#GET` (`rack/request.rb:484-497`).
   */
  get GET(): Record<string, any> {
    const rrQueryString = this.getHeader(RACK_REQUEST_QUERY_STRING);
    const queryString = this.queryString;
    if (rrQueryString === queryString) {
      return this.getHeader(RACK_REQUEST_QUERY_HASH);
    } else {
      if (rrQueryString != null) {
        console.warn(
          "query string used for GET parsing different from current query string. Starting in Rack 3.2, Rack will used the cached GET value instead of parsing the current query string.",
        );
      }
      const queryHash = this.parseQuery(queryString, "&");
      this.setHeader(RACK_REQUEST_QUERY_STRING, queryString);
      this.setHeader(RACK_REQUEST_QUERY_HASH, queryHash);
      return queryHash;
    }
  }

  /**
   * Returns the data received in the request body.
   *
   * This method support both application/x-www-form-urlencoded and
   * multipart/form-data.
   *
   * Mirrors `Rack::Request::Helpers#POST` (`rack/request.rb:503-551`).
   */
  get POST(): Record<string, any> {
    const error = this.getHeader(RACK_REQUEST_FORM_ERROR);
    if (error) {
      throw error;
    }

    try {
      const rackInput = this.getHeader(RACK_INPUT);

      // If the form hash was already memoized:
      const formHash = this.getHeader(RACK_REQUEST_FORM_HASH);
      if (formHash) {
        const formInput = this.getHeader(RACK_REQUEST_FORM_INPUT);
        // And it was memoized from the same input:
        if (formInput === rackInput) {
          return formHash;
        } else if (formInput) {
          console.warn(
            "input stream used for POST parsing different from current input stream. Starting in Rack 3.2, Rack will used the cached POST value instead of parsing the current input stream.",
          );
        }
      }

      // Otherwise, figure out how to parse the input:
      if (rackInput == null) {
        this.setHeader(RACK_REQUEST_FORM_INPUT, null);
        this.setHeader(RACK_REQUEST_FORM_HASH, {});
      } else if (this.formData || this.isParseableData()) {
        const pairs = multipartExtract(this.env, ParamList);
        if (pairs) {
          this.setHeader(RACK_REQUEST_FORM_PAIRS, pairs);
          this.setHeader(RACK_REQUEST_FORM_HASH, this.expandParamPairs(pairs));
        } else {
          let formVars: string = this.getHeader(RACK_INPUT).read();

          // Fix for Safari Ajax postings that always append \0
          if (formVars.endsWith("\0")) formVars = formVars.slice(0, -1);

          this.setHeader(RACK_REQUEST_FORM_VARS, formVars);
          this.setHeader(RACK_REQUEST_FORM_HASH, this.parseQuery(formVars, "&"));
        }

        this.setHeader(RACK_REQUEST_FORM_INPUT, this.getHeader(RACK_INPUT));
        return this.getHeader(RACK_REQUEST_FORM_HASH);
      } else {
        this.setHeader(RACK_REQUEST_FORM_INPUT, this.getHeader(RACK_INPUT));
        this.setHeader(RACK_REQUEST_FORM_HASH, {});
      }

      return this.getHeader(RACK_REQUEST_FORM_HASH);
    } catch (error) {
      this.setHeader(RACK_REQUEST_FORM_ERROR, error);
      throw error;
    }
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
    return `${this.scheme}://${this.hostWithPort()}`;
  }

  /** Mirrors `Rack::Request::Helpers#url` (`rack/request.rb:595-597`). */
  get url(): string {
    return this.baseUrl + this.fullpath;
  }

  /** Mirrors `Rack::Request::Helpers#path` (`rack/request.rb:599-601`). */
  get path(): string {
    return this.scriptName + this.pathInfo;
  }

  /** Mirrors `Rack::Request::Helpers#fullpath` (`rack/request.rb:603-605`). */
  get fullpath(): string {
    return this.queryString === "" ? this.path : `${this.path}?${this.queryString}`;
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
    return Request.ipFilter(ip);
  }

  /** Mirrors `Rack::Request::Helpers#values_at` (`rack/request.rb:620-624`). */
  valuesAt(...keys: string[]): any[] {
    console.warn(
      "Request#values_at is deprecated and will be removed in a future version of Rack. Please use request.params.values_at instead",
    );

    return keys.map((key) => this.params[key]);
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
    return value ? value.trim().split(/[,\s]+/) : [];
  }

  /**
   * Mirrors `Rack::Request::Helpers#split_authority` (`rack/request.rb:737-741`)
   * over the `AUTHORITY` pattern (`rack/request.rb:722-733`).
   * @internal
   */
  splitAuthority(authority: string | null | undefined): [string?, string?, (number | null)?] {
    if (authority == null) return [];
    const match = AUTHORITY.exec(authority);
    if (!match) return [];
    const port = match.groups!.port;
    return [match.groups!.host, match.groups!.address, port != null ? parseInt(port, 10) : null];
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

  static ipFilter: (ip: string) => boolean = (ip: string) => trustedProxies.test(ip);
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

  /**
   * The flat `[key, value]` pair list `POST` seats under
   * `rack.request.form_pairs` (`rack/request.rb:528`), or the pairs of the
   * urlencoded body it seated under `rack.request.form_vars` (`:537`).
   * @noRailsEquivalent CONVERGEABLE port-rack-request-form-pairs
   */
  get formPairs(): [string, any][] {
    void this.POST;

    const pairs = this.getHeader(RACK_REQUEST_FORM_PAIRS);
    if (pairs) return pairs;

    const formVars = this.getHeader(RACK_REQUEST_FORM_VARS);
    if (formVars == null) return [];

    return formVars
      .split("&")
      .filter((part: string) => part !== "")
      .map((part: string): [string, string] => {
        const eq = part.indexOf("=");
        return eq === -1
          ? [unescape(part), ""]
          : [unescape(part.slice(0, eq)), unescape(part.slice(eq + 1))];
      });
  }
}

include(Request, Helpers);
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/request.rb:790`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Request extends Omit<Helpers, "env" | "getHeader" | "setHeader" | "fetchHeader"> {}
