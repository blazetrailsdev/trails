/**
 * ActionDispatch::Request
 *
 * Wraps a Rack environment hash and provides convenience accessors
 * mirroring the Rails Request API.
 */

import type { RackBody, RackEnv, RackResponse } from "@blazetrails/rack";
import { parseNestedQuery, Request as RackRequest } from "@blazetrails/rack";
import { Session } from "../request/session.js";
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
  ignoreAcceptHeader as _ignoreAcceptHeader,
  negotiateMime as _negotiateMime,
  paramsReadable as _paramsReadable,
  setFormat as _setFormat,
  setFormats as _setFormats,
  setIgnoreAcceptHeader as _setIgnoreAcceptHeader,
  setVariant as _setVariant,
  shouldApplyVaryHeader as _shouldApplyVaryHeader,
  useAcceptHeader as _useAcceptHeader,
  validAcceptHeader as _validAcceptHeader,
  variant as _variant,
  type MimeNegotiationHost,
  type NullType,
} from "./mime-negotiation.js";
import type { ArrayInquirer } from "@blazetrails/activesupport";
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
import {
  contentSecurityPolicy as _contentSecurityPolicy,
  contentSecurityPolicyNonce as _contentSecurityPolicyNonce,
  contentSecurityPolicyNonceDirectives as _contentSecurityPolicyNonceDirectives,
  contentSecurityPolicyNonceGenerator as _contentSecurityPolicyNonceGenerator,
  contentSecurityPolicyReportOnly as _contentSecurityPolicyReportOnly,
  generateContentSecurityPolicyNonce as _generateContentSecurityPolicyNonce,
  setContentSecurityPolicy as _setContentSecurityPolicy,
  setContentSecurityPolicyNonceDirectives as _setContentSecurityPolicyNonceDirectives,
  setContentSecurityPolicyNonceGenerator as _setContentSecurityPolicyNonceGenerator,
  setContentSecurityPolicyReportOnly as _setContentSecurityPolicyReportOnly,
  type ContentSecurityPolicy,
  type NonceGenerator,
} from "./content-security-policy.js";
import { QueryParser } from "./query-parser.js";
import { X_CASCADE } from "../constants.js";
import type { PermissionsPolicy } from "../permissions-policy.js";
import type { ParameterFilter } from "@blazetrails/activesupport";
import { RequestUtils, type ParamValue } from "../request/utils.js";
import { COOKIES_APP_OPTIONS_KEY, type CookieJarOptions } from "../middleware/cookies.js";
import {
  parameters as _parameters,
  parameterParsers as _parameterParsers,
  paramsParsers as _paramsParsers,
  parseFormattedParameters as _parseFormattedParameters,
  pathParameters as _pathParameters,
  setParameterParsers as _setParameterParsers,
  setPathParameters as _setPathParameters,
  logParseErrorOnce as _logParseErrorOnce,
  type ParameterParser,
  type ParameterParsers,
  type ParametersHost,
} from "./parameters.js";
import { Headers as HttpHeaders } from "./headers.js";

const FLASH_HASH_KEY = "action_dispatch.request.flash_hash";
const ACTION_DISPATCH_REQUEST_ID = "action_dispatch.request_id";
const FORM_DATA_MEDIA_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"] as const;
const LOCALHOST_RE = /^(?:127(?:\.\d{1,3}){3}|::1|0:0:0:0:0:0:0:1(?:%.*)?)$/;

const RFC_METHODS = [
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
  Object.fromEntries(RFC_METHODS.map((m) => [m, m.toLowerCase().replace(/-/g, "_")])),
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

function envName(key: string): string {
  if (HTTP_HEADER_NAME.test(key)) {
    const upper = key.toUpperCase().replace(/-/g, "_");
    return CGI_VARIABLES.has(upper) ? upper : `HTTP_${upper}`;
  }
  return key;
}

export class Request {
  readonly env: RackEnv;

  constructor(env: RackEnv = {}) {
    this.env = { ...env };
    // Set defaults
    this.env["REQUEST_METHOD"] ??= "GET";
    this.env["SERVER_NAME"] ??= "localhost";
    this.env["SERVER_PORT"] ??= "80";
    this.env["PATH_INFO"] ??= "/";
    this.env["QUERY_STRING"] ??= "";
    this.env["rack.url_scheme"] ??= "http";
    this.env["rack.input"] ??= "";
  }

  // --- HTTP method ---

  get method(): string {
    // Check for method override via _method parameter or X-Http-Method-Override header
    if (this.requestMethod === "POST") {
      const override =
        (this.env["HTTP_X_HTTP_METHOD_OVERRIDE"] as string) ?? this.params?.["_method"];
      if (override) {
        const upper = String(override).toUpperCase();
        if (["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(upper)) {
          return upper;
        }
      }
    }
    return this.requestMethod;
  }

  get requestMethod(): string {
    return ((this.env["REQUEST_METHOD"] as string) || "GET").toUpperCase();
  }

  get isGet(): boolean {
    return this.method === "GET";
  }
  get isHead(): boolean {
    return this.method === "HEAD";
  }
  get isPost(): boolean {
    return this.method === "POST";
  }
  get isPut(): boolean {
    return this.method === "PUT";
  }
  get isPatch(): boolean {
    return this.method === "PATCH";
  }
  get isDelete(): boolean {
    return this.method === "DELETE";
  }

  // --- URL components ---

  get scheme(): string {
    if (this.env["HTTP_X_FORWARDED_PROTO"]) {
      return (this.env["HTTP_X_FORWARDED_PROTO"] as string).split(",")[0].trim();
    }
    return (this.env["rack.url_scheme"] as string) || "http";
  }

  get ssl(): boolean {
    return this.scheme === "https";
  }

  get host(): string {
    const httpHost = this.env["HTTP_HOST"] as string | undefined;
    if (httpHost) {
      // Strip port from host if present
      return httpHost.replace(/:\d+$/, "");
    }
    return (this.env["SERVER_NAME"] as string) || "localhost";
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
      (this.env["HTTP_HOST"] as string) || `${this.env["SERVER_NAME"]}:${this.env["SERVER_PORT"]}`
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
    return parseInt((this.env["SERVER_PORT"] as string) || "80", 10);
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
    return (this.env["ORIGINAL_FULLPATH"] as string) || this.fullpath;
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

  get contentLength(): number | undefined {
    const cl = this.env["CONTENT_LENGTH"] as string | undefined;
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
  declare readonly formats: MimeType[];
  declare hasContentType: () => boolean;
  declare negotiateMime: (order: MimeType[]) => MimeType | NullType | null;
  declare shouldApplyVaryHeader: () => boolean;
  declare setFormat: (extension: unknown) => void;
  declare setFormats: (extensions: unknown[]) => void;
  get variant(): ArrayInquirer<string> & Record<string, () => boolean> {
    return _variant.call(mimeHost(this));
  }
  set variant(value: string | string[] | null | undefined) {
    _setVariant.call(mimeHost(this), value);
  }

  // Class-level attribute mirroring Rails' `mattr_accessor :ignore_accept_header`.
  // Exposed as a static getter/setter so call sites read as `Request.ignoreAcceptHeader`
  // / `Request.ignoreAcceptHeader = true`.
  static get ignoreAcceptHeader(): boolean {
    return _ignoreAcceptHeader();
  }
  static set ignoreAcceptHeader(value: boolean) {
    _setIgnoreAcceptHeader(value);
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

  // --- Content Security Policy (ActionDispatch::ContentSecurityPolicy::Request) ---

  get contentSecurityPolicy(): ContentSecurityPolicy | null | undefined {
    return _contentSecurityPolicy.call(this);
  }
  set contentSecurityPolicy(policy: ContentSecurityPolicy | null) {
    _setContentSecurityPolicy.call(this, policy);
  }

  get contentSecurityPolicyReportOnly(): boolean | undefined {
    return _contentSecurityPolicyReportOnly.call(this);
  }
  set contentSecurityPolicyReportOnly(value: boolean) {
    _setContentSecurityPolicyReportOnly.call(this, value);
  }

  get contentSecurityPolicyNonceGenerator(): NonceGenerator | null | undefined {
    return _contentSecurityPolicyNonceGenerator.call(this);
  }
  set contentSecurityPolicyNonceGenerator(generator: NonceGenerator | null) {
    _setContentSecurityPolicyNonceGenerator.call(this, generator);
  }

  get contentSecurityPolicyNonceDirectives(): readonly string[] | null | undefined {
    return _contentSecurityPolicyNonceDirectives.call(this);
  }
  set contentSecurityPolicyNonceDirectives(directives: readonly string[] | null) {
    _setContentSecurityPolicyNonceDirectives.call(this, directives);
  }

  get contentSecurityPolicyNonce(): string | undefined {
    return _contentSecurityPolicyNonce.call(this);
  }

  /** @internal */
  generateContentSecurityPolicyNonce(): string {
    return _generateContentSecurityPolicyNonce.call(this);
  }

  // --- Permissions Policy (ActionDispatch::PermissionsPolicy::Request) ---

  get permissionsPolicy(): PermissionsPolicy | null | undefined {
    return this.env["action_dispatch.permissions_policy"] as PermissionsPolicy | null | undefined;
  }
  set permissionsPolicy(policy: PermissionsPolicy | null) {
    this.env["action_dispatch.permissions_policy"] = policy;
  }

  // --- Request type checks ---

  get isXmlHttpRequest(): boolean {
    return (this.env["HTTP_X_REQUESTED_WITH"] as string)?.toLowerCase() === "xmlhttprequest";
  }

  get xhr(): boolean {
    return this.isXmlHttpRequest;
  }

  // --- IP addresses ---

  get remoteIp(): string | null {
    const v = this.env["action_dispatch.remote_ip"];
    if (v != null) {
      if (typeof v === "object" && typeof (v as { calculate?: unknown }).calculate === "function") {
        return (v as { calculate(): string | null }).calculate();
      }
      return typeof v === "string" ? v : String(v);
    }
    return (this.env["REMOTE_ADDR"] as string) || "127.0.0.1";
  }

  set remoteIp(value: string | null) {
    this.env["action_dispatch.remote_ip"] = value;
  }

  get ip(): string | null {
    return this.remoteIp;
  }

  // --- Body ---

  get body(): string {
    const input = this.env["rack.input"];
    if (typeof input === "string") return input;
    if (input && typeof (input as { read?: unknown }).read === "function") {
      const buf = (input as { read(): string }).read();
      const rewind = (input as { rewind?: unknown }).rewind;
      if (typeof rewind === "function") {
        try {
          (rewind as () => void).call(input);
        } catch {
          // ignore
        }
      }
      return typeof buf === "string" ? buf : "";
    }
    return "";
  }

  get rawPost(): string {
    const cached = this.env["RAW_POST_DATA"];
    if (cached != null) return String(cached);
    // Rails caches raw_post under RAW_POST_DATA so repeated reads of a
    // stream-backed rack.input don't yield "" after the first drain.
    const body = this.body;
    this.env["RAW_POST_DATA"] = body;
    return body;
  }

  // --- Parameters ---

  get params(): Record<string, unknown> {
    return _parameters.call(this._paramsHost);
  }

  get queryParameters(): Record<string, unknown> {
    const qs = this.queryString;
    if (!qs) return {};
    return RequestUtils.normalizeEncodeParams(parseNestedQuery(qs) as ParamValue) as Record<
      string,
      unknown
    >;
  }

  get requestParameters(): Record<string, unknown> {
    const cached = this.env["action_dispatch.request.request_parameters"];
    if (cached && typeof cached === "object") {
      return cached as Record<string, unknown>;
    }

    const host = this._paramsHost;
    const params = _parseFormattedParameters.call(host, _paramsParsers.call(host), () =>
      this._fallbackRequestParameters(),
    );

    const normalized = RequestUtils.normalizeEncodeParams(params as ParamValue) as Record<
      string,
      unknown
    >;
    this.env["action_dispatch.request.request_parameters"] = normalized;
    return normalized;
  }

  get pathParameters(): Record<string, unknown> {
    return _pathParameters.call(this._paramsHost);
  }

  set pathParameters(params: Record<string, unknown>) {
    _setPathParameters.call(this._paramsHost, params);
  }

  /** Class-level parameter parser registry. Mirrors Rails `Request.parameter_parsers`. */
  static get parameterParsers(): ParameterParsers {
    return _parameterParsers();
  }

  static set parameterParsers(
    parsers: Record<string | symbol, ParameterParser> | Map<unknown, ParameterParser>,
  ) {
    _setParameterParsers(parsers);
  }

  /** @internal */
  private get _paramsHost(): ParametersHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const req = this;
    return {
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

  // Mixed in from MimeNegotiation onto the prototype below; declared here
  // for typing. `setFormat` / `setFormats` / `formats` are declared further
  // up alongside the rest of the MimeNegotiation surface.
  declare readonly format: MimeType | NullType;

  // --- Server software ---

  get serverSoftware(): string {
    return ((this.env["SERVER_SOFTWARE"] as string) || "").split("/")[0] || "";
  }

  // --- Header access ---

  /**
   * Returns the value for the given key mapped to the env. HTTP-header-style
   * names (alphanumerics + dashes) are converted to their CGI/Rack env name —
   * `"Content-Type" → "CONTENT_TYPE"`, `"If-None-Match" → "HTTP_IF_NONE_MATCH"`
   * — to mirror `ActionDispatch::Http::Headers#[]`. Keys that don't match the
   * pattern (e.g. `"action_dispatch.parameter_filter"`) pass through to the
   * env unchanged, mirroring `Request#get_header`.
   */
  getHeader(name: string): string | undefined {
    return this.env[envName(name)] as string | undefined;
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

  /** @internal Rails: `request.controller_instance` (request.rb:190-192). */
  get controllerInstance(): unknown {
    return this.env["action_controller.instance"];
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

  get session(): Record<string, unknown> {
    return (this.env["rack.session"] as Record<string, unknown>) || {};
  }

  // --- Flash ---
  //
  // Backed by an env header so the value survives the request lifecycle the
  // same way Rails' flash middleware stores it (`action_dispatch.request.flash_hash`).

  get flash(): unknown {
    return this.env[FLASH_HASH_KEY];
  }

  set flash(value: unknown) {
    this.env[FLASH_HASH_KEY] = value;
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
    return new HttpHeaders(this.env as Record<string, unknown>);
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

  /** @internal Validates `name` against the RFC methods list. */
  protected checkMethod(name: string | undefined): string | undefined {
    if (!name) return name;
    if (!Object.hasOwn(HTTP_METHOD_LOOKUP, name)) {
      throw new Error(`${name}, accepted HTTP methods are ${RFC_METHODS.join(", ")}`);
    }
    return name;
  }

  // --- Env-header passthroughs ---

  /** Rails: `request.route_uri_pattern` (env: `action_dispatch.route_uri_pattern`). */
  get routeUriPattern(): string | undefined {
    return this.env["action_dispatch.route_uri_pattern"] as string | undefined;
  }
  set routeUriPattern(pattern: string | undefined) {
    this.env["action_dispatch.route_uri_pattern"] = pattern;
  }

  /** @internal Rails: `request.routes` (env: `action_dispatch.routes`). */
  get routes(): unknown {
    return this.env["action_dispatch.routes"];
  }
  /** @internal */
  set routes(routes: unknown) {
    this.env["action_dispatch.routes"] = routes;
  }

  /** @internal Rails: `engine_script_name(_routes)` — env key from `_routes.env_key`. */
  engineScriptName(routes: { envKey: string }): unknown {
    return this.env[routes.envKey];
  }

  /** Rails: `http_auth_salt` env getter. */
  get httpAuthSalt(): unknown {
    return this.env["action_dispatch.http_auth_salt"];
  }

  /** Rails: `request_id` — set by `ActionDispatch::RequestId` middleware. */
  get requestId(): string | undefined {
    return this.env[ACTION_DISPATCH_REQUEST_ID] as string | undefined;
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
    return this.env["action_dispatch.logger"];
  }

  // --- Predicates / utility ---

  /** Rails: `request.key?(name)` — alias of {@link hasHeader}. */
  isKey(key: string): boolean {
    return this.hasHeader(key);
  }

  /** Rails: `form_data?` — content-type is form-data. */
  get isFormData(): boolean {
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
    return (this.env["HTTP_AUTHORIZATION"] ??
      this.env["X-HTTP_AUTHORIZATION"] ??
      this.env["X_HTTP_AUTHORIZATION"] ??
      this.env["REDIRECT_X_HTTP_AUTHORIZATION"]) as string | undefined;
  }

  // --- Body ---

  /** Rails: `body_stream` — raw `rack.input`. */
  get bodyStream(): unknown {
    return this.env["rack.input"];
  }

  /** @internal Rails: `read_body_stream` — drain `rack.input` with rewind guard. */
  protected readBodyStream(): string {
    const stream = this.bodyStream as
      | { read?: (n?: number) => string; rewind?: () => void }
      | undefined;
    if (!stream || typeof stream.read !== "function") return "";
    return this.resetStream(stream, () =>
      this.hasHeader("HTTP_TRANSFER_ENCODING") ? stream.read!() : stream.read!(this.contentLength),
    );
  }

  /** @internal Rails: `reset_stream` — rewind before+after yielding. */
  protected resetStream<T>(stream: { rewind?: () => void }, fn: () => T): T {
    if (typeof stream.rewind === "function") {
      stream.rewind();
      const result = fn();
      stream.rewind();
      return result;
    }
    return fn();
  }

  /** @internal Rails: `fallback_request_parameters` — parses raw post as form-urlencoded. */
  protected fallbackRequestParameters(): Record<string, unknown> {
    return this._fallbackRequestParameters();
  }

  // --- Session ---

  /** Rails: `reset_session` — destroys session and resets CSRF token. */
  resetSession(): void {
    const session = this.env["rack.session"] as { destroy?: () => void } | undefined;
    if (session && typeof session.destroy === "function") session.destroy();
    else this.env["rack.session"] = {};
    this.resetCsrfToken();
  }

  set sessionOptions(options: Record<string, unknown>) {
    this.env["rack.session.options"] = options;
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

  /** Rails: `commit_flash` — no-op on the bare Request; the Flash middleware overrides. */
  commitFlash(): void {}

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

  declare validAcceptHeader: () => boolean;
  declare useAcceptHeader: () => boolean;
  declare formatFromPathExtension: () => MimeType | undefined;
  declare isParamsReadable: () => boolean;

  // --- Controller dispatch ---

  /**
   * Rails: `request.controller_class` (request.rb:88-92). Defaults the
   * `action` path-parameter to `"index"` and resolves the controller class
   * via {@link controllerClassFor}.
   */
  controllerClass(): typeof PassNotFound {
    const params = this.pathParameters;
    if (params["action"] == null) params["action"] = "index";
    return this.controllerClassFor(params["controller"] as string | undefined);
  }

  /**
   * Rails: `request.controller_class_for(name)` (request.rb:94-110). When
   * `name` is absent, returns the {@link PassNotFound} sentinel; otherwise
   * throws — Trails has no global constant table to back Rails'
   * `"#{name.camelize}Controller".constantize` lookup, so callers must
   * resolve the class through the router (which knows the registered
   * controllers for a route) until that bridge lands.
   */
  controllerClassFor(name: string | undefined | null): typeof PassNotFound {
    // Ruby `if name` is truthy for empty strings; only nil/false fall through
    // to the PASS_NOT_FOUND branch. Mirror with explicit null-check so `""`
    // takes the resolution path (and surfaces the not-implemented error).
    if (name != null) {
      throw new Error(
        `controllerClassFor(${name}): Trails has no global controller constant table; ` +
          `resolve the controller class via the router instead.`,
      );
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

// --- ActionDispatch::Http::MimeNegotiation wiring ---
// The mixin's host shape (getHeader/setHeader) reads env keys directly,
// while Request#getHeader normalizes to `HTTP_*` for case-insensitive HTTP
// header lookup. We adapt via a per-Request host stored in a WeakMap so the
// mixin's `_variant` slot persists across calls. The mixin's getHeader/
// setHeader semantics treat `undefined` as "not cached" (calls fall through
// to compute and `setHeader` writes the value, including `null`).
const MIME_HOSTS = new WeakMap<Request, MimeNegotiationHost>();
function mimeHost(req: Request): MimeNegotiationHost {
  let h = MIME_HOSTS.get(req);
  if (!h) {
    h = {
      getHeader: (k) => req.env[k],
      setHeader: (k, v) => {
        req.env[k] = v;
        return v;
      },
      get parameters() {
        return req.params;
      },
      get accept() {
        return req.accept;
      },
      get xhr() {
        return req.xhr;
      },
    };
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
Object.defineProperty(Request.prototype, "format", {
  get(this: Request) {
    return _format.call(mimeHost(this));
  },
  configurable: true,
});
Object.defineProperty(Request.prototype, "formats", {
  get(this: Request) {
    return _formats.call(mimeHost(this));
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
Request.prototype.setFormat = function (this: Request, extension: unknown) {
  _setFormat.call(mimeHost(this), extension);
};
Request.prototype.setFormats = function (this: Request, extensions: unknown[]) {
  _setFormats.call(mimeHost(this), extensions);
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
async function* emptyRackBody(): RackBody {}

export class PassNotFound {
  /** @internal */
  static action(_name: unknown): typeof PassNotFound {
    return PassNotFound;
  }
  /** @internal */
  static call(_env: RackEnv): RackResponse {
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
