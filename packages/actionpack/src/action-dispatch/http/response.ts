/**
 * ActionDispatch::Response
 *
 * Represents an HTTP response with status, headers, and body.
 */

import { getFs } from "@blazetrails/activesupport";
import type { CookieExpires } from "../middleware/cookies.js";
import type { Request } from "./request.js";
import {
  type CacheControlHash,
  cacheControl as _cacheControl,
  cacheControlHeaders as _cacheControlHeaders,
  cacheControlSegments as _cacheControlSegments,
  generateStrongEtag as _generateStrongEtag,
  generateWeakEtag as _generateWeakEtag,
  getDate as _getDate,
  getLastModified as _getLastModified,
  handleConditionalGetBang as _handleConditionalGetBang,
  hasDate as _hasDate,
  hasEtag as _hasEtag,
  hasLastModified as _hasLastModified,
  isStrongEtag as _isStrongEtag,
  mergeAndNormalizeCacheControlBang as _mergeAndNormalizeCacheControlBang,
  isWeakEtag as _isWeakEtag,
  prepareCacheControlBang as _prepareCacheControlBang,
  setDate as _setDate,
  setLastModified as _setLastModified,
  strongEtag as _strongEtag,
  weakEtag as _weakEtag,
} from "./cache.js";
import {
  filteredLocation as _filteredLocation,
  locationFilterMatch as _locationFilterMatch,
  locationFilters as _locationFilters,
  parameterFilteredLocation as _parameterFilteredLocation,
} from "./filter-redirect.js";

// Lowercase to match the rest of this file's header conventions; setHeader
// is case-insensitive but call sites read `headers["content-type"]` directly.
const CONTENT_TYPE = "content-type";
const NO_CONTENT_CODES = [100, 101, 102, 103, 204, 205, 304] as const;
const CONTENT_TYPE_PARSER =
  /^(?<mime_type>[^;\s]+\s*(?:;\s*(?!charset)[^;\s]+)*)?(?:;\s*charset="?(?<charset>[^;\s"]+)"?)?/;

interface ContentTypeHeader {
  readonly mimeType: string | undefined;
  readonly charset: string | undefined;
}
const NULL_CONTENT_TYPE_HEADER: ContentTypeHeader = { mimeType: undefined, charset: undefined };

/** Mirrors Rails' `ActionDispatch::Response::Buffer` (response.rb:100-157). */
export class ResponseBuffer {
  private response: Response;
  private buf: Array<unknown>;
  private closed = false;
  private strBody: string | null = null;

  constructor(response: Response, buf: Array<unknown>) {
    this.response = response;
    this.buf = buf;
  }

  get body(): string {
    if (this.strBody !== null) return this.strBody;
    // Rails: `@buf.each { |chunk| buf << chunk }`. Join avoids O(n²) concat.
    this.strBody = this.buf.map((c) => String(c)).join("");
    return this.strBody;
  }

  write(value: string): void {
    if (this.closed) throw new Error("closed stream");
    this.strBody = null;
    this.response.commitBang();
    this.buf.push(value);
  }

  *each(): IterableIterator<unknown> {
    if (this.strBody !== null) {
      yield this.strBody;
      return;
    }
    for (const chunk of this.buf) yield chunk;
  }

  abort(): void {
    this.close();
  }

  close(): void {
    this.response.commitBang();
    this.closed = true;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

export class Response {
  /** Rails: `cattr_accessor :default_charset, default: "utf-8"`. */
  static defaultCharset = "utf-8";

  private _status: number;
  private _headers: Record<string, string>;
  private _body: string[];
  private _committed = false;
  private _charset: string | undefined;
  private _cookies: Map<string, CookieValue> = new Map();
  private _sending = false;
  private _sent = false;
  stream: unknown = null;
  /** Rails: `response.sending_file = true` flag set by `send_file_headers!`. */
  sendingFile = false;
  request: Request | null = null;
  /** Rails: `cattr_accessor :default_headers`. */
  static defaultHeaders: Record<string, string> | undefined;

  constructor(status = 200, headers: Record<string, string> = {}, body: string[] = []) {
    this._status = status;
    this._headers = { ...headers };
    this._body = [...body];
  }

  // --- Status ---

  get status(): number {
    return this._status;
  }
  set status(value: number) {
    this._status = value;
  }

  get code(): number {
    return this._status;
  }
  get statusCode(): number {
    return this._status;
  }

  get message(): string {
    return STATUS_MESSAGES[this._status] || "";
  }

  // --- Status predicates (Rack::Response::Helpers parity) ---

  /** 2xx response. */
  get successful(): boolean {
    return this._status >= 200 && this._status < 300;
  }
  /** 3xx response. */
  get redirection(): boolean {
    return this._status >= 300 && this._status < 400;
  }
  /** 4xx response. */
  get clientError(): boolean {
    return this._status >= 400 && this._status < 500;
  }
  /** 5xx response. */
  get serverError(): boolean {
    return this._status >= 500 && this._status < 600;
  }
  /** Exact 404. */
  get notFound(): boolean {
    return this._status === 404;
  }

  // --- Headers ---

  get headers(): Record<string, string> {
    return this._headers;
  }

  getHeader(key: string): string | undefined {
    const direct = this._headers[key] ?? this._headers[key.toLowerCase()];
    if (direct !== undefined) return direct;
    const lower = key.toLowerCase();
    for (const k of Object.keys(this._headers)) {
      if (k.toLowerCase() === lower) return this._headers[k];
    }
    return undefined;
  }

  setHeader(key: string, value: string): void {
    // Headers are logically case-insensitive (Rack response semantics).
    // Clear any other-case entry so reads through `getHeader` / accessors
    // can't return a stale value written under a different case.
    const lower = key.toLowerCase();
    if (lower !== key && lower in this._headers) delete this._headers[lower];
    for (const k of Object.keys(this._headers)) {
      if (k !== key && k.toLowerCase() === lower) delete this._headers[k];
    }
    this._headers[key] = value;
  }

  deleteHeader(key: string): void {
    const lower = key.toLowerCase();
    for (const k of Object.keys(this._headers)) {
      if (k === key || k.toLowerCase() === lower) delete this._headers[k];
    }
  }

  // --- Content type ---

  get contentType(): string | undefined {
    const ct = this._headers["content-type"] ?? this._headers["Content-Type"];
    if (!ct) return undefined;
    return ct.split(";")[0].trim() || undefined;
  }

  set contentType(value: string | undefined) {
    if (!value) {
      this.deleteHeader(CONTENT_TYPE);
      return;
    }
    const newHeader = this.parseContentType(value);
    const prevHeader = this.parsedContentTypeHeader();
    let charset = newHeader.charset || prevHeader.charset || this._charset;
    const mimeType = newHeader.mimeType ?? value;
    if (!charset && mimeType.startsWith("text/")) {
      charset = (this.constructor as typeof Response).defaultCharset;
    }
    this.setContentType(mimeType, charset);
  }

  get charset(): string | undefined {
    const ct = this._headers["content-type"] ?? this._headers["Content-Type"];
    if (!ct) return this._charset ?? (this.constructor as typeof Response).defaultCharset;
    const match = ct.match(/charset=([^\s;]+)/i);
    return match
      ? match[1]
      : (this._charset ?? (this.constructor as typeof Response).defaultCharset);
  }

  set charset(value: string | undefined) {
    this._charset = value;
  }

  // --- Body ---

  get body(): string {
    return this._body.join("");
  }

  set body(value: string) {
    this._body = [value];
    this._headers["content-length"] = String(Buffer.byteLength(value, "utf-8"));
  }

  get contentLength(): number | undefined {
    const cl = this._headers["content-length"] ?? this._headers["Content-Length"];
    if (!cl) return undefined;
    return parseInt(cl, 10);
  }

  // --- Stream-like writing ---

  write(data: string): void {
    if (this._committed) {
      throw new Error("Response already committed");
    }
    this._body.push(data);
  }

  close(): void {
    this._committed = true;
  }

  get committed(): boolean {
    return this._committed;
  }

  // --- Location ---

  /** The value of the `Location` header. Mirrors `Response#location`. */
  get location(): string {
    return this._headers["location"] ?? this._headers["Location"] ?? "";
  }

  set location(url: string) {
    delete this._headers["Location"];
    this._headers["location"] = url;
  }

  /**
   * Returns the redirect location with sensitive query parameters filtered
   * out. See `ActionDispatch::Http::FilterRedirect`.
   */
  filteredLocation(): string {
    return _filteredLocation.call(this);
  }

  // --- Cookies ---

  /** @internal */
  setCookie(name: string, value: string | CookieOptions): void {
    if (typeof value === "string") {
      this._cookies.set(name, { value });
    } else {
      this._cookies.set(name, value);
    }
  }

  deleteCookie(name: string, options: Partial<CookieOptions> = {}): void {
    this._cookies.set(name, {
      value: "",
      // boundary: epoch-zero Date is the standard delete-cookie sentinel.
      expires: new Date(0),
      ...options,
    });
  }

  get cookies(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, opts] of this._cookies) {
      result[name] = opts.value;
    }
    return result;
  }

  // --- Cache-Control (raw string accessor; Rails aliases this as `_cache_control`) ---

  /**
   * Raw `Cache-Control` header value. Mirrors Rails'
   * `Response#_cache_control` alias (`Rack::Response::Helpers#cache_control`),
   * which is the un-parsed header string. The parsed directive hash is
   * exposed via {@link cacheControl} (wired below from `Cache::Response`).
   *
   * @internal
   */
  get _cacheControl(): string | undefined {
    return this._headers["cache-control"] ?? this._headers["Cache-Control"];
  }

  set _cacheControl(value: string | undefined) {
    if (value) {
      this._headers["cache-control"] = value;
    } else {
      delete this._headers["cache-control"];
      delete this._headers["Cache-Control"];
    }
  }

  // --- ETag ---

  /** Mirrors Rails' `Cache::Response#etag` reader — returns the `ETag` header. */
  get etag(): string | undefined {
    return this._headers["etag"] ?? this._headers["ETag"];
  }

  /**
   * Mirrors Rails' `Cache::Response#etag=` — delegates to
   * {@link weakEtag}, which hashes `validators` into a weak validator
   * (`W/"<md5>"`). Pass `undefined` to delete the header.
   */
  set etag(value: unknown) {
    if (value === undefined) {
      delete this._headers["etag"];
      delete this._headers["ETag"];
      return;
    }
    this.weakEtag(value);
  }

  // --- Cache::Response wiring (declared here for typing; bound below) ---
  declare lastModified: Date | undefined;
  declare date: Date | undefined;
  declare readonly hasLastModified: boolean;
  declare readonly hasDate: boolean;
  declare readonly hasEtag: boolean;
  declare weakEtag: (validators: unknown) => void;
  declare strongEtag: (validators: unknown) => void;
  declare isWeakEtag: () => boolean;
  declare isStrongEtag: () => boolean;
  declare handleConditionalGetBang: () => void;
  declare mergeAndNormalizeCacheControlBang: (cacheControl: CacheControlHash) => void;
  /**
   * Parsed `Cache-Control` directives as a hash, mirroring Rails'
   * `Cache::Response#cache_control` (an `attr_reader` set by
   * `prepare_cache_control!`). The raw header string is exposed via
   * {@link _cacheControl}.
   */
  declare readonly cacheControl: CacheControlHash;
  /** @internal Rails: `cache_control_segments` private. */
  declare cacheControlSegments: () => string[] | undefined;
  /** @internal Rails: `cache_control_headers` private. */
  declare cacheControlHeaders: () => CacheControlHash;
  /** @internal Rails: `FilterRedirect#location_filters` private. */
  declare locationFilters: () => Array<string | RegExp>;
  /** @internal Rails: `FilterRedirect#location_filter_match?` private. */
  declare isLocationFilterMatch: () => boolean;
  /** @internal Rails: `FilterRedirect#parameter_filtered_location` private. */
  declare parameterFilteredLocation: () => string;

  // --- Rack response ---

  toRack(): [number, Record<string, string>, unknown] {
    // If a stream is installed, surface it directly so Rack::Sendfile /
    // BodyProxy can intercept via toPath()/close() rather than draining
    // the file into memory.
    if (this.stream) return [this._status, { ...this._headers }, this.stream];
    return [this._status, { ...this._headers }, [...this._body]];
  }

  // --- Stream / body parts ---

  private _ensureStream(): unknown {
    if (!this.stream) this.stream = this.buildBuffer(this, this.mungeBodyObject(this._body));
    return this.stream;
  }

  /** Drains the stream into a parts array (Rails `body_parts`). */
  bodyParts(): unknown[] {
    const stream = this._ensureStream() as { each(): IterableIterator<unknown> };
    const parts: unknown[] = [];
    for (const chunk of stream.each()) parts.push(chunk);
    return parts;
  }

  /** Mirrors `Response#send_file(path)` — commits + sets the stream to a `Response::FileBody`-style object. */
  sendFile(path: string): void {
    this.commitBang();
    let cached: string | null = null;
    const read = () => (cached ??= getFs().readFileSync(path, "latin1"));
    // Rack::Sendfile detects file bodies via `body.toPath()` (callable);
    // Rails' FileBody uses `attr_reader :to_path` which is also a method.
    this.stream = {
      toPath(): string {
        return path;
      },
      get body(): string {
        return read();
      },
      *each(): IterableIterator<string> {
        yield read();
      },
    };
  }

  /** Discards stream contents (Rails `reset_body!`). */
  resetBodyBang(): void {
    this.stream = this.buildBuffer(this, []);
    this._body = [];
  }

  /** Wraps stream iteration in `sending!`/`sent!` (Rails `each(&block)`). */
  *each(): IterableIterator<unknown> {
    const stream = this._ensureStream() as { each(): IterableIterator<unknown> };
    this.sendingBang();
    for (const chunk of stream.each()) yield chunk;
    this.sentBang();
  }

  /** Mirrors `Response#abort` — forwards to stream.abort, falling back to close. */
  abort(): void {
    const s = this.stream;
    if (!s) return;
    if (typeof (s as { abort?: () => void }).abort === "function") {
      (s as { abort: () => void }).abort();
    } else if (typeof (s as { close?: () => void }).close === "function") {
      (s as { close: () => void }).close();
    }
  }

  // --- Lifecycle (commit / sending / sent) ---

  /** Mirrors `Response#commit!`. Idempotent; runs beforeCommitted on transition. */
  commitBang(): void {
    if (this._committed) return;
    this.beforeCommitted();
    this._committed = true;
  }

  /** Mirrors `Response#sending!`. */
  sendingBang(): void {
    if (this._sending) return;
    this.beforeSending();
    this._sending = true;
  }

  /** Mirrors `Response#sent!`. */
  sentBang(): void {
    this._sent = true;
  }

  /** Mirrors `Response#sending?`. */
  get isSending(): boolean {
    return this._sending;
  }

  /** Mirrors `Response#sent?`. */
  get isSent(): boolean {
    return this._sent;
  }

  /** Rails uses MonitorMixin to block; single-threaded JS makes this a no-op. */
  async awaitCommit(): Promise<void> {}
  async awaitSent(): Promise<void> {}

  // --- Header / mime helpers ---

  /** Rails: `alias_method :header, :headers`. */
  get header(): Record<string, string> {
    return this._headers;
  }
  hasHeader(key: string): boolean {
    return this.getHeader(key) !== undefined;
  }
  get responseCode(): number {
    return this._status;
  }
  get statusMessage(): string {
    return this.message;
  }
  /** Rails: `alias_method :redirect_url, :location`. */
  get redirectUrl(): string {
    return this.location;
  }
  get mediaType(): string | undefined {
    return this.parsedContentTypeHeader().mimeType;
  }

  // --- Content-type parsing (private in Rails) ---

  /** @internal Rails: `parse_content_type(str)`. */
  parseContentType(value: string | undefined): ContentTypeHeader {
    if (!value) return NULL_CONTENT_TYPE_HEADER;
    const match = CONTENT_TYPE_PARSER.exec(value);
    if (!match) return NULL_CONTENT_TYPE_HEADER;
    return {
      mimeType: match.groups?.["mime_type"]?.trim() || undefined,
      charset: match.groups?.["charset"] || undefined,
    };
  }

  /** @internal Rails: `parsed_content_type_header` private. */
  parsedContentTypeHeader(): ContentTypeHeader {
    return this.parseContentType(this.getHeader(CONTENT_TYPE));
  }

  /** @internal Rails: `set_content_type(content_type, charset)` private. */
  setContentType(contentType: string | undefined, charset: string | undefined): void {
    const type = contentType ?? "";
    const value = charset ? `${type}; charset=${String(charset).toLowerCase()}` : type;
    this.setHeader(CONTENT_TYPE, value);
  }

  // --- Lifecycle hooks (private) ---

  /** @internal Rails: `before_committed` private. */
  protected beforeCommitted(): void {
    if (this._committed) return;
    this.assignDefaultContentTypeAndCharsetBang();
    this.mergeAndNormalizeCacheControlBang(this.cacheControl);
    this.handleConditionalGetBang();
    this.handleNoContentBang();
  }

  /** @internal Rails: `before_sending` — flushes cookie jar via request before headers freeze. */
  beforeSending(): void {
    if (!this._committed) this.commitBang();
    const req = this.request as (Request & { commitCookieJarBang?: () => void }) | null;
    if (req && typeof req.commitCookieJarBang === "function") req.commitCookieJarBang();
  }

  /** @internal Rails: `build_buffer(response, body)` private. */
  buildBuffer(response: unknown, body: unknown[]): unknown {
    return new ResponseBuffer(response as Response, body);
  }

  /** @internal Rails: `munge_body_object(body)` — wraps non-iterables into a 1-element array. */
  mungeBodyObject(body: unknown): unknown[] {
    if (Array.isArray(body)) return body;
    if (
      body != null &&
      typeof (body as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function" &&
      typeof body !== "string"
    ) {
      return Array.from(body as Iterable<unknown>);
    }
    return [body];
  }

  /** @internal Rails: `assign_default_content_type_and_charset!`. */
  assignDefaultContentTypeAndCharsetBang(): void {
    if (this.mediaType) return;
    const ct = this.parsedContentTypeHeader();
    const charset = ct.charset ?? (this.constructor as typeof Response).defaultCharset;
    this.setContentType(ct.mimeType ?? "text/html", charset);
  }

  /** @internal Rails: `handle_no_content!` — strips body headers on 1xx/204/205/304. */
  handleNoContentBang(): void {
    if ((NO_CONTENT_CODES as readonly number[]).includes(this._status)) {
      this.deleteHeader(CONTENT_TYPE);
      this.deleteHeader("Content-Length");
    }
  }

  /** @internal Rails: `rack_response(status, headers)` — empty body for no-content statuses. */
  rackResponse(
    status: number,
    headers: Record<string, string>,
  ): [number, Record<string, string>, unknown[]] {
    if ((NO_CONTENT_CODES as readonly number[]).includes(status)) return [status, headers, []];
    return [status, headers, this.bodyParts()];
  }

  // --- ETag generators (delegated to cache module) ---

  /** Rails: `generate_weak_etag(validators)`. */
  generateWeakEtag(validators: unknown): string {
    return _generateWeakEtag(validators);
  }

  /** Rails: `generate_strong_etag(validators)`. */
  generateStrongEtag(validators: unknown): string {
    return _generateStrongEtag(validators);
  }

  /** Rails: `prepare_cache_control!` private. */
  prepareCacheControlBang(): CacheControlHash {
    return _prepareCacheControlBang.call(this);
  }

  // --- Default-headers merge (static) ---

  /** Rails: `Response.merge_default_headers(original, default)`. */
  static mergeDefaultHeaders(
    original: Record<string, string>,
    defaults: Record<string, string> | undefined,
  ): Record<string, string> {
    if (!defaults) return original;
    return { ...defaults, ...original };
  }

  // --- Inspect ---

  inspect(): string {
    return `#<ActionDispatch::Response ${this._status} ${this.message}>`;
  }

  // --- Factory ---

  static create<T extends typeof Response>(
    this: T,
    status = 200,
    headers: Record<string, string> = {},
    body = "",
  ): InstanceType<T> {
    return new this(status, headers, body ? [body] : []) as InstanceType<T>;
  }
}

// Mix in ActionDispatch::Http::Cache::Response. Property-style helpers
// (Rails no-arg accessors) are wired as getters/setters; methods that take
// arguments are wired as prototype methods. The raw `Cache-Control` header
// string is exposed via `_cacheControl` (Rails: aliased `_cache_control`),
// and `cacheControl` (this wiring) is the parsed directive hash.
Object.defineProperty(Response.prototype, "lastModified", {
  get(this: Response) {
    return _getLastModified.call(this);
  },
  set(this: Response, t: Date | undefined) {
    if (t === undefined) this.deleteHeader("Last-Modified");
    else _setLastModified.call(this, t);
  },
  configurable: true,
});
Object.defineProperty(Response.prototype, "hasLastModified", {
  get(this: Response) {
    return _hasLastModified.call(this);
  },
  configurable: true,
});
Object.defineProperty(Response.prototype, "date", {
  get(this: Response) {
    return _getDate.call(this);
  },
  set(this: Response, t: Date | undefined) {
    if (t === undefined) this.deleteHeader("Date");
    else _setDate.call(this, t);
  },
  configurable: true,
});
Object.defineProperty(Response.prototype, "hasDate", {
  get(this: Response) {
    return _hasDate.call(this);
  },
  configurable: true,
});
Object.defineProperty(Response.prototype, "hasEtag", {
  get(this: Response) {
    return _hasEtag.call(this);
  },
  configurable: true,
});
Object.defineProperty(Response.prototype, "cacheControl", {
  get(this: Response) {
    return _cacheControl.call(this);
  },
  configurable: true,
});
Response.prototype.weakEtag = function (this: Response, v: unknown) {
  _weakEtag.call(this, v);
};
Response.prototype.strongEtag = function (this: Response, v: unknown) {
  _strongEtag.call(this, v);
};
Response.prototype.isWeakEtag = function (this: Response) {
  return _isWeakEtag.call(this);
};
Response.prototype.isStrongEtag = function (this: Response) {
  return _isStrongEtag.call(this);
};
Response.prototype.handleConditionalGetBang = function (this: Response) {
  _handleConditionalGetBang.call(this);
};
Response.prototype.mergeAndNormalizeCacheControlBang = function (
  this: Response,
  cacheControl: CacheControlHash,
) {
  _mergeAndNormalizeCacheControlBang.call(this, cacheControl);
};
Response.prototype.cacheControlSegments = function (this: Response) {
  return _cacheControlSegments.call(this);
};
Response.prototype.cacheControlHeaders = function (this: Response) {
  return _cacheControlHeaders.call(this);
};
Response.prototype.locationFilters = function (this: Response) {
  return _locationFilters.call(this);
};
Response.prototype.isLocationFilterMatch = function (this: Response) {
  return _locationFilterMatch.call(this);
};
Response.prototype.parameterFilteredLocation = function (this: Response) {
  return _parameterFilteredLocation.call(this);
};
export interface CookieOptions {
  value: string;
  path?: string;
  domain?: string;
  expires?: CookieExpires;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
}

type CookieValue = CookieOptions;

const STATUS_MESSAGES: Record<number, string> = {
  100: "Continue",
  101: "Switching Protocols",
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  409: "Conflict",
  410: "Gone",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};
