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
import { Request as CspRequest } from "./content-security-policy.js";
import { QueryParser } from "./query-parser.js";
import { X_CASCADE } from "../constants.js";
import type { PermissionsPolicy } from "../permissions-policy.js";
import type { ParameterFilter } from "@blazetrails/activesupport";
import { RequestUtils, type ParamValue } from "../request/utils.js";
import {
  COOKIES_APP_OPTIONS_KEY,
  authenticatedEncryptedCookieSalt as _authenticatedEncryptedCookieSalt,
  cookieJar as _cookieJar,
  cookiesDigest as _cookiesDigest,
  cookiesRotations as _cookiesRotations,
  cookiesSameSiteProtection as _cookiesSameSiteProtection,
  cookiesSerializer as _cookiesSerializer,
  encryptedCookieCipher as _encryptedCookieCipher,
  encryptedCookieSalt as _encryptedCookieSalt,
  encryptedSignedCookieSalt as _encryptedSignedCookieSalt,
  isHaveCookieJar as _isHaveCookieJar,
  secretKeyBase as _secretKeyBase,
  signedCookieDigest as _signedCookieDigest,
  signedCookieSalt as _signedCookieSalt,
  useAuthenticatedCookieEncryption as _useAuthenticatedCookieEncryption,
  useCookiesWithMetadata as _useCookiesWithMetadata,
  type CookieJar,
  type CookieJarOptions,
} from "../middleware/cookies.js";
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

  constructor(env: RackEnv = {}) {
    this.env = env;
  }

  get method(): string {
    this.#method ??= this.checkMethod(
      this.getHeader("rack.methodoverride.original_method") ?? this.getHeader("REQUEST_METHOD"),
    );
    return this.#method as string;
  }

  get requestMethod(): string {
    this.#requestMethod ??= this.checkMethod(this.rawRequestMethod);
    return this.#requestMethod as string;
  }

  /** @internal */
  set requestMethod(requestMethod: string) {
    if (this.checkMethod(requestMethod)) {
      this.#requestMethod = this.setHeader("REQUEST_METHOD", requestMethod) as string;
    }
  }

  get rawRequestMethod(): string {
    return this.getHeader("REQUEST_METHOD") as string;
  }

  get host(): string {
    return this.rawHostWithPort.replace(/:\d+$/, "");
  }

  get rawHost(): string {
    return this.rawHostWithPort;
  }

  get protocol(): string {
    return this.ssl ? "https://" : "http://";
  }

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

  domain(tldLength: number = HttpURL.tldLength): string | null {
    return HttpURL.extractDomain(this.host, tldLength);
  }

  subdomains(tldLength: number = HttpURL.tldLength): string[] {
    return HttpURL.extractSubdomains(this.host, tldLength);
  }

  subdomain(tldLength: number = HttpURL.tldLength): string {
    return HttpURL.extractSubdomain(this.host, tldLength);
  }

  get mediaType(): string | undefined {
    return this.contentMimeType?.toString();
  }

  get contentLength(): number | undefined {
    if (this.hasHeader(TRANSFER_ENCODING)) return new TextEncoder().encode(this.rawPost).length;
    const cl = this.getHeader("CONTENT_LENGTH") as string | undefined;
    if (!cl) return undefined;
    const n = parseInt(cl, 10);
    return isNaN(n) ? undefined : n;
  }

  get accept(): string {
    return (this.env["HTTP_ACCEPT"] as string) || "";
  }

  declare readonly ifModifiedSince: Date | undefined;
  declare readonly ifNoneMatch: string | undefined;
  declare readonly ifNoneMatchEtags: string[];
  declare notModified: (modifiedAt: Date | undefined) => boolean;
  declare etagMatches: (etag: string | undefined) => boolean;
  declare fresh: (response: CacheResponseLike) => boolean;

  declare readonly contentMimeType: MimeType | null;
  declare readonly accepts: MimeType[];
  declare hasContentType: () => boolean;
  declare negotiateMime: (order: MimeType[]) => MimeType | NullType | null;
  declare shouldApplyVaryHeader: () => boolean;
  get format(): MimeType | NullType {
    return _format.call(mimeHost(this));
  }
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

  static get ignoreAcceptHeader(): boolean {
    return _MimeNegotiation.ignoreAcceptHeader;
  }
  static set ignoreAcceptHeader(value: boolean) {
    _MimeNegotiation.ignoreAcceptHeader = value;
  }

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

  get permissionsPolicy(): PermissionsPolicy | null | undefined {
    return this.getHeader("action_dispatch.permissions_policy") as
      | PermissionsPolicy
      | null
      | undefined;
  }
  set permissionsPolicy(policy: PermissionsPolicy | null) {
    this.setHeader("action_dispatch.permissions_policy", policy);
  }

  get isXmlHttpRequest(): boolean {
    return (this.getHeader("HTTP_X_REQUESTED_WITH") as string)?.toLowerCase() === "xmlhttprequest";
  }

  get xhr(): boolean {
    return this.isXmlHttpRequest;
  }

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

  get body(): string {
    const rawPost = this.getHeader("RAW_POST_DATA");
    if (rawPost != null) return String(rawPost);
    return this.readBodyStream();
  }

  get rawPost(): string {
    if (!this.hasHeader("RAW_POST_DATA")) {
      this.setHeader("RAW_POST_DATA", this.readBodyStream());
    }
    return String(this.getHeader("RAW_POST_DATA"));
  }

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

  static get parameterParsers(): ParameterParsers {
    return _Parameters.parameterParsers;
  }

  static set parameterParsers(
    parsers: Record<string | symbol, ParameterParser> | Map<unknown, ParameterParser>,
  ) {
    _Parameters.parameterParsers = parsers;
  }

  /** @internal */
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

  get serverSoftware(): string {
    return ((this.getHeader("SERVER_SOFTWARE") as string) || "").split("/")[0] || "";
  }

  getHeader(name: string): any {
    return this.env[envName(name)];
  }

  hasHeader(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.env, key);
  }

  setHeader(key: string, value: unknown): unknown {
    this.env[key] = value;
    return value;
  }

  addHeader(key: string, v: unknown): unknown {
    if (v == null) {
      return this.getHeader(key);
    } else if (this.hasHeader(key)) {
      return this.setHeader(key, `${this.getHeader(key)},${v}`);
    } else {
      return this.setHeader(key, v);
    }
  }

  eachHeader(block: (key: string, value: unknown) => void): void {
    for (const [key, value] of Object.entries(this.env)) block(key, value);
  }

  /** @internal */
  get controllerInstance(): unknown {
    return this.getHeader("action_controller.instance");
  }

  /** @internal */
  set controllerInstance(controller: unknown) {
    this.setHeader("action_controller.instance", controller);
  }

  deleteHeader(key: string): void {
    delete this.env[key];
  }

  fetchHeader(key: string): unknown;
  fetchHeader<T>(key: string, fallback: (key: string) => T): unknown | T;
  fetchHeader<T>(key: string, fallback?: (key: string) => T): unknown | T {
    if (Object.prototype.hasOwnProperty.call(this.env, key)) return this.env[key];
    if (fallback) return fallback(key);
    throw new Error(`key not found: ${key}`);
  }

  inspect(): string {
    return `#<ActionDispatch::Request ${this.method} "${this.fullpath}">`;
  }

  get session(): Session {
    return this.fetchHeader(RACK_SESSION, (k) =>
      this.setHeader(k, this.defaultSession()),
    ) as Session;
  }

  get flash(): FlashHash | null {
    return flash.call(this as never);
  }

  set flash(value: FlashHash | null) {
    flash.call(this as never, value);
  }

  /** @internal */
  flashHash(): FlashHash | null {
    return flashHash.call(this as never);
  }

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

  get headers(): HttpHeaders {
    return new HttpHeaders(this);
  }

  get methodSymbol(): string | undefined {
    return HTTP_METHOD_LOOKUP[this.method];
  }

  get requestMethodSymbol(): string | undefined {
    return HTTP_METHOD_LOOKUP[this.requestMethod];
  }

  /** @internal */
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

  get routeUriPattern(): string | undefined {
    return this.getHeader("action_dispatch.route_uri_pattern") as string | undefined;
  }
  set routeUriPattern(pattern: string | undefined) {
    this.env["action_dispatch.route_uri_pattern"] = pattern;
  }

  /** @internal */
  get routes(): unknown {
    return this.getHeader("action_dispatch.routes");
  }
  /** @internal */
  set routes(routes: unknown) {
    this.env["action_dispatch.routes"] = routes;
  }

  /** @internal */
  engineScriptName(routes: { envKey: string }): unknown {
    return this.getHeader(routes.envKey);
  }

  get keyGenerator(): { generateKey(salt: string, keySize?: number): Buffer | string } | undefined {
    return this.env["action_dispatch.key_generator"] as
      | { generateKey(salt: string, keySize?: number): Buffer | string }
      | undefined;
  }

  get httpAuthSalt(): unknown {
    return this.getHeader("action_dispatch.http_auth_salt");
  }

  get requestId(): string | undefined {
    return this.getHeader(ACTION_DISPATCH_REQUEST_ID) as string | undefined;
  }
  set requestId(id: string | undefined) {
    this.env[ACTION_DISPATCH_REQUEST_ID] = id;
  }

  get uuid(): string | undefined {
    return this.requestId;
  }

  get logger(): unknown {
    return this.getHeader("action_dispatch.logger");
  }

  isKey(key: string): boolean {
    return this.hasHeader(key);
  }

  get formData(): boolean {
    const mt = this.mediaType;
    return mt != null && (FORM_DATA_MEDIA_TYPES as readonly string[]).includes(mt);
  }

  get isLocal(): boolean {
    const addr = (this.env["REMOTE_ADDR"] as string | undefined) ?? "";
    const ip = this.remoteIp ?? "";
    return LOCALHOST_RE.test(addr) && LOCALHOST_RE.test(ip);
  }

  get authorization(): string | undefined {
    return (this.getHeader("HTTP_AUTHORIZATION") ??
      this.getHeader("X-HTTP_AUTHORIZATION") ??
      this.getHeader("X_HTTP_AUTHORIZATION") ??
      this.getHeader("REDIRECT_X_HTTP_AUTHORIZATION")) as string | undefined;
  }

  get bodyStream(): unknown {
    return this.getHeader("rack.input");
  }

  /** @internal */
  protected readBodyStream(): string {
    const input = this.bodyStream;
    if (typeof input === "string") return input;
    const stream = input as { read?: (n?: number) => string; rewind?: () => void } | undefined;
    if (!stream || typeof stream.read !== "function") return "";
    return this.resetStream(stream, () =>
      this.hasHeader(TRANSFER_ENCODING) ? stream.read!() : stream.read!(this.contentLength),
    );
  }

  /** @internal */
  protected resetStream<T>(bodyStream: { rewind?: () => void }, fn: () => T): T {
    if (typeof bodyStream.rewind === "function") {
      bodyStream.rewind();
      const result = fn();
      bodyStream.rewind();
      return result;
    }
    return fn();
  }

  /** @internal */
  protected fallbackRequestParameters(): Record<string, unknown> {
    return this._fallbackRequestParameters();
  }

  resetSession(): void {
    this.session.destroy();
    this.resetCsrfToken();
    resetFlashSession.call(this as never);
  }

  set session(session: Session) {
    Session.set(this, session);
  }

  get sessionOptions(): Record<string, unknown> {
    return this.fetchHeader(RACK_SESSION_OPTIONS, (k: string) => this.setHeader(k, {})) as Record<
      string,
      unknown
    >;
  }

  set sessionOptions(options: Record<string, unknown>) {
    Session.Options.set(this, options);
  }

  /** @internal */
  protected defaultSession(): Session {
    return Session.disabled(this);
  }

  resetCsrfToken(): void {
    const c = this.controllerInstance as { resetCsrfToken?: (req: unknown) => void } | undefined;
    if (c && typeof c.resetCsrfToken === "function") c.resetCsrfToken(this);
  }

  commitCsrfToken(): void {
    const c = this.controllerInstance as { commitCsrfToken?: (req: unknown) => void } | undefined;
    if (c && typeof c.commitCsrfToken === "function") c.commitCsrfToken(this);
  }

  commitFlash(): void {
    commitFlash.call(this as never);
  }

  commitCookieJarBang(): void {
    this.cookieJar().commitBang();
  }

  GET(): Record<string, unknown> {
    return this.queryParameters;
  }

  POST(): Record<string, unknown> {
    return this.requestParameters;
  }

  get parameters(): Record<string, unknown> {
    const override = this.env["action_dispatch.request.parameters_override"];
    if (override) return override as Record<string, unknown>;
    return this.params;
  }
  set parameters(value: Record<string, unknown>) {
    this.env["action_dispatch.request.parameters_override"] = value;
  }

  sendEarlyHints(links: Record<string, string>): void {
    const cb = this.env["rack.early_hints"] as ((l: Record<string, string>) => void) | undefined;
    if (typeof cb === "function") cb(links);
  }

  get rackRequest(): RackRequest {
    const cached = this.env["action_dispatch.rack_request"] as RackRequest | undefined;
    if (cached) return cached;
    const r = new RackRequest(this.env);
    this.env["action_dispatch.rack_request"] = r;
    return r;
  }

  /** @internal */
  declare validAcceptHeader: () => boolean;
  /** @internal */
  declare useAcceptHeader: () => boolean;
  /** @internal */
  declare formatFromPathExtension: () => MimeType | undefined;
  /** @internal */
  declare isParamsReadable: () => boolean;

  controllerClass(): DispatchableControllerClass | typeof PassNotFound {
    const params = this.pathParameters;
    if (params["action"] == null) params["action"] = "index";
    return this.controllerClassFor(params["controller"] as string | undefined);
  }

  controllerClassFor(
    name: string | undefined | null,
  ): DispatchableControllerClass | typeof PassNotFound {
    if (name != null) {
      const controllerParam = underscore(name);
      const constName = `${camelize(controllerParam)}Controller`;
      const klass = controllerConstants.get(controllerParam);
      if (!klass) throw new MissingController(`uninitialized constant ${constName}`, constName);
      return klass;
    }
    return PassNotFound;
  }

  requestParametersList(): Array<[string, unknown]> | null {
    const rackPost = this.rackRequest.POST;
    const formPairs = this.env["rack.request.form_pairs"];
    if (formPairs != null) return formPairs as Array<[string, unknown]>;
    const formVars = this.env["rack.request.form_vars"];
    if (formVars != null) return Array.from(QueryParser.eachPair(formVars as string));
    if (rackPost && typeof rackPost === "object" && Object.keys(rackPost as object).length > 0) {
      return null;
    }
    return [];
  }

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

  static create(env: RackEnv = {}): Request {
    return new Request(env);
  }

  static empty(): Request {
    return new Request({});
  }
}

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
  | "host"
  | "port"
  | "hostWithPort"
  | "serverPort"
  | "url"
  | "fullpath"
  | "mediaType"
  | "contentLength"
  | "xhr"
  | "ip"
  | "params"
  | "session"
  | "sessionOptions"
  | "logger"
  | "GET"
  | "POST"
  | "formData"
  | "defaultSession"
> {}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface Request extends CspRequest {}
include(Request, CspRequest);

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

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include RequestCookieMethods`; the class/interface merge is how a mixin surfaces on the type side. */
export interface Request {
  cookieJar(jar?: CookieJar): CookieJar;
  isHaveCookieJar(): boolean;
  signedCookieSalt(): string | undefined;
  encryptedCookieSalt(): string | undefined;
  encryptedSignedCookieSalt(): string | undefined;
  authenticatedEncryptedCookieSalt(): string | undefined;
  useAuthenticatedCookieEncryption(): boolean | undefined;
  encryptedCookieCipher(): string | undefined;
  signedCookieDigest(): string | undefined;
  secretKeyBase(): string | undefined;
  cookiesSerializer(): string | undefined;
  cookiesSameSiteProtection(): unknown;
  cookiesDigest(): string | undefined;
  cookiesRotations(): unknown;
  useCookiesWithMetadata(): boolean | undefined;
}
Request.prototype.cookieJar = _cookieJar;
Request.prototype.isHaveCookieJar = _isHaveCookieJar;
Request.prototype.signedCookieSalt = _signedCookieSalt;
Request.prototype.encryptedCookieSalt = _encryptedCookieSalt;
Request.prototype.encryptedSignedCookieSalt = _encryptedSignedCookieSalt;
Request.prototype.authenticatedEncryptedCookieSalt = _authenticatedEncryptedCookieSalt;
Request.prototype.useAuthenticatedCookieEncryption = _useAuthenticatedCookieEncryption;
Request.prototype.encryptedCookieCipher = _encryptedCookieCipher;
Request.prototype.signedCookieDigest = _signedCookieDigest;
Request.prototype.secretKeyBase = _secretKeyBase;
Request.prototype.cookiesSerializer = _cookiesSerializer;
Request.prototype.cookiesSameSiteProtection = _cookiesSameSiteProtection;
Request.prototype.cookiesDigest = _cookiesDigest;
Request.prototype.cookiesRotations = _cookiesRotations;
Request.prototype.useCookiesWithMetadata = _useCookiesWithMetadata;

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

/** @internal */
export async function* emptyRackBody(): RackBody {}

/** @noRailsEquivalent PERMANENT */
export class MissingController extends NameError {
  constructor(message: string, constantName?: string) {
    super(message, constantName);
    this.name = "MissingController";
  }
}

/** @noRailsEquivalent CONVERGEABLE controller-constant-resolution-throws-instead-of-constantize */
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
