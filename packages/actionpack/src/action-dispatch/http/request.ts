import {
  camelize,
  constantize,
  NameError,
  toSentence,
  underscore,
  type Logger,
} from "@blazetrails/activesupport";
import {
  EOFError,
  Encoding,
  StringIO,
  forceEncoding,
  rbModConstSet,
  rbRegMatchP,
  rbStrDump,
  toI,
  excSetupMessage,
  rbObjDup,
} from "@blazetrails/ruby-compat";
import type { RackBody, RackEnv, RackResponse } from "@blazetrails/rack";
import {
  parseNestedQuery,
  RACK_SESSION,
  RACK_SESSION_OPTIONS,
  Request as RackRequest,
  RequestHelpers,
} from "@blazetrails/rack";
import { BadRequest, UnknownHttpMethod } from "../../action-controller/metal/exceptions.js";
import { ParamBuilder } from "./param-builder.js";
import { ParamError } from "./param-error.js";
import type { DispatchableControllerClass } from "../routing/dispatcher.js";
import { Session } from "../request/session.js";
import {
  commitFlash,
  RequestMethods as FlashRequestMethods,
  resetSession as resetFlashSession,
} from "../middleware/flash.js";
import {
  etagMatches as _etagMatches,
  fresh as _fresh,
  Request as CacheRequest,
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
  formatFromPathExtension as _formatFromPathExtension,
  hasContentType as _hasContentType,
  MimeNegotiation as _MimeNegotiation,
  negotiateMime as _negotiateMime,
  isParamsReadable as _isParamsReadable,
  setFormat as _setFormat,
  shouldApplyVaryHeader as _shouldApplyVaryHeader,
  useAcceptHeader as _useAcceptHeader,
  validAcceptHeader as _validAcceptHeader,
} from "./mime-negotiation.js";
import {
  include,
  runLoadHooks,
  type ArrayInquirer,
  type Included,
} from "@blazetrails/activesupport";
import type { MimeType, NullType } from "./mime-type.js";
import { URL as HttpURL } from "./url.js";
import {
  envFilter as _envFilter,
  filteredEnv as _filteredEnv,
  filteredParameters as _filteredParameters,
  filteredPath as _filteredPath,
  filteredQueryString as _filteredQueryString,
  type FilterParameters,
  parameterFilter as _parameterFilter,
  parameterFilterFor as _parameterFilterFor,
} from "./filter-parameters.js";
import { Request as CspRequest } from "./content-security-policy.js";
import { QueryParser } from "./query-parser.js";
import { X_CASCADE } from "../constants.js";
import { Request as PermissionsPolicyRequest } from "./permissions-policy.js";
import type { ParameterFilter } from "@blazetrails/activesupport";
import { Utils, type ParamHash } from "../request/utils.js";
import "../middleware/cookies.js";
import type { RequestCookieMethods } from "../middleware/cookies.js";
import {
  Parameters as _Parameters,
  paramsParsers as _paramsParsers,
  parseFormattedParameters as _parseFormattedParameters,
  parameters as _parameters,
  logParseErrorOnce as _logParseErrorOnce,
  type ParameterParser,
  type ParameterParsers,
} from "./parameters.js";
import { Headers as HttpHeaders } from "./headers.js";
import type { GetIp } from "../middleware/remote-ip.js";
import { ActionDispatch } from "../../namespaces.js";

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

export const ENV_METHODS: readonly string[] = Object.freeze([
  "AUTH_TYPE",
  "GATEWAY_INTERFACE",
  "PATH_TRANSLATED",
  "REMOTE_HOST",
  "REMOTE_IDENT",
  "REMOTE_USER",
  "REMOTE_ADDR",
  "SERVER_NAME",
  "SERVER_PROTOCOL",
  "ORIGINAL_SCRIPT_NAME",

  "HTTP_ACCEPT",
  "HTTP_ACCEPT_CHARSET",
  "HTTP_ACCEPT_ENCODING",
  "HTTP_ACCEPT_LANGUAGE",
  "HTTP_CACHE_CONTROL",
  "HTTP_FROM",
  "HTTP_NEGOTIATE",
  "HTTP_PRAGMA",
  "HTTP_CLIENT_IP",
  "HTTP_X_FORWARDED_FOR",
  "HTTP_ORIGIN",
  "HTTP_VERSION",
  "HTTP_X_CSRF_TOKEN",
  "HTTP_X_REQUEST_ID",
  "HTTP_X_FORWARDED_HOST",
]);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Request {
  declare static Utils: typeof Utils;
  static HTTP_METHODS = HTTP_METHODS;
  static HTTP_METHOD_LOOKUP = HTTP_METHOD_LOOKUP;
  static ENV_METHODS = ENV_METHODS;

  static {
    for (const env of ENV_METHODS) {
      Object.defineProperty(
        this.prototype,
        camelize(env.replace(/^HTTP_/, "").toLowerCase(), false),
        {
          get(this: Request) {
            return this.getHeader(env);
          },
          configurable: true,
        },
      );
    }
  }

  readonly env: RackEnv;
  declare readonly ssl: boolean;

  #method?: string;
  #requestMethod?: string;
  /** @internal */
  declare _protocol: string | null;
  /** @internal */
  declare _port: number | null;

  /**
   * @inlinedFrom Rack::Request::Env#initialize rack/v3.1.14/lib/rack/request.rb:86-91
   * @inlinedFrom ActionDispatch::Http::URL#initialize rails/v8.0.2/actionpack/lib/action_dispatch/http/url.rb:181-185
   * @inlinedFrom ActionDispatch::Http::FilterParameters#initialize rails/v8.0.2/actionpack/lib/action_dispatch/http/filter_parameters.rb:24-30
   */
  constructor(env: RackEnv = {}) {
    this.env = env;
    this._filteredParameters = null;
    this._filteredEnv = null;
    this._filteredPath = null;
    this._parameterFilter = null;
    this._protocol = null;
    this._port = null;
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

  get fullpath(): string {
    const qs = this.queryString;
    return qs ? `${this.path}?${qs}` : this.path;
  }

  get originalFullpath(): string {
    return (this.getHeader("ORIGINAL_FULLPATH") as string) || this.fullpath;
  }

  get originalUrl(): string {
    return `${this.scheme}://${this.hostWithPort()}${this.originalFullpath}`;
  }

  get mediaType(): string | undefined {
    return this.contentMimeType?.toString();
  }

  get contentLength(): number {
    if (this.hasHeader(TRANSFER_ENCODING)) return new TextEncoder().encode(this.rawPost).length;
    return Number(toI(this.rackRequest.contentLength));
  }

  declare readonly ifModifiedSince: Date | undefined;
  declare readonly ifNoneMatch: string | undefined;
  declare readonly ifNoneMatchEtags: string[];
  declare notModified: (modifiedAt: Date | undefined) => boolean;
  declare etagMatches: (etag: string | null | undefined) => boolean;
  declare fresh: (response: CacheResponseLike) => boolean;

  declare readonly contentMimeType: MimeType | null;
  declare readonly accepts: MimeType[];
  declare hasContentType: () => boolean;
  declare negotiateMime: (order: MimeType[]) => MimeType | NullType | null;
  declare shouldApplyVaryHeader: () => boolean;
  get format(): MimeType | NullType {
    return _format.call(this);
  }
  declare setFormat: (extension: unknown) => void;

  declare static ignoreAcceptHeader: boolean;
  declare ignoreAcceptHeader: boolean;

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

  get isXmlHttpRequest(): boolean {
    return rbRegMatchP(
      /XMLHttpRequest/i,
      this.getHeader("HTTP_X_REQUESTED_WITH") as string | null | undefined,
    );
  }

  get xhr(): boolean {
    return this.isXmlHttpRequest;
  }

  get remoteIp(): string | null {
    const v = this.getHeader("action_dispatch.remote_ip");
    if (v != null) {
      if (typeof v === "object") return (v as { toString(): string | null }).toString();
      return typeof v === "string" ? v : String(v);
    }
    return (this.getHeader("REMOTE_ADDR") as string) || "127.0.0.1";
  }

  set remoteIp(value: string | GetIp | null) {
    this.setHeader("action_dispatch.remote_ip", value);
  }

  get ip(): string | null {
    return this.remoteIp;
  }

  /** @missingRailsArgs force_encoding — PERMANENT */
  get body(): StringIO {
    let rawPost = this.getHeader("RAW_POST_DATA") as string | null | undefined;
    if (rawPost != null) {
      rawPost = forceEncoding(rawPost, Encoding.BINARY);
      return new StringIO(rawPost);
    } else {
      return this.bodyStream;
    }
  }

  get rawPost(): string {
    if (!this.hasHeader("RAW_POST_DATA")) {
      this.setHeader("RAW_POST_DATA", this.readBodyStream());
    }
    return this.getHeader("RAW_POST_DATA") as string;
  }

  declare readonly params: Record<string, unknown>;

  get queryParameters(): Record<string, unknown> {
    return this.GET();
  }

  get requestParameters(): Record<string, unknown> {
    return this.POST();
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
  private _fallbackRequestParameters(): Record<string, unknown> {
    const input = this.rawPost;
    if (!input) return {};
    const ct = ((this.env["CONTENT_TYPE"] as string) || "").toLowerCase();
    if (ct.includes("application/x-www-form-urlencoded")) {
      return parseNestedQuery(input);
    }
    return {};
  }

  get serverSoftware(): string | null {
    const m =
      this.getHeader("SERVER_SOFTWARE") != null &&
      /^([a-zA-Z]+)/.exec(this.getHeader("SERVER_SOFTWARE") as string);
    return m ? m[1].toLowerCase() : null;
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
    return `#<ActionDispatch::Request ${this.method} ${rbStrDump(this.originalUrl)} for ${this.remoteIp ?? ""}>`;
  }

  get session(): Session {
    return this.fetchHeader(RACK_SESSION, (k) =>
      this.setHeader(k, this.defaultSession()),
    ) as Session;
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

  /** @internal */
  setEngineScriptName(name: string): void {
    this.setHeader((this.routes as { envKey: string }).envKey, rbObjDup(name));
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

  get logger(): Logger | undefined {
    return this.getHeader("action_dispatch.logger") as Logger | undefined;
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

  get bodyStream(): StringIO {
    return this.getHeader("rack.input") as StringIO;
  }

  /** @internal */
  protected readBodyStream(): string | null | undefined {
    if (this.bodyStream != null) {
      return this.resetStream(this.bodyStream, () => {
        if (this.hasHeader(TRANSFER_ENCODING)) {
          return this.bodyStream.read();
        } else {
          return this.bodyStream.read(this.contentLength);
        }
      });
    }
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

  async resetSession(): Promise<void> {
    await this.session.destroy();
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
    try {
      return this.fetchHeader("action_dispatch.request.query_parameters", (k) => {
        const encodingTemplate = Request.Utils.CustomParamEncoder.actionEncodingTemplate(
          this,
          this.pathParameters["controller"] as string | undefined,
          this.pathParameters["action"] as string | undefined,
        );
        const rackQueryParams = ParamBuilder.fromQueryString(this.rackRequest.queryString, {
          encodingTemplate: encodingTemplate,
        });

        return this.setHeader(k, rackQueryParams);
      }) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof ParamError) {
        throw excSetupMessage(new BadRequest(`Invalid query parameters: ${e.message}`, e), e);
      }
      throw e;
    }
  }

  POST(): Record<string, unknown> {
    try {
      return this.fetchHeader("action_dispatch.request.request_parameters", (k) => {
        const encodingTemplate = Request.Utils.CustomParamEncoder.actionEncodingTemplate(
          this,
          this.pathParameters["controller"] as string | undefined,
          this.pathParameters["action"] as string | undefined,
        );

        let paramList: Array<[string, unknown]> | null = null;
        let pr = this.parseFormattedParameters(this.paramsParsers(), () => {
          if ((paramList = this.requestParametersList()) != null) {
            return ParamBuilder.fromPairs(paramList, { encodingTemplate: encodingTemplate });
          } else {
            return this._fallbackRequestParameters();
          }
        });

        if (paramList === null) {
          pr = ParamBuilder.fromHash(pr as ParamHash, { encodingTemplate: encodingTemplate });
        }

        return this.setHeader(k, pr);
      }) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof ParamError || e instanceof EOFError) {
        throw excSetupMessage(new BadRequest(`Invalid request parameters: ${e.message}`, e), e);
      }
      throw e;
    }
  }

  get parameters(): Record<string, unknown> {
    return _parameters.call(this);
  }

  sendEarlyHints(links: Record<string, string>): void {
    (this.env["rack.early_hints"] as ((links: Record<string, string>) => void) | undefined)?.call(
      null,
      links,
    );
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

  controllerClass(): DispatchableControllerClass | typeof PASS_NOT_FOUND | null {
    const params = this.pathParameters;
    if (params["action"] == null) params["action"] = "index";
    return this.controllerClassFor(params["controller"] as string | undefined);
  }

  /** @inventedArm get — CONVERGEABLE controller-constant-resolution-throws-instead-of-constantize */
  controllerClassFor(
    name: string | undefined | null,
  ): DispatchableControllerClass | typeof PASS_NOT_FOUND {
    if (name != null) {
      const controllerParam = underscore(name);
      const constName = `${camelize(controllerParam)}Controller`;
      try {
        return (
          controllerConstants.get(controllerParam) ??
          (constantize(constName) as DispatchableControllerClass)
        );
      } catch (error) {
        if (!(error instanceof NameError)) throw error;
        if (error.missingName() === constName || constName.startsWith(`${error.missingName()}::`)) {
          throw new MissingController(error.message, error.constantName);
        } else {
          throw error;
        }
      }
    }
    return PASS_NOT_FOUND;
  }

  requestParametersList(): Array<[string, unknown]> | null {
    const rackPost = this.rackRequest.POST;
    const formPairs = this.getHeader("rack.request.form_pairs");
    if (formPairs != null) return formPairs as Array<[string, unknown]>;
    const formVars = this.getHeader("rack.request.form_vars");
    if (formVars != null) return Array.from(QueryParser.eachPair(formVars as string));
    if (rackPost && typeof rackPost === "object" && Object.keys(rackPost as object).length > 0) {
      return null;
    }
    return [];
  }

  /** @internal */
  paramsParsers(): ParameterParsers {
    return _paramsParsers.call(this);
  }
  /** @internal */
  parseFormattedParameters(
    parsers: ParameterParsers,
    fallback: () => Record<string, unknown>,
  ): ReturnType<ParameterParser> {
    return _parseFormattedParameters.call(this, parsers, fallback);
  }
  /** @internal */
  logParseErrorOnce(): void {
    _logParseErrorOnce.call(this);
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
include(Request, _MimeNegotiation);
include(Request, _Parameters);
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
  | "hostWithPort"
  | "ssl"
  | "port"
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
  | "serverName"
  | "acceptEncoding"
  | "acceptLanguage"
> {}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Request {
  get authType(): string | undefined;
  get gatewayInterface(): string | undefined;
  get pathTranslated(): string | undefined;
  get remoteHost(): string | undefined;
  get remoteIdent(): string | undefined;
  get remoteUser(): string | undefined;
  get remoteAddr(): string | undefined;
  get serverName(): string | undefined;
  get serverProtocol(): string | undefined;
  get originalScriptName(): string | undefined;
  get accept(): string | undefined;
  get acceptCharset(): string | undefined;
  get acceptEncoding(): string | undefined;
  get acceptLanguage(): string | undefined;
  get cacheControl(): string | undefined;
  get from(): string | undefined;
  get negotiate(): string | undefined;
  get pragma(): string | undefined;
  get clientIp(): string | undefined;
  get xForwardedFor(): string | undefined;
  get origin(): string | undefined;
  get version(): string | undefined;
  get xCsrfToken(): string | undefined;
  get xRequestId(): string | undefined;
  get xForwardedHost(): string | undefined;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Request
  extends
    CspRequest,
    CacheRequest,
    HttpURL,
    PermissionsPolicyRequest,
    FlashRequestMethods,
    FilterParameters {}
include(Request, CspRequest);
include(Request, PermissionsPolicyRequest);
include(Request, CacheRequest);
include(Request, HttpURL);
include(Request, FlashRequestMethods);

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Request {
  dup(): Request;
  get formats(): MimeType[];
  set formats(extensions: unknown[]);
  get variant(): ArrayInquirer<string> & Record<string, () => boolean>;
  set variant(value: string | string[] | null | undefined);
  get pathParameters(): Record<string, unknown>;
  set pathParameters(parameters: Record<string, unknown>);
}
Request.prototype.dup = RackRequest.prototype.dup as unknown as () => Request;

Object.defineProperty(Request.prototype, "contentMimeType", {
  get(this: Request) {
    return _contentMimeType.call(this);
  },
  configurable: true,
});
Object.defineProperty(Request.prototype, "accepts", {
  get(this: Request) {
    return _accepts.call(this);
  },
  configurable: true,
});
Request.prototype.hasContentType = function (this: Request) {
  return _hasContentType.call(this);
};
Request.prototype.negotiateMime = function (this: Request, order: MimeType[]) {
  return _negotiateMime.call(this, order);
};
Request.prototype.shouldApplyVaryHeader = function (this: Request) {
  return _shouldApplyVaryHeader.call(this);
};

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- `ActiveSupport.on_load(:action_dispatch_request) { include RequestCookieMethods }` (`action_dispatch/middleware/cookies.rb:93-95`). */
export interface Request extends Included<typeof RequestCookieMethods> {}

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

export class PASS_NOT_FOUND {
  /** @internal */
  static action(_: unknown): typeof PASS_NOT_FOUND {
    return PASS_NOT_FOUND;
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
  return _validAcceptHeader.call(this);
};
Request.prototype.useAcceptHeader = function (this: Request) {
  return _useAcceptHeader.call(this);
};
Request.prototype.formatFromPathExtension = function (this: Request) {
  return _formatFromPathExtension.call(this);
};
Request.prototype.setFormat = _setFormat;
Request.prototype.isParamsReadable = _isParamsReadable;

ActionDispatch.Request = Request;
rbModConstSet(Request, "Utils", Utils);
rbModConstSet(ActionDispatch, "MissingController", MissingController);

runLoadHooks("action_dispatch_request", Request);
