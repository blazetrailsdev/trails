import {
  ActiveSupportJSON,
  camelize,
  classAttribute,
  include,
  isAnonymous,
  isBlank,
  isPlainObject,
  runLoadHooks,
  SetupAndTeardown,
  toQuery,
  toXml,
  type FilterListEntry,
  type Included,
} from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { b, KeyError, merge, SecureRandom, StringIO } from "@blazetrails/ruby-compat";
import {
  DEFAULT_OPTIONS,
  Persisted,
  SecureSessionHash,
  SessionId,
  type PersistedRequest,
} from "@blazetrails/rack-session";
import {
  MULTIPART_BOUNDARY,
  UploadedFile as RackTestUploadedFile,
  Utils as RackTestUtils,
} from "@blazetrails/rack-test";
import { Mime } from "../action-dispatch/http/mime-type.js";
import { Response } from "../action-dispatch/http/response.js";
import { TestResponse } from "../action-dispatch/testing/test-response.js";
import { htmlDocument, type HtmlDocumentHost } from "../action-dispatch/testing/assertions.js";
import type { XmlDocument } from "@blazetrails/nokogiri";
import { TestRequest as AbstractTestRequest } from "../action-dispatch/testing/test-request.js";
import type { ParameterParsers } from "../action-dispatch/http/parameters.js";
import { FlashHash } from "../action-dispatch/middleware/flash.js";
import { CookieJar, type CookieResponse } from "../action-dispatch/middleware/cookies.js";
import { cookies, type TestProcessHost } from "../action-dispatch/testing/test-process.js";
import type { RouteSet } from "../action-dispatch/routing/route-set.js";
import * as responseAssertions from "../action-dispatch/testing/assertions/response.js";
import * as routingAssertions from "../action-dispatch/testing/assertions/routing.js";
import { Metal } from "./metal.js";
import { Functional } from "./metal/testing.js";
import { Buffer as LiveBuffer, Live, type LiveControllerHost } from "./metal/live.js";

include(Metal, Functional);

declare module "./metal.js" {
  /* eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Ruby `class Metal; include Testing::Functional; end` (`actionpack/lib/action_controller/test_case.rb:16-18`). */
  interface Metal extends Included<typeof Functional> {}
}

export const originalNewControllerThread = Live.newControllerThread;

export async function newControllerThread(
  this: LiveControllerHost,
  block: () => void | Promise<void>,
): Promise<void> {
  await block();
}

export const originalCleanUpThreadLocals = Live.cleanUpThreadLocals;

export function cleanUpThreadLocals(this: LiveControllerHost, ..._args: unknown[]): void {}

Live.newControllerThread = newControllerThread;
Live.cleanUpThreadLocals = cleanUpThreadLocals;

LiveBuffer.queueSize = null;

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

export class TestCase extends ActiveSupportTestCase {
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

  static override setup(this: object, ...args: FilterListEntry<object>[]): void {
    SetupAndTeardown.setup.call((this as { prototype: object }).prototype, ...args);
  }

  static override teardown(this: object, ...args: FilterListEntry<object>[]): void {
    SetupAndTeardown.teardown.call((this as { prototype: object }).prototype, ...args);
  }

  static withRouting(
    this: ThisParameterType<typeof routingAssertions.ClassMethods.withRouting>,
    block: (routes: RouteSet) => unknown,
  ): void {
    routingAssertions.ClassMethods.withRouting.call(this, block);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE active-support-test-case-carries-setup-and-teardown-instance-side
   */
  beforeSetup(): unknown {
    const result = super.beforeSetup?.();
    return result instanceof Promise
      ? result.then(() => SetupAndTeardown.beforeSetup.call(this))
      : SetupAndTeardown.beforeSetup.call(this);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE active-support-test-case-carries-setup-and-teardown-instance-side
   */
  afterTeardown(test: Parameters<typeof SetupAndTeardown.afterTeardown>[0]): unknown {
    SetupAndTeardown.afterTeardown.call(this, test);
    return super.afterTeardown?.(test as never);
  }

  setup(): void {
    routingAssertions.setup.call(this);
  }

  routes?: RouteSet;

  declare assertResponse: typeof responseAssertions.assertResponse;
  declare assertRedirectedTo: typeof responseAssertions.assertRedirectedTo;
  /** @internal */
  declare parameterize: typeof responseAssertions.parameterize;
  /** @internal */
  declare normalizeArgumentToRedirection: typeof responseAssertions.normalizeArgumentToRedirection;
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
    const klass = this.controller.constructor as typeof Metal;
    return isAnonymous(klass) ? "anonymous" : klass.controllerPath();
  }

  private _controllerClass: ControllerClass;

  controller!: Metal;

  request!: TestRequest;

  response!: Response;

  get session(): TestSession {
    return this.request.session as unknown as TestSession;
  }

  get flash(): FlashHash {
    return (this.controller as any).flash ?? new FlashHash();
  }

  get cookies(): CookieJar {
    return cookies.call(this as unknown as TestProcessHost);
  }

  /** @internal */
  _cookieJar?: CookieJar;

  /** @internal */
  _responseKlass!: typeof Response;

  get responseBody(): string {
    return this.response?.body ?? this.controller?.responseBody ?? "";
  }

  get parsedBody(): unknown {
    return JSON.parse(this.responseBody);
  }

  constructor(controllerClass: ControllerClass) {
    super("");
    this._controllerClass = controllerClass;
    this.setupControllerRequestAndResponse();
  }

  setupControllerRequestAndResponse(): void {
    this._responseKlass = TestResponse;

    const klass = this._controllerClass;
    if (klass) {
      if (!this.controller) {
        try {
          this.controller = new klass();
        } catch {
          this.controller = undefined!;
        }
      }
    }

    this.request = TestRequest.create(this.controller?.constructor ?? klass);
    this.response = this.buildResponse(this._responseKlass);
    this.response.request = this.request;

    if (this.controller) {
      this.controller.request = this.request;
      this.controller.params = {};
    }
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

  /** @internal */
  assertTemplate(_options: unknown = {}, _message?: string): never {
    throw new Error(
      "assert_template has been extracted to a gem. To continue using it, " +
        'add `gem "rails-controller-testing"` to your Gemfile.',
    );
  }

  reset(): void {
    this.controller = undefined!;
    this._cookieJar = undefined;
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

    this.checkRequiredIvars();
    this.controller.clearInstanceVariablesBetweenRequests();

    const httpMethod = String(method).toUpperCase();

    this._htmlDocument?.dispose();
    this._htmlDocument = undefined;

    this.cookies.update(this.request.cookies);
    this.cookies.updateCookiesFromJar();
    this.request.setHeader("HTTP_COOKIE", this.cookies.toHeader());
    this.request.deleteHeader("action_dispatch.cookies");

    this.request = new TestRequest(
      this.scrubEnvBang(this.request.env),
      this.request.session as unknown as TestSession,
      this.controller.constructor,
    );
    this.response = this.buildResponse(this._responseKlass);
    this.response.request = this.request;
    this.controller.recycleBang();

    if (body) {
      this.request.setHeader("RAW_POST_DATA", body);
    }

    this.request.setHeader("REQUEST_METHOD", httpMethod);

    if (as) {
      this.request.contentType = Mime.get(as)!.toString();
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

    this.setupRequest(this.controllerClassName(), action, parameters, session, flash, xhr);
    await this.processControllerResponse(action, this.cookies, xhr);
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
  buildResponse(klass: typeof Response): Response {
    return klass.create();
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
    const generatedExtras = this.routes!.generateExtras(
      merge(parameters, { controller: controllerClassName, action }),
    );
    const generatedPath = this.generatedPath(generatedExtras);
    const queryStringKeys = this.queryParameterNames(generatedExtras);

    this.request.assignParameters(
      this.routes,
      controllerClassName,
      action,
      parameters,
      generatedPath,
      queryStringKeys,
    );

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
      this.request.setHeader(
        k,
        (this.controller as unknown as { config(): { relativeUrlRoot?: string } }).config()
          .relativeUrlRoot,
      );
    });
  }

  /** @internal */
  private async processControllerResponse(
    action: string,
    cookies: CookieJar,
    xhr: boolean,
  ): Promise<void> {
    try {
      this.controller.recycleBang();

      await this.wrapExecution(() =>
        this.controller.dispatch(action, this.request, this.response).then(() => {}),
      );
    } finally {
      this.request = this.controller.request as TestRequest;
      this.response = this.controller.response;

      if (this.request.isHaveCookieJar()) {
        if (!this.request.cookieJar().isCommitted()) {
          this.request.cookieJar().write(this.response as unknown as CookieResponse);
          cookies.update(this.request.cookieJar().toHash());
          cookies.update(this.response.cookies as Record<string, string>);
        }
      }
      this.response.toRack();

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

  /** @internal */
  _htmlDocument?: XmlDocument;

  get htmlDocument(): XmlDocument {
    return htmlDocument.call(this as unknown as HtmlDocumentHost);
  }

  /** @internal */
  private get documentRootElement() {
    return this.htmlDocument.root;
  }

  /** @internal */
  private checkRequiredIvars(): void {
    for (const ivName of ["routes", "controller", "request", "response"] as const) {
      if (this[ivName] == null) {
        throw new Error(`@${ivName} is nil: make sure you set it in your test's setup method.`);
      }
    }
  }
}

const proto = TestCase.prototype as unknown as Record<string, unknown>;
proto.assertResponse = responseAssertions.assertResponse;
proto.assertRedirectedTo = responseAssertions.assertRedirectedTo;
proto.parameterize = responseAssertions.parameterize;
proto.normalizeArgumentToRedirection = responseAssertions.normalizeArgumentToRedirection;
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
        this.queryString = toQuery(nonPathParameters);
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
            data = toQuery(nonPathParameters);
            break;
          default:
            this._customParamParsers[contentMimeType!.symbol!] = () => nonPathParameters;
            data = toQuery(nonPathParameters);
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
