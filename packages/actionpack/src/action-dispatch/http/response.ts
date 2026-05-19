/**
 * ActionDispatch::Response
 *
 * Represents an HTTP response with status, headers, and body.
 */

import type { CookieExpires } from "../middleware/cookies.js";
import type { Request } from "./request.js";
import {
  type CacheControlHash,
  cacheControl as _cacheControl,
  getDate as _getDate,
  getLastModified as _getLastModified,
  handleConditionalGet as _handleConditionalGet,
  hasDate as _hasDate,
  hasEtag as _hasEtag,
  hasLastModified as _hasLastModified,
  isStrongEtag as _isStrongEtag,
  mergeAndNormalizeCacheControl as _mergeAndNormalizeCacheControl,
  isWeakEtag as _isWeakEtag,
  setDate as _setDate,
  setLastModified as _setLastModified,
  setStrongEtag as _setStrongEtag,
  setWeakEtag as _setWeakEtag,
} from "./cache.js";
import { filteredLocation as _filteredLocation } from "./filter-redirect.js";

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
  /** Rails: `response.sending_file = true` flag set by `send_file_headers!`. */
  sendingFile = false;
  request: Request | null = null;

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
    if (value) {
      const charset = this._charset ?? (this.constructor as typeof Response).defaultCharset;
      if (value.startsWith("text/")) {
        this._headers["content-type"] = `${value}; charset=${charset}`;
      } else {
        this._headers["content-type"] = value;
      }
    } else {
      delete this._headers["content-type"];
      delete this._headers["Content-Type"];
    }
  }

  get charset(): string | undefined {
    const ct = this._headers["content-type"] ?? this._headers["Content-Type"];
    if (!ct) return this._charset;
    const match = ct.match(/charset=([^\s;]+)/i);
    return match ? match[1] : this._charset;
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
   * {@link setWeakEtag}, which hashes `validators` into a weak validator
   * (`W/"<md5>"`). Pass `undefined` to delete the header.
   */
  set etag(value: unknown) {
    if (value === undefined) {
      delete this._headers["etag"];
      delete this._headers["ETag"];
      return;
    }
    this.setWeakEtag(value);
  }

  // --- Cache::Response wiring (declared here for typing; bound below) ---
  declare lastModified: Date | undefined;
  declare date: Date | undefined;
  declare readonly hasLastModified: boolean;
  declare readonly hasDate: boolean;
  declare readonly hasEtag: boolean;
  declare setWeakEtag: (validators: unknown) => void;
  declare setStrongEtag: (validators: unknown) => void;
  declare isWeakEtag: () => boolean;
  declare isStrongEtag: () => boolean;
  declare handleConditionalGet: () => void;
  declare mergeAndNormalizeCacheControl: (cacheControl: CacheControlHash) => void;
  /**
   * Parsed `Cache-Control` directives as a hash, mirroring Rails'
   * `Cache::Response#cache_control` (an `attr_reader` set by
   * `prepare_cache_control!`). The raw header string is exposed via
   * {@link _cacheControl}.
   */
  declare readonly cacheControl: CacheControlHash;

  // --- Rack response ---

  toRack(): [number, Record<string, string>, string[]] {
    return [this._status, { ...this._headers }, [...this._body]];
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
Response.prototype.setWeakEtag = function (this: Response, v: unknown) {
  _setWeakEtag.call(this, v);
};
Response.prototype.setStrongEtag = function (this: Response, v: unknown) {
  _setStrongEtag.call(this, v);
};
Response.prototype.isWeakEtag = function (this: Response) {
  return _isWeakEtag.call(this);
};
Response.prototype.isStrongEtag = function (this: Response) {
  return _isStrongEtag.call(this);
};
Response.prototype.handleConditionalGet = function (this: Response) {
  _handleConditionalGet.call(this);
};
Response.prototype.mergeAndNormalizeCacheControl = function (
  this: Response,
  cacheControl: CacheControlHash,
) {
  _mergeAndNormalizeCacheControl.call(this, cacheControl);
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
