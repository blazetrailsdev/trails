import type { Request } from "./request.js";
import { _RequestCtor } from "./request-slot.js";
import { KeyError } from "@blazetrails/ruby-compat";

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

  constructor(request: Request) {
    this._req = request;
  }

  get env(): Record<string, unknown> {
    return { ...(this._req.env as Record<string, unknown>) };
  }

  get(key: string): unknown {
    return this._req.getHeader(envName(String(key)));
  }

  set(key: string, value: unknown): void {
    this._req.setHeader(envName(String(key)), value);
  }

  has(key: string): boolean {
    return this._req.hasHeader(envName(String(key)));
  }

  isKey(key: string): boolean {
    return this.has(key);
  }

  mergeBang(headersOrEnv: Record<string, unknown>): this {
    return this.mergeInPlace(headersOrEnv);
  }

  static fromHash(hash: Record<string, unknown>): Headers {
    return new Headers(new _RequestCtor!(hash));
  }

  add(key: string, value: unknown): void {
    this._req.addHeader(envName(String(key)), value);
  }

  fetch(key: string, ...defaultValue: unknown[]): unknown {
    return this._req.fetchHeader(envName(String(key)), () => {
      if (defaultValue.length > 0) {
        const fallback = defaultValue[0];
        if (typeof fallback === "function") return (fallback as () => unknown)();
        return fallback;
      }
      throw new KeyError(String(key));
    });
  }

  each(fn: (pair: [string, unknown]) => void): void {
    this._req.eachHeader((key, value) => fn([key, value]));
  }

  merge(headersOrEnv: Record<string, unknown>): Headers {
    const headers = Headers.fromHash(this.env);
    headers.mergeInPlace(headersOrEnv);
    return headers;
  }

  mergeInPlace(other: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(other)) {
      this._req.setHeader(envName(String(key)), value);
    }
    return this;
  }
}
