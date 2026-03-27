/**
 * ActionDispatch::IntegrationTest
 *
 * Full-stack integration testing that drives requests through the routing
 * layer and dispatches to controllers. Supports multi-request sessions
 * with persistent cookies, session, and flash.
 *
 * Usage with Vitest:
 *
 *   import { IntegrationTest } from "@blazetrails/actionpack/actioncontroller/integration-test";
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

import { Request } from "../actiondispatch/request.js";
import { Response } from "../actiondispatch/response.js";
import { Parameters } from "../actiondispatch/parameters.js";
import { FlashHash } from "../actiondispatch/flash.js";
import { RouteSet } from "../actiondispatch/routing/route-set.js";
import type { Metal } from "./metal.js";

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

export class IntegrationTest {
  /** The route set for this test. */
  routes: RouteSet = new RouteSet();

  /** Controller registry: maps controller names to classes. */
  private controllers: Map<string, ControllerClass> = new Map();

  /** Session data persisted across requests. */
  session: Record<string, unknown> = {};

  /** Accumulated cookies across requests (simple key/value). */
  cookieJar: Record<string, string> = {};

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

  /** Flash from the last request. */
  get flash(): FlashHash {
    return (this.controller as any)?.flash ?? new FlashHash();
  }

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
    await this._processPath("GET", path, options);
  }

  async post(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this._processPath("POST", path, options);
  }

  async put(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this._processPath("PUT", path, options);
  }

  async patch(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this._processPath("PATCH", path, options);
  }

  async delete(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this._processPath("DELETE", path, options);
  }

  async head(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this._processPath("HEAD", path, options);
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
   * Reset all session state (cookies, session, flash).
   */
  reset(): void {
    this.session = {};
    this.cookieJar = {};
    this.controller = undefined!;
    this.request = undefined!;
    this.response = undefined!;
  }

  // --- Internal ---

  private async _processPath(
    method: string,
    path: string,
    options: IntegrationRequestOptions,
  ): Promise<void> {
    // Match route
    const matched = this.routes.recognize(method, path);
    if (!matched) {
      // No route matched — create a 404-like response
      this.request = new Request({ REQUEST_METHOD: method, PATH_INFO: path });
      this.response = new Response();
      this.response.status = 404;
      this.response.body = `No route matches [${method}] "${path}"`;
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
      PATH_INFO: path,
      HTTP_HOST: "www.example.com",
      SERVER_NAME: "www.example.com",
      SERVER_PORT: "80",
      "rack.session": { ...this.session },
      "action_dispatch.request.path_parameters": {
        controller: controllerName,
        action,
        ...params,
      },
      ...(options.env ?? {}),
    };

    // Cookies from jar
    if (Object.keys(this.cookieJar).length > 0) {
      env.HTTP_COOKIE = Object.entries(this.cookieJar)
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

    // Build params: route params + request params
    const allParams: Record<string, unknown> = { ...params };
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

    // Collect cookies from response
    const setCookies = this.response.getHeader("set-cookie");
    if (setCookies) {
      for (const cookie of setCookies.split(",")) {
        const parts = cookie.trim().split(";")[0];
        const eqIdx = parts.indexOf("=");
        if (eqIdx > 0) {
          const name = parts.slice(0, eqIdx).trim();
          const value = parts.slice(eqIdx + 1).trim();
          this.cookieJar[name] = value;
        }
      }
    }
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
