/**
 * ActionDispatch::Response
 *
 * Represents an HTTP response with status, headers, and body.
 */

export class Response {
  private _status: number;
  private _headers: Record<string, string>;
  private _body: string[];
  private _committed = false;
  private _charset: string | undefined;
  private _cookies: Map<string, CookieValue> = new Map();
  private _sending = false;

  constructor(status = 200, headers: Record<string, string> = {}, body: string[] = []) {
    this._status = status;
    this._headers = { ...headers };
    this._body = [...body];
  }

  // --- Status ---

  get status(): number { return this._status; }
  set status(value: number) { this._status = value; }

  get code(): number { return this._status; }
  get statusCode(): number { return this._status; }

  get message(): string {
    return STATUS_MESSAGES[this._status] || "";
  }

  // --- Headers ---

  get headers(): Record<string, string> { return this._headers; }

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
      const charset = this._charset ?? "utf-8";
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

  get committed(): boolean { return this._committed; }

  // --- Cookies ---

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

  // --- Rack response ---

  toRack(): [number, Record<string, string>, string[]] {
    return [this._status, { ...this._headers }, [...this._body]];
  }

  // --- Inspect ---

  inspect(): string {
    return `#<ActionDispatch::Response ${this._status} ${this.message}>`;
  }

  // --- Factory ---

  static create(status = 200, headers: Record<string, string> = {}, body = ""): Response {
    return new Response(status, headers, body ? [body] : []);
  }
}

export interface CookieOptions {
  value: string;
  path?: string;
  domain?: string;
  expires?: Date;
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
