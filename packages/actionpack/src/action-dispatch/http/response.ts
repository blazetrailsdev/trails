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
  getEtag as _getEtag,
  getLastModified as _getLastModified,
  handleConditionalGet as _handleConditionalGet,
  hasDate as _hasDate,
  hasEtag as _hasEtag,
  hasLastModified as _hasLastModified,
  isStrongEtag as _isStrongEtag,
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
    return this._headers[key.toLowerCase()] ?? this._headers[key];
  }

  setHeader(key: string, value: string): void {
    this._headers[key] = value;
  }

  deleteHeader(key: string): void {
    delete this._headers[key];
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

  // --- Cache-Control ---

  get cacheControl(): string | undefined {
    return this._headers["cache-control"] ?? this._headers["Cache-Control"];
  }

  set cacheControl(value: string | undefined) {
    if (value) {
      this._headers["cache-control"] = value;
    } else {
      delete this._headers["cache-control"];
      delete this._headers["Cache-Control"];
    }
  }

  // --- ETag ---

  get etag(): string | undefined {
    return this._headers["etag"] ?? this._headers["ETag"];
  }

  set etag(value: string | undefined) {
    if (value) {
      // Ensure proper quoting
      if (!value.startsWith('"') && !value.startsWith('W/"')) {
        value = `"${value}"`;
      }
      this._headers["etag"] = value;
    } else {
      delete this._headers["etag"];
      delete this._headers["ETag"];
    }
  }

  get weakEtag(): boolean {
    return this.etag?.startsWith('W/"') ?? false;
  }

  get strongEtag(): boolean {
    const e = this.etag;
    return e !== undefined && e.startsWith('"') && !e.startsWith('W/"');
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
  /**
   * Parsed `Cache-Control` directives as a hash, mirroring Rails'
   * `Cache::Response#cache_control`. The raw header string remains available
   * via the existing {@link cacheControl} string accessor.
   */
  declare readonly cacheControlHash: CacheControlHash;

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
// arguments are wired as prototype methods. The existing `etag`/`cacheControl`
// string accessors are intentionally retained — Rails-parity replacements
// (etag= → weakEtag=, cacheControl as parsed hash) are tracked as a separate
// follow-up since they break existing test expectations.
Object.defineProperty(Response.prototype, "lastModified", {
  get(this: Response) {
    return _getLastModified.call(this);
  },
  set(this: Response, t: Date) {
    _setLastModified.call(this, t);
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
  set(this: Response, t: Date) {
    _setDate.call(this, t);
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
Object.defineProperty(Response.prototype, "cacheControlHash", {
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
// `_getEtag` mirrors Rails' `Cache::Response#etag` reader. The existing
// `Response.etag` getter already returns the header value (case-insensitive),
// so we don't re-wire it here. Reference the import to satisfy TS unused-import.
void _getEtag;

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
