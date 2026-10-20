import {
  REQUEST_METHOD,
  RACK_METHODOVERRIDE_ORIGINAL_METHOD,
  SERVER_NAME,
  SERVER_PORT,
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
} from "./constants.js";
import {
  forwardedValues,
  defaultQueryParser,
  parseCookiesHeader,
  QueryParser,
  unescape,
} from "./utils.js";
import {
  block as rbBlock,
  fetch,
  hashDelete,
  include,
  rbObjDup,
  warn,
} from "@blazetrails/ruby-compat";
import { MediaType } from "./media-type.js";
import * as Multipart from "./multipart.js";

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

const AUTHORITY = new RegExp(
  "^(?<host>" +
    "\\[(?<address>" +
    ipv6 +
    ")\\]" +
    "|" +
    "(?<address>[^\\p{Cc}\\p{Cn}\\p{Cs}\\p{White_Space}\\[\\]]*?)" +
    ")" +
    "(:(?<port>\\d+))?$",
  "u",
);

const FORM_DATA_MEDIA_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"];
const PARSEABLE_DATA_MEDIA_TYPES = ["multipart/related", "multipart/mixed"];

export const DEFAULT_PORTS: Record<string, number | undefined> = {
  http: 80,
  https: 443,
  coffee: 80,
};

export const HTTP_X_FORWARDED_FOR = "HTTP_X_FORWARDED_FOR";

export const HTTP_X_FORWARDED_HOST = "HTTP_X_FORWARDED_HOST";

export const HTTP_FORWARDED = "HTTP_FORWARDED";

export const HTTP_X_FORWARDED_SCHEME = "HTTP_X_FORWARDED_SCHEME";

export const HTTP_X_FORWARDED_PROTO = "HTTP_X_FORWARDED_PROTO";

export const HTTP_X_FORWARDED_PORT = "HTTP_X_FORWARDED_PORT";

export const HTTP_X_FORWARDED_SSL = "HTTP_X_FORWARDED_SSL";

const ALLOWED_SCHEMES = ["https", "http", "wss", "ws"] as const;
const FORWARDED_SCHEME_HEADERS: Record<string, string> = {
  proto: HTTP_X_FORWARDED_PROTO,
  scheme: HTTP_X_FORWARDED_SCHEME,
};

const validIpv4Octet = "\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9]?[0-9])";

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

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `module Env` (`rack/request.rb:82`); the class/interface merge is how the module's host state surfaces on the type side. */
export interface Env {
  env: Record<string, any>;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above. */
export abstract class Env {
  hasHeader(name: string): boolean {
    return Object.hasOwn(this.env, name);
  }

  getHeader(name: string): any {
    return this.env[name];
  }

  fetchHeader(name: string): any;
  fetchHeader(name: string, block: (key: string) => any): any;
  fetchHeader(name: string, block?: (key: string) => any): any {
    return block === undefined ? fetch(this.env, name) : fetch(this.env, name, rbBlock(block));
  }

  eachHeader(callback: (key: string, value: any) => void): void {
    for (const [k, v] of Object.entries(this.env)) callback(k, v);
  }

  setHeader(name: string, v: any): any {
    return (this.env[name] = v);
  }

  addHeader(key: string, v: string | null): any {
    if (v == null) {
      return this.getHeader(key);
    } else if (this.hasHeader(key)) {
      return this.setHeader(key, `${this.getHeader(key)},${v}`);
    } else {
      return this.setHeader(key, v);
    }
  }

  deleteHeader(name: string): any {
    return hashDelete(this.env, name);
  }

  initializeCopy(other: Env): Record<string, any> {
    return (this.env = rbObjDup(other.env));
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Request::Helpers`; the class/interface merge is how the module's host state surfaces on the type side. */
export interface Helpers {
  readonly env: Record<string, any>;
  getHeader(name: string): any;
  setHeader(name: string, v: any): any;
  fetchHeader(name: string, block?: (key: string) => any): any;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above. */
export abstract class Helpers {
  get body(): any {
    return this.getHeader(RACK_INPUT) ?? null;
  }

  get scriptName(): string {
    return this.getHeader(SCRIPT_NAME) || "";
  }
  set scriptName(v: string) {
    this.setHeader(SCRIPT_NAME, v);
  }

  get pathInfo(): string {
    return this.getHeader(PATH_INFO) ?? "";
  }
  set pathInfo(v: string) {
    this.setHeader(PATH_INFO, v);
  }

  get requestMethod(): string {
    return this.getHeader(REQUEST_METHOD);
  }

  get queryString(): string {
    return this.getHeader(QUERY_STRING) ?? "";
  }

  get contentLength(): string | null {
    return this.getHeader("CONTENT_LENGTH") ?? null;
  }

  get logger(): any {
    return this.getHeader(RACK_LOGGER) ?? null;
  }

  get userAgent(): string | null {
    return this.getHeader("HTTP_USER_AGENT") || null;
  }

  get referer(): string | null {
    return this.getHeader("HTTP_REFERER") ?? null;
  }

  get referrer(): string | null {
    return this.referer;
  }

  get session(): Record<string, any> {
    return this.fetchHeader(RACK_SESSION, (_k) =>
      this.setHeader(RACK_SESSION, this.defaultSession()),
    );
  }

  get sessionOptions(): Record<string, any> {
    return this.fetchHeader(RACK_SESSION_OPTIONS, (k) => this.setHeader(k, {}));
  }

  isDelete(): boolean {
    return this.requestMethod === DELETE;
  }

  isGet(): boolean {
    return this.requestMethod === GET;
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

  isPatch(): boolean {
    return this.requestMethod === PATCH;
  }

  isPost(): boolean {
    return this.requestMethod === POST;
  }

  isPut(): boolean {
    return this.requestMethod === PUT;
  }

  isTrace(): boolean {
    return this.requestMethod === TRACE;
  }

  isUnlink(): boolean {
    return this.requestMethod === UNLINK;
  }

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

  get authority(): string | null {
    return this.forwardedAuthority ?? this.hostAuthority ?? this.serverAuthority;
  }

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

  get serverName(): string | null {
    return this.getHeader(SERVER_NAME) ?? null;
  }

  get serverPort(): string | null {
    return this.getHeader(SERVER_PORT) ?? null;
  }

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

  get contentType(): string | null {
    const contentType = this.getHeader("CONTENT_TYPE");
    return contentType == null || contentType === "" ? null : contentType;
  }

  get xhr(): boolean {
    return (this.getHeader("HTTP_X_REQUESTED_WITH") || "").toLowerCase() === "xmlhttprequest";
  }

  get hostAuthority(): string | null {
    return this.getHeader(HTTP_HOST) ?? null;
  }

  hostWithPort(authority: string | null = this.authority): string | null {
    const [host, , port] = this.splitAuthority(authority);

    if ((port ?? null) === (DEFAULT_PORTS[this.scheme] ?? null)) {
      return host ?? null;
    } else {
      return authority;
    }
  }

  get host(): string | null {
    return this.splitAuthority(this.authority)[0] ?? null;
  }

  get hostname(): string | null {
    return this.splitAuthority(this.authority)[1] ?? null;
  }

  get port(): number | string | null {
    let port: number | null | undefined = null;
    const authority = this.authority;
    if (authority != null) {
      [, , port] = this.splitAuthority(authority);
    }

    return port ?? this.forwardedPort?.at(-1) ?? DEFAULT_PORTS[this.scheme] ?? this.serverPort;
  }

  get forwardedFor(): Array<string | undefined> | null {
    for (const type of this.forwardedPriority()) {
      if (type === "forwarded") {
        const forwardedFor: Array<string | undefined> | null = this.getHttpForwarded("for");
        if (forwardedFor) {
          for (const [i, authority] of forwardedFor.entries()) {
            forwardedFor[i] = this.splitAuthority(authority)[1];
          }
          return forwardedFor;
        }
      } else if (type === "x_forwarded") {
        const value = this.getHeader(HTTP_X_FORWARDED_FOR);
        if (value)
          return this.splitHeader(value).map(
            (authority) => this.splitAuthority(this.wrapIpv6(authority))[1],
          );
      }
    }
    return null;
  }

  get forwardedPort(): number[] | null {
    for (const type of this.forwardedPriority()) {
      if (type === "forwarded") {
        const forwarded = this.getHttpForwarded("for");
        if (forwarded)
          return forwarded
            .map((authority) => this.splitAuthority(authority)[2])
            .filter((p): p is number => p != null);
      } else if (type === "x_forwarded") {
        const value = this.getHeader(HTTP_X_FORWARDED_PORT);
        if (value) return this.splitHeader(value).map((v) => parseInt(v) || 0);
      }
    }
    return null;
  }

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

  get ssl(): boolean {
    return this.scheme === "https" || this.scheme === "wss";
  }

  get ip(): string | null {
    const remoteAddresses = this.splitHeader(this.getHeader("REMOTE_ADDR"));
    const externalAddresses = this.rejectTrustedIpAddresses(remoteAddresses);

    if (externalAddresses.length !== 0) {
      return externalAddresses[externalAddresses.length - 1];
    }

    const forwardedFor = this.forwardedFor;
    if (forwardedFor && forwardedFor.length !== 0) {
      const external = this.rejectTrustedIpAddresses(forwardedFor);
      return external[external.length - 1] ?? forwardedFor[0] ?? null;
    }

    return remoteAddresses[0] ?? null;
  }

  get mediaType(): string | null {
    return MediaType.type(this.contentType);
  }

  get mediaTypeParams(): Record<string, string> {
    return MediaType.params(this.contentType);
  }

  get contentCharset(): string | null {
    return this.mediaTypeParams["charset"] ?? null;
  }

  get formData(): boolean {
    const type = this.mediaType;
    const meth =
      this.getHeader(RACK_METHODOVERRIDE_ORIGINAL_METHOD) ?? this.getHeader(REQUEST_METHOD);

    return (
      (meth === POST && type === null) || (type !== null && FORM_DATA_MEDIA_TYPES.includes(type))
    );
  }

  isParseableData(): boolean {
    const mt = this.mediaType;
    return mt !== null && PARSEABLE_DATA_MEDIA_TYPES.includes(mt);
  }

  get GET(): Record<string, any> {
    const rrQueryString = this.getHeader(RACK_REQUEST_QUERY_STRING);
    const queryString = this.queryString;
    if (rrQueryString === queryString) {
      return this.getHeader(RACK_REQUEST_QUERY_HASH);
    } else {
      if (rrQueryString != null) {
        warn(
          "query string used for GET parsing different from current query string. Starting in Rack 3.2, Rack will used the cached GET value instead of parsing the current query string.",
          { uplevel: 1 },
        );
      }
      const queryHash = this.parseQuery(queryString, "&");
      this.setHeader(RACK_REQUEST_QUERY_STRING, queryString);
      this.setHeader(RACK_REQUEST_QUERY_HASH, queryHash);
      return queryHash;
    }
  }

  get POST(): Record<string, any> {
    const error = this.getHeader(RACK_REQUEST_FORM_ERROR);
    if (error) {
      throw new (error.constructor as ErrorConstructor)(error.message, { cause: error.cause });
    }

    try {
      const rackInput = this.getHeader(RACK_INPUT);

      const formHash = this.getHeader(RACK_REQUEST_FORM_HASH);
      if (formHash) {
        const formInput = this.getHeader(RACK_REQUEST_FORM_INPUT);
        if (formInput === rackInput) {
          return formHash;
        } else if (formInput) {
          warn(
            "input stream used for POST parsing different from current input stream. Starting in Rack 3.2, Rack will used the cached POST value instead of parsing the current input stream.",
            { uplevel: 1 },
          );
        }
      }

      if (rackInput == null) {
        this.setHeader(RACK_REQUEST_FORM_INPUT, null);
        this.setHeader(RACK_REQUEST_FORM_HASH, {});
        return this.getHeader(RACK_REQUEST_FORM_HASH);
      } else if (this.formData || this.isParseableData()) {
        const pairs = Multipart.parseMultipart(
          this.env,
          Multipart.ParamList as unknown as QueryParser,
        ) as unknown as Array<[string, any]> | null;
        if (pairs) {
          this.setHeader(RACK_REQUEST_FORM_PAIRS, pairs);
          this.setHeader(RACK_REQUEST_FORM_HASH, this.expandParamPairs(pairs));
        } else {
          let formVars: string = this.getHeader(RACK_INPUT).read();

          if (formVars.endsWith("\0")) formVars = formVars.slice(0, -1);

          this.setHeader(RACK_REQUEST_FORM_VARS, formVars);
          this.setHeader(RACK_REQUEST_FORM_HASH, this.parseQuery(formVars, "&"));
        }

        this.setHeader(RACK_REQUEST_FORM_INPUT, this.getHeader(RACK_INPUT));
        return this.getHeader(RACK_REQUEST_FORM_HASH);
      } else {
        this.setHeader(RACK_REQUEST_FORM_INPUT, this.getHeader(RACK_INPUT));
        this.setHeader(RACK_REQUEST_FORM_HASH, {});
        return this.getHeader(RACK_REQUEST_FORM_HASH);
      }
    } catch (error) {
      this.setHeader(RACK_REQUEST_FORM_ERROR, error);
      throw error;
    }
  }

  get params(): Record<string, any> {
    return { ...this.GET, ...this.POST };
  }

  updateParam(k: string, v: any): void {
    let found = false;
    if (Object.hasOwn(this.GET, k)) {
      found = true;
      this.GET[k] = v;
    }
    if (Object.hasOwn(this.POST, k)) {
      found = true;
      this.POST[k] = v;
    }
    if (!found) {
      this.GET[k] = v;
    }
  }

  deleteParam(k: string): any {
    const [postValue, getValue] = [hashDelete(this.POST, k), hashDelete(this.GET, k)];
    return postValue != null && postValue !== false ? postValue : getValue;
  }

  get baseUrl(): string {
    return `${this.scheme}://${this.hostWithPort()}`;
  }

  get url(): string {
    return this.baseUrl + this.fullpath;
  }

  get path(): string {
    return this.scriptName + this.pathInfo;
  }

  get fullpath(): string {
    return this.queryString === "" ? this.path : `${this.path}?${this.queryString}`;
  }

  get acceptEncoding(): Array<[string, number]> {
    return this.parseHttpAcceptHeader(this.getHeader("HTTP_ACCEPT_ENCODING"));
  }

  get acceptLanguage(): Array<[string, number]> {
    return this.parseHttpAcceptHeader(this.getHeader("HTTP_ACCEPT_LANGUAGE"));
  }

  trustedProxy(ip: string | undefined): boolean {
    return Request.ipFilter(ip);
  }

  valuesAt(...keys: string[]): any[] {
    warn(
      "Request#values_at is deprecated and will be removed in a future version of Rack. Please use request.params.values_at instead",
      { uplevel: 1 },
    );

    return keys.map((key) => this.params[key]);
  }

  /** @internal */
  defaultSession(): Record<string, any> {
    return {};
  }

  /** @internal */
  wrapIpv6(host: string): string {
    if (host && !host.startsWith("[") && host.split(":").length - 1 > 1) {
      return `[${host}]`;
    }
    return host;
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
  getHttpForwarded(token: string): string[] | null {
    return forwardedValues(this.getHeader(HTTP_FORWARDED))?.[token] ?? null;
  }

  /** @internal */
  queryParser(): QueryParser {
    return defaultQueryParser();
  }

  /** @internal */
  parseQuery(qs: string, d = "&"): Record<string, any> {
    return this.queryParser().parseNestedQuery(qs, d);
  }

  /** @internal */
  parseMultipart(): Record<string, any> | null {
    return Multipart.extractMultipart(this, this.queryParser());
  }

  /** @internal */
  expandParamPairs(
    pairs: Array<[string, any]>,
    queryParser: QueryParser = this.queryParser(),
  ): Record<string, any> {
    const params = queryParser.makeParams();

    for (const [k, v] of pairs) {
      queryParser.normalizeParams(params, k, v);
    }

    return params.toParamsHash();
  }

  /** @internal */
  splitHeader(value: string | null | undefined): string[] {
    return value ? value.trim().split(/[,\s]+/) : [];
  }

  /** @internal */
  splitAuthority(authority: string | null | undefined): [string?, string?, (number | null)?] {
    if (authority == null) return [];
    const match = AUTHORITY.exec(authority);
    if (!match) return [];
    const port = match.groups!.port;
    return [match.groups!.host, match.groups!.address, port != null ? parseInt(port, 10) : null];
  }

  /** @internal */
  rejectTrustedIpAddresses<T extends string | undefined>(ipAddresses: T[]): T[] {
    return ipAddresses.filter((ip) => !this.trustedProxy(ip));
  }

  /** @internal */
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

  /** @internal */
  allowedScheme(header: string | null | undefined): string | null {
    if (!header) return null;
    return (ALLOWED_SCHEMES as readonly string[]).includes(header) ? header : null;
  }

  /** @internal */
  forwardedPriority(): Array<"forwarded" | "x_forwarded" | null> {
    return Request.forwardedPriority;
  }

  /** @internal */
  xForwardedProtoPriority(): Array<"proto" | "scheme" | null> {
    return Request.xForwardedProtoPriority;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/request.rb:790`); the class/interface merge is how a mixin surfaces on the type side. */
export class Request {
  env: Record<string, any>;

  static #ipFilter: (ip: string | undefined) => boolean = (ip: string | undefined) =>
    ip != null && trustedProxies.test(ip);
  static get ipFilter(): (ip: string | undefined) => boolean {
    return Request.#ipFilter;
  }
  static set ipFilter(ipFilter: (ip: string | undefined) => boolean) {
    Request.#ipFilter = ipFilter;
  }
  static forwardedPriority: Array<"forwarded" | "x_forwarded" | null> = [
    "forwarded",
    "x_forwarded",
  ];
  static xForwardedProtoPriority: Array<"proto" | "scheme" | null> = ["proto", "scheme"];

  /** @internal */
  private _params: Record<string, any> | null;

  constructor(env: Record<string, any>) {
    this.env = env;
    this._params = null;
  }

  get params(): Record<string, any> {
    return (this._params ||= { ...this.GET, ...this.POST });
  }

  updateParam(k: string, v: any): void {
    let found = false;
    if (Object.hasOwn(this.GET, k)) {
      found = true;
      this.GET[k] = v;
    }
    if (Object.hasOwn(this.POST, k)) {
      found = true;
      this.POST[k] = v;
    }
    if (!found) {
      this.GET[k] = v;
    }
    this._params = null;
  }

  deleteParam(k: string): any {
    const [postValue, getValue] = [hashDelete(this.POST, k), hashDelete(this.GET, k)];
    const v = postValue != null && postValue !== false ? postValue : getValue;
    this._params = null;
    return v;
  }

  dup(): Request {
    return new (this.constructor as typeof Request)({ ...this.env });
  }

  /** @noRailsEquivalent CONVERGEABLE port-rack-request-form-pairs */
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

include(Request, Env);
include(Request, Helpers);
/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/request.rb:790`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Request
  extends Env, Omit<Helpers, "env" | "getHeader" | "setHeader" | "fetchHeader"> {}
