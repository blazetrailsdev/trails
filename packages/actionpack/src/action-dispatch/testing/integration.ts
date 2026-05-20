/**
 * ActionDispatch::IntegrationTest
 *
 * Full-stack integration testing that drives requests through the routing
 * layer and dispatches to controllers. Supports multi-request sessions
 * with persistent cookies, session, and flash.
 *
 * Usage with Vitest:
 *
 *   import { IntegrationTest } from "@blazetrails/actionpack/action-dispatch/testing/integration";
 *
 *   describe("Posts API", () => {
 *     const app = new IntegrationTest();
 *
 *     beforeAll(() => {
 *       app.routes.draw((r) => { r.resources("posts"); });
 *       app.registerController("posts", PostsController);
 *     });
 *
 *     it("GET /posts returns 200", async () => {
 *       await app.get("/posts");
 *       app.assertResponse("success");
 *     });
 *
 *     it("POST /posts creates and redirects", async () => {
 *       await app.post("/posts", { params: { title: "Hello" } });
 *       app.assertResponse("redirect");
 *       await app.followRedirect();
 *       app.assertResponse("success");
 *     });
 *   });
 */

import { Request } from "../http/request.js";
import { Response } from "../http/response.js";
import { Parameters } from "../../action-controller/metal/strong-parameters.js";
import { CookieJar } from "../middleware/cookies.js";
import { FlashHash } from "../middleware/flash.js";
import { RouteSet } from "../routing/route-set.js";
import type { Metal } from "../../action-controller/metal.js";
import {
  cookies as testProcessCookies,
  flash as testProcessFlash,
  redirectToUrl as testProcessRedirectToUrl,
  type TestProcessHost,
} from "./test-process.js";

type ControllerClass = new () => Metal;

export interface IntegrationRequestOptions {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: string;
  format?: string;
  xhr?: boolean;
  env?: Record<string, unknown>;
  as?: string;
}

const STATUS_RANGES: Record<string, [number, number]> = {
  success: [200, 299],
  redirect: [300, 399],
  missing: [400, 499],
  error: [500, 599],
};

// Match only paths that *begin* with a scheme (e.g. `http://…`). Rails uses
// `path.include?("://")` which is fine in Ruby because `URI.parse` is lenient
// with relative inputs, but JS `new URL` throws on relative paths — so we
// have to be stricter to avoid breaking `/callback?return=http://example.com`.
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const DEFAULT_HOST = "www.example.com";
const DEFAULT_REMOTE_ADDR = "127.0.0.1";
const DEFAULT_ACCEPT =
  "text/xml,application/xml,application/xhtml+xml," +
  "text/html;q=0.9,text/plain;q=0.8,image/png," +
  "*/*;q=0.5";

export class IntegrationTest {
  /** The route set for this test. */
  routes: RouteSet = new RouteSet();

  /** Controller registry: maps controller names to classes. */
  private controllers: Map<string, ControllerClass> = new Map();

  /** Session data persisted across requests. */
  session: Record<string, unknown> = {};

  /** The hostname used in the last request. */
  host: string = DEFAULT_HOST;

  /** The remote address used in the last request. */
  remoteAddr: string = DEFAULT_REMOTE_ADDR;

  /** The Accept header to send. */
  accept: string = DEFAULT_ACCEPT;

  /** A running counter of the number of requests processed. */
  requestCount: number = 0;

  /** @internal */
  _https: boolean = false;

  /** @internal */
  _urlOptions?: Record<string, unknown>;

  /**
   * Caller-supplied defaults merged into {@link urlOptions}. Rails sources
   * this from the `UrlFor` mixin; until UrlFor is ported, sessions can still
   * populate it directly (it's also what `Runner#default_url_options=` writes
   * through to).
   *
   * @internal
   */
  _defaultUrlOptions: Record<string, unknown> = {};

  constructor() {
    this.resetBang();
  }

  /**
   * Reset the instance. Mirrors `Integration::Session#reset!`. Existing
   * `reset()` is kept as a friendly alias.
   */
  resetBang(): void {
    this.session = {};
    this._persistentCookies = {};
    this._cookieJar = undefined;
    this.controller = undefined!;
    this.request = undefined!;
    this.response = undefined!;
    this._https = false;
    this._urlOptions = undefined;
    this.requestCount = 0;
    this.host = DEFAULT_HOST;
    this.remoteAddr = DEFAULT_REMOTE_ADDR;
    this.accept = DEFAULT_ACCEPT;
  }

  /** Mirror of Rails `Integration::Session#https!`. */
  httpsBang(flag: boolean = true): void {
    this._https = flag;
  }

  /** Returns true if the session is mimicking a secure HTTPS request. */
  isHttps(): boolean {
    return this._https;
  }

  /**
   * Default URL options for this session, derived from host/scheme.
   * Mirrors `Integration::Session#url_options`, memoized per-request like
   * Rails (cleared inside `_processPath`).
   */
  urlOptions(): Record<string, unknown> {
    if (!this._urlOptions) {
      this._urlOptions = {
        ...this._defaultUrlOptions,
        host: this.host,
        protocol: this._https ? "https" : "http",
      };
    }
    return this._urlOptions;
  }

  /**
   * Caller-supplied defaults merged into {@link urlOptions} (Rails
   * `Runner#default_url_options`). Stored as a separate hash so writes don't
   * clobber the per-request memo computed by {@link urlOptions}.
   */
  defaultUrlOptions(): Record<string, unknown> {
    return this._defaultUrlOptions;
  }

  setDefaultUrlOptions(options: Record<string, unknown>): void {
    this._defaultUrlOptions = options;
    this._urlOptions = undefined;
  }

  /**
   * Build the absolute URI for the current request. Matches Rails
   * `Integration::Session#build_full_uri(path, env)`. Called by `_processPath`
   * to populate `env.REQUEST_URI`.
   *
   * @internal
   */
  _buildFullUri(path: string, env: Record<string, unknown>): string {
    return `${env["rack.url_scheme"]}://${env["SERVER_NAME"]}:${env["SERVER_PORT"]}${path}`;
  }

  /**
   * Expand a path that may itself contain a scheme/host, optionally letting
   * the caller observe the parsed location to update `host`/`https`. Mirrors
   * `Integration::Session#build_expanded_path`.
   *
   * @internal
   */
  _buildExpandedPath(path: string, onLocation?: (url: URL) => void): string {
    if (!ABSOLUTE_URL_RE.test(path)) return path;
    const location = new URL(path);
    onLocation?.(location);
    return location.search ? `${location.pathname}${location.search}` : location.pathname;
  }

  /**
   * Rails-shaped `Integration::Session#process`. Verb helpers delegate here.
   */
  async process(
    method: string,
    path: string,
    options: IntegrationRequestOptions = {},
  ): Promise<number> {
    let expanded = path;
    if (ABSOLUTE_URL_RE.test(path)) {
      expanded = this._buildExpandedPath(path, (loc) => {
        this.httpsBang(loc.protocol === "https:");
        if (loc.host) this.host = loc.host;
      });
    }
    await this._processPath(method.toUpperCase(), expanded, options);
    return this.status;
  }

  /**
   * Rails-shaped `RequestHelpers#follow_redirect!`. Preserves the verb on
   * 307/308 (per RFC 7231/7538) and sets `HTTP_REFERER` to the previous URL,
   * mirroring the Rails implementation.
   */
  async followRedirectBang(options: IntegrationRequestOptions = {}): Promise<number> {
    if (!this.response || this.status < 300 || this.status >= 400) {
      throw new Error(`not a redirect! ${this.status}`);
    }
    const location = this.redirectUrl;
    if (!location) throw new Error("not a redirect! (no Location header)");

    const preserveVerb = this.status === 307 || this.status === 308;
    const method = preserveVerb
      ? ((this.request?.env?.REQUEST_METHOD as string | undefined)?.toLowerCase() ?? "get")
      : "get";

    const headers = { ...(options.headers ?? {}) };
    const hasReferer = Object.keys(headers).some(
      (k) => k === "HTTP_REFERER" || k.toLowerCase() === "referer",
    );
    if (!hasReferer && this.request) {
      const env = this.request.env as Record<string, string | undefined>;
      const qs = env.QUERY_STRING ? `?${env.QUERY_STRING}` : "";
      const prev =
        `${env["rack.url_scheme"] ?? "http"}://${env.HTTP_HOST ?? this.host}` +
        `${env.PATH_INFO ?? ""}${qs}`;
      headers["HTTP_REFERER"] = prev;
    }

    await this.process(method, location, { ...options, headers });
    return this.status;
  }

  /** Accumulated cookies across requests (simple key/value), seeds the jar. */
  private _persistentCookies: Record<string, string> = {};

  /**
   * Memoized CookieJar slot consumed by `ActionDispatch::TestProcess#cookies`.
   * Cleared at the start of each request so the jar reflects the current
   * request's `HTTP_COOKIE` header.
   *
   * @internal
   */
  _cookieJar?: CookieJar;

  /** The controller instance from the last request. */
  controller!: Metal;

  /** The Request from the last request. */
  request!: Request;

  /** The Response from the last request. */
  response!: Response;

  /** The response status code. */
  get status(): number {
    return this.response?.statusCode ?? this.controller?.status ?? 0;
  }

  /** The response body as a string. */
  get responseBody(): string {
    return this.response?.body ?? this.controller?.body ?? "";
  }

  /** Parsed JSON response body. */
  get parsedBody(): unknown {
    return JSON.parse(this.responseBody);
  }

  /** The response Location header. */
  get redirectUrl(): string | undefined {
    return this.response?.getHeader("location") ?? this.controller?.getHeader("location");
  }

  /**
   * Flash from the last request. Delegates to
   * `ActionDispatch::TestProcess#flash`, which reads off
   * `this.request.flash` — wired up by `_processPath` after each dispatch so
   * the value survives between requests like the real flash middleware.
   */
  get flash(): FlashHash {
    if (!this.request) return new FlashHash();
    return testProcessFlash.call(this as unknown as TestProcessHost) as FlashHash;
  }

  /**
   * Cookies from the last request as a Rails-shaped `CookieJar`. Delegates
   * to `ActionDispatch::TestProcess#cookies`, which builds the jar from
   * `this.request.cookies` (parsed from `HTTP_COOKIE`) and memoizes it on
   * `_cookieJar`. The slot is cleared on every new request and on `reset()`.
   */
  get cookies(): CookieJar {
    if (!this.request) {
      this._cookieJar ??= CookieJar.build(undefined, this._persistentCookies);
      return this._cookieJar;
    }
    return testProcessCookies.call(this as unknown as TestProcessHost);
  }

  /** Mirror of `ActionDispatch::TestProcess#redirectToUrl`. */
  get redirectToUrl(): string | undefined {
    return testProcessRedirectToUrl.call(this as unknown as TestProcessHost);
  }

  /** Mirror of `ActionDispatch::TestProcess#session` (no-op delegation). */
  // `session` is kept as an instance field above so multi-request tests can
  // observe accumulated state directly. TestProcess#session reads the same
  // value off the Request via `rack.session`, which `_processPath` syncs.

  /**
   * Register a controller class for a given name.
   * The name should match the controller segment from routes
   * (e.g., "posts" for PostsController, "admin/posts" for namespaced).
   */
  registerController(name: string, klass: ControllerClass): void {
    this.controllers.set(name, klass);
  }

  // --- HTTP verb methods ---

  async get(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this.process("GET", path, options);
  }

  async post(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this.process("POST", path, options);
  }

  async put(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this.process("PUT", path, options);
  }

  async patch(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this.process("PATCH", path, options);
  }

  async delete(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this.process("DELETE", path, options);
  }

  async head(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this.process("HEAD", path, options);
  }

  /**
   * Follow the redirect from the last response.
   * Issues a GET to the Location header.
   */
  async followRedirect(): Promise<void> {
    const location = this.redirectUrl;
    if (!location) {
      throw new Error("No redirect to follow (no Location header)");
    }
    await this.get(location);
  }

  // --- Assertions ---

  assertResponse(expected: number | string): void {
    const actual = this.status;
    if (typeof expected === "number") {
      if (actual !== expected) {
        throw new Error(`Expected response status ${expected}, got ${actual}`);
      }
      return;
    }

    const range = STATUS_RANGES[expected];
    if (range) {
      if (actual < range[0] || actual > range[1]) {
        throw new Error(
          `Expected response to be "${expected}" (${range[0]}-${range[1]}), got ${actual}`,
        );
      }
      return;
    }

    const SYMBOLS: Record<string, number> = {
      ok: 200,
      created: 201,
      accepted: 202,
      no_content: 204,
      moved_permanently: 301,
      found: 302,
      see_other: 303,
      not_modified: 304,
      bad_request: 400,
      unauthorized: 401,
      forbidden: 403,
      not_found: 404,
      method_not_allowed: 405,
      unprocessable_entity: 422,
      internal_server_error: 500,
      service_unavailable: 503,
    };
    const code = SYMBOLS[expected];
    if (code !== undefined) {
      if (actual !== code) {
        throw new Error(`Expected response status :${expected} (${code}), got ${actual}`);
      }
      return;
    }

    throw new Error(`Unknown response assertion: "${expected}"`);
  }

  assertRedirectedTo(expected: string | RegExp): void {
    const location = this.redirectUrl;
    if (!location) {
      throw new Error("Expected a redirect but no Location header was set");
    }
    if (typeof expected === "string") {
      if (location !== expected) {
        throw new Error(`Expected redirect to "${expected}", got "${location}"`);
      }
    } else {
      if (!expected.test(location)) {
        throw new Error(`Expected redirect matching ${expected}, got "${location}"`);
      }
    }
  }

  assertContentType(expected: string): void {
    const actual = this.response?.getHeader("content-type") ?? this.controller?.contentType ?? "";
    if (!actual.includes(expected)) {
      throw new Error(`Expected content type to include "${expected}", got "${actual}"`);
    }
  }

  assertHeader(name: string, expected: string | RegExp): void {
    const actual = this.response?.getHeader(name) ?? this.controller?.getHeader(name);
    if (actual === undefined) {
      throw new Error(`Expected header "${name}" to be set`);
    }
    if (typeof expected === "string") {
      if (actual !== expected) {
        throw new Error(`Expected header "${name}" to be "${expected}", got "${actual}"`);
      }
    } else {
      if (!expected.test(actual)) {
        throw new Error(`Expected header "${name}" to match ${expected}, got "${actual}"`);
      }
    }
  }

  assertFlash(key: string, expected?: string | RegExp): void {
    const value = this.flash.get(key);
    if (value === undefined) {
      throw new Error(`Expected flash[:${key}] to be set`);
    }
    if (expected !== undefined) {
      if (typeof expected === "string" && value !== expected) {
        throw new Error(`Expected flash[:${key}] to be "${expected}", got "${value}"`);
      }
      if (expected instanceof RegExp && !expected.test(value as string)) {
        throw new Error(`Expected flash[:${key}] to match ${expected}, got "${value}"`);
      }
    }
  }

  /**
   * Reset all session state (cookies, session, flash). Alias of {@link resetBang}.
   */
  reset(): void {
    this.resetBang();
  }

  // --- Internal ---

  private async _processPath(
    method: string,
    path: string,
    options: IntegrationRequestOptions,
  ): Promise<void> {
    this.requestCount += 1;
    // Clear per-request memos up front so they don't leak across requests,
    // including down the no-route 404 path.
    this._cookieJar = undefined;
    this._urlOptions = undefined;

    // Split path into PATH_INFO + QUERY_STRING; Rack stores them separately.
    const qIdx = path.indexOf("?");
    const pathInfo = qIdx >= 0 ? path.slice(0, qIdx) : path;
    const queryString = qIdx >= 0 ? path.slice(qIdx + 1) : "";
    // Match route on pathname only.
    const matched = this.routes.recognize(method, pathInfo);
    if (!matched) {
      // No route matched — create a 404-like response. Mirror the same
      // host/scheme/cookie env keys as the matched branch so request.url and
      // request.cookies are accurate for 404s too.
      const noRouteEnv: Record<string, unknown> = {
        REQUEST_METHOD: method,
        PATH_INFO: pathInfo,
        QUERY_STRING: queryString,
        HTTP_HOST: this.host,
        SERVER_NAME: this.host.split(":")[0],
        SERVER_PORT: this.host.split(":")[1] ?? (this._https ? "443" : "80"),
        HTTPS: this._https ? "on" : "off",
        "rack.url_scheme": this._https ? "https" : "http",
        REMOTE_ADDR: this.remoteAddr,
        HTTP_ACCEPT: this.accept,
      };
      if (Object.keys(this._persistentCookies).length > 0) {
        noRouteEnv.HTTP_COOKIE = Object.entries(this._persistentCookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
      }
      noRouteEnv.REQUEST_URI = this._buildFullUri(
        (noRouteEnv.PATH_INFO as string) +
          (noRouteEnv.QUERY_STRING ? `?${noRouteEnv.QUERY_STRING as string}` : ""),
        noRouteEnv,
      );
      this.request = new Request(noRouteEnv);
      this.response = new Response();
      this.response.status = 404;
      this.response.body = `No route matches [${method}] "${pathInfo}"`;
      this.controller = undefined!;
      return;
    }

    const { route, params } = matched;
    const controllerName = route.controller;
    const action = route.action;

    // Look up controller class
    const ControllerClass = this.controllers.get(controllerName);
    if (!ControllerClass) {
      throw new Error(
        `No controller registered for "${controllerName}". ` +
          `Call registerController("${controllerName}", YourController) first.`,
      );
    }

    // Build env
    const env: Record<string, unknown> = {
      REQUEST_METHOD: method,
      PATH_INFO: pathInfo,
      QUERY_STRING: queryString,
      HTTP_HOST: this.host,
      SERVER_NAME: this.host.split(":")[0],
      SERVER_PORT: this.host.split(":")[1] ?? (this._https ? "443" : "80"),
      HTTPS: this._https ? "on" : "off",
      "rack.url_scheme": this._https ? "https" : "http",
      REMOTE_ADDR: this.remoteAddr,
      HTTP_ACCEPT: this.accept,
      "rack.session": { ...this.session },
      "action_dispatch.request.path_parameters": {
        controller: controllerName,
        action,
        ...params,
      },
      ...(options.env ?? {}),
    };
    // Build REQUEST_URI from the *finalized* env so options.env overrides of
    // PATH_INFO/QUERY_STRING are honored.
    const finalPath =
      (env.PATH_INFO as string) + (env.QUERY_STRING ? `?${env.QUERY_STRING as string}` : "");
    env.REQUEST_URI = this._buildFullUri(finalPath, env);

    // Cookies from persistent jar
    if (Object.keys(this._persistentCookies).length > 0) {
      env.HTTP_COOKIE = Object.entries(this._persistentCookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }

    // Format / content type
    if (options.format || options.as) {
      const fmt = options.format ?? options.as;
      env.HTTP_ACCEPT = formatToMime(fmt!);
      if (fmt === "json" && (method === "POST" || method === "PUT" || method === "PATCH")) {
        env.CONTENT_TYPE = "application/json";
      }
    }

    // XHR
    if (options.xhr) {
      env.HTTP_X_REQUESTED_WITH = "XMLHttpRequest";
    }

    // Custom headers
    if (options.headers) {
      for (const [name, value] of Object.entries(options.headers)) {
        const envKey = name.startsWith("HTTP_")
          ? name
          : "HTTP_" + name.toUpperCase().replace(/-/g, "_");
        env[envKey] = value;
      }
    }

    // Body
    if (options.body) {
      env["rack.input"] = options.body;
    } else if (options.params && options.as === "json" && method !== "GET" && method !== "HEAD") {
      env["rack.input"] = JSON.stringify(options.params);
    }

    this.request = new Request(env);
    this.response = new Response();

    // Build params: route params + parsed query string + caller-supplied params.
    // Rails merges request.GET/request.POST into request.parameters via the
    // ParamsParser; we mirror that here so query-string params survive the
    // PATH_INFO/QUERY_STRING split done above.
    const allParams: Record<string, unknown> = { ...params };
    if (queryString) {
      Object.assign(allParams, this.request.queryParameters);
    }
    if (options.params) {
      Object.assign(allParams, options.params);
    }
    (this.request as any).parameters = new Parameters(
      Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, v])),
    );

    // Instantiate and dispatch
    this.controller = new ControllerClass();

    // Set session on controller
    if ("session" in this.controller) {
      (this.controller as any).session = { ...this.session };
    }

    await this.controller.dispatch(action, this.request, this.response);

    // Persist session back
    if ("session" in this.controller) {
      Object.assign(this.session, (this.controller as any).session);
    }

    // Surface the controller's flash on the request so `TestProcess#flash`
    // (and the `flash` getter above) can find it.
    this.request.flash = (this.controller as any).flash ?? new FlashHash();

    // Collect cookies from response
    const setCookies = this.response.getHeader("set-cookie");
    if (setCookies) {
      for (const cookie of setCookies.split(",")) {
        const parts = cookie.trim().split(";")[0];
        const eqIdx = parts.indexOf("=");
        if (eqIdx > 0) {
          const name = parts.slice(0, eqIdx).trim();
          const value = parts.slice(eqIdx + 1).trim();
          this._persistentCookies[name] = value;
        }
      }
    }

    // Reflect the up-to-date persistent jar on the request so subsequent
    // reads of `app.cookies` (which delegates to `TestProcess#cookies`)
    // see Set-Cookies from the just-finished response, not just the
    // cookies that were sent in.
    if (Object.keys(this._persistentCookies).length > 0) {
      this.request.env.HTTP_COOKIE = Object.entries(this._persistentCookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }
    this._cookieJar = undefined;
  }
}

function formatToMime(format: string): string {
  const MIMES: Record<string, string> = {
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    text: "text/plain",
    js: "text/javascript",
    css: "text/css",
    csv: "text/csv",
    any: "*/*",
  };
  return MIMES[format] ?? format;
}
