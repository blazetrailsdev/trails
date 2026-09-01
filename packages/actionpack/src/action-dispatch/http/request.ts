/**
 * ActionDispatch::Request
 *
 * Wraps a Rack environment hash and provides convenience accessors
 * mirroring the Rails Request API.
 */

import { camelize, NameError, toSentence, underscore } from "@blazetrails/activesupport";
import type { RackBody, RackEnv, RackResponse } from "@blazetrails/rack";
import {
  parseNestedQuery,
  RACK_SESSION,
  RACK_SESSION_OPTIONS,
  Request as RackRequest,
  RequestHelpers,
} from "@blazetrails/rack";
import {
  _setActionDispatchRequest,
  type ActionDispatchRequestConstructor,
} from "@blazetrails/activesupport";
import { UnknownHttpMethod } from "../../action-controller/metal/exceptions.js";
import type { DispatchableControllerClass } from "../routing/dispatcher.js";
import { Session } from "../request/session.js";
import {
  commitFlash,
  flash,
  flashHash,
  resetSession as resetFlashSession,
  type FlashHash,
} from "../middleware/flash.js";
import {
  etagMatches as _etagMatches,
  fresh as _fresh,
  ifModifiedSince as _ifModifiedSince,
  ifNoneMatch as _ifNoneMatch,
  ifNoneMatchEtags as _ifNoneMatchEtags,
  notModified as _notModified,
  type CacheResponseLike,
} from "./cache.js";
import {
  accepts as _accepts,
  contentMimeType as _contentMimeType,
  format as _format,
  formats as _formats,
  formatFromPathExtension as _formatFromPathExtension,
  hasContentType as _hasContentType,
  MimeNegotiation as _MimeNegotiation,
  negotiateMime as _negotiateMime,
  paramsReadable as _paramsReadable,
  shouldApplyVaryHeader as _shouldApplyVaryHeader,
  useAcceptHeader as _useAcceptHeader,
  validAcceptHeader as _validAcceptHeader,
  variant as _variant,
  type MimeNegotiationHost,
  type NullType,
} from "./mime-negotiation.js";
import { include, type ArrayInquirer } from "@blazetrails/activesupport";
import type { MimeType } from "./mime-type.js";
import { URL as HttpURL } from "./url.js";
import {
  envFilter as _envFilter,
  filteredEnv as _filteredEnv,
  filteredParameters as _filteredParameters,
  filteredPath as _filteredPath,
  filteredQueryString as _filteredQueryString,
  parameterFilter as _parameterFilter,
  parameterFilterFor as _parameterFilterFor,
} from "./filter-parameters.js";
import { ContentSecurityPolicyRequest as CspRequest } from "./content-security-policy.js";
import { QueryParser } from "./query-parser.js";
import { X_CASCADE } from "../constants.js";
import type { PermissionsPolicy } from "../permissions-policy.js";
import type { ParameterFilter } from "@blazetrails/activesupport";
import { RequestUtils, type ParamValue } from "../request/utils.js";
import { COOKIES_APP_OPTIONS_KEY, type CookieJarOptions } from "../middleware/cookies.js";
import {
  parameters as _parameters,
  Parameters as _Parameters,
  paramsParsers as _paramsParsers,
  parseFormattedParameters as _parseFormattedParameters,
  pathParameters as _pathParameters,
  logParseErrorOnce as _logParseErrorOnce,
  type ParameterParser,
  type ParameterParsers,
  type ParametersHost,
} from "./parameters.js";
import { Headers as HttpHeaders } from "./headers.js";
import { _setRequestCtor } from "./request-slot.js";

const ACTION_DISPATCH_REQUEST_ID = "action_dispatch.request_id";
const FORM_DATA_MEDIA_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"] as const;
const LOCALHOST_RE = /^(?:127(?:\.\d{1,3}){3}|::1|0:0:0:0:0:0:0:1(?:%.*)?)$/;

const HTTP_METHODS = [
  "OPTIONS",
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "TRACE",
  "CONNECT",
  "PROPFIND",
  "PROPPATCH",
  "MKCOL",
  "COPY",
  "MOVE",
  "LOCK",
  "UNLOCK",
  "VERSION-CONTROL",
  "REPORT",
  "CHECKOUT",
  "CHECKIN",
  "UNCHECKOUT",
  "MKWORKSPACE",
  "UPDATE",
  "LABEL",
  "MERGE",
  "BASELINE-CONTROL",
  "MKACTIVITY",
  "ORDERPATCH",
  "ACL",
  "SEARCH",
  "MKCALENDAR",
  "PATCH",
] as const;
// Null-prototype lookup so `__proto__` / `constructor` can't shadow
// prototype-chain lookups into apparent membership in `checkMethod`.
const HTTP_METHOD_LOOKUP: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  Object.fromEntries(HTTP_METHODS.map((m) => [m, m.toLowerCase().replace(/-/g, "_")])),
);

const HTTP_HEADER_NAME = /^[A-Za-z0-9-]+$/;
const CGI_VARIABLES: ReadonlySet<string> = new Set([
  "AUTH_TYPE",
  "CONTENT_LENGTH",
  "CONTENT_TYPE",
  "GATEWAY_INTERFACE",
  "HTTPS",
  "PATH_INFO",
  "PATH_TRANSLATED",
  "QUERY_STRING",
  "REMOTE_ADDR",
  "REMOTE_HOST",
  "REMOTE_IDENT",
  "REMOTE_USER",
  "REQUEST_METHOD",
  "SCRIPT_NAME",
  "SERVER_NAME",
  "SERVER_PORT",
  "SERVER_PROTOCOL",
  "SERVER_SOFTWARE",
]);

/** Rails: `TRANSFER_ENCODING = "HTTP_TRANSFER_ENCODING"` (request.rb:58). */
const TRANSFER_ENCODING = "HTTP_TRANSFER_ENCODING";

function envName(key: string): string {
  if (HTTP_HEADER_NAME.test(key)) {
    const upper = key.toUpperCase().replace(/-/g, "_");
    return CGI_VARIABLES.has(upper) ? upper : `HTTP_${upper}`;
  }
  return key;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Request {
  readonly env: RackEnv;

  #method?: string;
  #requestMethod?: string;

  /**
   * Mirrors: `Request#initialize` (`request.rb:64-73`), whose `super` reaches
   * `Rack::Request::Env#initialize` (`rack/request.rb:62-65`)
   * and keeps `env` by reference — the semantics `set_header` writes through, so a write made on
   * one `Request` is visible to the middleware downstream of it.
   */
  constructor(env: RackEnv = {}) {
    this.env = env;
  }

  // --- HTTP method ---

  /**
   * Returns the original value of the environment's REQUEST_METHOD, even if it
   * was overridden by middleware. See {@link requestMethod}. Mirrors
   * `Request#method` (request.rb:212-221); the `*args` arm delegating to
   * `Object#method` has no spelling on a TS getter.
   */
  get method(): string {
    this.#method ??= this.checkMethod(
      this.getHeader("rack.methodoverride.original_method") ?? this.getHeader("REQUEST_METHOD"),
    );
    return this.#method as string;
  }

  /**
   * Returns the HTTP method that the application should see — the overridden
   * value where a middleware rewrote it. Mirrors `Request#request_method`
   * (request.rb:145-152).
   */
  get requestMethod(): string {
    this.#requestMethod ??= this.checkMethod(this.rawRequestMethod);
    return this.#requestMethod as string;
  }

  /** @internal Mirrors `Request#request_method=` (request.rb:184-188). */
  set requestMethod(requestMethod: string) {
    if (this.checkMethod(requestMethod)) {
      this.#requestMethod = this.setHeader("REQUEST_METHOD", requestMethod) as string;
    }
  }

  /** Mirrors: `alias raw_request_method request_method` (request.rb:145) — the
   * unchecked `Rack::Request::Helpers#request_method`. */
  get rawRequestMethod(): string {
    return this.getHeader("REQUEST_METHOD") as string;
  }

  get isGet(): boolean {
    return this.requestMethod === "GET";
  }
  get isHead(): boolean {
    return this.requestMethod === "HEAD";
  }
  get isPost(): boolean {
    return this.requestMethod === "POST";
  }
  get isPut(): boolean {
    return this.requestMethod === "PUT";
  }
  get isPatch(): boolean {
    return this.requestMethod === "PATCH";
  }
  get isDelete(): boolean {
    return this.requestMethod === "DELETE";
  }

  // --- URL components ---

  /**
   * Returns the host for this request, such as "example.com".
   *
   * Mirrors: `ActionDispatch::Http::URL#host` (`url.rb:228-230`).
   */
  get host(): string {
    return this.rawHostWithPort.replace(/:\d+$/, "");
  }

  get rawHost(): string {
    return this.rawHostWithPort;
  }

  /** Returns 'https://' if this is an SSL request and 'http://' otherwise. */
  get protocol(): string {
    return this.ssl ? "https://" : "http://";
  }

  /**
   * Returns the host and port for this request, such as "example.com:8080".
   * Mirrors Rails' `raw_host_with_port`: honors X-Forwarded-Host (last entry).
   */
  get rawHostWithPort(): string {
    const forwarded = (this.env["HTTP_X_FORWARDED_HOST"] as string | undefined)?.trim();
    if (forwarded) {
      const parts = forwarded.split(/,\s?/);
      return parts[parts.length - 1];
    }
    return (
      (this.getHeader("HTTP_HOST") as string) ||
      `${this.getHeader("SERVER_NAME") ?? ""}:${this.getHeader("SERVER_PORT") ?? ""}`
    );
  }

  get port(): number {
    const httpHost = this.env["HTTP_HOST"] as string | undefined;
    if (httpHost) {
      const match = httpHost.match(/:(\d+)$/);
      if (match) return parseInt(match[1], 10);
    }
    return parseInt((this.env["SERVER_PORT"] as string) || "80", 10);
  }

  get standardPort(): number {
    return this.scheme === "https" ? 443 : 80;
  }

  get isStandardPort(): boolean {
    return this.port === this.standardPort;
  }

  get optionalPort(): string {
    return this.isStandardPort ? "" : `:${this.port}`;
  }

  get portString(): string {
    return this.isStandardPort ? "" : `:${this.port}`;
  }

  get hostWithPort(): string {
    return `${this.host}${this.portString}`;
  }

  get serverPort(): number {
    return parseInt((this.getHeader("SERVER_PORT") as string) || "80", 10);
  }

  // --- Path ---

  get path(): string {
    return (this.env["PATH_INFO"] as string) || "/";
  }

  get queryString(): string {
    return (this.env["QUERY_STRING"] as string) || "";
  }

  get fullpath(): string {
    const qs = this.queryString;
    return qs ? `${this.path}?${qs}` : this.path;
  }

  get originalFullpath(): string {
    return (this.getHeader("ORIGINAL_FULLPATH") as string) || this.fullpath;
  }

  get originalUrl(): string {
    return `${this.scheme}://${this.hostWithPort}${this.originalFullpath}`;
  }

  get url(): string {
    return `${this.scheme}://${this.hostWithPort}${this.fullpath}`;
  }

  // --- Domain / subdomains ---

  // Rails: `Request#{domain,subdomains,subdomain}` delegate to
  // `ActionDispatch::Http::URL.extract_*` (`url.rb:320-340`) and default the
  // `tld_length` arg to the class-level `@@tld_length` so railtie config
  // (`URL.tldLength = N`) flows through. `domain` returns `nil` for IP /
  // unnamed hosts; we mirror that with `string | null`.

  domain(tldLength: number = HttpURL.tldLength): string | null {
    return HttpURL.extractDomain(this.host, tldLength);
  }

  subdomains(tldLength: number = HttpURL.tldLength): string[] {
    return HttpURL.extractSubdomains(this.host, tldLength);
  }

  subdomain(tldLength: number = HttpURL.tldLength): string {
    return HttpURL.extractSubdomain(this.host, tldLength);
  }

  // --- Headers ---

  get contentType(): string | undefined {
    const ct = this.env["CONTENT_TYPE"] as string | undefined;
    if (!ct) return undefined;
    return ct.split(";")[0].trim() || undefined;
  }

  get mediaType(): string | undefined {
    return this.contentType;
  }

  /**
   * Rails: `content_length` (request.rb:292-295). A chunked body carries no
   * `CONTENT_LENGTH`, so the drained body is measured instead.
   */
  get contentLength(): number | undefined {
    if (this.hasHeader(TRANSFER_ENCODING)) return new TextEncoder().encode(this.rawPost).length;
    const cl = this.getHeader("CONTENT_LENGTH") as string | undefined;
    if (!cl) return undefined;
    const n = parseInt(cl, 10);
    return isNaN(n) ? undefined : n;
  }

  get userAgent(): string {
    return (this.env["HTTP_USER_AGENT"] as string) || "";
  }

  get accept(): string {
    return (this.env["HTTP_ACCEPT"] as string) || "";
  }

  // --- Conditional-GET (ActionDispatch::Http::Cache::Request) ---
  // Mixed in onto Request.prototype below; declared here for typing.
  declare readonly ifModifiedSince: Date | undefined;
  declare readonly ifNoneMatch: string | undefined;
  declare readonly ifNoneMatchEtags: string[];
  declare notModified: (modifiedAt: Date | undefined) => boolean;
  declare etagMatches: (etag: string | undefined) => boolean;
  declare fresh: (response: CacheResponseLike) => boolean;

  // --- MIME negotiation (ActionDispatch::Http::MimeNegotiation) ---
  // Mixed in onto Request.prototype below; declared here for typing.
  declare readonly contentMimeType: MimeType | null;
  declare readonly accepts: MimeType[];
  declare hasContentType: () => boolean;
  declare negotiateMime: (order: MimeType[]) => MimeType | NullType | null;
  declare shouldApplyVaryHeader: () => boolean;
  get format(): MimeType | NullType {
    return _format.call(mimeHost(this));
  }
  /**
   * Rails' `format=` (`http/mime_negotiation.rb:115`). Spelled `setFormat` so
   * the reader stays a 0-arg property mirroring `format(_view_path = nil)`
   * (`mime_negotiation.rb:63`) — a TS accessor pair cannot carry both Ruby
   * signatures.
   */
  setFormat(extension: unknown): void {
    mimeHost(this).format = extension;
  }
  get formats(): MimeType[] {
    return _formats.call(mimeHost(this));
  }
  set formats(extensions: unknown[]) {
    mimeHost(this).formats = extensions;
  }
  get variant(): ArrayInquirer<string> & Record<string, () => boolean> {
    return _variant.call(mimeHost(this));
  }
  set variant(value: string | string[] | null | undefined) {
    mimeHost(this).variant = value;
  }

  // Class-level attribute mirroring Rails' `mattr_accessor :ignore_accept_header`.
  // Exposed as a static getter/setter so call sites read as `Request.ignoreAcceptHeader`
  // / `Request.ignoreAcceptHeader = true`.
  static get ignoreAcceptHeader(): boolean {
    return _MimeNegotiation.ignoreAcceptHeader;
  }
  static set ignoreAcceptHeader(value: boolean) {
    _MimeNegotiation.ignoreAcceptHeader = value;
  }

  // --- Filter Parameters (ActionDispatch::Http::FilterParameters) ---
  declare filteredParameters: () => Record<string, unknown>;
  declare filteredEnv: () => Record<string, unknown>;
  declare filteredPath: () => string;
  declare parameterFilter: () => ParameterFilter;
  /** @internal */
  declare envFilter: () => ParameterFilter;
  /** @internal */
  declare filteredQueryString: () => string;
  /** @internal */
  declare parameterFilterFor: (filters: Array<string | RegExp>) => ParameterFilter;

  // --- Permissions Policy (ActionDispatch::PermissionsPolicy::Request) ---

  get permissionsPolicy(): PermissionsPolicy | null | undefined {
    return this.getHeader("action_dispatch.permissions_policy") as
      | PermissionsPolicy
      | null
      | undefined;
  }
  set permissionsPolicy(policy: PermissionsPolicy | null) {
    this.setHeader("action_dispatch.permissions_policy", policy);
  }

  // --- Request type checks ---

  get isXmlHttpRequest(): boolean {
    return (this.getHeader("HTTP_X_REQUESTED_WITH") as string)?.toLowerCase() === "xmlhttprequest";
  }

  get xhr(): boolean {
    return this.isXmlHttpRequest;
  }

  // --- IP addresses ---

  get remoteIp(): string | null {
    const v = this.getHeader("action_dispatch.remote_ip");
    if (v != null) {
      if (typeof v === "object" && typeof (v as { calculate?: unknown }).calculate === "function") {
        return (v as { calculate(): string | null }).calculate();
      }
      return typeof v === "string" ? v : String(v);
    }
    return (this.getHeader("REMOTE_ADDR") as string) || "127.0.0.1";
  }

  set remoteIp(value: string | null) {
    this.setHeader("action_dispatch.remote_ip", value);
  }

  get ip(): string | null {
    return this.remoteIp;
  }

  // --- Body ---

  /** Rails: `body` (request.rb:357-364) — a cached `RAW_POST_DATA` wins over the live stream. */
  get body(): string {
    const rawPost = this.getHeader("RAW_POST_DATA");
    if (rawPost != null) return String(rawPost);
    return this.readBodyStream();
  }

  /**
   * Rails: `raw_post` (request.rb:348-353). The body is cached under
   * `RAW_POST_DATA` so repeated reads of a stream-backed `rack.input` don't
   * yield "" after the first drain.
   */
  get rawPost(): string {
    if (!this.hasHeader("RAW_POST_DATA")) {
      this.setHeader("RAW_POST_DATA", this.readBodyStream());
    }
    return String(this.getHeader("RAW_POST_DATA"));
  }

  // --- Parameters ---

  get params(): Record<string, unknown> {
    return _parameters.call(this._paramsHost);
  }

  get queryParameters(): Record<string, unknown> {
    return this.fetchHeader("action_dispatch.request.query_parameters", (k) => {
      const qs = this.queryString;
      const params = qs
        ? (RequestUtils.normalizeEncodeParams(parseNestedQuery(qs) as ParamValue) as Record<
            string,
            unknown
          >)
        : {};
      return this.setHeader(k, params);
    }) as Record<string, unknown>;
  }

  get requestParameters(): Record<string, unknown> {
    return this.fetchHeader("action_dispatch.request.request_parameters", (k) => {
      const host = this._paramsHost;
      const params = _parseFormattedParameters.call(host, _paramsParsers.call(host), () =>
        this._fallbackRequestParameters(),
      );

      const normalized = RequestUtils.normalizeEncodeParams(params as ParamValue) as Record<
        string,
        unknown
      >;
      return this.setHeader(k, normalized);
    }) as Record<string, unknown>;
  }

  get pathParameters(): Record<string, unknown> {
    return _pathParameters.call(this._paramsHost);
  }

  set pathParameters(params: Record<string, unknown>) {
    this._paramsHost.pathParameters = params;
  }

  /** Class-level parameter parser registry. Mirrors Rails `Request.parameter_parsers`. */
  static get parameterParsers(): ParameterParsers {
    return _Parameters.parameterParsers;
  }

  static set parameterParsers(
    parsers: Record<string | symbol, ParameterParser> | Map<unknown, ParameterParser>,
  ) {
    _Parameters.parameterParsers = parsers;
  }

  /**
   * Prototyped on `Parameters.prototype` so the mixin's `path_parameters=`
   * writer applies by plain assignment.
   * @internal
   */
  private get _paramsHost(): ParametersHost & _Parameters {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const req = this;
    const host: ParametersHost = {
      getHeader: (k) => req.env[k],
      setHeader: (k, v) => ((req.env[k] = v), v),
      deleteHeader: (k) => void delete req.env[k],
      get queryParameters() {
        return req.queryParameters;
      },
      get requestParameters() {
        return req.requestParameters;
      },
      get contentLength() {
        return req.contentLength;
      },
      get contentMimeType() {
        return req.contentMimeType;
      },
      get rawPost() {
        return req.rawPost;
      },
      get logger() {
        const l = req.env["action_dispatch.logger"] ?? req.env["rack.logger"];
        return (l as { debug(m: string): void } | null | undefined) ?? null;
      },
    };
    return Object.setPrototypeOf(host, _Parameters.prototype) as ParametersHost & _Parameters;
  }

  /** @internal */
  private _fallbackRequestParameters(): Record<string, unknown> {
    const input = this.rawPost;
    if (!input) return {};
    const ct = ((this.env["CONTENT_TYPE"] as string) || "").toLowerCase();
    if (ct.includes("application/x-www-form-urlencoded")) {
      return parseNestedQuery(input);
    }
    return {};
  }

  // --- Server software ---

  get serverSoftware(): string {
    return ((this.getHeader("SERVER_SOFTWARE") as string) || "").split("/")[0] || "";
  }

  // --- Header access ---

  /**
   * Returns the value for the given key mapped to the env. HTTP-header-style
   * names (alphanumerics + dashes) are converted to their CGI/Rack env name —
   * `"Content-Type" → "CONTENT_TYPE"`, `"If-None-Match" → "HTTP_IF_NONE_MATCH"`
   * — to mirror `ActionDispatch::Http::Headers#[]`. Keys that don't match the
   * pattern (e.g. `"action_dispatch.parameter_filter"`) pass through to the
   * env unchanged, mirroring `Request#get_header`.
   *
   * Untyped, as `@env[name]` (rack/lib/rack/request.rb:100-102) is in Ruby: an
   * env slot holds a String as often as a routes set, a logger or a RemoteIp.
   */
  getHeader(name: string): any {
    return this.env[envName(name)];
  }

  /**
   * Returns true if the env has a value for `key`. Mirrors Rails'
   * `Rack::Request::Env#has_header?` — raw env access, no HTTP-name
   * conversion. Callers passing HTTP-style names (e.g. `"Content-Type"`)
   * should reach for `headers[]` (or `getHeader`, which applies the
   * `Headers#env_name` mapping).
   */
  hasHeader(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.env, key);
  }

  /** Sets `key` on the env. Returns the assigned value. Mirrors `set_header`. */
  setHeader(key: string, value: unknown): unknown {
    this.env[key] = value;
    return value;
  }

  /**
   * Adds `v` to a multivalued env slot, comma-joining an existing value.
   * Mirrors `Rack::Request::Env#add_header` (`rack/request.rb:129-137`).
   */
  addHeader(key: string, v: unknown): unknown {
    if (v == null) {
      return this.getHeader(key);
    } else if (this.hasHeader(key)) {
      return this.setHeader(key, `${this.getHeader(key)},${v}`);
    } else {
      return this.setHeader(key, v);
    }
  }

  /** Mirrors `Rack::Request::Env#each_header` (`rack/request.rb:111-113`). */
  eachHeader(block: (key: string, value: unknown) => void): void {
    for (const [key, value] of Object.entries(this.env)) block(key, value);
  }

  /** @internal Rails: `request.controller_instance` (request.rb:190-192). */
  get controllerInstance(): unknown {
    return this.getHeader("action_controller.instance");
  }

  /** @internal Rails: `request.controller_instance=` (request.rb:194-196). */
  set controllerInstance(controller: unknown) {
    this.setHeader("action_controller.instance", controller);
  }

  /** Deletes `key` from the env. Mirrors `delete_header`. */
  deleteHeader(key: string): void {
    delete this.env[key];
  }

  /**
   * Returns the value for `key`, or invokes `fallback` with `key` when
   * absent. Mirrors `fetch_header`, which yields the key on miss.
   */
  fetchHeader(key: string): unknown;
  fetchHeader<T>(key: string, fallback: (key: string) => T): unknown | T;
  fetchHeader<T>(key: string, fallback?: (key: string) => T): unknown | T {
    if (Object.prototype.hasOwnProperty.call(this.env, key)) return this.env[key];
    if (fallback) return fallback(key);
    throw new Error(`key not found: ${key}`);
  }

  // --- Inspect ---

  inspect(): string {
    return `#<ActionDispatch::Request ${this.method} "${this.fullpath}">`;
  }

  // --- Session ---

  /**
   * Mirrors: `Rack::Request::Helpers#session` (`rack/request.rb:207-211`) —
   * `fetch_header(RACK_SESSION) { |k| set_header RACK_SESSION, default_session }`.
   * ActionDispatch supplies `default_session` (`request.rb:505-507`) as
   * `Session.disabled(self)`, so a request with no session middleware answers a
   * disabled `Session` and seeds `Session::Options` as a side effect.
   */
  get session(): Session {
    return this.fetchHeader(RACK_SESSION, (k) =>
      this.setHeader(k, this.defaultSession()),
    ) as Session;
  }

  // --- Flash ---
  //
  // Rails prepends `ActionDispatch::Flash::RequestMethods` onto Request
  // (`middleware/flash.rb:14`); `ActionDispatch::Flash` itself is a pure
  // passthrough (`flash.rb:312`), so the middleware stack is not where the
  // flash lives. These read the ported functions in `middleware/flash.ts`.

  get flash(): FlashHash | null {
    return flash.call(this as never);
  }

  set flash(value: FlashHash | null) {
    flash.call(this as never, value);
  }

  /** @internal Rails: `Flash::RequestMethods#flash_hash` (`flash.rb:288-290`). */
  flashHash(): FlashHash | null {
    return flashHash.call(this as never);
  }

  // --- Cookies ---
  //
  // Parses the `HTTP_COOKIE` header into a `name → value` map. Trails layers
  // a richer `CookieJar` on top via `ActionDispatch::Cookies`; this getter
  // returns the raw seed used to build it.

  get cookies(): Record<string, string> {
    const header = (this.env.HTTP_COOKIE as string | undefined) ?? "";
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const pair of header.split(";")) {
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (k) out[k] = v;
    }
    return out;
  }

  // --- Cookies (app-wide options) ---
  //
  // `cookiesAppOptions` is the bridge the `ActionDispatch::Cookies` middleware
  // uses to pass the app-wide secret/serializer/etc. configuration into the
  // signed/encrypted cookie jars. Rails stores each option in its own env
  // header (`action_dispatch.signed_cookie_salt` and friends); trails
  // collapses them into a single `CookieJarOptions` object stored under
  // `COOKIES_APP_OPTIONS_KEY` until the full middleware lands.

  get cookiesAppOptions(): CookieJarOptions | undefined {
    return this.env[COOKIES_APP_OPTIONS_KEY] as CookieJarOptions | undefined;
  }

  set cookiesAppOptions(options: CookieJarOptions | undefined) {
    if (options === undefined) {
      delete this.env[COOKIES_APP_OPTIONS_KEY];
    } else {
      this.env[COOKIES_APP_OPTIONS_KEY] = options;
    }
  }

  // --- Headers wrapper ---

  get headers(): HttpHeaders {
    return new HttpHeaders(this);
  }

  // --- Method symbol ---

  /** Returns the lowercase symbol form of {@link method} (RFC method name). */
  get methodSymbol(): string | undefined {
    return HTTP_METHOD_LOOKUP[this.method];
  }

  /** Returns the lowercase symbol form of {@link requestMethod}. */
  get requestMethodSymbol(): string | undefined {
    return HTTP_METHOD_LOOKUP[this.requestMethod];
  }

  /** @internal Mirrors `Request#check_method` (request.rb:497-503). */
  protected checkMethod(name: string | undefined): string | undefined {
    if (name != null) {
      if (!Object.hasOwn(HTTP_METHOD_LOOKUP, name)) {
        throw new UnknownHttpMethod(
          `${name}, accepted HTTP methods are ${toSentence([...HTTP_METHODS], { locale: false })}`,
        );
      }
    }

    return name;
  }

  // --- Env-header passthroughs ---

  /** Rails: `request.route_uri_pattern` (env: `action_dispatch.route_uri_pattern`). */
  get routeUriPattern(): string | undefined {
    return this.getHeader("action_dispatch.route_uri_pattern") as string | undefined;
  }
  set routeUriPattern(pattern: string | undefined) {
    this.env["action_dispatch.route_uri_pattern"] = pattern;
  }

  /** @internal Rails: `request.routes` (env: `action_dispatch.routes`). */
  get routes(): unknown {
    return this.getHeader("action_dispatch.routes");
  }
  /** @internal */
  set routes(routes: unknown) {
    this.env["action_dispatch.routes"] = routes;
  }

  /** @internal Rails: `engine_script_name(_routes)` — env key from `_routes.env_key`. */
  engineScriptName(routes: { envKey: string }): unknown {
    return this.getHeader(routes.envKey);
  }

  /** Rails: `key_generator` — reads `action_dispatch.key_generator` from env. */
  get keyGenerator(): { generateKey(salt: string, keySize?: number): Buffer | string } | undefined {
    return this.env["action_dispatch.key_generator"] as
      | { generateKey(salt: string, keySize?: number): Buffer | string }
      | undefined;
  }

  /** Rails: `http_auth_salt` env getter. */
  get httpAuthSalt(): unknown {
    return this.getHeader("action_dispatch.http_auth_salt");
  }

  /** Rails: `request_id` — set by `ActionDispatch::RequestId` middleware. */
  get requestId(): string | undefined {
    return this.getHeader(ACTION_DISPATCH_REQUEST_ID) as string | undefined;
  }
  set requestId(id: string | undefined) {
    this.env[ACTION_DISPATCH_REQUEST_ID] = id;
  }

  /** Alias of {@link requestId}. */
  get uuid(): string | undefined {
    return this.requestId;
  }

  /** Rails: `logger` — `action_dispatch.logger` env entry. */
  get logger(): unknown {
    return this.getHeader("action_dispatch.logger");
  }

  // --- Predicates / utility ---

  /** Rails: `request.key?(name)` — alias of {@link hasHeader}. */
  isKey(key: string): boolean {
    return this.hasHeader(key);
  }

  /**
   * Rails: `form_data?` (request.rb:373-375) — content-type is form-data.
   * Spelled as `Rack::Request::Helpers#form_data?` is
   * (`packages/rack/src/request.ts`), so that this override outranks the
   * mixin's, which also treats a POST with no Content-Type as form data.
   */
  get formData(): boolean {
    const mt = this.mediaType;
    return mt != null && (FORM_DATA_MEDIA_TYPES as readonly string[]).includes(mt);
  }

  /** Rails: `local?` — REMOTE_ADDR and remoteIp both match localhost. */
  get isLocal(): boolean {
    const addr = (this.env["REMOTE_ADDR"] as string | undefined) ?? "";
    const ip = this.remoteIp ?? "";
    return LOCALHOST_RE.test(addr) && LOCALHOST_RE.test(ip);
  }

  /** Rails: `authorization` — checks 4 env keys in order. */
  get authorization(): string | undefined {
    return (this.getHeader("HTTP_AUTHORIZATION") ??
      this.getHeader("X-HTTP_AUTHORIZATION") ??
      this.getHeader("X_HTTP_AUTHORIZATION") ??
      this.getHeader("REDIRECT_X_HTTP_AUTHORIZATION")) as string | undefined;
  }

  // --- Body ---

  /** Rails: `body_stream` — raw `rack.input`. */
  get bodyStream(): unknown {
    return this.getHeader("rack.input");
  }

  /** @internal Rails: `read_body_stream` — drain `rack.input` with rewind guard. */
  protected readBodyStream(): string {
    const input = this.bodyStream;
    if (typeof input === "string") return input;
    const stream = input as { read?: (n?: number) => string; rewind?: () => void } | undefined;
    if (!stream || typeof stream.read !== "function") return "";
    return this.resetStream(stream, () =>
      this.hasHeader(TRANSFER_ENCODING) ? stream.read!() : stream.read!(this.contentLength),
    );
  }

  /** @internal Rails: `reset_stream` — rewind before+after yielding. */
  protected resetStream<T>(bodyStream: { rewind?: () => void }, fn: () => T): T {
    if (typeof bodyStream.rewind === "function") {
      bodyStream.rewind();
      const result = fn();
      bodyStream.rewind();
      return result;
    }
    return fn();
  }

  /** @internal Rails: `fallback_request_parameters` — parses raw post as form-urlencoded. */
  protected fallbackRequestParameters(): Record<string, unknown> {
    return this._fallbackRequestParameters();
  }

  // --- Session ---

  /**
   * Rails: `reset_session` (request.rb:381-384) — `session.destroy;
   * reset_csrf_token` — with `Flash::RequestMethods#reset_session`
   * (`flash.rb:307-310`) prepended on top, which clears the flash after
   * `super`.
   */
  resetSession(): void {
    this.session.destroy();
    this.resetCsrfToken();
    resetFlashSession.call(this as never);
  }

  /** Rails: `session=` (request.rb:385-387) — `Session.set self, session`. */
  set session(session: Session) {
    Session.set(this, session);
  }

  /**
   * Mirrors `Rack::Request::Helpers#session_options` (`rack/request.rb:213-217`),
   * which `ActionDispatch::Request` inherits through the mixin
   * (`request.rb:21`) while overriding only the writer below. A JS property
   * takes both halves from one descriptor, so the reader cannot fall through
   * the mixin while the writer overrides it, and the inherited half is
   * restated here.
   */
  get sessionOptions(): Record<string, unknown> {
    return this.fetchHeader(RACK_SESSION_OPTIONS, (k: string) => this.setHeader(k, {})) as Record<
      string,
      unknown
    >;
  }

  /**
   * Rails: `session_options=` (request.rb:390-392) —
   * `Session::Options.set self, options`.
   */
  set sessionOptions(options: Record<string, unknown>) {
    Session.Options.set(this, options);
  }

  /** @internal Rails: `default_session` — returns a disabled-session sentinel. */
  protected defaultSession(): Session {
    return Session.disabled(this);
  }

  // --- CSRF ---

  /** Rails: `reset_csrf_token` — forwards to `controller_instance` when supported. */
  resetCsrfToken(): void {
    const c = this.controllerInstance as { resetCsrfToken?: (req: unknown) => void } | undefined;
    if (c && typeof c.resetCsrfToken === "function") c.resetCsrfToken(this);
  }

  /** Rails: `commit_csrf_token` — forwards to `controller_instance` when supported. */
  commitCsrfToken(): void {
    const c = this.controllerInstance as { commitCsrfToken?: (req: unknown) => void } | undefined;
    if (c && typeof c.commitCsrfToken === "function") c.commitCsrfToken(this);
  }

  // --- Flash / cookie-jar lifecycle hooks (no-ops; Rails uses these as mixin overrides) ---

  /** Rails: `Flash::RequestMethods#commit_flash` (`flash.rb:292-305`). */
  commitFlash(): void {
    commitFlash.call(this as never);
  }

  /** @internal Rails: `commit_cookie_jar!` — no-op on the bare Request. */
  commitCookieJarBang(): void {}

  // --- Aliases ---

  /** Rails: `GET` alias of `query_parameters`. */
  GET(): Record<string, unknown> {
    return this.queryParameters;
  }

  /** Rails: `POST` alias of `request_parameters`. */
  POST(): Record<string, unknown> {
    return this.requestParameters;
  }

  /** Rails: `parameters` alias of `params`. */
  get parameters(): Record<string, unknown> {
    const override = this.env["action_dispatch.request.parameters_override"];
    if (override) return override as Record<string, unknown>;
    return this.params;
  }
  set parameters(value: Record<string, unknown>) {
    this.env["action_dispatch.request.parameters_override"] = value;
  }

  // --- Early hints ---

  /** Rails: `send_early_hints(links)` — invokes the `rack.early_hints` callable. */
  sendEarlyHints(links: Record<string, string>): void {
    const cb = this.env["rack.early_hints"] as ((l: Record<string, string>) => void) | undefined;
    if (typeof cb === "function") cb(links);
  }

  // --- Rack request wrapper (env-backed minimal shim) ---

  get rackRequest(): RackRequest {
    const cached = this.env["action_dispatch.rack_request"] as RackRequest | undefined;
    if (cached) return cached;
    const r = new RackRequest(this.env);
    this.env["action_dispatch.rack_request"] = r;
    return r;
  }

  // --- Mime-negotiation privates (declared; bound below via prototype) ---

  /** @internal */
  declare validAcceptHeader: () => boolean;
  /** @internal */
  declare useAcceptHeader: () => boolean;
  /** @internal */
  declare formatFromPathExtension: () => MimeType | undefined;
  /** @internal */
  declare isParamsReadable: () => boolean;

  // --- Controller dispatch ---

  /**
   * Rails: `request.controller_class` (request.rb:88-92). Defaults the
   * `action` path-parameter to `"index"` and resolves the controller class
   * via {@link controllerClassFor}.
   */
  controllerClass(): DispatchableControllerClass | typeof PassNotFound {
    const params = this.pathParameters;
    if (params["action"] == null) params["action"] = "index";
    return this.controllerClassFor(params["controller"] as string | undefined);
  }

  /**
   * Rails: `request.controller_class_for(name)` (request.rb:94-110).
   * `"#{controller_param.camelize}Controller"` is looked up in
   * {@link controllerConstants} rather than `constantize`d, so the miss
   * arrives as the absence of a map entry rather than as the `NameError`
   * `constantize` raises; the `missing_name` guard that distinguishes that
   * `NameError` from one thrown by the controller file itself has nothing
   * left to discriminate and collapses into raising {@link MissingController}
   * (`request.rb:102`) directly.
   */
  controllerClassFor(
    name: string | undefined | null,
  ): DispatchableControllerClass | typeof PassNotFound {
    // Ruby `if name` is truthy for empty strings; only nil/false fall through
    // to the PASS_NOT_FOUND branch. Mirror with explicit null-check so `""`
    // takes the resolution path.
    if (name != null) {
      const controllerParam = underscore(name);
      const constName = `${camelize(controllerParam)}Controller`;
      const klass = controllerConstants.get(controllerParam);
      if (!klass) throw new MissingController(`uninitialized constant ${constName}`, constName);
      return klass;
    }
    return PassNotFound;
  }

  // --- Request parameters (Rack form pairs / vars) ---

  /**
   * Rails: `request_parameters_list` (request.rb:437-456). Drives the
   * `from_pairs` builder by surfacing whichever flat form list Rack has
   * populated under `rack.request.form_pairs` / `rack.request.form_vars`.
   * Returns `[]` when the body is empty and `null` when Rack parsed
   * multipart but did not preserve a pair list.
   */
  requestParametersList(): Array<[string, unknown]> | null {
    const rackPost = this.rackRequest.POST;
    const formPairs = this.env["rack.request.form_pairs"];
    // Multipart form_pairs values may be UploadedFile-like objects, not just
    // strings; surface as `unknown` rather than narrowing to QueryPair.
    if (formPairs != null) return formPairs as Array<[string, unknown]>;
    const formVars = this.env["rack.request.form_vars"];
    if (formVars != null) return Array.from(QueryParser.eachPair(formVars as string));
    if (rackPost && typeof rackPost === "object" && Object.keys(rackPost as object).length > 0) {
      return null;
    }
    return [];
  }

  // --- Parameters mixin privates (Rails: private instance methods on Request) ---

  /** @internal */
  paramsParsers(): ParameterParsers {
    return _paramsParsers.call(this._paramsHost);
  }
  /** @internal */
  parseFormattedParameters(
    parsers: ParameterParsers,
    fallback: () => Record<string, unknown>,
  ): Record<string, unknown> {
    return _parseFormattedParameters.call(this._paramsHost, parsers, fallback);
  }
  /** @internal */
  logParseErrorOnce(): void {
    _logParseErrorOnce.call(this._paramsHost);
  }

  // --- Static factory ---

  static create(env: RackEnv = {}): Request {
    return new Request(env);
  }

  static empty(): Request {
    return new Request({});
  }
}

// Mix in ActionDispatch::Http::Cache::Request. Property-style helpers
// (Rails: no-arg methods) are wired as getters for parity with the existing
// Request surface; methods that take arguments are wired as prototype methods.
Object.defineProperty(Request.prototype, "ifModifiedSince", {
  get(this: Request) {
    return _ifModifiedSince.call(this);
  },
  configurable: true,
});
Object.defineProperty(Request.prototype, "ifNoneMatch", {
  get(this: Request) {
    return _ifNoneMatch.call(this);
  },
  configurable: true,
});
Object.defineProperty(Request.prototype, "ifNoneMatchEtags", {
  get(this: Request) {
    return _ifNoneMatchEtags.call(this);
  },
  configurable: true,
});
Request.prototype.notModified = _notModified;
Request.prototype.etagMatches = _etagMatches;
Request.prototype.fresh = _fresh;

include(Request, RequestHelpers);
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Request::Helpers` (`action_dispatch/http/request.rb:21`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Request extends Omit<
  RequestHelpers,
  | "env"
  | "getHeader"
  | "setHeader"
  | "fetchHeader"
  | "body"
  | "requestMethod"
  | "isGet"
  | "isHead"
  | "isPost"
  | "isPut"
  | "isPatch"
  | "isDelete"
  | "host"
  | "port"
  | "hostWithPort"
  | "serverPort"
  | "path"
  | "queryString"
  | "fullpath"
  | "url"
  | "contentType"
  | "mediaType"
  | "contentLength"
  | "userAgent"
  | "xhr"
  | "ip"
  | "params"
  | "session"
  | "sessionOptions"
  | "cookies"
  | "logger"
  | "GET"
  | "POST"
  | "formData"
  | "defaultSession"
> {}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface Request extends CspRequest {}
include(Request, CspRequest);

// --- ActionDispatch::Http::MimeNegotiation wiring ---
// The mixin's host shape (getHeader/setHeader) reads env keys directly,
// while Request#getHeader normalizes to `HTTP_*` for case-insensitive HTTP
// header lookup. We adapt via a per-Request host stored in a WeakMap so the
// mixin's `_variant` slot persists across calls. The mixin's getHeader/
// setHeader semantics treat `undefined` as "not cached" (calls fall through
// to compute and `setHeader` writes the value, including `null`). The host
// derives from `MimeNegotiation.prototype` so the module's writers (`variant=`
// / `format=` / `formats=`, which TypeScript can only spell as `set`
// accessors) apply to it by plain assignment.
type MimeHost = MimeNegotiationHost & _MimeNegotiation;
const MIME_HOSTS = new WeakMap<Request, MimeHost>();
function mimeHost(req: Request): MimeHost {
  let h = MIME_HOSTS.get(req);
  if (!h) {
    h = Object.create(_MimeNegotiation.prototype, {
      getHeader: { value: (k: string) => req.env[k] },
      setHeader: {
        value: (k: string, v: unknown) => {
          req.env[k] = v;
          return v;
        },
      },
      fetchHeader: {
        value: <T>(k: string, fallback: (key: string) => T) => req.fetchHeader(k, fallback),
      },
      parameters: { get: () => req.params },
      accept: { get: () => req.accept },
      xhr: { get: () => req.xhr },
    }) as MimeHost;
    MIME_HOSTS.set(req, h);
  }
  return h;
}
Object.defineProperty(Request.prototype, "contentMimeType", {
  get(this: Request) {
    return _contentMimeType.call(mimeHost(this));
  },
  configurable: true,
});
Object.defineProperty(Request.prototype, "accepts", {
  get(this: Request) {
    return _accepts.call(mimeHost(this));
  },
  configurable: true,
});
Request.prototype.hasContentType = function (this: Request) {
  return _hasContentType.call(mimeHost(this));
};
Request.prototype.negotiateMime = function (this: Request, order: MimeType[]) {
  return _negotiateMime.call(mimeHost(this), order);
};
Request.prototype.shouldApplyVaryHeader = function (this: Request) {
  return _shouldApplyVaryHeader.call(mimeHost(this));
};

// Mix in ActionDispatch::Http::FilterParameters. The mixin reads the merged
// param hash via the host's `params` getter (already defined on `Request`).
Request.prototype.filteredParameters = _filteredParameters;
Request.prototype.filteredEnv = _filteredEnv;
Request.prototype.filteredPath = _filteredPath;
Request.prototype.parameterFilter = _parameterFilter;
Request.prototype.envFilter = _envFilter;
Request.prototype.filteredQueryString = _filteredQueryString;
Request.prototype.parameterFilterFor = _parameterFilterFor as (
  this: Request,
  filters: Array<string | RegExp>,
) => ParameterFilter;

/**
 * Sentinel controller used when {@link Request.controllerClassFor} is called
 * without a controller name. Mirrors Rails' `PASS_NOT_FOUND` anonymous class
 * (request.rb:82-86): every dispatch path returns the sentinel itself, and
 * `call` short-circuits to a `404` with the `X-Cascade: pass` header so the
 * router falls through to the next matching route.
 */
/**
 * Ruby's empty array body (`[]`) — a body that yields no chunks at all, not
 * one empty chunk.
 *
 * @internal
 */
export async function* emptyRackBody(): RackBody {}

/**
 * Rails: `ActionDispatch::MissingController < NameError`
 * (`action_dispatch.rb:50`).
 *
 * @noRailsEquivalent PERMANENT — declared beside its only raise site rather
 * than in the `action_dispatch` module file, whose TS counterpart is the
 * package barrel: importing the barrel from here closes an ESM cycle
 * (barrel → http/request → barrel) that a Ruby autoload never has.
 */
export class MissingController extends NameError {
  constructor(message: string, constantName?: string) {
    super(message, constantName);
    this.name = "MissingController";
  }
}

/**
 * The constant table `controller_class_for` resolves against, keyed by the
 * Rails controller path `path_parameters[:controller]` carries (`posts`,
 * `admin/posts`). Rails looks the `"#{name.camelize}Controller"` constant up
 * in the global Ruby namespace, which Zeitwerk autoloads on demand; ESM has
 * no `const_missing` seam, so railties' `setup_main_autoloader` populates
 * this map eagerly instead.
 *
 * @noRailsEquivalent PERMANENT
 */
export const controllerConstants = new Map<string, DispatchableControllerClass>();

export class PassNotFound {
  /** @internal */
  static action(_: unknown): typeof PassNotFound {
    return PassNotFound;
  }
  /** @internal */
  static call(_: RackEnv): RackResponse {
    return [404, { [X_CASCADE]: "pass" }, emptyRackBody()];
  }
  /** @internal */
  static actionEncodingTemplate(_action: unknown): false {
    return false;
  }
}
// Mime-negotiation privates wired via prototype; declared on the class for
// typing. These mirror Rails' private predicates / lookup helpers.
Request.prototype.validAcceptHeader = function (this: Request) {
  return _validAcceptHeader.call(mimeHost(this));
};
Request.prototype.useAcceptHeader = function (this: Request) {
  return _useAcceptHeader.call(mimeHost(this));
};
Request.prototype.formatFromPathExtension = function (this: Request) {
  return _formatFromPathExtension.call(mimeHost(this));
};
Request.prototype.isParamsReadable = function (this: Request) {
  return _paramsReadable.call(mimeHost(this));
};

_setActionDispatchRequest(Request as unknown as ActionDispatchRequestConstructor);

_setRequestCtor(Request);
