/**
 * ActionDispatch::Request
 *
 * Wraps a Rack environment hash and provides convenience accessors
 * mirroring the Rails Request API.
 */

import type { RackEnv } from "@blazetrails/rack";
import { parseNestedQuery } from "@blazetrails/rack";
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
  formats as _formats,
  hasContentType as _hasContentType,
  ignoreAcceptHeader as _ignoreAcceptHeader,
  negotiateMime as _negotiateMime,
  setFormat as _setFormat,
  setFormats as _setFormats,
  setIgnoreAcceptHeader as _setIgnoreAcceptHeader,
  shouldApplyVaryHeader as _shouldApplyVaryHeader,
  type MimeNegotiationHost,
  type NullType,
} from "./mime-negotiation.js";
import type { MimeType } from "./mime-type.js";
import {
  filteredEnv as _filteredEnv,
  filteredParameters as _filteredParameters,
  filteredPath as _filteredPath,
  parameterFilter as _parameterFilter,
} from "./filter-parameters.js";
import type { ParameterFilter } from "@blazetrails/activesupport";
import { RequestUtils, type ParamValue } from "../request/utils.js";
import {
  parameters as _parameters,
  parameterParsers as _parameterParsers,
  paramsParsers as _paramsParsers,
  parseFormattedParameters as _parseFormattedParameters,
  pathParameters as _pathParameters,
  setParameterParsers as _setParameterParsers,
  setPathParameters as _setPathParameters,
  type ParameterParser,
  type ParameterParsers,
  type ParametersHost,
} from "./parameters.js";

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

  domain(tldLength = 1): string {
    const parts = this.host.split(".");
    return parts.slice(-(tldLength + 1)).join(".");
  }

  subdomains(tldLength = 1): string[] {
    const parts = this.host.split(".");
    return parts.slice(0, -(tldLength + 1));
  }

  subdomain(tldLength = 1): string {
    return this.subdomains(tldLength).join(".");
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

  // --- Format ---

  get format(): string | undefined {
    // Check explicit format parameter
    const paramFormat = this.params?.["format"];
    if (paramFormat) return String(paramFormat);

    // Check path extension
    const ext = this.path.match(/\.(\w+)$/);
    if (ext) return ext[1];

    // Infer from Accept header
    const accept = this.accept;
    if (!accept || accept === "*/*") return "html";
    if (accept.includes("text/html")) return "html";
    if (accept.includes("application/xhtml+xml")) return "html";
    if (accept.includes("application/xml") || accept.includes("text/xml")) return "xml";
    if (accept.includes("text/plain")) return "text";
    if (accept.includes("application/json")) return "json";

    return undefined;
  }

  // --- Server software ---

  get serverSoftware(): string {
    return ((this.env["SERVER_SOFTWARE"] as string) || "").split("/")[0] || "";
  }

  // --- Variant ---

  private _variant: symbol | symbol[] | undefined;

  get variant(): symbol | symbol[] | undefined {
    return this._variant;
  }

  set variant(value: symbol | symbol[] | undefined) {
    if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v !== "symbol") {
          throw new TypeError("Variant must be a symbol or array of symbols");
        }
      }
    } else if (value !== undefined && typeof value !== "symbol") {
      throw new TypeError("Variant must be a symbol or array of symbols");
    }
    this._variant = value;
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

  // --- Static factory ---

  static create(env: RackEnv = {}): Request {
    return new Request(env);
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
