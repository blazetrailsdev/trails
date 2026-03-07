import { CONTENT_LENGTH, CONTENT_TYPE, TRANSFER_ENCODING, SET_COOKIE, CACHE_CONTROL, EXPIRES, ETAG } from "./constants.js";
import { STATUS_WITH_NO_ENTITY_BODY } from "./constants.js";
import * as MediaTypeModule from "./media-type.js";
import { setCookieHeader, deleteSetCookieHeaderBang } from "./utils.js";

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
    this._writer = this._append.bind(this);
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

  // Bracket accessor
  get(key: string): any { return this.headers[key]; }
  set(key: string, value: any): void { this.headers[key] = value; }

  // Alias for bracket notation
  [Symbol.for("[]")](key: string): any { return this.headers[key]; }

  includes(key: string): boolean { return key in this.headers; }

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
    this.bufferedBody();
    // Clone array body on first write to avoid mutating original
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
    return key in this.headers;
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

  // Status helpers
  get isInvalid(): boolean { return this.status < 100 || this.status >= 600; }
  get isInformational(): boolean { return this.status >= 100 && this.status < 200; }
  get isSuccessful(): boolean { return this.status >= 200 && this.status < 300; }
  get isRedirection(): boolean { return this.status >= 300 && this.status < 400; }
  get isClientError(): boolean { return this.status >= 400 && this.status < 500; }
  get isServerError(): boolean { return this.status >= 500 && this.status < 600; }
  get isOk(): boolean { return this.status === 200; }
  get isCreated(): boolean { return this.status === 201; }
  get isAccepted(): boolean { return this.status === 202; }
  get isNoContent(): boolean { return this.status === 204; }
  get isMovedPermanently(): boolean { return this.status === 301; }
  get isNotFound(): boolean { return this.status === 404; }
  get isBadRequest(): boolean { return this.status === 400; }
  get isUnauthorized(): boolean { return this.status === 401; }
  get isMethodNotAllowed(): boolean { return this.status === 405; }
  get isNotAcceptable(): boolean { return this.status === 406; }
  get isRequestTimeout(): boolean { return this.status === 408; }
  get isPreconditionFailed(): boolean { return this.status === 412; }
  get isRedirect(): boolean { return [301, 302, 303, 307, 308].includes(this.status); }
  get isUnprocessable(): boolean { return this.status === 422; }

  get contentType(): string | undefined { return this.getHeader(CONTENT_TYPE); }
  set contentType(v: string) { this.setHeader(CONTENT_TYPE, v); }
  get contentLength(): number | null { const cl = this.getHeader(CONTENT_LENGTH); return cl ? parseInt(cl) : null; }
  get location(): string | undefined { return this.getHeader("location"); }
  set location(v: string) { this.setHeader("location", v); }

  get mediaType(): string | null { return MediaTypeModule.type(this.contentType ?? null); }
  get mediaTypeParams(): Record<string, string> { return MediaTypeModule.params(this.contentType ?? null); }

  get setCookieHeaderValue(): any { return this.getHeader(SET_COOKIE); }
  set setCookieHeaderValue(v: any) { this.setHeader(SET_COOKIE, v); }

  get cacheControl(): string | undefined { return this.getHeader(CACHE_CONTROL); }
  set cacheControl(v: string) { this.setHeader(CACHE_CONTROL, v); }

  get etag(): string | undefined { return this.getHeader(ETAG); }
  set etag(v: string) { this.setHeader(ETAG, v); }

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

  setCookie(key: string, value: any): void {
    this.addHeader(SET_COOKIE, setCookieHeader(key, value));
  }

  deleteCookie(key: string, value: Record<string, any> = {}): void {
    this.setHeader(SET_COOKIE, deleteSetCookieHeaderBang(this.getHeader(SET_COOKIE), key, value));
  }

  cache(duration: number): void {
    if (this.getHeader(CACHE_CONTROL) === "no-cache, must-revalidate") return;
    this.setHeader(CACHE_CONTROL, `public, max-age=${duration}`);
    this.setHeader(EXPIRES, new Date(Date.now() + duration * 1000).toUTCString());
  }

  doNotCache(): void {
    this.setHeader(CACHE_CONTROL, "no-cache, must-revalidate");
    this.setHeader(EXPIRES, new Date(0).toUTCString());
  }

  bufferedBody(): boolean {
    if (this._buffered === null) {
      if (Array.isArray(this.body)) {
        this.body = this.body.filter((p: any) => p !== null && p !== undefined);
        this.length = this.body.reduce((s: number, p: string) => s + Buffer.byteLength(String(p)), 0);
        this._buffered = true;
      } else if (this.body && typeof this.body.each === "function") {
        const oldBody = this.body;
        this.body = [];
        this._buffered = true;
        this.length = 0;
        oldBody.each((part: string) => this._append(String(part)));
      } else if (this.body && typeof this.body[Symbol.iterator] === "function") {
        const oldBody = this.body;
        this.body = [];
        this._buffered = true;
        this.length = 0;
        for (const part of oldBody) this._append(String(part));
      } else {
        this._buffered = false;
      }
    }
    return this._buffered!;
  }

  private _append(chunk: string): string {
    this.body.push(chunk);
    if (this.length !== null) {
      this.length += Buffer.byteLength(chunk);
    } else if (this._buffered) {
      this.length = Buffer.byteLength(chunk);
    }
    return chunk;
  }
}

export class ResponseRaw {
  status: number;
  headers: Record<string, any>;

  constructor(status: number, headers: Record<string, any>) {
    this.status = status;
    this.headers = headers;
  }

  hasHeader(key: any): boolean {
    return String(key) in this.headers;
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

  get isInvalid(): boolean { return this.status < 100 || this.status >= 600; }
  get isSuccessful(): boolean { return this.status >= 200 && this.status < 300; }
  get isOk(): boolean { return this.status === 200; }
  get isNotFound(): boolean { return this.status === 404; }
  get isRedirect(): boolean { return [301, 302, 303, 307, 308].includes(this.status); }
}
