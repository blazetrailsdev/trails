import type { Time } from "@blazetrails/date";
import { cattrAccessor, include, presence } from "@blazetrails/activesupport";
import {
  File,
  IO,
  IOError,
  basicObjRespondTo,
  rbCheckArrayType,
  rbObjAsString,
  rbFSend,
  rbObjRespondTo,
  strNew,
  stringSplit,
  Struct,
  toEnum,
} from "@blazetrails/ruby-compat";
import {
  deleteSetCookieHeaderBang,
  Headers,
  HTTP_STATUS_CODES,
  ResponseHelpers as RackResponseHelpers,
  setCookieHeader,
  statusCode,
  unescape,
} from "@blazetrails/rack";
import type { CookieExpires, SetCookieOptions } from "../middleware/cookies.js";
import type { Request } from "./request.js";
import type { MimeType } from "./mime-type.js";
import {
  type CacheControlHash,
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
  /^(?<mime_type>[^;\s]+\s*(?:;\s*(?:(?!charset)[^;\s])+)*)?(?:;\s*charset=(?<quote>"?)(?<charset>[^;\s]+)\k<quote>)?/;

/** @internal */
export class ContentTypeHeader extends Struct.new("mimeType", "charset") {
  declare mimeType: string | null;
  declare charset: string | null;
}
const NULL_CONTENT_TYPE_HEADER = new ContentTypeHeader(null, null);
type RubyArgs = unknown[] | [...unknown[], (...args: never[]) => unknown];
const BODY_METHODS = { toAry: true, each: true, call: true, toPath: true } as const;

export class Buffer<Buf extends { push(obj: unknown): unknown } = Array<unknown>> {
  /** @internal */
  protected _response: Response | null;
  /** @internal */
  protected _buf: Buf;
  /** @internal */
  protected _closed = false;
  /** @internal */
  protected _strBody: string | null = null;

  constructor(response: Response | null, buf: Buf) {
    this._response = response;
    this._buf = buf;
  }

  toAry(): unknown {
    return rbObjRespondTo(this._buf, "toAry")
      ? rbCheckArrayType(this._buf)
      : (this._buf as unknown as { each(): unknown }).each();
  }

  get body(): string {
    if (this._strBody !== null) return this._strBody;
    let buf = "";
    for (const chunk of this.each() as Iterable<unknown>) {
      const str = rbObjAsString(chunk) as string | Uint8Array;
      buf += str instanceof Uint8Array ? strNew(Array.from(str)) : str;
    }
    this._strBody = buf;
    return this._strBody;
  }

  /** @noRailsEquivalent PERMANENT */
  async awaitBody(): Promise<string> {
    if (this._strBody !== null) return this._strBody;
    let buf = "";
    for await (const chunk of this) buf += String(chunk);
    this._strBody = buf;
    return this._strBody;
  }

  write(string: string): void {
    if (this.isClosed) throw new IOError("closed stream");

    this._strBody = null;
    this._response!.commitBang();
    this._buf.push(string);
  }

  each(block?: (chunk: unknown) => unknown): unknown {
    if (this._strBody !== null) {
      if (!block) return toEnum(this, "each");

      return block(this._strBody);
    } else {
      return this.eachChunk(block);
    }
  }

  /** @noRailsEquivalent PERMANENT */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
    if (this._strBody !== null) {
      yield this._strBody;
    } else {
      const yielded: Array<{ chunk: unknown; resume: () => void }> = [];
      let wake: (() => void) | null = null;
      let done = false;
      const eachChunk = Promise.resolve(
        this.eachChunk(
          (chunk) =>
            new Promise<void>((resume) => {
              yielded.push({ chunk, resume });
              wake?.();
            }),
        ),
      ).finally(() => {
        done = true;
        wake?.();
      });
      eachChunk.catch(() => {});
      while (yielded.length > 0 || !done) {
        const next = yielded.shift();
        if (next) {
          yield next.chunk;
          next.resume();
        } else {
          await new Promise<void>((resolve) => (wake = resolve));
          wake = null;
        }
      }
      await eachChunk;
    }
  }

  abort(): void {}

  close(): void {
    this._response!.commitBang();
    this._closed = true;
  }

  get isClosed(): boolean {
    return this._closed;
  }

  /** @internal */
  protected eachChunk(block?: (chunk: unknown) => unknown): unknown {
    return rbFSend(this._buf, "each", block);
  }
}

export class RackBody {
  /** @internal */
  private _response: Response;

  constructor(response: Response) {
    this._response = response;
    for (const method of Object.keys(BODY_METHODS)) {
      if (!this.isRespondTo(method)) {
        Object.defineProperty(this, method, { value: undefined, configurable: true });
      }
    }
  }

  close(): void {
    this._response.abort();
  }

  get body(): string {
    return this._response.body;
  }

  isRespondTo(method: string, includePrivate = false): boolean {
    if (Object.hasOwn(BODY_METHODS, method)) {
      return rbObjRespondTo(this._response.stream, method);
    } else {
      return basicObjRespondTo(this, method, !includePrivate);
    }
  }

  toAry(): unknown {
    return (this._response.stream as unknown as { toAry(): unknown }).toAry();
  }

  each(...args: RubyArgs): unknown {
    return this._response.each(...(args as [((chunk: unknown) => unknown)?]));
  }

  call(...arguments_: RubyArgs): unknown {
    return (this._response.stream as unknown as { call(...a: RubyArgs): unknown }).call(
      ...arguments_,
    );
  }

  toPath(): string {
    return (this._response.stream as { toPath(): string }).toPath();
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<unknown> {
    return (this.each() as Iterable<unknown>)[Symbol.iterator]();
  }

  /** @noRailsEquivalent PERMANENT */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<string | Uint8Array> {
    const stream = this._response.stream as Partial<AsyncIterable<unknown>> & {
      each(): unknown;
    };
    this._response.sendingBang();
    if (typeof stream[Symbol.asyncIterator] === "function") {
      for await (const chunk of stream as AsyncIterable<unknown>)
        yield chunk as string | Uint8Array;
    } else {
      for (const chunk of stream.each() as Iterable<unknown>) yield chunk as string | Uint8Array;
    }
    this._response.sentBang();
  }
}

export class FileBody {
  private readonly _toPath: string;

  constructor(path: string) {
    this._toPath = path;
  }

  toPath(): string {
    return this._toPath;
  }

  get body(): string {
    return IO.binread(this.toPath());
  }

  *each(): IterableIterator<string> {
    const file = File.open(this.toPath(), "rb");
    try {
      let chunk: string | null;
      while ((chunk = file.read(16384)) !== null) yield chunk;
    } finally {
      file.close();
    }
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Response::Helpers` (`action_dispatch/http/response.rb:91`); the class/interface merge is how a mixin surfaces on the type side. */
export class Response {
  static Headers = Headers;
  static Header = Headers;

  declare static defaultCharset: string | null;
  declare defaultCharset: string | null;
  declare static defaultHeaders: Record<string, string> | undefined;
  declare defaultHeaders: Record<string, string> | undefined;

  static {
    cattrAccessor.call(this, "defaultCharset", { default: "utf-8" });
    cattrAccessor.call(this, "defaultHeaders");
  }

  private _status: number;
  private _headers: Headers;
  private _committed = false;
  private cv: Array<() => void> = [];
  private _sending = false;
  private _sent = false;
  stream: Buffer<{ push(obj: unknown): unknown }> | FileBody | { toPath(): string };
  request: Request | null = null;

  constructor(status = 200, headers: Record<string, string> = {}, body: string[] = []) {
    this._status = status;
    this._headers = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      this._headers.set(key, value);
    }
    this.stream = this.buildBuffer(this, this.mungeBodyObject([...body]));
    this.prepareCacheControlBang();
  }

  get status(): number {
    return this._status;
  }
  set status(status: number | string) {
    this._status = statusCode(status);
  }

  get code(): string {
    return String(this._status);
  }

  get message(): string {
    return HTTP_STATUS_CODES[this._status];
  }

  get successful(): boolean {
    return this._status >= 200 && this._status < 300;
  }
  get isRedirection(): boolean {
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

  get contentType(): string | null | undefined {
    return presence(this.getHeader(CONTENT_TYPE));
  }

  set contentType(value: string | MimeType | undefined) {
    if (value == null) return;
    const newHeaderInfo = this.parseContentType(String(value));
    const prevHeaderInfo = this.parsedContentTypeHeader();
    let charset: string | null | undefined = newHeaderInfo.charset || prevHeaderInfo.charset;
    if (!charset && !prevHeaderInfo.mimeType) {
      charset = (this.constructor as typeof Response).defaultCharset;
    }
    this.setContentType(newHeaderInfo.mimeType, charset);
  }

  get charset(): string | null | undefined {
    const headerInfo = this.parsedContentTypeHeader();
    return headerInfo.charset || (this.constructor as typeof Response).defaultCharset;
  }

  set charset(charset: string | false | null | undefined) {
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

  set body(value: string | Uint8Array | { toPath(): string }) {
    if (typeof (value as { toPath?: unknown }).toPath === "function") {
      this.stream = value as { toPath(): string };
      return;
    }
    this.stream = this.buildBuffer(this, this.mungeBodyObject(value));
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

  get location(): string | undefined {
    return this.getHeader("location");
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

  get cookies(): Record<string, string | null> {
    const cookies: Record<string, string | null> = {};
    let header: string | string[] | undefined = this.getHeader(SET_COOKIE);
    if (header != null) {
      if (typeof header === "string") header = stringSplit(header, "\n");
      for (const cookie of header) {
        const pair = stringSplit(cookie, ";")[0];
        if (pair != null) {
          const [key, value = null] = stringSplit(pair, "=").map((v) => unescape(v));
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
  /** @internal */
  declare _cacheControlHash: CacheControlHash;
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

  toA(): [number, Record<string, string>, unknown] {
    this.commitBang();
    return this.rackResponse(this._status, this._headers.toHash());
  }

  prepareBang(): [number, Record<string, string>, unknown] {
    return this.toA();
  }

  bodyParts(): unknown[] {
    const stream = this.stream as { each(): unknown };
    const parts: unknown[] = [];
    for (const chunk of stream.each() as Iterable<unknown>) parts.push(chunk);
    return parts;
  }

  sendFile(path: string): void {
    this.commitBang();
    this.stream = new FileBody(path);
  }

  resetBodyBang(): void {
    this.stream = this.buildBuffer(this, []);
  }

  each(block?: (chunk: unknown) => unknown): unknown {
    this.sendingBang();
    const x = (this.stream as { each(block?: (chunk: unknown) => unknown): unknown }).each(block);
    this.sentBang();
    return x;
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
    for (const broadcast of this.cv.splice(0)) broadcast();
  }

  sendingBang(): void {
    if (this._sending) return;
    this.beforeSending();
    this._sending = true;
    for (const broadcast of this.cv.splice(0)) broadcast();
  }

  sentBang(): void {
    this._sent = true;
    for (const broadcast of this.cv.splice(0)) broadcast();
  }

  get isSending(): boolean {
    return this._sending;
  }

  get isSent(): boolean {
    return this._sent;
  }

  async awaitCommit(): Promise<void> {
    while (!this._committed) await new Promise<void>((broadcast) => this.cv.push(broadcast));
  }

  async awaitSent(): Promise<void> {
    while (!this._sent) await new Promise<void>((broadcast) => this.cv.push(broadcast));
  }

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
  get redirectUrl(): string | undefined {
    return this.location;
  }
  get mediaType(): string | null {
    return this.parsedContentTypeHeader().mimeType;
  }

  /** @internal */
  parseContentType(contentType: string | undefined): ContentTypeHeader {
    let match: RegExpExecArray | null;
    if (contentType && (match = CONTENT_TYPE_PARSER.exec(contentType))) {
      return new ContentTypeHeader(
        match.groups!["mime_type"] ?? null,
        match.groups!["charset"] ?? null,
      );
    } else {
      return NULL_CONTENT_TYPE_HEADER;
    }
  }

  /** @internal */
  parsedContentTypeHeader(): ContentTypeHeader {
    return this.parseContentType(this.getHeader(CONTENT_TYPE));
  }

  /** @internal */
  setContentType(contentType: string | null | undefined, charset: string | null | undefined): void {
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
  buildBuffer(response: unknown, body: unknown[]): Buffer<{ push(obj: unknown): unknown }> {
    return new Buffer(response as Response, body);
  }

  /** @internal */
  mungeBodyObject(body: unknown): unknown[] {
    if (Array.isArray(body)) return body;
    if (
      body != null &&
      typeof (body as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function" &&
      typeof body !== "string" &&
      !(body instanceof Uint8Array)
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

include(Response, RackResponseHelpers);
Object.defineProperty(Response.prototype, "cacheControl", {
  ...Object.getOwnPropertyDescriptor(RackResponseHelpers.prototype, "cacheControl"),
  get: Object.getOwnPropertyDescriptor(CacheResponse.prototype, "cacheControl")!.get,
  configurable: true,
});
/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Response::Helpers` (`action_dispatch/http/response.rb:91`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Response extends Omit<
  RackResponseHelpers,
  "status" | "headers" | "mediaType" | "contentLength" | "cacheControl" | "contentType"
> {
  get lastModified(): Date | undefined;
  set lastModified(t: Date | Time | { epochMilliseconds: number });
  get date(): Date | undefined;
  set date(t: Date | Time);
}
export interface CookieOptions {
  value: string;
  path?: string;
  domain?: string;
  expires?: CookieExpires;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: SetCookieOptions["sameSite"];
}

function rackCookieValue(value: string | Partial<CookieOptions>): Record<string, unknown> {
  const opts = typeof value === "string" ? { value } : value;
  return {
    value: opts.value ?? "",
    path: opts.path,
    domain: opts.domain,
    // boundary: `Rack::Utils.set_cookie_header` formats `expires` through
    expires:
      opts.expires === undefined || !("epochMilliseconds" in opts.expires)
        ? opts.expires
        : new Date(opts.expires.epochMilliseconds),
    secure: opts.secure,
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
  };
}
