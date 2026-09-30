import {
  ActiveSupportJSON,
  Assertion,
  camelize,
  classAttribute,
  include,
  isBlank,
  isPlainObject,
  runLoadHooks,
  SetupAndTeardown,
  toXml,
  type FilterListEntry,
  type Included,
} from "@blazetrails/activesupport";
import { b, KeyError, merge, SecureRandom, StringIO } from "@blazetrails/ruby-compat";
import {
  DEFAULT_OPTIONS,
  Persisted,
  SecureSessionHash,
  SessionId,
  type PersistedRequest,
} from "@blazetrails/rack-session";
import { buildNestedQuery, statusCode } from "@blazetrails/rack";
import {
  MULTIPART_BOUNDARY,
  UploadedFile as RackTestUploadedFile,
  Utils as RackTestUtils,
} from "@blazetrails/rack-test";
import { Mime } from "../action-dispatch/http/mime-type.js";
import { Response } from "../action-dispatch/http/response.js";
import { TestRequest as AbstractTestRequest } from "../action-dispatch/testing/test-request.js";
import type { ParameterParsers } from "../action-dispatch/http/parameters.js";
import { FlashHash } from "../action-dispatch/middleware/flash.js";
import type { RouteSet } from "../action-dispatch/routing/route-set.js";
import * as routingAssertions from "../action-dispatch/testing/assertions/routing.js";
import type { Metal } from "./metal.js";
import { _computeRedirectToLocation } from "./metal/redirecting.js";

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

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Test::Utils` (`actionpack/lib/action_controller/test_case.rb:152`); the class/interface merge is how a mixin surfaces on the type side. */
interface Encoder extends Included<typeof RackTestUtils> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
class Encoder {
  shouldMultipart(params: Record<string, unknown>): boolean {
    let multipart = false;
    const query = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(query);
      } else if (isPlainObject(value)) {
        Object.values(value).forEach(query);
      } else if (value instanceof RackTestUploadedFile) {
        multipart = true;
      }
    };
    Object.values(params).forEach(query);
    return multipart;
  }

  get contentType(): string {
    return `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`;
  }
}

include(Encoder, RackTestUtils);

export class TestCase {
  /** @internal */
  declare static _controllerClass: ControllerClass | null | undefined;
  declare static is_controllerClass: boolean;

  static {
    classAttribute.call(this, "_controllerClass");
  }

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
    const currentControllerClass = this._controllerClass;
    if (currentControllerClass) {
      return currentControllerClass;
    } else {
      return (this.controllerClass = this.determineDefaultControllerClass(this.name));
    }
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

  static setup(this: { prototype: object }, ...args: FilterListEntry<object>[]): void {
    SetupAndTeardown.setup.call(this.prototype, ...args);
  }

  static teardown(this: { prototype: object }, ...args: FilterListEntry<object>[]): void {
    SetupAndTeardown.teardown.call(this.prototype, ...args);
  }

  static withRouting(
    this: ThisParameterType<typeof routingAssertions.ClassMethods.withRouting>,
    block: (routes: RouteSet) => unknown,
  ): void {
    routingAssertions.ClassMethods.withRouting.call(this, block);
  }

  /** @internal */
  beforeSetup(): void {
    SetupAndTeardown.beforeSetup.call(this);
  }

  /** @internal */
  afterTeardown(test: Parameters<typeof SetupAndTeardown.afterTeardown>[0]): void {
    SetupAndTeardown.afterTeardown.call(this, test);
  }

  setup(): void {
    routingAssertions.setup.call(this);
  }

  routes?: RouteSet;

  declare assertRecognizes: typeof routingAssertions.assertRecognizes;
  declare assertGenerates: typeof routingAssertions.assertGenerates;
  declare assertRouting: typeof routingAssertions.assertRouting;
  declare withRouting: typeof routingAssertions.withRouting;
  /** @internal */
  declare createRoutes: typeof routingAssertions.createRoutes;
  /** @internal */
  declare resetRoutes: typeof routingAssertions.resetRoutes;
  /** @internal */
  declare recognizedRequestFor: typeof routingAssertions.recognizedRequestFor;
  /** @internal */
  declare failOn: typeof routingAssertions.failOn;

  controllerClassName(): string {
    return (this.constructor as typeof TestCase).controllerClass?.name ?? "";
  }

  private _controllerClass: ControllerClass;

  controller!: Metal;

  request!: TestRequest;

  response!: Response;

  session: Record<string, unknown> = {};

  get flash(): FlashHash {
    return (this.controller as any).flash ?? new FlashHash();
  }

  get cookies(): Record<string, string | undefined> {
    return this.response?.cookies ?? {};
  }

  get responseBody(): string {
    return this.response?.body ?? this.controller?.responseBody ?? "";
  }

  get parsedBody(): unknown {
    return JSON.parse(this.responseBody);
  }

  constructor(controllerClass: ControllerClass) {
    this._controllerClass = controllerClass;
    this.setupControllerRequestAndResponse();
  }

  setupControllerRequestAndResponse(): void {
    this.request = TestRequest.create(this._controllerClass);
    this.response = this.buildResponse();
    this.response.request = this.request;
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

    const code = statusCode(expected);
    if (actual !== code) {
      throw new Error(`Expected response status :${expected} (${code}), got ${actual}`);
    }
  }

  assertRedirectedTo(expected: string | RegExp): void {
    const location =
      this.response?.getHeader("location") ?? this.controller?.headers.get("location");
    if (!location) {
      throw new Assertion("Expected a redirect but no Location header was set");
    }
    if (typeof expected === "string") {
      const redirectIs = _computeRedirectToLocation(this.request, location);
      const redirectExpected = _computeRedirectToLocation(this.request, expected);
      if (redirectIs !== redirectExpected) {
        throw new Assertion(`Expected redirect to "${expected}", got "${location}"`);
      }
    } else {
      if (!expected.test(location)) {
        throw new Assertion(`Expected redirect matching ${expected}, got "${location}"`);
      }
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
    this.setupControllerRequestAndResponse();
  }

  async process(action: string, options: RequestOptions = {}): Promise<void> {
    const {
      method = "GET",
      params,
      session,
      body,
      flash,
      xhr = false,
      as,
      env: extraEnv = {},
      headers,
    } = options;
    let { format } = options;

    const httpMethod = String(method).toUpperCase();

    this.controller = new this._controllerClass();

    this.request = new TestRequest(
      this.scrubEnvBang(this.request.env),
      new TestSession({ ...this.session }),
      this._controllerClass,
    );
    this.response = this.buildResponse();
    this.response.request = this.request;

    if (body) {
      this.request.setHeader("RAW_POST_DATA", body);
    }

    this.request.setHeader("REQUEST_METHOD", httpMethod);

    if (as) {
      this.request.contentType = formatToMime(as);
      format ??= as;
    }

    const parameters: Record<string, unknown> = { ...(params ?? {}) };

    if (format) {
      parameters["format"] = format;
    }

    for (const [key, value] of Object.entries(extraEnv)) this.request.setHeader(key, value);
    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        const envKey = name.startsWith("HTTP_")
          ? name
          : "HTTP_" + name.toUpperCase().replace(/-/g, "_");
        this.request.setHeader(envKey, value);
      }
    }

    this.setupRequest(
      (this._controllerClass as unknown as typeof import("./metal.js").Metal).controllerPath(),
      action,
      parameters,
      session,
      flash,
      xhr,
    );
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
  private setupRequest(
    controllerClassName: string,
    action: string,
    parameters: Record<string, unknown>,
    session: Record<string, unknown> | undefined,
    flash: Record<string, string> | undefined,
    xhr: boolean,
  ): void {
    this.request.setHeader("PATH_INFO", parameters["path"] ?? `/${action}`);
    if (Object.keys(parameters).length > 0) (this.request as any).parameters = parameters;
    this.request.setHeader("action_dispatch.request.path_parameters", {
      controller: controllerClassName,
      action,
    });

    if (session) this.request.session.update(session);
    this.request.flash!.update(flash ?? {});

    if (xhr) {
      this.request.setHeader("HTTP_X_REQUESTED_WITH", "XMLHttpRequest");
      this.request.fetchHeader("HTTP_ACCEPT", (k) => {
        this.request.setHeader(
          k,
          [Mime.get("js"), Mime.get("html"), Mime.get("xml"), "text/xml", "*/*"].join(", "),
        );
      });
    }

    this.request.fetchHeader("SCRIPT_NAME", (k) => {
      this.request.setHeader(k, (this.controller as any).config.relativeUrlRoot);
    });
  }

  /** @internal */
  private async processControllerResponse(action: string, xhr: boolean): Promise<void> {
    try {
      await this.wrapExecution(() =>
        this.controller.dispatch(action, this.request, this.response).then(() => {}),
      );
    } finally {
      this.request = this.controller.request as TestRequest;
      this.response = this.controller.response;

      const flashValue = this.request.flash!.toSessionValue();
      if (flashValue) {
        this.request.session.set("flash", flashValue);
      } else {
        this.request.session.delete("flash");
      }

      if (xhr) {
        this.request.deleteHeader("HTTP_X_REQUESTED_WITH");
        this.request.deleteHeader("HTTP_ACCEPT");
      }
      this.request.queryString = "";

      this.response.sentBang();

      for (const key of Object.keys(this.session)) delete this.session[key];
      Object.assign(this.session, (this.request.session as unknown as TestSession).toHash());
    }
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
    env["rack.input"] = new StringIO();
    return env;
  }
}

const proto = TestCase.prototype as unknown as Record<string, unknown>;
proto.assertRecognizes = routingAssertions.assertRecognizes;
proto.assertGenerates = routingAssertions.assertGenerates;
proto.assertRouting = routingAssertions.assertRouting;
proto.withRouting = routingAssertions.withRouting;
proto.createRoutes = routingAssertions.createRoutes;
proto.resetRoutes = routingAssertions.resetRoutes;
proto.recognizedRequestFor = routingAssertions.recognizedRequestFor;
proto.failOn = routingAssertions.failOn;

SetupAndTeardown.prepended(TestCase.prototype);

runLoadHooks("action_controller_test_case", TestCase);

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
  private _testControllerClass: unknown;

  static create(controllerClass?: unknown): TestRequest {
    const env: Record<string, unknown> = {};
    env["rack.request.cookie_hash"] = {};
    return new TestRequest(
      merge(TestRequest.defaultEnv(), env),
      TestRequest.newSession(),
      controllerClass ?? null,
    );
  }

  /** @internal */
  static override defaultEnv(): Record<string, unknown> {
    const base = AbstractTestRequest.defaultEnv();
    const env = { ...base };
    delete (env as Record<string, unknown>)["PATH_INFO"];
    return env;
  }

  constructor(env: Record<string, unknown>, session: TestSession, controllerClass: unknown) {
    super(env);

    this.session = session as never;
    this.sessionOptions = { ...TestSession.DEFAULT_OPTIONS };
    this._testControllerClass = controllerClass;
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

    if (this.isGet()) {
      if (isBlank(this.queryString)) {
        this.queryString = buildNestedQuery(nonPathParameters);
      }
    } else {
      let data: string;
      if (TestRequest.ENCODER.shouldMultipart(nonPathParameters)) {
        this.contentType = TestRequest.ENCODER.contentType;
        data = TestRequest.ENCODER.buildMultipart(nonPathParameters)!;
      } else {
        this.fetchHeader("CONTENT_TYPE", (k) => {
          this.setHeader(k, "application/x-www-form-urlencoded");
        });

        const contentMimeType = this.contentMimeType;
        switch (contentMimeType?.symbol ?? null) {
          case null:
            throw new Error(`Unknown Content-Type: ${this.contentType ?? ""}`);
          case ":json":
            data = ActiveSupportJSON.encode(nonPathParameters);
            break;
          case ":xml":
            data = toXml(nonPathParameters);
            break;
          case ":url_encoded_form":
            data = buildNestedQuery(nonPathParameters);
            break;
          default:
            this._customParamParsers[contentMimeType!.symbol!] = () => nonPathParameters;
            data = buildNestedQuery(nonPathParameters);
        }
        data = b(data);
      }

      const dataStream = new StringIO(data);
      this.setHeader("CONTENT_LENGTH", String(dataStream.size()));
      this.setHeader("rack.input", dataStream);
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

  static readonly ENCODER = new Encoder();

  /**
   * @internal
   * @missingRailsArgs merge — PERMANENT
   */
  override paramsParsers(): ParameterParsers {
    const base = super.paramsParsers();
    return merge<unknown>(base, this._customParamParsers) as ParameterParsers;
  }
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
    if (arguments.length < 2) {
      throw new KeyError(`key not found: "${k}"`, { receiver: this.data, key: k });
    }
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

Object.defineProperty(TestSession, "name", { value: "ActionController::TestSession" });

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
