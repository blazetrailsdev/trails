import { presence } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import {
  deleteSetCookieHeaderBang,
  Headers,
  setCookieHeader,
  statusCode,
  unescape,
} from "@blazetrails/rack";
import type { CookieExpires } from "../middleware/cookies.js";
import type { Request } from "./request.js";
import {
  type CacheControlHash,
  cacheControl as _cacheControl,
  cacheControlHeaders as _cacheControlHeaders,
  cacheControlSegments as _cacheControlSegments,
  generateStrongEtag as _generateStrongEtag,
  generateWeakEtag as _generateWeakEtag,
  Response as CacheResponse,
  handleConditionalGetBang as _handleConditionalGetBang,
  isDate as _isDate,
  isEtag as _isEtag,
  isLastModified as _isLastModified,
  isStrongEtag as _isStrongEtag,
  mergeAndNormalizeCacheControlBang as _mergeAndNormalizeCacheControlBang,
  isWeakEtag as _isWeakEtag,
  prepareCacheControlBang as _prepareCacheControlBang,
  strongEtag as _strongEtag,
  weakEtag as _weakEtag,
} from "./cache.js";
import {
  filteredLocation as _filteredLocation,
  locationFilterMatch as _locationFilterMatch,
  locationFilters as _locationFilters,
  parameterFilteredLocation as _parameterFilteredLocation,
} from "./filter-redirect.js";

const CONTENT_TYPE = "Content-Type";
const SET_COOKIE = "set-cookie";
const NO_CONTENT_CODES = [100, 101, 102, 103, 204, 205, 304] as const;
const CONTENT_TYPE_PARSER =
  /^(?<mime_type>[^;\s]+\s*(?:;\s*(?!charset)[^;\s]+)*)?(?:;\s*charset="?(?<charset>[^;\s"]+)"?)?/;

interface ContentTypeHeader {
  readonly mimeType: string | undefined;
  readonly charset: string | undefined;
}
const NULL_CONTENT_TYPE_HEADER: ContentTypeHeader = { mimeType: undefined, charset: undefined };
const BODY_METHODS = ["toAry", "call", "toPath"] as const;

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
    this.strBody = this.buf.map((c) => String(c)).join("");
    return this.strBody;
  }

  write(string: string): void {
    if (this.closed) throw new Error("closed stream");
    this.strBody = null;
    this.response.commitBang();
    this.buf.push(string);
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

export class RackBody {
  private response: Response;

  constructor(response: Response) {
    this.response = response;
    const stream = this.response.stream as Record<string, unknown> | null;
    for (const method of BODY_METHODS) {
      if (stream && typeof stream[method] === "function") {
        (this as unknown as Record<string, unknown>)[method] = (...args: unknown[]): unknown =>
          (stream[method] as (...a: unknown[]) => unknown)(...args);
      }
    }
  }

  close(): void {
    this.response.abort();
  }

  get body(): string {
    return this.response.body;
  }

  *each(): IterableIterator<unknown> {
    yield* this.response.each();
  }

  [Symbol.iterator](): IterableIterator<unknown> {
    return this.each();
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<string | Uint8Array> {
    for (const chunk of this.each()) yield chunk as string | Uint8Array;
  }
}

export class Response {
  static defaultCharset = "utf-8";

  private _status: number;
  private _headers: Headers;
  private _committed = false;
  private _sending = false;
  private _sent = false;
  stream: unknown = null;
  request: Request | null = null;
  static defaultHeaders: Record<string, string> | undefined;

  constructor(status = 200, headers: Record<string, string> = {}, body: string[] = []) {
    this._status = status;
    this._headers = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      this._headers.set(key, value);
    }
    this.stream = this.buildBuffer(this, this.mungeBodyObject([...body]));
  }

  get status(): number {
    return this._status;
  }
  set status(status: number | string) {
    this._status = statusCode(status);
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

  get successful(): boolean {
    return this._status >= 200 && this._status < 300;
  }
  get redirection(): boolean {
    return this._status >= 300 && this._status < 400;
  }
  get clientError(): boolean {
    return this._status >= 400 && this._status < 500;
  }
  get serverError(): boolean {
    return this._status >= 500 && this._status < 600;
  }
  get notFound(): boolean {
    return this._status === 404;
  }

  get headers(): Headers {
    return this._headers;
  }

  getHeader(key: string): string | undefined {
    return this._headers.get(key);
  }

  setHeader(key: string, v: string): void {
    this._headers.set(key, v);
  }

  deleteHeader(key: string): void {
    this._headers.delete(key);
  }

  get contentType(): string | undefined {
    return presence(this.getHeader(CONTENT_TYPE));
  }

  set contentType(value: string | undefined) {
    if (value == null) return;
    const newHeaderInfo = this.parseContentType(String(value));
    const prevHeaderInfo = this.parsedContentTypeHeader();
    let charset = newHeaderInfo.charset || prevHeaderInfo.charset;
    if (!charset && !prevHeaderInfo.mimeType) {
      charset = (this.constructor as typeof Response).defaultCharset;
    }
    this.setContentType(newHeaderInfo.mimeType, charset);
  }

  get charset(): string | undefined {
    const headerInfo = this.parsedContentTypeHeader();
    return headerInfo.charset || (this.constructor as typeof Response).defaultCharset;
  }

  set charset(charset: string | false | undefined) {
    const contentType = this.parsedContentTypeHeader().mimeType;
    if (charset === false) {
      this.setContentType(contentType, undefined);
    } else {
      const defaultCharset = (this.constructor as typeof Response).defaultCharset;
      this.setContentType(contentType, charset || defaultCharset);
    }
  }

  set sendingFile(v: boolean) {
    if (v === true) this.charset = false;
  }

  get body(): string {
    return (this.stream as { body: string }).body;
  }

  set body(value: string | { toPath(): string }) {
    if (typeof (value as { toPath?: unknown }).toPath === "function") {
      this.stream = value;
      return;
    }
    this.stream = this.buildBuffer(this, this.mungeBodyObject(value));
    this.setHeader("content-length", String(Buffer.byteLength(value as string, "utf-8")));
  }

  get contentLength(): number | undefined {
    const cl = this.getHeader("content-length");
    if (!cl) return undefined;
    return parseInt(cl, 10);
  }

  write(data: string): void {
    (this.stream as { write(string: string): void }).write(data);
  }

  close(): void {
    const stream = this.stream as { close?: () => void };
    if (typeof stream?.close === "function") stream.close();
  }

  get committed(): boolean {
    return this._committed;
  }

  get location(): string {
    return this.getHeader("location") ?? "";
  }

  set location(url: string) {
    this.setHeader("location", url);
  }

  filteredLocation(): string {
    return _filteredLocation.call(this);
  }

  /** @internal */
  setCookie(name: string, value: string | CookieOptions): void {
    const header = this.getHeader(SET_COOKIE);
    const cookie = setCookieHeader(name, rackCookieValue(value));
    this.setHeader(SET_COOKIE, header === undefined ? cookie : `${header}\n${cookie}`);
  }

  deleteCookie(name: string, options: Partial<CookieOptions> = {}): void {
    const header = deleteSetCookieHeaderBang(
      this.getHeader(SET_COOKIE) ?? null,
      name,
      rackCookieValue({ value: "", ...options }),
    );
    this.setHeader(SET_COOKIE, Array.isArray(header) ? header.join("\n") : header);
  }

  get cookies(): Record<string, string | undefined> {
    const cookies: Record<string, string | undefined> = {};
    let header: string | string[] | undefined = this.getHeader(SET_COOKIE);
    if (header != null) {
      if (typeof header === "string") header = header.split("\n");
      for (const cookie of header) {
        const pair = cookie.split(";")[0];
        if (pair) {
          const [key, value] = pair.split("=").map((v) => unescape(v));
          cookies[key] = value;
        }
      }
    }
    return cookies;
  }

  /** @internal */
  get _cacheControl(): string | undefined {
    return this.getHeader("cache-control");
  }

  set _cacheControl(value: string | undefined) {
    if (value) {
      this.setHeader("cache-control", value);
    } else {
      this.deleteHeader("cache-control");
    }
  }

  declare lastModified: Date | undefined;
  declare date: Date | undefined;
  declare etag: string | undefined;
  declare readonly isLastModified: boolean;
  declare readonly isDate: boolean;
  declare readonly isEtag: string | undefined;
  declare weakEtag: (validators: unknown) => void;
  declare strongEtag: (validators: unknown) => void;
  declare isWeakEtag: () => boolean;
  declare isStrongEtag: () => boolean;
  /** @internal */
  declare handleConditionalGetBang: () => void;
  /** @internal */
  declare mergeAndNormalizeCacheControlBang: (cacheControl: CacheControlHash) => void;
  declare readonly cacheControl: CacheControlHash;
  /** @internal */
  declare cacheControlSegments: () => string[] | undefined;
  /** @internal */
  declare cacheControlHeaders: () => CacheControlHash;
  /** @internal */
  declare locationFilters: () => Array<string | RegExp>;
  /** @internal */
  declare isLocationFilterMatch: () => boolean;
  /** @internal */
  declare parameterFilteredLocation: () => string;

  toRack(): [number, Record<string, string>, unknown] {
    this.commitBang();
    return this.rackResponse(this._status, this._headers.toHash());
  }

  bodyParts(): unknown[] {
    const stream = this.stream as { each(): IterableIterator<unknown> };
    const parts: unknown[] = [];
    for (const chunk of stream.each()) parts.push(chunk);
    return parts;
  }

  sendFile(path: string): void {
    this.commitBang();
    let cached: string | null = null;
    const read = () => (cached ??= File.open(path, "rb", (file) => file.read()));
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

  resetBodyBang(): void {
    this.stream = this.buildBuffer(this, []);
  }

  *each(): IterableIterator<unknown> {
    const stream = this.stream as { each(): IterableIterator<unknown> };
    this.sendingBang();
    for (const chunk of stream.each()) yield chunk;
    this.sentBang();
  }

  abort(): void {
    const s = this.stream;
    if (!s) return;
    if (typeof (s as { abort?: () => void }).abort === "function") {
      (s as { abort: () => void }).abort();
    } else if (typeof (s as { close?: () => void }).close === "function") {
      (s as { close: () => void }).close();
    }
  }

  commitBang(): void {
    if (this._committed) return;
    this.beforeCommitted();
    this._committed = true;
  }

  sendingBang(): void {
    if (this._sending) return;
    this.beforeSending();
    this._sending = true;
  }

  sentBang(): void {
    this._sent = true;
  }

  get isSending(): boolean {
    return this._sending;
  }

  get isSent(): boolean {
    return this._sent;
  }

  async awaitCommit(): Promise<void> {}
  async awaitSent(): Promise<void> {}

  get header(): Headers {
    return this._headers;
  }
  hasHeader(key: string): boolean {
    return this._headers.hasKey(key);
  }
  get responseCode(): number {
    return this._status;
  }
  get statusMessage(): string {
    return this.message;
  }
  get redirectUrl(): string {
    return this.location;
  }
  get mediaType(): string | undefined {
    return this.parsedContentTypeHeader().mimeType;
  }

  /** @internal */
  parseContentType(contentType: string | undefined): ContentTypeHeader {
    if (!contentType) return NULL_CONTENT_TYPE_HEADER;
    const match = CONTENT_TYPE_PARSER.exec(contentType);
    if (!match) return NULL_CONTENT_TYPE_HEADER;
    return {
      mimeType: match.groups?.["mime_type"]?.trim() || undefined,
      charset: match.groups?.["charset"] || undefined,
    };
  }

  /** @internal */
  parsedContentTypeHeader(): ContentTypeHeader {
    return this.parseContentType(this.getHeader(CONTENT_TYPE));
  }

  /** @internal */
  setContentType(contentType: string | undefined, charset: string | undefined): void {
    const type = contentType ?? "";
    const value = charset ? `${type}; charset=${String(charset).toLowerCase()}` : type;
    this.setHeader(CONTENT_TYPE, value);
  }

  /** @internal */
  protected beforeCommitted(): void {
    if (this._committed) return;
    this.assignDefaultContentTypeAndCharsetBang();
    this.mergeAndNormalizeCacheControlBang(this.cacheControl);
    this.handleConditionalGetBang();
    this.handleNoContentBang();
  }

  /** @internal */
  beforeSending(): void {
    if (!this._committed) this.commitBang();
    const req = this.request as (Request & { commitCookieJarBang?: () => void }) | null;
    if (req && typeof req.commitCookieJarBang === "function") req.commitCookieJarBang();
  }

  /** @internal */
  buildBuffer(response: unknown, body: unknown[]): unknown {
    return new ResponseBuffer(response as Response, body);
  }

  /** @internal */
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

  /** @internal */
  assignDefaultContentTypeAndCharsetBang(): void {
    if (this.mediaType) return;
    const ct = this.parsedContentTypeHeader();
    const charset = ct.charset ?? (this.constructor as typeof Response).defaultCharset;
    this.setContentType(ct.mimeType ?? "text/html", charset);
  }

  /** @internal */
  handleNoContentBang(): void {
    if ((NO_CONTENT_CODES as readonly number[]).includes(this._status)) {
      this._headers.delete(CONTENT_TYPE);
      this._headers.delete("Content-Length");
    }
  }

  /** @internal */
  rackResponse(
    status: number,
    headers: Record<string, string>,
  ): [number, Record<string, string>, unknown] {
    if ((NO_CONTENT_CODES as readonly number[]).includes(status)) return [status, headers, []];
    return [status, headers, new RackBody(this)];
  }

  /** @internal */
  generateWeakEtag(validators: unknown): string {
    return _generateWeakEtag(validators);
  }

  /** @internal */
  generateStrongEtag(validators: unknown): string {
    return _generateStrongEtag(validators);
  }

  /** @internal */
  prepareCacheControlBang(): CacheControlHash {
    return _prepareCacheControlBang.call(this);
  }

  static mergeDefaultHeaders(
    original: Record<string, string>,
    defaults: Record<string, string> | undefined,
  ): Record<string, string> {
    if (!defaults) return original;
    return { ...defaults, ...original };
  }

  inspect(): string {
    return `#<ActionDispatch::Response ${this._status} ${this.message}>`;
  }

  static create<T extends typeof Response>(
    this: T,
    status = 200,
    headers: Record<string, string> = {},
    body: string | string[] = [],
    { defaultHeaders }: { defaultHeaders?: Record<string, string> } = {},
  ): InstanceType<T> {
    const merged = this.mergeDefaultHeaders(headers, defaultHeaders ?? this.defaultHeaders);
    const parts = Array.isArray(body) ? body : [body];
    return new this(status, merged, parts) as InstanceType<T>;
  }
}

for (const name of ["lastModified", "date", "etag"] as const) {
  Object.defineProperty(Response.prototype, name, {
    ...Object.getOwnPropertyDescriptor(CacheResponse.prototype, name)!,
    configurable: true,
  });
}
Object.defineProperty(Response.prototype, "isLastModified", {
  get(this: Response) {
    return _isLastModified.call(this);
  },
  configurable: true,
});
Object.defineProperty(Response.prototype, "isDate", {
  get(this: Response) {
    return _isDate.call(this);
  },
  configurable: true,
});
Object.defineProperty(Response.prototype, "isEtag", {
  get(this: Response) {
    return _isEtag.call(this);
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

function rackCookieValue(value: string | Partial<CookieOptions>): Record<string, unknown> {
  const opts = typeof value === "string" ? { value } : value;
  return {
    value: opts.value ?? "",
    path: opts.path,
    domain: opts.domain,
    // boundary: `Rack::Utils.set_cookie_header` formats `expires` through
    expires:
      opts.expires === undefined || opts.expires instanceof Date
        ? opts.expires
        : new Date(opts.expires.epochMilliseconds),
    secure: opts.secure,
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
  };
}

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
