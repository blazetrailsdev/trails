import type { Request } from "./request.js";
import { _RequestCtor } from "./request-slot.js";

/**
 * ActionDispatch::Http::Headers
 *
 * Provides a thin wrapper over the request environment hash, giving
 * case-insensitive access to HTTP headers. Headers can be accessed by
 * their HTTP name ("Content-Type") or their CGI env name ("CONTENT_TYPE"
 * or "HTTP_CONTENT_MD5").
 */

const CGI_VARIABLES = new Set([
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

/** @internal */
function envName(key: string): string {
  const str = String(key);
  if (str.includes(".")) return str;
  if (CGI_VARIABLES.has(str) || str.startsWith("HTTP_")) return str;
  const upper = str.toUpperCase().replace(/-/g, "_");
  if (CGI_VARIABLES.has(upper)) return upper;
  if (upper.startsWith("HTTP_")) return upper;
  return "HTTP_" + upper;
}

export class Headers {
  private _req: Request;

  /** Mirrors: `Headers#initialize` (`http/headers.rb:58-60`). */
  constructor(request: Request) {
    this._req = request;
  }

  /** Mirrors: `Headers#env` (`http/headers.rb:117`). */
  get env(): Record<string, unknown> {
    return { ...(this._req.env as Record<string, unknown>) };
  }

  /** Mirrors: `Headers#[]` (`http/headers.rb:62-64`). */
  get(key: string): unknown {
    return this._req.getHeader(envName(String(key)));
  }

  /** Mirrors: `Headers#[]=` (`http/headers.rb:66-68`). */
  set(key: string, value: unknown): void {
    this._req.setHeader(envName(String(key)), value);
  }

  /** Mirrors: `Headers#key?` (`http/headers.rb:75-77`). */
  has(key: string): boolean {
    return this._req.hasHeader(envName(String(key)));
  }

  /** Rails alias `key?` for `Hash#key?`. */
  isKey(key: string): boolean {
    return this.has(key);
  }

  /** Rails `merge!(other)` — mutating merge. Alias of `mergeInPlace`. */
  mergeBang(headersOrEnv: Record<string, unknown>): this {
    return this.mergeInPlace(headersOrEnv);
  }

  /** Mirrors: `Headers.from_hash` (`http/headers.rb:54-56`). */
  static fromHash(hash: Record<string, unknown>): Headers {
    return new Headers(new _RequestCtor!(hash));
  }

  /** Mirrors: `Headers#add` (`http/headers.rb:71-73`). */
  add(key: string, value: unknown): void {
    this._req.addHeader(envName(String(key)), value);
  }

  /** Mirrors: `Headers#fetch` (`http/headers.rb:90-96`). */
  fetch(key: string, ...defaultValue: unknown[]): unknown {
    const envKey = envName(String(key));
    if (this._req.hasHeader(envKey)) return this._req.getHeader(envKey);
    if (defaultValue.length > 0) {
      const fallback = defaultValue[0];
      if (typeof fallback === "function") return (fallback as () => unknown)();
      return fallback;
    }
    throw new Error(`key not found: "${key}"`);
  }

  /** Mirrors: `Headers#each` (`http/headers.rb:98-100`). */
  each(fn: (pair: [string, unknown]) => void): void {
    this._req.eachHeader((key, value) => fn([key, value]));
  }

  /** Mirrors: `Headers#merge` (`http/headers.rb:104-108`). */
  merge(headersOrEnv: Record<string, unknown>): Headers {
    const headers = Headers.fromHash(this.env);
    headers.mergeInPlace(headersOrEnv);
    return headers;
  }

  /** Mirrors: `Headers#merge!` (`http/headers.rb:112-116`). */
  mergeInPlace(other: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(other)) {
      this._req.setHeader(envName(String(key)), value);
    }
    return this;
  }
}
