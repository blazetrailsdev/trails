import { Time } from "@blazetrails/date";
import { ResponseHelpers as Helpers, type Headers as RackHeaders } from "@blazetrails/rack";
import {
  ArgumentError,
  include,
  rbObjDup,
  rbObjRespondTo,
  stringSplit,
  toI,
  update,
} from "@blazetrails/ruby-compat";
import { CacheControl } from "./cache-control.js";
import { Headers } from "./headers.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Response::Helpers` (`rack-cache/response.rb:22`); the class/interface merge is how a mixin surfaces on the type side. */
export class Response {
  status: number;
  headers: RackHeaders;
  body: unknown;
  readonly now: Time;
  /** @internal */
  private _cacheControl: CacheControl | null = null;

  static readonly CACHEABLE_RESPONSE_CODES: ReadonlySet<number> = new Set([
    200, 203, 300, 301, 302, 404, 410,
  ]);

  static readonly NOT_MODIFIED_OMIT_HEADERS: ReadonlySet<string> = new Set([
    "allow",
    "content-encoding",
    "content-language",
    "content-length",
    "content-md5",
    "content-type",
    "last-modified",
  ]);

  constructor(status: number | string, headers: unknown, body: unknown) {
    this.status = toI(status) as number;
    this.headers = Headers(headers);
    this.body = body;
    this.now = Time.now();
    if (this.headers.get("date") == null) this.headers.set("date", this.now.httpdate());
  }

  initializeCopy(other: Response): void {
    this.headers = rbObjDup(other.headers);
    this._cacheControl = null;
  }

  toA(): [number, object, unknown] {
    return [this.status, this.headers.toHash(), this.body];
  }

  get cacheControl(): CacheControl {
    return (this._cacheControl ??= new CacheControl(this.headers.get("cache-control") ?? null));
  }

  set cacheControl(value: unknown) {
    if (rbObjRespondTo(value, "toHash")) {
      this.cacheControl.clear();
      update(this.cacheControl, value as Record<string, string | boolean>);
      value = this.cacheControl.toString();
    }

    if (value == null || (value as string).length === 0) {
      this.headers.delete("cache-control");
    } else {
      this.headers.set("cache-control", value as string);
    }
  }

  isFresh(): boolean | null {
    const ttl = this.ttl;
    return ttl != null ? ttl > 0 : null;
  }

  isCacheable(): boolean | null {
    if (!Response.CACHEABLE_RESPONSE_CODES.has(this.status)) return false;
    if (
      (this.cacheControl.isNoStore() ?? false) !== false ||
      (this.cacheControl.isPrivate() ?? false) !== false
    ) {
      return false;
    }
    return this.isValidateable() || this.isFresh();
  }

  isValidateable(): boolean {
    return this.headers.hasKey("last-modified") || this.headers.hasKey("etag");
  }

  set private(value: unknown) {
    const v = value != null && value !== false ? true : null;
    this.cacheControl = this.cacheControl.merge({ public: !v, private: v });
  }

  isMustRevalidate(): string | boolean | undefined {
    const mustRevalidate = this.cacheControl.isMustRevalidate();
    return mustRevalidate != null && mustRevalidate !== false
      ? mustRevalidate
      : this.cacheControl.isProxyRevalidate();
  }

  expireBang(): void {
    if (this.isFresh()) this.headers.set("age", String(this.maxAge));
  }

  get date(): Time {
    try {
      const date = this.headers.get("date");
      if (date != null) {
        return Time.httpdate(date);
      } else {
        if (!this.headers.isFrozen()) this.headers.set("date", this.now.httpdate());
        return this.now;
      }
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (!this.headers.isFrozen()) this.headers.set("date", this.now.httpdate());
      return this.now;
    }
  }

  get age(): number {
    return toI(
      this.headers.get("age") ?? Math.max(Math.trunc(this.now.minus(this.date) as number), 0),
    ) as number;
  }

  get maxAge(): number | null {
    return (this.cacheControl.reverseMaxAge() ??
      this.cacheControl.sharedMaxAge() ??
      this.cacheControl.maxAge() ??
      (this.expires && (this.expires.minus(this.date) as number))) as number | null;
  }

  set maxAge(value: unknown) {
    this.cacheControl = this.cacheControl.merge({ "max-age": String(value) });
  }

  get expires(): Time | null {
    try {
      const expires = this.headers.get("expires");
      return expires != null ? Time.httpdate(expires) : null;
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      return null;
    }
  }

  set sharedMaxAge(value: unknown) {
    this.cacheControl = this.cacheControl.merge({ "s-maxage": String(value) });
  }

  set reverseMaxAge(value: unknown) {
    this.cacheControl = this.cacheControl.merge({ "r-maxage": String(value) });
  }

  get ttl(): number | null {
    const maxAge = this.maxAge;
    return maxAge != null ? maxAge - this.age : null;
  }

  set ttl(seconds: number) {
    this.sharedMaxAge = this.age + seconds;
  }

  set clientTtl(seconds: number) {
    this.maxAge = this.age + seconds;
  }

  get lastModified(): string | undefined {
    return this.headers.get("last-modified");
  }

  get etag(): string | undefined {
    return this.headers.get("etag");
  }

  notModifiedBang(): null {
    if (rbObjRespondTo(this.body, "close")) (this.body as { close(): void }).close();
    this.status = 304;
    this.body = [];
    for (const name of Response.NOT_MODIFIED_OMIT_HEADERS) this.headers.delete(name);
    return null;
  }

  get vary(): string | undefined {
    return this.headers.get("vary");
  }

  isVary(): boolean {
    return !(this.vary == null);
  }

  get varyHeaderNames(): string[] {
    const vary = this.headers.get("vary");
    if (vary == null) return [];
    return stringSplit(vary, /[\s,]+/);
  }
}

include(Response, Helpers);
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Response::Helpers` (`rack-cache/response.rb:22`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Response extends Omit<
  Helpers,
  | "status"
  | "headers"
  | "_body"
  | "length"
  | "_buffered"
  | "_writer"
  | "hasHeader"
  | "getHeader"
  | "setHeader"
  | "deleteHeader"
  | "etag"
  | "cacheControl"
> {}
