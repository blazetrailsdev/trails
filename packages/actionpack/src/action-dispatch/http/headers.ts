import type { Request } from "./request.js";
import { ActionDispatch } from "../../namespaces.js";
import { KeyError, eachPair } from "@blazetrails/ruby-compat";

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

const HTTP_HEADER = /^[A-Za-z0-9-]+$/;

/** @internal */
function envName(key: string): string {
  key = String(key);
  if (HTTP_HEADER.test(key)) {
    key = key.toUpperCase();
    key = key.replace(/-/g, "_");
    if (!CGI_VARIABLES.has(key)) key = "HTTP_" + key;
  }
  return key;
}

export class Headers {
  static DEFAULT: object = {};

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

  static fromHash(hash: Record<string, unknown>): Headers {
    return new Headers(new ActionDispatch.Request(hash));
  }

  add(key: string, value: unknown): void {
    this._req.addHeader(envName(String(key)), value);
  }

  isKey(key: string): boolean {
    return this._req.hasHeader(envName(String(key)));
  }

  isInclude(key: string): boolean {
    return this.isKey(key);
  }

  fetch(key: string, defaultValue: unknown = Headers.DEFAULT, block?: () => unknown): unknown {
    return this._req.fetchHeader(envName(key), () => {
      if (defaultValue !== Headers.DEFAULT) return defaultValue;
      if (block) return block();
      throw new KeyError(key);
    });
  }

  each(fn: (pair: [string, unknown]) => void): void {
    this._req.eachHeader((key, value) => fn([key, value]));
  }

  merge(headersOrEnv: Record<string, unknown> | Headers): Headers {
    const headers = this._req.dup().headers;
    headers.mergeBang(headersOrEnv);
    return headers;
  }

  mergeBang(headersOrEnv: Record<string, unknown> | Headers): Record<string, unknown> | Headers {
    eachPair(headersOrEnv as Record<string, unknown>, (key, value) => {
      this._req.setHeader(envName(String(key)), value);
    });
    return headersOrEnv;
  }
}
