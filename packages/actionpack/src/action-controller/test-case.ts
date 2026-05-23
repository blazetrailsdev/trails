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
 *   import { TestCase } from "@blazetrails/actionpack/action-controller/test-case";
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

import { camelize, getCrypto } from "@blazetrails/activesupport";
import { buildNestedQuery } from "@blazetrails/rack";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import { TestRequest as AbstractTestRequest } from "../action-dispatch/testing/test-request.js";
import { RequestUtils, type ParamValue } from "../action-dispatch/request/utils.js";
import type { ParameterParsers } from "../action-dispatch/http/parameters.js";
import { UploadedFile } from "../action-dispatch/http/upload.js";
import { MimeType } from "../action-dispatch/http/mime-type.js";
import { Parameters } from "./metal/strong-parameters.js";
import { FlashHash } from "../action-dispatch/middleware/flash.js";
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
  /** @internal Backing slot for the `controllerClass` static accessor. */
  private static _controllerClass: ControllerClass | null = null;

  /**
   * Mirrors Rails `TestCase.tests(controller_class)`. Accepts a
   * controller class or a string name; the string is camelized + suffixed
   * with `Controller` and looked up on `globalThis` (the closest JS
   * analogue to Ruby's `constantize`). Rails also accepts symbols; JS
   * has no symbol/constant lookup, so the string form covers that case.
   */
  static tests(controllerClass: ControllerClass | string): void {
    if (typeof controllerClass === "string") {
      const constantName = `${camelize(controllerClass)}Controller`;
      const klass = (globalThis as Record<string, unknown>)[constantName];
      if (typeof klass !== "function") {
        throw new Error(`uninitialized constant ${constantName}`);
      }
      this._controllerClass = klass as ControllerClass;
      return;
    }
    if (typeof controllerClass !== "function") {
      throw new Error("controller class must be a String or Class");
    }
    this._controllerClass = controllerClass;
  }

  /**
   * Mirrors Rails `TestCase.controller_class` / `controller_class=`.
   * Reading lazily falls back to `determineDefaultControllerClass(name)`.
   * Per-class (not inherited): Rails class ivars don't walk the
   * superclass chain, so we gate on `Object.hasOwn` to keep subclasses
   * from picking up the base class's controller.
   */
  static get controllerClass(): ControllerClass | null {
    if (Object.hasOwn(this, "_controllerClass") && this._controllerClass) {
      return this._controllerClass;
    }
    const inferred = this.determineDefaultControllerClass(this.name);
    if (inferred) this._controllerClass = inferred;
    return Object.hasOwn(this, "_controllerClass") ? this._controllerClass : null;
  }
  static set controllerClass(v: ControllerClass | null) {
    this._controllerClass = v;
  }

  /**
   * Mirrors Rails `determine_default_controller_class(name)` — strips
   * a trailing `Test` from the class name and looks the result up on
   * `globalThis`. Returns `null` when no controller class can be found.
   */
  static determineDefaultControllerClass(name: string): ControllerClass | null {
    if (!name) return null;
    const stripped = name.replace(/Test$/, "");
    const candidate = (globalThis as Record<string, unknown>)[stripped];
    return typeof candidate === "function" ? (candidate as ControllerClass) : null;
  }

  /** Mirrors Rails `controller_class_name` — the class's `controllerClass.name`. */
  controllerClassName(): string {
    return (this.constructor as typeof TestCase).controllerClass?.name ?? "";
  }

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

/**
 * ActionController::TestRequest — a controller-test-flavored TestRequest
 * that mirrors `ActionDispatch::TestRequest`. Most behavior is inherited
 * from the dispatch layer; controller-specific helpers (`newSession`) live
 * here so test harnesses can synthesize a request without reaching across
 * packages.
 */
export class TestRequest extends AbstractTestRequest {
  /** @internal Custom param parsers keyed by MIME type symbol. */
  private _customParamParsers: Record<string, (raw: string) => unknown> = {
    // Rails: Hash.from_xml(raw_post)["hash"] — no XML parser available; return empty hash.
    xml: (_raw) => ({}),
  };

  /** @internal Mirrors Rails `ActionController::TestRequest.new_session`. */
  static newSession(): TestSession {
    return new TestSession();
  }

  /** @internal Mirrors Rails `@controller_class` ivar. */
  private _testControllerClass: unknown = null;

  /**
   * Mirrors Rails `ActionController::TestRequest.create(controller_class)`.
   * Builds a fresh request with default env and a new session.
   */
  static create(controllerClass?: unknown): TestRequest {
    const env: Record<string, unknown> = {};
    env["rack.request.cookie_hash"] = {};
    const session = TestRequest.newSession();
    env["rack.session"] = session;
    const req = new TestRequest({ ...TestRequest.defaultEnv(), ...env });
    req._testControllerClass = controllerClass ?? null;
    return req;
  }

  /**
   * @internal Mirrors Rails `ActionController::TestRequest.default_env` (private class method).
   * Extends the dispatch-layer DEFAULT_ENV and strips PATH_INFO.
   */
  static override defaultEnv(): Record<string, unknown> {
    const base = AbstractTestRequest.defaultEnv();
    const env = { ...base };
    delete (env as Record<string, unknown>)["PATH_INFO"];
    return env;
  }

  get queryString(): string {
    return super.queryString;
  }

  set queryString(string: string) {
    this.setHeader("QUERY_STRING", string);
  }

  get contentType(): string | undefined {
    return super.contentType;
  }

  set contentType(type: string) {
    this.setHeader("CONTENT_TYPE", type);
  }

  /**
   * Mirrors Rails `TestRequest#assign_parameters`.
   * Splits parameters into path parameters and query/body parameters, then
   * encodes the body (or query string) based on the request method and
   * content type.
   */
  assignParameters(
    _routes: unknown,
    controllerPath: string,
    action: string,
    parameters: Record<string, unknown>,
    generatedPath: string,
    queryStringKeys: string[],
  ): void {
    const nonPathParameters: Record<string, unknown> = {};
    // Rails path_parameters uses symbol keys; we mirror with string keys.
    // Array values are preserved as-is (Rails: value.map(&:to_param)).
    const pathParameters: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (queryStringKeys.includes(key)) {
        nonPathParameters[key] = value;
      } else if (Array.isArray(value)) {
        pathParameters[key] = value.map((v) => String(v ?? ""));
      } else {
        pathParameters[key] = String(value ?? "");
      }
    }

    // Clear any request-parameters cache established before the body was wired in.
    delete this.env["action_dispatch.request.request_parameters"];

    if (this.requestMethod === "GET") {
      if (!this.getHeader("QUERY_STRING")) {
        this.queryString = buildNestedQuery(nonPathParameters);
      }
    } else {
      if (shouldMultipart(nonPathParameters)) {
        const { body, boundary } = buildMultipartBody(nonPathParameters);
        this.setHeader("CONTENT_TYPE", `multipart/form-data; boundary=${boundary}`);
        this.setHeader("CONTENT_LENGTH", String(Buffer.byteLength(body, "binary")));
        this.setHeader("rack.input", body);
        // Multipart isn't parsed by the formatted-parameter path; pre-populate the
        // cache so params/requestParameters expose the uploaded files directly.
        this.env["action_dispatch.request.request_parameters"] = nonPathParameters;
      } else {
        if (!this.getHeader("CONTENT_TYPE")) {
          this.setHeader("CONTENT_TYPE", "application/x-www-form-urlencoded");
        }

        const ct = this.getHeader("CONTENT_TYPE") ?? "";
        let data: string;
        const mimeSymbol = MimeType.lookup(ct.split(";")[0].trim().toLowerCase()).symbol;

        if (mimeSymbol === "json") {
          data = JSON.stringify(nonPathParameters);
        } else if (
          mimeSymbol === "xml" ||
          mimeSymbol === "url_encoded_form" ||
          ct.includes("application/x-www-form-urlencoded")
        ) {
          data = buildNestedQuery(nonPathParameters);
        } else {
          // Rails: registers a custom parser so the controller sees the raw params hash
          this._customParamParsers[mimeSymbol] = () => nonPathParameters;
          data = buildNestedQuery(nonPathParameters);
        }

        const encoded = new TextEncoder().encode(data);
        this.setHeader("CONTENT_LENGTH", String(encoded.byteLength));
        this.setHeader("rack.input", data);
      }
    }

    if (!this.getHeader("PATH_INFO")) {
      this.setHeader("PATH_INFO", generatedPath);
    }
    if (!this.getHeader("ORIGINAL_FULLPATH")) {
      // Rails uses fullpath here (path + query string) not just the generated path
      this.setHeader("ORIGINAL_FULLPATH", this.fullpath);
    }

    pathParameters["controller"] = controllerPath;
    pathParameters["action"] = action;
    this.pathParameters = pathParameters;
  }

  /** @internal Mirrors Rails `TestRequest#params_parsers` (private). */
  override paramsParsers(): ParameterParsers {
    const base = super.paramsParsers();
    return { ...base, ...this._customParamParsers } as ParameterParsers;
  }

  /**
   * @internal Wires custom param parsers into the request parameter parsing path.
   * The base `Request#requestParameters` calls `_paramsParsers` directly (bypassing
   * instance dispatch), so we override to use `this.paramsParsers()` instead.
   */
  override get requestParameters(): Record<string, unknown> {
    const cached = this.env["action_dispatch.request.request_parameters"];
    if (cached && typeof cached === "object") return cached as Record<string, unknown>;
    const fallback = (): Record<string, unknown> => this.fallbackRequestParameters();
    const params = this.parseFormattedParameters(this.paramsParsers(), fallback);
    const normalized = RequestUtils.normalizeEncodeParams(params as ParamValue) as Record<
      string,
      unknown
    >;
    this.env["action_dispatch.request.request_parameters"] = normalized;
    return normalized;
  }
}

/** @internal Mirrors Rails Rack::Test::Utils.build_multipart — encodes params with file uploads. */
function buildMultipartBody(params: Record<string, unknown>): { body: string; boundary: string } {
  const boundary = "AaB03x";
  const parts: string[] = [];
  function addParts(prefix: string, value: unknown): void {
    if (value instanceof UploadedFile) {
      parts.push(
        `--${boundary}\r\n` +
          `content-disposition: form-data; name="${prefix}"; filename="${value.originalFilename}"\r\n` +
          `content-type: ${value.contentType}\r\n\r\n` +
          value.read().toString("binary") +
          "\r\n",
      );
    } else if (Array.isArray(value)) {
      for (const item of value) addParts(`${prefix}[]`, item);
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) addParts(`${prefix}[${k}]`, v);
    } else {
      parts.push(
        `--${boundary}\r\ncontent-disposition: form-data; name="${prefix}"\r\n\r\n${String(value ?? "")}\r\n`,
      );
    }
  }
  for (const [k, v] of Object.entries(params)) addParts(k, v);
  return { body: parts.join("") + `--${boundary}--\r\n`, boundary };
}

/** @internal Mirrors Rails ENCODER#should_multipart? — true if any param is an UploadedFile. */
function shouldMultipart(params: Record<string, unknown>): boolean {
  const check = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(check);
    if (value instanceof UploadedFile) return true;
    if (value !== null && typeof value === "object") {
      return Object.values(value as object).some(check);
    }
    return false;
  };
  return Object.values(params).some(check);
}

export class LiveTestResponse extends Response {
  /** Mirrors Rails `LiveTestResponse#success?` (alias of `successful?`). */
  get isSuccess(): boolean {
    return this.successful;
  }

  /** Mirrors Rails `LiveTestResponse#missing?` (alias of `not_found?`). */
  get isMissing(): boolean {
    return this.notFound;
  }

  /** Mirrors Rails `LiveTestResponse#error?` (alias of `server_error?`). */
  get isError(): boolean {
    return this.serverError;
  }
}

export class TestSession {
  private _data = new Map<string, unknown>();
  /** @internal Mirrors Rails `@id`. */
  private _id: string;

  constructor(initial: Record<string, unknown> = {}, id?: string) {
    this._id = id ?? randomHex(16);
    for (const [k, v] of Object.entries(initial)) this._data.set(String(k), v);
  }

  get(key: string): unknown {
    return this._data.get(key);
  }

  set(key: string, value: unknown): void {
    this._data.set(key, value);
  }

  has(key: string): boolean {
    return this._data.has(key);
  }

  delete(key: string): void {
    this._data.delete(key);
  }

  clear(): void {
    this._data.clear();
  }

  toHash(): Record<string, unknown> {
    return Object.fromEntries(this._data);
  }

  toH(): Record<string, unknown> {
    return this.toHash();
  }

  toObject(): Record<string, unknown> {
    return this.toHash();
  }

  /** Mirrors Rails `TestSession#exists?` — always `true`. */
  isExists(): boolean {
    return true;
  }

  /** Mirrors Rails `TestSession#keys` — stored data keys. */
  keys(): string[] {
    return [...this._data.keys()];
  }

  /** Mirrors Rails `TestSession#values` — stored data values. */
  values(): unknown[] {
    return [...this._data.values()];
  }

  /** Mirrors Rails `TestSession#destroy` — `def destroy; clear; end`. */
  destroy(): void {
    this.clear();
  }

  /** Mirrors Rails `TestSession#dig(*keys)` — first key is coerced to string. */
  dig(...keys: unknown[]): unknown {
    if (keys.length === 0) return undefined;
    let cur: unknown = this._data.get(String(keys[0]));
    for (let i = 1; i < keys.length; i++) {
      if (cur == null) return undefined;
      const k = keys[i] as string;
      if (cur instanceof Map) cur = cur.get(k);
      else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
      else return undefined;
    }
    return cur;
  }

  /**
   * Mirrors Rails `TestSession#fetch(key, *args, &block)`. Returns the
   * value at `key`; if missing, returns `fallback` (or the result of
   * `fallback()` when callable), else throws.
   */
  fetch(key: string, fallback?: unknown): unknown {
    const k = String(key);
    if (this._data.has(k)) return this._data.get(k);
    if (arguments.length >= 2) {
      // Ruby `Hash#fetch(key) { |k| ... }` yields the missing key to the
      // block; mirror by passing the stringified key when fallback is callable.
      return typeof fallback === "function" ? (fallback as (key: string) => unknown)(k) : fallback;
    }
    const err = new Error(`key not found: "${k}"`);
    err.name = "KeyError";
    throw err;
  }

  /** Mirrors Rails `TestSession#enabled?` — always `true`. */
  isEnabled(): boolean {
    return true;
  }

  /** Mirrors Rails `TestSession#id_was` — the session id frozen at init. */
  idWas(): string {
    return this._id;
  }

  /** @internal Mirrors Rails private `TestSession#load!` — returns `@id`. */
  loadBang(): string {
    return this._id;
  }
}

function randomHex(bytes: number): string {
  return getCrypto().randomBytes(bytes).toString("hex");
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
