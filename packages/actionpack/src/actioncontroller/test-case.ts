/**
 * ActionController::TestCase
 *
 * Provides a Rails-like testing harness for controllers that works
 * naturally with Vitest. Instead of manually creating Request/Response
 * objects and calling dispatch(), you use HTTP verb methods (get, post,
 * put, patch, delete) and inspect the results via controller, request,
 * response, flash, session, and cookies.
 *
 * Usage with Vitest:
 *
 *   import { TestCase } from "@blazetrails/actionpack/actioncontroller/test-case";
 *
 *   class PostsController extends Base {
 *     async index() { this.render({ json: [{ id: 1 }] }); }
 *     async show() { this.render({ json: { id: this.params.get("id") } }); }
 *   }
 *
 *   describe("PostsController", () => {
 *     const tc = new TestCase(PostsController);
 *
 *     it("lists posts", async () => {
 *       await tc.get("index");
 *       tc.assertResponse("success");
 *       expect(tc.responseBody).toContain("id");
 *     });
 *
 *     it("shows a post", async () => {
 *       await tc.get("show", { params: { id: "42" } });
 *       tc.assertResponse(200);
 *       expect(JSON.parse(tc.responseBody).id).toBe("42");
 *     });
 *   });
 */

import { Request } from "../actiondispatch/request.js";
import { Response } from "../actiondispatch/response.js";
import { Parameters } from "../actiondispatch/parameters.js";
import { FlashHash } from "../actiondispatch/flash.js";
import type { Metal } from "./metal.js";

type ControllerClass = new () => Metal;

export interface RequestOptions {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  session?: Record<string, unknown>;
  flash?: Record<string, string>;
  body?: string;
  format?: string;
  xhr?: boolean;
  env?: Record<string, unknown>;
}

const STATUS_RANGES: Record<string, [number, number]> = {
  success: [200, 299],
  redirect: [300, 399],
  missing: [400, 499],
  error: [500, 599],
};

export class TestCase {
  private _controllerClass: ControllerClass;

  /** The controller instance from the last request. */
  controller!: Metal;

  /** The Request object from the last request. */
  request!: Request;

  /** The Response object from the last request. */
  response!: Response;

  /** Session hash — persists across requests within the same TestCase. */
  session: Record<string, unknown> = {};

  /** Flash messages from the last request. */
  get flash(): FlashHash {
    return (this.controller as any).flash ?? new FlashHash();
  }

  /** Cookies jar from the response. */
  get cookies(): Record<string, string> {
    return this.response?.cookies ?? {};
  }

  /** The response body as a string. */
  get responseBody(): string {
    return this.response?.body ?? this.controller?.body ?? "";
  }

  /** Parsed JSON response body. */
  get parsedBody(): unknown {
    return JSON.parse(this.responseBody);
  }

  constructor(controllerClass: ControllerClass) {
    this._controllerClass = controllerClass;
  }

  // --- HTTP verb methods ---

  async get(action: string, options: RequestOptions = {}): Promise<void> {
    await this._process(action, "GET", options);
  }

  async post(action: string, options: RequestOptions = {}): Promise<void> {
    await this._process(action, "POST", options);
  }

  async put(action: string, options: RequestOptions = {}): Promise<void> {
    await this._process(action, "PUT", options);
  }

  async patch(action: string, options: RequestOptions = {}): Promise<void> {
    await this._process(action, "PATCH", options);
  }

  async delete(action: string, options: RequestOptions = {}): Promise<void> {
    await this._process(action, "DELETE", options);
  }

  async head(action: string, options: RequestOptions = {}): Promise<void> {
    await this._process(action, "HEAD", options);
  }

  // --- Assertions ---

  /**
   * Assert the response status. Accepts:
   * - A number (exact status code)
   * - A string symbol ("success", "redirect", "missing", "error",
   *   or a Rails status symbol like "ok", "not_found")
   */
  assertResponse(expected: number | string): void {
    const actual = this.response?.statusCode ?? this.controller?.status;
    if (typeof expected === "number") {
      if (actual !== expected) {
        throw new Error(`Expected response status ${expected}, got ${actual}`);
      }
      return;
    }

    // Check range aliases
    const range = STATUS_RANGES[expected];
    if (range) {
      if (actual < range[0] || actual > range[1]) {
        throw new Error(
          `Expected response to be "${expected}" (${range[0]}-${range[1]}), got ${actual}`,
        );
      }
      return;
    }

    // Check Rails status symbols
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

  /**
   * Assert the response redirected to a given URL or path.
   */
  assertRedirectedTo(expected: string | RegExp): void {
    const location = this.response?.getHeader("location") ?? this.controller?.getHeader("location");
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

  /**
   * Assert the response content type.
   */
  assertContentType(expected: string): void {
    const actual = this.response?.getHeader("content-type") ?? this.controller?.contentType ?? "";
    if (!actual.includes(expected)) {
      throw new Error(`Expected content type to include "${expected}", got "${actual}"`);
    }
  }

  /**
   * Assert a response header value.
   */
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

  /**
   * Assert a flash message was set.
   */
  assertFlash(key: string, expected?: string | RegExp): void {
    const flash = this.flash;
    const value = flash.get(key);
    if (value === undefined) {
      throw new Error(`Expected flash[:${key}] to be set`);
    }
    if (expected !== undefined) {
      if (typeof expected === "string") {
        if (value !== expected) {
          throw new Error(`Expected flash[:${key}] to be "${expected}", got "${value}"`);
        }
      } else {
        if (!expected.test(value as string)) {
          throw new Error(`Expected flash[:${key}] to match ${expected}, got "${value}"`);
        }
      }
    }
  }

  /**
   * Assert no flash message for a key.
   */
  assertNoFlash(key: string): void {
    const flash = this.flash;
    if (flash.has(key)) {
      throw new Error(`Expected no flash[:${key}], but got "${flash.get(key)}"`);
    }
  }

  /**
   * Reset state for a fresh request cycle.
   */
  reset(): void {
    this.session = {};
    this.controller = undefined!;
    this.request = undefined!;
    this.response = undefined!;
  }

  // --- Internal ---

  private async _process(action: string, method: string, options: RequestOptions): Promise<void> {
    const env: Record<string, unknown> = {
      REQUEST_METHOD: method,
      PATH_INFO: options.params?.path ?? `/${action}`,
      HTTP_HOST: "test.host",
      SERVER_NAME: "test.host",
      SERVER_PORT: "80",
      "rack.session": { ...this.session, ...(options.session ?? {}) },
      ...(options.env ?? {}),
    };

    // Set format
    if (options.format) {
      env.HTTP_ACCEPT = formatToMime(options.format);
    }

    // Set XHR
    if (options.xhr) {
      env.HTTP_X_REQUESTED_WITH = "XMLHttpRequest";
    }

    // Set custom headers
    if (options.headers) {
      for (const [name, value] of Object.entries(options.headers)) {
        const envKey = name.startsWith("HTTP_")
          ? name
          : "HTTP_" + name.toUpperCase().replace(/-/g, "_");
        env[envKey] = value;
      }
    }

    // Set body
    if (options.body) {
      env["rack.input"] = options.body;
    }

    this.request = new Request(env);
    this.response = new Response();

    // Set path parameters (params from route matching)
    if (options.params) {
      const pathParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(options.params)) {
        pathParams[k] = String(v);
      }
      (this.request as any)._pathParameters = pathParams;
      env["action_dispatch.request.path_parameters"] = pathParams;
    }

    // Set up request parameters as a Parameters object
    const allParams = { ...(options.params ?? {}) };
    (this.request as any).parameters = new Parameters(
      Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, v])),
    );

    // Flash setup
    if (options.flash) {
      const flash = new FlashHash();
      for (const [k, v] of Object.entries(options.flash)) {
        flash.set(k, v);
      }
      env["action_dispatch.request.flash_hash"] = flash;
    }

    // Instantiate controller and dispatch
    this.controller = new this._controllerClass();

    // Copy session to controller if it has a session property
    if ("session" in this.controller) {
      (this.controller as any).session = {
        ...this.session,
        ...(options.session ?? {}),
      };
    }

    await this.controller.dispatch(action, this.request, this.response);

    // Persist session back
    if ("session" in this.controller) {
      Object.assign(this.session, (this.controller as any).session);
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
