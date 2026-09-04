import { camelize } from "@blazetrails/activesupport";
import { KeyError, merge, SecureRandom } from "@blazetrails/ruby-compat";
import {
  DEFAULT_OPTIONS,
  Persisted,
  SecureSessionHash,
  SessionId,
  setRubyClassPath,
  type PersistedRequest,
} from "@blazetrails/rack-session";
import { buildNestedQuery } from "@blazetrails/rack";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import { TestRequest as AbstractTestRequest } from "../action-dispatch/testing/test-request.js";
import { RequestUtils, type ParamValue } from "../action-dispatch/request/utils.js";
import type { ParameterParsers } from "../action-dispatch/http/parameters.js";
import { UploadedFile } from "../action-dispatch/http/upload.js";
import { MimeType } from "../action-dispatch/http/mime-type.js";
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
  as?: string;
  env?: Record<string, unknown>;
  method?: string;
}

const STATUS_RANGES: Record<string, [number, number]> = {
  success: [200, 299],
  redirect: [300, 399],
  missing: [400, 499],
  error: [500, 599],
};

export class TestCase {
  /** @internal */
  private static _controllerClass: ControllerClass | null = null;

  static executorAroundEachRequest = false;

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

  static determineDefaultControllerClass(name: string): ControllerClass | null {
    if (!name) return null;
    const stripped = name.replace(/Test$/, "");
    const candidate = (globalThis as Record<string, unknown>)[stripped];
    return typeof candidate === "function" ? (candidate as ControllerClass) : null;
  }

  controllerClassName(): string {
    return (this.constructor as typeof TestCase).controllerClass?.name ?? "";
  }

  private _controllerClass: ControllerClass;

  controller!: Metal;

  request!: Request;

  response!: Response;

  session: Record<string, unknown> = {};

  get flash(): FlashHash {
    return (this.controller as any).flash ?? new FlashHash();
  }

  get cookies(): Record<string, string | undefined> {
    return this.response?.cookies ?? {};
  }

  get responseBody(): string {
    return this.response?.body ?? this.controller?.body ?? "";
  }

  get parsedBody(): unknown {
    return JSON.parse(this.responseBody);
  }

  constructor(controllerClass: ControllerClass) {
    this._controllerClass = controllerClass;
  }

  async get(action: string, options: RequestOptions = {}): Promise<void> {
    await this.process(action, { method: "GET", ...options });
  }

  async post(action: string, options: RequestOptions = {}): Promise<void> {
    await this.process(action, { method: "POST", ...options });
  }

  async put(action: string, options: RequestOptions = {}): Promise<void> {
    await this.process(action, { method: "PUT", ...options });
  }

  async patch(action: string, options: RequestOptions = {}): Promise<void> {
    await this.process(action, { method: "PATCH", ...options });
  }

  async delete(action: string, options: RequestOptions = {}): Promise<void> {
    await this.process(action, { method: "DELETE", ...options });
  }

  async head(action: string, options: RequestOptions = {}): Promise<void> {
    await this.process(action, { method: "HEAD", ...options });
  }

  assertResponse(expected: number | string): void {
    const actual = this.response?.statusCode ?? this.controller?.status;
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

  assertNoFlash(key: string): void {
    const flash = this.flash;
    if (flash.has(key)) {
      throw new Error(`Expected no flash[:${key}], but got "${flash.get(key)}"`);
    }
  }

  /** @internal */
  assertTemplate(_options: unknown = {}, _message?: string): never {
    throw new Error(
      "assert_template has been extracted to a gem. To continue using it, " +
        'add `gem "rails-controller-testing"` to your Gemfile.',
    );
  }

  reset(): void {
    this.session = {};
    this.controller = undefined!;
    this.request = undefined!;
    this.response = undefined!;
  }

  async process(action: string, options: RequestOptions = {}): Promise<void> {
    const {
      method = "GET",
      params,
      session,
      body,
      flash,
      format,
      xhr = false,
      as,
      env: extraEnv = {},
      headers,
    } = options;

    const httpMethod = String(method).toUpperCase();

    const env: Record<string, unknown> = {
      ...TestRequest.defaultEnv(),
      REQUEST_METHOD: httpMethod,
      PATH_INFO: (params as Record<string, unknown>)?.["path"] ?? `/${action}`,
      HTTP_HOST: "test.host",
      SERVER_NAME: "test.host",
      SERVER_PORT: "80",
      "rack.session": new TestSession({ ...this.session, ...(session ?? {}) }),
      ...extraEnv,
    };

    if (as) env["CONTENT_TYPE"] = formatToMime(as);
    const resolvedFormat = format ?? as;
    if (resolvedFormat) env.HTTP_ACCEPT = formatToMime(resolvedFormat);

    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        const envKey = name.startsWith("HTTP_")
          ? name
          : "HTTP_" + name.toUpperCase().replace(/-/g, "_");
        env[envKey] = value;
      }
    }

    if (body) {
      env["RAW_POST_DATA"] = body;
      env["rack.input"] = body;
    }

    if (xhr) {
      env["HTTP_X_REQUESTED_WITH"] = "XMLHttpRequest";
    }

    this.request = new Request(env);
    this.response = this.buildResponse();

    if (params) (this.request as any).parameters = { ...params };

    this.controller = new this._controllerClass();

    (this.request as any).env["action_dispatch.request.path_parameters"] = {
      controller: (
        this._controllerClass as unknown as typeof import("./metal.js").Metal
      ).controllerPath(),
      action,
    };

    this.request.flash!.update(flash ?? {});

    await this.processControllerResponse(action, xhr);
  }

  /** @internal */
  generatedPath(generatedExtras: [string, string[]]): string {
    return generatedExtras[0];
  }

  /** @internal */
  queryParameterNames(generatedExtras: [string, string[]]): string[] {
    return [...generatedExtras[1], "controller", "action"];
  }

  /** @internal */
  buildResponse(): Response {
    return new Response();
  }

  /** @internal */
  wrapExecution(fn: () => Promise<void>): Promise<void> {
    return fn();
  }
  /** @internal */
  private async processControllerResponse(action: string, _xhr: boolean): Promise<void> {
    await this.wrapExecution(() =>
      this.controller.dispatch(action, this.request, this.response).then(() => {}),
    );
    Object.assign(this.session, (this.request.session as unknown as TestSession).toHash());
  }

  /** @internal */
  private scrubEnvBang(env: Record<string, unknown>): Record<string, unknown> {
    for (const key of Object.keys(env)) {
      if (
        key.startsWith("rack.request") ||
        key.startsWith("action_dispatch.request") ||
        key.startsWith("action_dispatch.rescue")
      )
        delete env[key];
    }
    delete env["CONTENT_LENGTH"];
    delete env["RAW_POST_DATA"];
    env["rack.input"] = "";
    return env;
  }
}

export class TestRequest extends AbstractTestRequest {
  /** @internal */
  private _customParamParsers: Record<string, (raw: string) => unknown> = {
    xml: (_raw) => ({}),
  };

  /** @internal */
  static newSession(): TestSession {
    return new TestSession();
  }

  /** @internal */
  private _testControllerClass: unknown = null;

  static create(controllerClass?: unknown): TestRequest {
    const env: Record<string, unknown> = {};
    env["rack.request.cookie_hash"] = {};
    const session = TestRequest.newSession();
    env["rack.session"] = session;
    const req = new TestRequest(merge(TestRequest.defaultEnv(), env));
    req._testControllerClass = controllerClass ?? null;
    return req;
  }

  /** @internal */
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

  get contentType(): string | null {
    return super.contentType;
  }

  set contentType(type: string) {
    this.setHeader("CONTENT_TYPE", type);
  }

  assignParameters(
    _routes: unknown,
    controllerPath: string,
    action: string,
    parameters: Record<string, unknown>,
    generatedPath: string,
    queryStringKeys: string[],
  ): void {
    const nonPathParameters: Record<string, unknown> = {};
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
        this.env["action_dispatch.request.request_parameters"] = nonPathParameters;
      } else {
        this.fetchHeader("CONTENT_TYPE", (k) => {
          this.setHeader(k, "application/x-www-form-urlencoded");
        });

        const ct = this.getHeader("CONTENT_TYPE") ?? "";
        let data: string;
        const mediaType = ct.split(";")[0].trim().toLowerCase();
        const mimeSymbol = MimeType.lookup(mediaType).symbol ?? mediaType;

        if (mimeSymbol === ":json") {
          data = JSON.stringify(nonPathParameters);
        } else if (
          mimeSymbol === ":xml" ||
          mimeSymbol === ":url_encoded_form" ||
          ct.includes("application/x-www-form-urlencoded")
        ) {
          data = buildNestedQuery(nonPathParameters);
        } else {
          this._customParamParsers[mimeSymbol] = () => nonPathParameters;
          data = buildNestedQuery(nonPathParameters);
        }

        const encoded = new TextEncoder().encode(data);
        this.setHeader("CONTENT_LENGTH", String(encoded.byteLength));
        this.setHeader("rack.input", data);
      }
    }

    this.fetchHeader("PATH_INFO", (k) => {
      this.setHeader(k, generatedPath);
    });
    this.fetchHeader("ORIGINAL_FULLPATH", (k) => {
      this.setHeader(k, this.fullpath);
    });

    pathParameters["controller"] = controllerPath;
    pathParameters["action"] = action;
    this.pathParameters = pathParameters;
  }

  /**
   * @internal
   * @missingRailsArgs merge — PERMANENT
   */
  override paramsParsers(): ParameterParsers {
    const base = super.paramsParsers();
    return merge<unknown>(base, this._customParamParsers) as ParameterParsers;
  }

  /** @internal */
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

  /** @internal */
  static shouldMultipart(params: Record<string, unknown>): boolean {
    return shouldMultipart(params);
  }
}

/** @internal */
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

/** @internal */
function shouldMultipart(params: Record<string, unknown>): boolean {
  const check = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(check);
    if (value instanceof UploadedFile) return true;
    if (value !== null && typeof value === "object") {
      return Object.values(value).some(check);
    }
    return false;
  };
  return Object.values(params).some(check);
}

export class LiveTestResponse extends Response {
  get isSuccess(): boolean {
    return this.successful;
  }

  get isMissing(): boolean {
    return this.notFound;
  }

  get isError(): boolean {
    return this.serverError;
  }
}

export class TestSession extends SecureSessionHash {
  static DEFAULT_OPTIONS = DEFAULT_OPTIONS;

  /** @internal */
  protected initiallyEmpty: boolean;

  constructor(
    session: Record<string, unknown> = {},
    id: SessionId = new SessionId(SecureRandom.hex(16)),
  ) {
    super(null as unknown as Persisted, null as unknown as PersistedRequest);
    this.setId(id);
    this.data = this.stringifyKeys(session);
    this.loaded = true;
    this.initiallyEmpty = Object.keys(this.data).length === 0;
  }

  override isExists(): boolean {
    return true;
  }

  override keys(): string[] {
    return Object.keys(this.data);
  }

  override values(): unknown[] {
    return Object.values(this.data);
  }

  override destroy(): void {
    this.clear();
  }

  override dig(key: unknown, ...keys: unknown[]): unknown {
    let value: unknown = this.data[String(key)];
    for (const k of keys) {
      if (value == null) return undefined;
      if (typeof value !== "object") {
        throw new TypeError(`${(value as object).constructor.name} does not have #dig method`);
      }
      value = (value as Record<string, unknown>)[k as string];
    }
    return value;
  }

  override fetch(key: unknown, args?: unknown, block?: (key: string) => unknown): unknown {
    const k = String(key);
    if (Object.hasOwn(this.data, k)) return this.data[k];
    if (block) return block(k);
    if (arguments.length < 2) throw new KeyError(`key not found: "${k}"`);
    return args;
  }

  isEnabled(): boolean {
    return true;
  }

  idWas(): unknown {
    return this._id;
  }

  /** @internal */
  override loadBang(): unknown {
    return this._id;
  }
}

setRubyClassPath(TestSession, "ActionController::TestSession");

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
