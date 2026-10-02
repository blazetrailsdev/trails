import {
  ActiveSupportJSON,
  camelize,
  classAttribute,
  Concern,
  constantize,
  ConstantLookup,
  extend,
  include,
  isAnonymous,
  isBlank,
  isModuleIncluded,
  isPlainObject,
  runLoadHooks,
  TopLevel,
  toQuery,
  toXml,
  type Included,
} from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { DomTestingAssertions } from "@blazetrails/actionview";
import {
  ArgumentError,
  b,
  KeyError,
  merge,
  Module,
  rbModConstSet,
  RuntimeError,
  SecureRandom,
  StringIO,
  verbose,
  warn,
} from "@blazetrails/ruby-compat";
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
import { Assertions } from "../action-dispatch/testing/assertions.js";
import type { XmlDocument } from "@blazetrails/nokogiri";
import { TestRequest as AbstractTestRequest } from "../action-dispatch/testing/test-request.js";
import type { ParameterParsers } from "../action-dispatch/http/parameters.js";
import type { CookieJar, CookieResponse } from "../action-dispatch/middleware/cookies.js";
import { TestProcess } from "../action-dispatch/testing/test-process.js";
import type { RouteSet } from "../action-dispatch/routing/route-set.js";
import type { DispatchableControllerClass } from "../action-dispatch/routing/dispatcher.js";
import type { ClassMethods as RoutingAssertionsClassMethods } from "../action-dispatch/testing/assertions/routing.js";
import { ActionController } from "../namespaces.js";
import { Metal } from "./metal.js";
import { TemplateAssertions } from "./template-assertions.js";
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
  params?: Record<string, unknown> | null;
  session?: Record<string, unknown>;
  flash?: Record<string, string>;
  body?: string | Record<string, unknown>;
  format?: string;
  xhr?: boolean;
  as?: string;
  method?: string;
}

interface BehaviorClassMethods {
  tests(controllerClass: ControllerClass | string): void;
  controllerClass: ControllerClass | null;
  determineDefaultControllerClass(name: string): ControllerClass | null;
}

interface BehaviorClass extends BehaviorClassMethods {
  name: string;
  determineConstantFromTestName(testName: string, block: (constant: unknown) => unknown): unknown;
  _controllerClass: ControllerClass | null | undefined;
}

export const ClassMethods: BehaviorClassMethods & ThisType<BehaviorClass> = {
  tests(controllerClass: ControllerClass | string): void {
    if (typeof controllerClass === "string") {
      this.controllerClass = constantize(
        `${camelize(controllerClass)}Controller`,
      ) as ControllerClass;
    } else if (typeof controllerClass === "function") {
      this.controllerClass = controllerClass;
    } else {
      throw new ArgumentError("controller class must be a String, Symbol, or Class");
    }
  },

  set controllerClass(newClass: ControllerClass | null) {
    this._controllerClass = newClass;
  },

  get controllerClass(): ControllerClass | null {
    const currentControllerClass = this._controllerClass;
    if (currentControllerClass) {
      return currentControllerClass;
    } else {
      return (this.controllerClass = this.determineDefaultControllerClass(this.name));
    }
  },

  determineDefaultControllerClass(name: string): ControllerClass | null {
    return this.determineConstantFromTestName(
      name,
      (constant) => typeof constant === "function" && constant.prototype instanceof Metal,
    ) as ControllerClass | null;
  },
};

export interface Behavior extends Included<typeof TestProcess> {
  routes?: RouteSet;
  controller: Metal;
  request: TestRequest;
  response: TestResponse | LiveTestResponse;
  /** @internal */
  _cookieJar?: CookieJar;
  /** @internal */
  _responseKlass: typeof TestResponse | typeof LiveTestResponse;
  /** @internal */
  _htmlDocument?: XmlDocument;
  readonly htmlDocument: XmlDocument;
  get: OmitThisParameter<typeof get>;
  post: OmitThisParameter<typeof post>;
  patch: OmitThisParameter<typeof patch>;
  put: OmitThisParameter<typeof put>;
  delete: OmitThisParameter<typeof deleteRequest>;
  head: OmitThisParameter<typeof head>;
  process: OmitThisParameter<typeof process>;
  controllerClassName: OmitThisParameter<typeof controllerClassName>;
  /** @internal */
  generatedPath: OmitThisParameter<typeof generatedPath>;
  /** @internal */
  queryParameterNames: OmitThisParameter<typeof queryParameterNames>;
  setupControllerRequestAndResponse: OmitThisParameter<typeof setupControllerRequestAndResponse>;
  /** @internal */
  buildResponse: OmitThisParameter<typeof buildResponse>;
  /** @internal */
  setupRequest: OmitThisParameter<typeof setupRequest>;
  /** @internal */
  wrapExecution<T>(block: () => T): T;
  /** @internal */
  processControllerResponse: OmitThisParameter<typeof processControllerResponse>;
  /** @internal */
  scrubEnvBang: OmitThisParameter<typeof scrubEnvBang>;
  /** @internal */
  readonly documentRootElement: ReturnType<typeof documentRootElement>;
  /** @internal */
  checkRequiredIvars: OmitThisParameter<typeof checkRequiredIvars>;
}

async function get(
  this: Behavior,
  action: string,
  options: RequestOptions = {},
): Promise<Behavior["response"]> {
  return this.process(action, { method: "GET", ...options });
}

async function post(
  this: Behavior,
  action: string,
  options: RequestOptions = {},
): Promise<Behavior["response"]> {
  return this.process(action, { method: "POST", ...options });
}

async function patch(
  this: Behavior,
  action: string,
  options: RequestOptions = {},
): Promise<Behavior["response"]> {
  return this.process(action, { method: "PATCH", ...options });
}

async function put(
  this: Behavior,
  action: string,
  options: RequestOptions = {},
): Promise<Behavior["response"]> {
  return this.process(action, { method: "PUT", ...options });
}

async function deleteRequest(
  this: Behavior,
  action: string,
  options: RequestOptions = {},
): Promise<Behavior["response"]> {
  return this.process(action, { method: "DELETE", ...options });
}

export { deleteRequest as delete };

async function head(
  this: Behavior,
  action: string,
  options: RequestOptions = {},
): Promise<Behavior["response"]> {
  return this.process(action, { method: "HEAD", ...options });
}

async function process(
  this: Behavior,
  action: string,
  options: RequestOptions = {},
): Promise<Behavior["response"]> {
  const { method = "GET", params, session, body, flash = {}, xhr = false, as } = options;
  let { format } = options;

  this.checkRequiredIvars();
  this.controller.clearInstanceVariablesBetweenRequests();

  const httpMethod = String(method).toUpperCase();

  this._htmlDocument = undefined;

  this.cookies().update(this.request.cookies);
  this.cookies().updateCookiesFromJar();
  this.request.setHeader("HTTP_COOKIE", this.cookies().toHeader());
  this.request.deleteHeader("action_dispatch.cookies");

  this.request = new TestRequest(
    this.scrubEnvBang(this.request.env),
    this.request.session as unknown as TestSession,
    this.controller.constructor as typeof Metal,
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

  this.setupRequest(this.controllerClassName(), action, parameters, session, flash, xhr);
  return this.processControllerResponse(action, this.cookies(), xhr);
}

function controllerClassName(this: Behavior): string {
  const klass = this.controller.constructor as typeof Metal;
  return isAnonymous(klass) ? "anonymous" : klass.controllerPath();
}

/** @internal */
function generatedPath(this: Behavior, generatedExtras: [string, string[]]): string {
  return generatedExtras[0];
}

/** @internal */
function queryParameterNames(this: Behavior, generatedExtras: [string, string[]]): string[] {
  return [...generatedExtras[1], "controller", "action"];
}

function setupControllerRequestAndResponse(this: Behavior): void {
  if (this.controller === undefined) this.controller = null!;

  this._responseKlass = TestResponse;

  const klass = (this.constructor as typeof TestCase).controllerClass;
  if (klass) {
    if (isModuleIncluded(klass, Live)) this._responseKlass = LiveTestResponse;
    if (!this.controller) {
      try {
        this.controller = new klass();
      } catch {
        const verboseGlobal = verbose();
        if (verboseGlobal != null && verboseGlobal !== false) {
          warn(`could not construct controller ${klass.name}`);
        }
      }
    }
  }

  this.request = TestRequest.create(this.controller == null ? null : this.controller.constructor);
  this.response = this.buildResponse(this._responseKlass);
  this.response.request = this.request;

  if (this.controller) {
    this.controller.request = this.request;
    this.controller.params = {};
  }
}

/** @internal */
function buildResponse(this: Behavior, klass: Behavior["_responseKlass"]): Behavior["response"] {
  return klass.create();
}

/** @internal */
function setupRequest(
  this: Behavior,
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
function wrapExecution<T>(this: Behavior, block: () => T): T {
  if (
    TestCase.executorAroundEachRequest &&
    TopLevel.Trails !== undefined &&
    TopLevel.Trails.application
  ) {
    return TopLevel.Trails.application.executor.wrap(block);
  } else {
    return block();
  }
}

/** @internal */
async function processControllerResponse(
  this: Behavior,
  action: string,
  cookies: CookieJar,
  xhr: boolean,
): Promise<Behavior["response"]> {
  try {
    this.controller.recycleBang();

    await this.wrapExecution(() => this.controller.dispatch(action, this.request, this.response));
  } finally {
    this.request = this.controller.request as TestRequest;
    this.response = this.controller.response as Behavior["response"];

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

  return this.response;
}

/** @internal */
function scrubEnvBang(this: Behavior, env: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("rack.request") ||
      key.startsWith("action_dispatch.request") ||
      key.startsWith("action_dispatch.rescue")
    )
      delete env[key];
  }
  env["rack.input"] = new StringIO();
  delete env["CONTENT_LENGTH"];
  delete env["RAW_POST_DATA"];
  return env;
}

/** @internal */
function documentRootElement(this: Behavior) {
  return this.htmlDocument.root;
}

/** @internal */
function checkRequiredIvars(this: Behavior): void {
  for (const ivName of ["routes", "controller", "request", "response"] as const) {
    if (this[ivName] == null) {
      throw new RuntimeError(
        `@${ivName} is nil: make sure you set it in your test's setup method.`,
      );
    }
  }
}

export const Behavior = new Module((mod) => {
  extend(mod, Concern);
  mod.include(TestProcess);
  mod.include(ConstantLookup);
  mod.include(DomTestingAssertions);

  (mod as unknown as { ClassMethods: typeof ClassMethods }).ClassMethods = ClassMethods;

  mod.moduleEval((m) => {
    Object.assign(m, {
      get,
      post,
      patch,
      put,
      delete: deleteRequest,
      head,
      process,
      controllerClassName,
      generatedPath,
      queryParameterNames,
      setupControllerRequestAndResponse,
      buildResponse,
    });
  });

  (
    mod as unknown as { included(base: null, block: (this: typeof TestCase) => void): void }
  ).included(null, function (this: typeof TestCase) {
    include(this, TemplateAssertions);
    include(this, Assertions);
    classAttribute.call(this, "_controllerClass");
    this.setup(":setupControllerRequestAndResponse");
    runLoadHooks("action_controller_test_case", this);
  });

  mod.moduleEval((m) => {
    Object.assign(m, {
      setupRequest,
      wrapExecution,
      processControllerResponse,
      scrubEnvBang,
      checkRequiredIvars,
    });
    Object.defineProperty(m, "documentRootElement", {
      get: documentRootElement,
      configurable: true,
    });
  });
});

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Behavior` (`actionpack/lib/action_controller/test_case.rb:696`) and the two `include`s of its `included do` block (`:597-598`); the class/interface merge is how a mixin surfaces on the type side. */
export interface TestCase extends Behavior, TemplateAssertions, Assertions {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class TestCase extends ActiveSupportTestCase {
  static executorAroundEachRequest: boolean | null | undefined = null;

  declare response: TestResponse | LiveTestResponse;
  declare request: TestRequest;
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- `Behavior::ClassMethods`, `class_attribute :_controller_class` and `RoutingAssertions::ClassMethods` reach `TestCase` through `include Behavior` (`actionpack/lib/action_controller/test_case.rb:379-414,599,696`); a namespace merged onto the class is how the added statics surface on the type side.
export declare namespace TestCase {
  /** @internal */
  let _controllerClass: ControllerClass | null | undefined;
  let is_controllerClass: boolean;
  const tests: BehaviorClassMethods["tests"];
  let controllerClass: ControllerClass | null;
  const determineDefaultControllerClass: BehaviorClassMethods["determineDefaultControllerClass"];
  const determineConstantFromTestName: BehaviorClass["determineConstantFromTestName"];
  let withRouting: typeof RoutingAssertionsClassMethods.withRouting;
}

rbModConstSet(ActionController, "TestCase", TestCase);

include(TestCase, Behavior);

export class TestRequest extends AbstractTestRequest {
  /** @internal */
  private _customParamParsers: Record<string, (raw: string) => unknown> = {
    xml: (_raw) => ({}),
  };

  /** @internal */
  static newSession(): TestSession {
    return new TestSession();
  }

  private _controllerClass: DispatchableControllerClass | null;

  override controllerClass(): DispatchableControllerClass | null {
    return this._controllerClass;
  }

  static create(controllerClass: unknown): TestRequest {
    const env: Record<string, unknown> = {};
    env["rack.request.cookie_hash"] = {};
    return new TestRequest(
      merge(TestRequest.defaultEnv(), env),
      TestRequest.newSession(),
      controllerClass as DispatchableControllerClass | null,
    );
  }

  /** @internal */
  static override defaultEnv(): Record<string, unknown> {
    const base = AbstractTestRequest.defaultEnv();
    const env = { ...base };
    delete (env as Record<string, unknown>)["PATH_INFO"];
    return env;
  }

  constructor(
    env: Record<string, unknown>,
    session: TestSession,
    controllerClass: DispatchableControllerClass | null,
  ) {
    super(env);

    this.session = session as never;
    this.sessionOptions = { ...TestSession.DEFAULT_OPTIONS };
    this._controllerClass = controllerClass;
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

  static readonly ENCODER = new (class {
    static {
      include(this, RackTestUtils);
    }

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

    declare buildMultipart: Included<typeof RackTestUtils>["buildMultipart"];

    get contentType(): string {
      return `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`;
    }
  })();

  /**
   * @internal
   * @missingRailsArgs merge — PERMANENT
   */
  override paramsParsers(): ParameterParsers {
    const base = super.paramsParsers();
    return merge<unknown>(base, this._customParamParsers) as ParameterParsers;
  }
}

rbModConstSet(ActionController, "TestRequest", TestRequest);

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
