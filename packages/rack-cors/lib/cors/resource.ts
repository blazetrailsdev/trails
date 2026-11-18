import { Rack, type RackEnv } from "@blazetrails/rack";
import { constDefined, constGet, regexpEscape, TypeError } from "@blazetrails/ruby-compat";

import { Cors } from "../cors.js";
import { CorsMisconfigurationError } from "./resources/cors-misconfiguration-error.js";
import { Result } from "./result.js";

type Headers = Record<string, string>;

export interface ResourceOptions {
  credentials?: boolean | null;
  maxAge?: number | null;
  if?: ((env: RackEnv) => unknown) | null;
  vary?: string | string[] | null;
  headers?: "any" | string | string[] | null;
  methods?: "any" | string | string[] | null;
  expose?: string | string[] | null;
}

export class Resource {
  static readonly CORS_SIMPLE_HEADERS: readonly string[] = Object.freeze([
    "accept",
    "accept-language",
    "content-language",
    "content-type",
  ]);

  static readonly CorsMisconfigurationError = CorsMisconfigurationError;

  path: string | RegExp;
  methods: string[];
  headers: "any" | string[] | null;
  expose: string[] | null;
  maxAge: number;
  credentials: boolean;
  pattern: RegExp;
  ifProc: ((env: RackEnv) => unknown) | null;
  varyHeaders: string[] | null;
  /** @internal */
  protected publicResource: boolean;
  /** @internal */
  protected _headerProc?: (h: Headers) => Headers;

  constructor(publicResource: boolean, path: string | RegExp, opts: ResourceOptions = {}) {
    if (publicResource && opts.credentials === true) throw new CorsMisconfigurationError();

    this.path = path;
    this.credentials = publicResource ? false : opts.credentials === true;
    this.maxAge = opts.maxAge ?? 7200;
    this.pattern = this.compile(path);
    this.ifProc = opts.if ?? null;
    this.varyHeaders = opts.vary != null ? [opts.vary].flat() : null;
    this.publicResource = publicResource;

    switch (opts.headers) {
      case "any":
        this.headers = "any";
        break;
      case null:
      case undefined:
        this.headers = null;
        break;
      default:
        this.headers = [opts.headers].flat().map((h) => h.toLowerCase());
    }

    let methods: string[];
    switch (opts.methods) {
      case "any":
        methods = ["get", "head", "post", "put", "patch", "delete", "options"];
        break;
      default:
        methods = this.ensureEnum(opts.methods) ?? ["get"];
    }
    this.methods = methods.map((m) => String(m));

    this.expose = opts.expose != null ? [opts.expose].flat() : null;
  }

  isMatchesPath(path: string | null): boolean {
    return path != null && this.pattern.test(path);
  }

  isMatch(path: string | null, env: RackEnv): boolean {
    if (!this.isMatchesPath(path)) return false;
    if (this.ifProc == null) return true;
    const result = this.ifProc(env);
    return result != null && result !== false;
  }

  processPreflight(env: RackEnv, result: Result): Headers {
    const headers: Headers = {};

    const requestMethod = env[Cors.HTTP_ACCESS_CONTROL_REQUEST_METHOD] as string | null | undefined;
    if (requestMethod == null && result.miss(Result.MISS_NO_METHOD)) return headers;
    if (
      !this.methods.includes(requestMethod!.toLowerCase()) &&
      result.miss(Result.MISS_DENY_METHOD)
    )
      return headers;

    const requestHeaders = env[Cors.HTTP_ACCESS_CONTROL_REQUEST_HEADERS] as
      | string
      | null
      | undefined;
    if (
      requestHeaders != null &&
      !this.isAllowHeaders(requestHeaders) &&
      result.miss(Result.MISS_DENY_HEADER)
    )
      return headers;

    result.hit = true;
    return { ...headers, ...this.toPreflightHeaders(env) };
  }

  toHeaders(env: RackEnv): Headers {
    const h: Headers = {
      "access-control-allow-origin": this.originForResponseHeader(env[Cors.HTTP_ORIGIN] as string),
      "access-control-allow-methods": this.methods.map((m) => String(m).toUpperCase()).join(", "),
      "access-control-expose-headers": this.expose == null ? "" : this.expose.join(", "),
      "access-control-max-age": String(this.maxAge),
    };
    if (this.credentials) h["access-control-allow-credentials"] = "true";
    return this.headerProc()(h);
  }

  /** @internal */
  protected isPublicResource(): boolean {
    return this.publicResource;
  }

  /** @internal */
  protected originForResponseHeader(origin: string): string {
    if (this.isPublicResource()) return "*";

    return origin;
  }

  /** @internal */
  protected toPreflightHeaders(env: RackEnv): Headers {
    const h = this.toHeaders(env);
    if (env[Cors.HTTP_ACCESS_CONTROL_REQUEST_HEADERS] != null)
      Object.assign(h, {
        "access-control-allow-headers": env[Cors.HTTP_ACCESS_CONTROL_REQUEST_HEADERS] as string,
      });
    return h;
  }

  /** @internal */
  protected isAllowHeaders(requestHeaders: string | string[]): boolean {
    const headers = this.headers || [];
    if (headers === "any") return true;

    if (typeof requestHeaders === "string") requestHeaders = requestHeaders.split(/,\s*/);
    return requestHeaders.every((header) => {
      header = header.toLowerCase();
      return Resource.CORS_SIMPLE_HEADERS.includes(header) || headers.includes(header);
    });
  }

  /** @internal */
  protected ensureEnum<T>(var_: T | T[] | null | undefined): T[] | null {
    if (var_ == null) return null;

    return [var_].flat() as T[];
  }

  /** @internal */
  protected compile(path: string | RegExp): RegExp {
    if (typeof path === "string") {
      const specialChars = [".", "+", "(", ")", "$"];
      const pattern = path.replace(/((:\w+)|\/\*|[*.+()$])/g, (match) => {
        switch (match) {
          case "/*":
            return "\\/?(.*?)";
          case "*":
            return "(.*?)";
          default:
            if (specialChars.includes(match)) return regexpEscape(match);
            return "([^/?&#]+)";
        }
      });
      return new RegExp(`^${pattern}$`, "m");
    } else if (path instanceof RegExp) {
      return path;
    } else {
      throw new TypeError(path);
    }
  }

  /** @internal */
  protected headerProc(): (h: Headers) => Headers {
    return (this._headerProc ??= constDefined(Rack, "Headers")
      ? (h) => h
      : (h) => {
          const HeaderHash = constGet(Rack, "Utils::HeaderHash") as new (h: Headers) => Headers;
          return new HeaderHash(h);
        });
  }
}
