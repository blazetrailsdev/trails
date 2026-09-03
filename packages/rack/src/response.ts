import { hasKey } from "@blazetrails/ruby-compat";
import {
  CONTENT_LENGTH,
  CONTENT_TYPE,
  TRANSFER_ENCODING,
  SET_COOKIE,
  CACHE_CONTROL,
  EXPIRES,
  ETAG,
} from "./constants.js";
import { STATUS_WITH_NO_ENTITY_BODY } from "./constants.js";
import * as MediaTypeModule from "./media-type.js";
import { setCookieHeader, deleteSetCookieHeaderBang } from "./utils.js";
import { include } from "@blazetrails/ruby-compat";

export abstract class Helpers {
  declare status: number;
  declare headers: Record<string, any>;
  declare body: any;
  declare length: number | null;
  declare _buffered: boolean | null;
  declare _writer: (chunk: string) => string;

  abstract hasHeader(key: any): boolean;
  abstract getHeader(key: any): any;
  abstract setHeader(key: any, value: any): any;
  abstract deleteHeader(key: any): any;

  get isInvalid(): boolean {
    return this.status < 100 || this.status >= 600;
  }

  get isInformational(): boolean {
    return this.status >= 100 && this.status < 200;
  }
  get isSuccessful(): boolean {
    return this.status >= 200 && this.status < 300;
  }
  get isRedirection(): boolean {
    return this.status >= 300 && this.status < 400;
  }
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
  get isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }

  get isOk(): boolean {
    return this.status === 200;
  }
  get isCreated(): boolean {
    return this.status === 201;
  }
  get isAccepted(): boolean {
    return this.status === 202;
  }
  get isNoContent(): boolean {
    return this.status === 204;
  }
  get isMovedPermanently(): boolean {
    return this.status === 301;
  }
  get isBadRequest(): boolean {
    return this.status === 400;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isMethodNotAllowed(): boolean {
    return this.status === 405;
  }
  get isNotAcceptable(): boolean {
    return this.status === 406;
  }
  get isRequestTimeout(): boolean {
    return this.status === 408;
  }
  get isPreconditionFailed(): boolean {
    return this.status === 412;
  }
  get isUnprocessable(): boolean {
    return this.status === 422;
  }

  get isRedirect(): boolean {
    return [301, 302, 303, 307, 308].includes(this.status);
  }

  isInclude(header: string): boolean {
    return this.hasHeader(header);
  }

  addHeader(key: string | null, value: string | null): any {
    if (key === null || key === undefined) throw new Error("ArgumentError: key cannot be nil");
    if (value === null || value === undefined) return this.getHeader(key) ?? null;
    const existing = this.getHeader(key);
    if (existing != null) {
      if (Array.isArray(existing)) {
        existing.push(String(value));
        return existing;
      } else {
        const arr = [existing, String(value)];
        this.setHeader(key, arr);
        return arr;
      }
    } else {
      this.setHeader(key, String(value));
      return String(value);
    }
  }

  get contentType(): string | undefined {
    return this.getHeader(CONTENT_TYPE);
  }

  set contentType(contentType: string) {
    this.setHeader(CONTENT_TYPE, contentType);
  }

  get mediaType(): string | null {
    return MediaTypeModule.type(this.contentType ?? null);
  }

  get mediaTypeParams(): Record<string, string> {
    return MediaTypeModule.params(this.contentType ?? null);
  }

  get contentLength(): number | null {
    const cl = this.getHeader(CONTENT_LENGTH);
    return cl ? parseInt(cl) : null;
  }

  get location(): string | undefined {
    return this.getHeader("location");
  }

  set location(location: string) {
    this.setHeader("location", location);
  }

  setCookie(key: string, value: any): void {
    this.addHeader(SET_COOKIE, setCookieHeader(key, value));
  }

  deleteCookie(key: string, value: Record<string, any> = {}): void {
    this.setHeader(SET_COOKIE, deleteSetCookieHeaderBang(this.getHeader(SET_COOKIE), key, value));
  }

  get setCookieHeader(): any {
    return this.getHeader(SET_COOKIE);
  }

  set setCookieHeader(value: any) {
    this.setHeader(SET_COOKIE, value);
  }

  get cacheControl(): string | undefined {
    return this.getHeader(CACHE_CONTROL);
  }

  set cacheControl(value: string) {
    this.setHeader(CACHE_CONTROL, value);
  }

  doNotCacheBang(): void {
    this.setHeader(CACHE_CONTROL, "no-cache, must-revalidate");
    this.setHeader(EXPIRES, new Date().toUTCString()); // boundary: HTTP-date header
  }

  cacheBang(duration: number = 3600, { directive = "public" }: { directive?: string } = {}): void {
    if (!/no-cache/.test(this.getHeader(CACHE_CONTROL) ?? "")) {
      this.setHeader(CACHE_CONTROL, `${directive}, max-age=${duration}`);
      this.setHeader(EXPIRES, new Date(Date.now() + duration * 1000).toUTCString()); // boundary: HTTP-date header
    }
  }

  get etag(): string | undefined {
    return this.getHeader(ETAG);
  }

  set etag(value: string) {
    this.setHeader(ETAG, value);
  }

  /** @internal */
  bufferedBodyBang(): boolean {
    if (this._buffered === null) {
      if (Array.isArray(this.body)) {
        this.body = this.body.filter((p: any) => p !== null && p !== undefined);
        this.length = this.body.reduce(
          (s: number, p: string) => s + Buffer.byteLength(String(p)),
          0,
        );
        this._buffered = true;
      } else if (this.body && typeof this.body.each === "function") {
        const oldBody = this.body;
        this.body = [];
        this._buffered = true;
        this.length = 0;
        oldBody.each((part: string) => this.append(String(part)));
      } else if (this.body && typeof this.body[Symbol.iterator] === "function") {
        const oldBody = this.body;
        this.body = [];
        this._buffered = true;
        this.length = 0;
        for (const part of oldBody) this.append(String(part));
      } else {
        this._buffered = false;
      }
    }
    return this._buffered;
  }

  /** @internal */
  append(chunk: string): string {
    this.body.push(chunk);
    if (this.length !== null) {
      this.length += Buffer.byteLength(chunk);
    } else if (this._buffered) {
      this.length = Buffer.byteLength(chunk);
    }
    return chunk;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/response.rb:373`); the class/interface merge is how a mixin surfaces on the type side. */
export class Response {
  status: number;
  headers: Record<string, string | string[]>;
  body: any;
  length: number | null;
  private _buffered: boolean | null;
  private _block: ((self: Response) => void) | null;
  private _writer: (chunk: string) => string;

  constructor(body: any = null, status: number = 200, headers: Record<string, string> = {}) {
    this.status = typeof status === "number" ? status : parseInt(String(status));
    this.headers = {};
    for (const [k, v] of Object.entries(headers)) {
      this.headers[k.toLowerCase()] = v;
    }
    this._writer = this.append.bind(this);
    this._block = null;

    if (body === null || body === undefined) {
      this.body = [];
      this._buffered = true;
      this.length = null;
    } else if (typeof body === "string") {
      this.body = [body];
      this._buffered = true;
      this.length = Buffer.byteLength(body);
    } else if (Array.isArray(body)) {
      this.body = body;
      this._buffered = true;
      this.length = body.reduce((s: number, p: string) => s + Buffer.byteLength(String(p)), 0);
    } else {
      this.body = body;
      this._buffered = null;
      this.length = null;
    }
  }

  static create(status: number, headers: Record<string, string>, body: any): Response {
    return new Response(body, status, headers);
  }

  get(key: string): any {
    return this.headers[key];
  }
  set(key: string, value: any): void {
    this.headers[key] = value;
  }

  [Symbol.for("[]")](key: string): any {
    return this.headers[key];
  }

  includes(key: string): boolean {
    return key in this.headers;
  }

  redirect(target: string, status = 302): void {
    this.status = status;
    this.setHeader("location", target);
  }

  isChunked(): boolean {
    return this.getHeader(TRANSFER_ENCODING) === "chunked";
  }

  noEntityBody(): boolean {
    return STATUS_WITH_NO_ENTITY_BODY[this.status] === true;
  }

  finish(block?: (self: Response) => void): [number, Record<string, any>, any] {
    if (this.noEntityBody()) {
      this.deleteHeader(CONTENT_TYPE);
      this.deleteHeader(CONTENT_LENGTH);
      this.close();
      return [this.status, this.headers, []];
    }

    if (block) {
      this._block = block;
      return [this.status, this.headers, this];
    }

    if (this.length !== null && !this.isChunked() && !this.headers[CONTENT_LENGTH]) {
      this.headers[CONTENT_LENGTH] = String(this.length);
    }
    return [this.status, this.headers, this.body];
  }

  toArray(): [number, Record<string, any>, any] {
    return this.finish();
  }

  each(callback: (chunk: string) => void): void {
    if (Array.isArray(this.body)) {
      for (const chunk of this.body) callback(chunk);
    } else if (this.body && typeof this.body.each === "function") {
      this.body.each(callback);
    } else if (this.body && typeof this.body.forEach === "function") {
      this.body.forEach(callback);
    }
    this._buffered = true;
    if (this._block) {
      this._writer = callback as any;
      this._block(this);
    }
  }

  write(chunk: string): void {
    this.bufferedBodyBang();
    if (this._buffered && Array.isArray(this.body) && !this._bodyCloned) {
      this.body = [...this.body];
      this._bodyCloned = true;
    }
    this._writer(String(chunk));
  }
  private _bodyCloned = false;

  close(): void {
    if (this.body && typeof this.body.close === "function") this.body.close();
  }

  isEmpty(): boolean {
    return this._block === null && Array.isArray(this.body) && this.body.length === 0;
  }

  hasHeader(key: string | null): boolean {
    if (key === null || key === undefined) throw new Error("ArgumentError: key cannot be nil");
    return hasKey(this.headers, key);
  }
  getHeader(key: string | null): any {
    if (key === null || key === undefined) throw new Error("ArgumentError: key cannot be nil");
    return this.headers[key];
  }
  setHeader(key: string | null, value: any): any {
    if (key === null || key === undefined) throw new Error("ArgumentError: key cannot be nil");
    this.headers[key] = value;
    return value;
  }
  deleteHeader(key: string | null): any {
    if (key === null || key === undefined) throw new Error("ArgumentError: key cannot be nil");
    const val = this.headers[key];
    delete this.headers[key];
    return val ?? null;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/response.rb:376`); the class/interface merge is how a mixin surfaces on the type side. */
export class ResponseRaw {
  status: number;
  headers: Record<string, any>;

  constructor(status: number, headers: Record<string, any>) {
    this.status = status;
    this.headers = headers;
  }

  hasHeader(key: any): boolean {
    return hasKey(this.headers, String(key));
  }
  getHeader(key: any): any {
    return this.headers[String(key)];
  }
  setHeader(key: any, value: any): any {
    this.headers[String(key)] = value;
    return value;
  }
  deleteHeader(key: any): any {
    const k = String(key);
    const val = this.headers[k];
    delete this.headers[k];
    return val ?? null;
  }
}

include(Response, Helpers);
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/response.rb:373`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Response extends Omit<
  Helpers,
  | "status"
  | "headers"
  | "body"
  | "length"
  | "_buffered"
  | "_writer"
  | "hasHeader"
  | "getHeader"
  | "setHeader"
  | "deleteHeader"
> {}

include(ResponseRaw, Helpers);
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers` (`rack/response.rb:376`); the class/interface merge is how a mixin surfaces on the type side. */
export interface ResponseRaw extends Omit<
  Helpers,
  | "status"
  | "headers"
  | "body"
  | "length"
  | "_buffered"
  | "_writer"
  | "hasHeader"
  | "getHeader"
  | "setHeader"
  | "deleteHeader"
> {}
