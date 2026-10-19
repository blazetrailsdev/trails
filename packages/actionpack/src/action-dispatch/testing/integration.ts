import { Request } from "../http/request.js";
import { Headers } from "../http/headers.js";
import { Mime } from "../http/mime-type.js";
import { isPresent, reverseMergeBang, runLoadHooks } from "@blazetrails/activesupport";
import {
  HTTPS,
  NoMethodError,
  RuntimeError,
  URI,
  include,
  rbFPublicSend,
  rbModConstSet,
  rbObjClassname,
  rbObjDup,
  Module,
  rbFSend,
  rbObjRespondTo,
  stringSplit,
  type Generic,
  type Included,
  type StringIO,
} from "@blazetrails/ruby-compat";
import { TestResponse } from "./test-response.js";
import { RouteSet } from "../routing/route-set.js";
import type { Metal } from "../../action-controller/metal.js";
import { FixtureFile, TestProcess } from "./test-process.js";
import * as routingAssertions from "./assertions/routing.js";
import { Assertions } from "./assertions.js";
import type { XmlDocument } from "@blazetrails/nokogiri";
import * as urlForMod from "../routing/url-for.js";
import * as polymorphicRoutes from "../routing/polymorphic-routes.js";
import type { UrlForRoutes } from "../routing/url-for.js";
import { RequestEncoder } from "./request-encoder.js";
import * as pageDumpHelper from "./test-helpers/page-dump-helper.js";
import { ActionDispatch } from "../../namespaces.js";
import { Session as RackTestSession, type CookieJar } from "@blazetrails/rack-test";
import { DEFAULT_PORTS, type RackApp, type RackMiddleware } from "@blazetrails/rack";
import { TestCase } from "@blazetrails/activesupport/test-case";

export interface IntegrationRequestOptions {
  params?: Record<string, unknown> | string | StringIO;
  headers?: Record<string, unknown>;
  xhr?: boolean;
  env?: Record<string, unknown>;
  as?: string;
}

export function get(
  this: Session,
  path: string,
  options: IntegrationRequestOptions = {},
): Promise<number> {
  return this.process("GET", path, options);
}

export function post(
  this: Session,
  path: string,
  options: IntegrationRequestOptions = {},
): Promise<number> {
  return this.process("POST", path, options);
}

export function patch(
  this: Session,
  path: string,
  options: IntegrationRequestOptions = {},
): Promise<number> {
  return this.process("PATCH", path, options);
}

export function put(
  this: Session,
  path: string,
  options: IntegrationRequestOptions = {},
): Promise<number> {
  return this.process("PUT", path, options);
}

/** @noRailsEquivalent PERMANENT */
export function delete_(
  this: Session,
  path: string,
  options: IntegrationRequestOptions = {},
): Promise<number> {
  return this.process("DELETE", path, options);
}

export function head(
  this: Session,
  path: string,
  options: IntegrationRequestOptions = {},
): Promise<number> {
  return this.process("HEAD", path, options);
}

export function options(
  this: Session,
  path: string,
  options: IntegrationRequestOptions = {},
): Promise<number> {
  return this.process("OPTIONS", path, options);
}

export async function followRedirectBang(
  this: Session,
  { headers = {}, ...args }: IntegrationRequestOptions = {},
): Promise<number | null> {
  if (!this.isRedirect) {
    throw new RuntimeError(`not a redirect! ${this.status} ${this.statusMessage}`);
  }

  const method = [307, 308].includes(this.response!.status)
    ? this.request!.method.toLowerCase()
    : "get";

  if (![":HTTP_REFERER", "HTTP_REFERER"].some((key) => Object.hasOwn(headers, key))) {
    headers["HTTP_REFERER"] = this.request!.url;
  }

  await rbFPublicSend(this, method, this.response!.location, { headers, ...args });
  return this.status;
}

export { delete_ as delete };

interface RequestHelpersMethods {
  get: typeof get;
  post: typeof post;
  patch: typeof patch;
  put: typeof put;
  delete: typeof delete_;
  head: typeof head;
  options: typeof options;
  followRedirectBang: typeof followRedirectBang;
}

export const RequestHelpers = new Module((mod) => {
  mod.moduleEval((m) => {
    Object.assign(m, { get, post, patch, put, delete: delete_, head, options, followRedirectBang });
  });
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class Session {
  static DEFAULT_HOST = "www.example.com";

  get status(): number | null {
    return this.response == null ? null : this.response.status;
  }

  get statusMessage(): string | null {
    return this.response == null ? null : this.response.statusMessage;
  }

  get headers(): TestResponse["headers"] | null {
    return this.response == null ? null : this.response.headers;
  }

  get body(): string | null {
    return this.response == null ? null : this.response.body;
  }

  get isRedirect(): boolean | null {
    return this.response == null ? null : this.response.isRedirect;
  }

  get path(): string | null {
    return this.request == null ? null : this.request.path;
  }

  /** @internal */
  _host?: string;

  get host(): string {
    return this._host ?? Session.DEFAULT_HOST;
  }

  set host(host: string) {
    this._host = host;
  }

  /** @internal */
  _remoteAddr!: string;

  get remoteAddr(): string {
    return this._remoteAddr;
  }

  set remoteAddr(remoteAddr: string) {
    this._remoteAddr = remoteAddr;
  }

  /** @internal */
  _accept!: string;

  get accept(): string {
    return this._accept;
  }

  set accept(accept: string) {
    this._accept = accept;
  }

  get cookies(): CookieJar {
    return this._mockSession.cookieJar;
  }

  controller!: Metal | null;

  request!: Request | null;

  response!: TestResponse | null;

  /** @internal */
  _requestCount!: number;

  get requestCount(): number {
    return this._requestCount;
  }

  set requestCount(requestCount: number) {
    this._requestCount = requestCount;
  }

  /** @internal */
  _app: unknown;

  /** @internal */
  _https!: boolean;

  /** @internal */
  _urlOptions?: Record<string, unknown>;

  /** @internal */
  _defaultUrlOptions: Record<string, unknown> = {};

  /** @internal */
  _htmlDocument?: XmlDocument | null;

  private _mockSessionMemo?: RackTestSession;

  /** @inlinedFrom ActionDispatch::Routing::UrlFor#initialize rails/v8.0.2/actionpack/lib/action_dispatch/routing/url_for.rb:111-114 */
  constructor(app: unknown) {
    (this as { _routes?: unknown })._routes = null;
    this._app = app;

    this.resetBang();
  }

  urlOptions(): Record<string, unknown> {
    if (!this._urlOptions) {
      const urlOptions = { ...this.defaultUrlOptions };
      if (rbObjRespondTo(this.controller, "urlOptions")) {
        reverseMergeBang(
          urlOptions,
          (this.controller as unknown as { urlOptions(): Record<string, unknown> }).urlOptions(),
        );
      }

      if (rbObjRespondTo(this._app, "routes")) {
        reverseMergeBang(urlOptions, (rbFSend(this._app, "routes") as RouteSet).defaultUrlOptions);
      }

      reverseMergeBang(urlOptions, {
        host: this.host,
        protocol: this.isHttps() ? "https" : "http",
      });
      this._urlOptions = urlOptions;
    }
    return this._urlOptions;
  }

  get defaultUrlOptions(): Record<string, unknown> {
    return this._defaultUrlOptions;
  }

  set defaultUrlOptions(options: Record<string, unknown>) {
    this._defaultUrlOptions = options;
    this._urlOptions = undefined;
  }

  resetBang(): void {
    this._https = false;
    this.controller = this.request = this.response = null;
    this._mockSessionMemo = undefined;
    this.requestCount = 0;
    this._urlOptions = undefined;

    this.host = Session.DEFAULT_HOST;
    this.remoteAddr = "127.0.0.1";
    this.accept =
      "text/xml,application/xml,application/xhtml+xml," +
      "text/html;q=0.9,text/plain;q=0.8,image/png," +
      "*/*;q=0.5";
  }

  httpsBang(flag: boolean = true): void {
    this._https = flag;
  }

  isHttps(): boolean {
    return this._https;
  }

  async process(
    method: string,
    path: string,
    options: IntegrationRequestOptions = {},
  ): Promise<number> {
    const requestEncoder = RequestEncoder.encoder(options.as);
    const headers: Record<string, unknown> = { ...(options.headers ?? {}) };
    const params = options.params;

    if (method === "GET" && options.as === "json" && params != null) {
      headers["X-Http-Method-Override"] = "GET";
      method = "POST";
    }

    if (path.includes("://")) {
      path = this.buildExpandedPath(path, (location) => {
        if (location.scheme != null) this.httpsBang(location instanceof HTTPS);

        let urlHost = location.host;
        if (urlHost != null) {
          const dflt = DEFAULT_PORTS[location.scheme!];
          if (dflt !== location.port) urlHost += `:${location.port}`;
          this.hostBang(urlHost);
        }
      });
    }

    const [hostname, port] = stringSplit(this.host, ":");

    const requestEnv: Record<string, unknown> = {
      ":method": method,
      ":params": requestEncoder.encodeParams(params),

      SERVER_NAME: hostname,
      SERVER_PORT: port ?? (this.isHttps() ? "443" : "80"),
      HTTPS: this.isHttps() ? "on" : "off",
      "rack.url_scheme": this.isHttps() ? "https" : "http",

      REQUEST_URI: path,
      HTTP_HOST: this.host,
      REMOTE_ADDR: this.remoteAddr,
      HTTP_ACCEPT: requestEncoder.acceptHeader ?? this.accept,
    };

    if (requestEncoder.contentType) {
      requestEnv["CONTENT_TYPE"] = requestEncoder.contentType;
    }

    const wrappedHeaders = Headers.fromHash({});
    wrappedHeaders.mergeBang(headers);

    if (options.xhr) {
      wrappedHeaders.set("HTTP_X_REQUESTED_WITH", "XMLHttpRequest");
      if (wrappedHeaders.get("HTTP_ACCEPT") == null) {
        wrappedHeaders.set(
          "HTTP_ACCEPT",
          [
            Mime.get(":js")!.toString(),
            Mime.get(":html")!.toString(),
            Mime.get(":xml")!.toString(),
            "text/xml",
            "*/*",
          ].join(", "),
        );
      }
    }

    if (isPresent(wrappedHeaders)) {
      Headers.fromHash(requestEnv).mergeBang(wrappedHeaders);
    }
    if (isPresent(options.env)) {
      Headers.fromHash(requestEnv).mergeBang(options.env!);
    }

    const session = new RackTestSession(this._mockSession);

    let uri = this.buildFullUri(path, requestEnv);

    if (method === "GET" && typeof requestEnv[":params"] === "string") {
      uri += `?${requestEnv[":params"]}`;
      delete requestEnv[":params"];
    }

    await session.request(uri, requestEnv);

    this.requestCount += 1;
    this.request = new Request(session.lastRequest().env);
    const response = this._mockSession.lastResponse();
    this.response = TestResponse.fromResponse(response);
    this.response.request = this.request;
    this._htmlDocument = null;
    this._urlOptions = undefined;

    this.controller = this.request.controllerInstance as Metal;

    return response.status;
  }

  hostBang(value: string): void {
    this.host = value;
  }

  /**
   * @internal
   * @missingRailsName app — PERMANENT
   */
  get _mockSession(): RackTestSession {
    this._mockSessionMemo ??= new RackTestSession(this._app as RackApp | RackMiddleware, this.host);
    return this._mockSessionMemo;
  }

  /** @internal */
  buildFullUri(path: string, env: Record<string, unknown>): string {
    return `${env["rack.url_scheme"]}://${env["SERVER_NAME"]}:${env["SERVER_PORT"]}${path}`;
  }

  /** @internal */
  buildExpandedPath(path: string, block?: (location: Generic) => void): string {
    const location = URI.parse(path);
    if (block) block(location);
    path = location.path!;
    return location.query != null ? `${path}?${location.query}` : path;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include TestProcess, RequestHelpers, Assertions` (`actionpack/lib/action_dispatch/testing/integration.rb:95`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Session
  extends
    Omit<Included<typeof TestProcess>, "cookies">,
    RequestHelpersMethods,
    Omit<Assertions, "withRouting"> {}

include(Session, TestProcess);
include(Session, RequestHelpers);
include(Session, Assertions);
include(Session, urlForMod.UrlFor);

interface RunnerHost {
  _integrationSession: Session | null;
  _htmlDocument?: XmlDocument | null;
  _app?: unknown;
  readonly app: unknown;
  rootSession: RunnerHost | null;
  assertions: number;
  controller: unknown;
  response: unknown;
  request: unknown;
  readonly integrationSession: Session;
  resetBang(): void;
  createSession(app: unknown): Session;
  copySessionVariablesBang(): void;
}

function beforeSetup(this: RunnerHost): unknown {
  this._app = null;
  return Runner.superMethod(this, "beforeSetup")!();
}

function integrationSession(this: RunnerHost): Session {
  return (this._integrationSession ??= this.createSession(this.app));
}

function resetBang(this: RunnerHost): void {
  this._integrationSession = this.createSession(this.app);
}

function createSession(this: RunnerHost, app: unknown): Session {
  const APP_SESSIONS = Runner.APP_SESSIONS;
  let klass = APP_SESSIONS.get(app);
  if (klass === undefined) {
    klass = class extends Session {};
    if (rbObjRespondTo(app, "routes") && rbFSend(app, "routes") instanceof RouteSet) {
      include(klass, (rbFSend(app, "routes") as RouteSet).urlHelpers());
      include(klass, (rbFSend(app, "routes") as RouteSet).mountedHelpers());
    }
    APP_SESSIONS.set(app, klass);
  }
  return new klass(app);
}

function removeBang(this: RunnerHost): void {
  this._integrationSession = null;
}

function openSession<T extends RunnerHost>(this: T, block?: (session: T) => void): T {
  const session = rbObjDup(this);
  session.resetBang();
  session.rootSession = this.rootSession ?? this;
  block?.(session);
  return session;
}

function assertions(this: RunnerHost): number {
  return this.rootSession
    ? this.rootSession.assertions
    : (Runner.superMethod(this, "assertions")!() as number);
}

function setAssertions(this: RunnerHost, assertions: number): void {
  if (this.rootSession) this.rootSession.assertions = assertions;
  else Runner.superMethod(this, "assertions=")!(assertions);
}

function copySessionVariablesBang(this: RunnerHost): void {
  this.controller = this._integrationSession!.controller!;
  this.response = this._integrationSession!.response!;
  this.request = this._integrationSession!.request!;
}

function defaultUrlOptions(this: RunnerHost): Record<string, unknown> {
  return this.integrationSession.defaultUrlOptions;
}

function setDefaultUrlOptions(this: RunnerHost, options: Record<string, unknown>): void {
  this.integrationSession.defaultUrlOptions = options;
}

function respondToMissing(this: RunnerHost, method: string, _: boolean): boolean {
  return (
    rbObjRespondTo(this.integrationSession, method) ||
    Runner.superMethod(this, "respondToMissing")?.(method, _) === true
  );
}

function methodMissing(this: RunnerHost, method: string, ...args: unknown[]): unknown {
  if (rbObjRespondTo(this.integrationSession, method)) {
    const result = rbFPublicSend(this.integrationSession, method, ...args);
    if (typeof (result as { then?: unknown } | null)?.then === "function") {
      return (result as Promise<unknown>).then((value) => {
        this.copySessionVariablesBang();
        return value;
      });
    }
    this.copySessionVariablesBang();
    return result;
  } else {
    const super_ = Runner.superMethod(this, "methodMissing");
    if (super_ !== undefined) return super_(method, ...args);
    throw new NoMethodError(
      `undefined method '${method}' for an instance of ${rbObjClassname(this)}`,
      method,
      args,
      false,
      { receiver: this },
    );
  }
}

export interface Runner {
  readonly app: unknown;
  /** @internal */
  rootSession: Runner | null;
  readonly integrationSession: Session;
  resetBang(): void;
  /** @internal */
  createSession(app: unknown): Session;
  /** @internal */
  removeBang(): void;
  get(path: string, options?: IntegrationRequestOptions): Promise<number>;
  post(path: string, options?: IntegrationRequestOptions): Promise<number>;
  patch(path: string, options?: IntegrationRequestOptions): Promise<number>;
  put(path: string, options?: IntegrationRequestOptions): Promise<number>;
  head(path: string, options?: IntegrationRequestOptions): Promise<number>;
  delete(path: string, options?: IntegrationRequestOptions): Promise<number>;
  readonly cookies: CookieJar;
  assigns(key?: string | symbol): never;
  followRedirectBang(options?: IntegrationRequestOptions): Promise<number | null>;
  openSession(block?: (session: this) => void): this;
  /** @internal */
  copySessionVariablesBang(): void;
  defaultUrlOptions: Record<string, unknown>;
  /** @internal */
  respondToMissing(method: string, _: boolean): boolean;
  /** @internal */
  methodMissing(method: string, ...args: unknown[]): unknown;
  /** @internal */
  beforeSetup(): unknown;
}

/** @missingRailsCall include — CONVERGEABLE integration-runner-includes-assertions */
export const Runner = new Module((mod) => {
  mod.attrReader("app");
  mod.attrReader("rootSession");
  mod.attrWriter("rootSession");

  mod.defineMethod("beforeSetup", beforeSetup);
  mod.defineMethod("resetBang", resetBang);
  mod.defineMethod("createSession", createSession);
  mod.defineMethod("removeBang", removeBang);
  for (const method of [
    "get",
    "post",
    "patch",
    "put",
    "head",
    "delete",
    "cookies",
    "assigns",
    "followRedirectBang",
  ] as const) {
    if (method === "cookies" || method === "assigns") {
      mod.moduleEval((m) => {
        Object.defineProperty(m, method, {
          ...(method === "cookies"
            ? {
                get(this: RunnerHost) {
                  const result = this.integrationSession[method];
                  this.copySessionVariablesBang();
                  return result;
                },
              }
            : {
                value(this: RunnerHost, ...args: unknown[]) {
                  const result = rbFPublicSend(this.integrationSession, method, ...args);
                  this.copySessionVariablesBang();
                  return result;
                },
                writable: true,
              }),
          configurable: true,
        });
      });
    } else {
      mod.defineMethod(method, async function (this: RunnerHost, ...args: unknown[]) {
        this._htmlDocument = null;

        const result = await rbFPublicSend(this.integrationSession, method, ...args);
        this.copySessionVariablesBang();
        return result;
      });
    }
  }
  mod.defineMethod("openSession", openSession);
  mod.defineMethod("copySessionVariablesBang", copySessionVariablesBang);
  mod.defineMethod("respondToMissing", respondToMissing);
  mod.defineMethod("methodMissing", methodMissing);
  mod.moduleEval((m) => {
    Object.defineProperty(m, "integrationSession", { get: integrationSession, configurable: true });
    Object.defineProperty(m, "assertions", {
      get: assertions,
      set: setAssertions,
      configurable: true,
    });
    Object.defineProperty(m, "defaultUrlOptions", {
      get: defaultUrlOptions,
      set: setDefaultUrlOptions,
      configurable: true,
    });
  });
}) as Module & { APP_SESSIONS: Map<unknown, typeof Session> };

rbModConstSet(Runner, "APP_SESSIONS", new Map<unknown, typeof Session>());

rbModConstSet(ActionDispatch, "Integration", {
  name: "ActionDispatch::Integration",
  Session,
  Runner,
});

type SessionMethodMissing = Pick<
  Session,
  | "host"
  | "remoteAddr"
  | "accept"
  | "requestCount"
  | "status"
  | "statusMessage"
  | "headers"
  | "body"
  | "isRedirect"
  | "path"
  | "httpsBang"
  | "isHttps"
  | "hostBang"
  | "process"
  | "urlOptions"
  | "session"
  | "flash"
  | "redirectToUrl"
> & { options(path: string, options?: IntegrationRequestOptions): Promise<number> };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class IntegrationTest extends TestCase {
  routes: RouteSet = new RouteSet();

  /** @inlinedFrom ActionDispatch::Routing::UrlFor#initialize rails/v8.0.2/actionpack/lib/action_dispatch/routing/url_for.rb:111-114 */
  constructor(
    ...args:
      | ConstructorParameters<typeof TestCase>
      | [...ConstructorParameters<typeof TestCase>, () => unknown]
  ) {
    super(...(args as ConstructorParameters<typeof TestCase>));
    this._routesOverride = undefined;
    this._integrationSession = null;
  }

  /** @internal */
  get _routes(): UrlForRoutes {
    if (this._routesOverride) return this._routesOverride;
    const app = this.app as { routes?: unknown } | null;
    return app?.routes instanceof RouteSet ? app.routes._routes : this.routes._routes;
  }

  set _routes(value: UrlForRoutes | null) {
    if (value == null || value === this.routes._routes) {
      this._routesOverride = undefined;
    } else {
      this._routesOverride = value;
    }
  }

  /** @internal */
  _routesOverride?: UrlForRoutes;

  controller!: Metal;

  request!: Request;

  response!: TestResponse;

  documentRootElement() {
    return this.htmlDocument.root;
  }

  urlOptions(): Record<string, unknown> {
    return this.integrationSession.urlOptions();
  }

  /** @internal */
  declare _integrationSession: Session | null;

  /** @internal */
  declare _htmlDocument?: XmlDocument | null;

  static withRouting = routingAssertions.WithIntegrationRouting.ClassMethods.withRouting;

  /** @internal */
  _originalRoutes?: RouteSet;

  /** @internal */
  declare _app?: unknown;

  get app(): unknown {
    return (
      Reflect.get(Object.getPrototypeOf(IntegrationTest.prototype) as object, "app", this) ??
      (this.constructor as typeof IntegrationTest).app
    );
  }

  set app(value: unknown) {
    this._app = value;
  }

  /** @internal */
  static _app: unknown = null;

  static get app(): unknown {
    if (IntegrationTest._app != null && IntegrationTest._app !== false) {
      return IntegrationTest._app;
    } else {
      return ActionDispatch.testApp;
    }
  }

  static set app(app: unknown) {
    IntegrationTest._app = app;
  }

  static registerEncoder(
    args: string,
    options: {
      paramEncoder?: (params: unknown) => unknown;
      responseParser?: (body: string) => unknown;
    } = {},
  ): void {
    RequestEncoder.registerEncoder(args, options);
  }

  inspect(): string {
    const url = this.request?.env?.REQUEST_URI ?? "(no request)";
    return `#<${this.constructor.name} ${url}>`;
  }

  declare withRouting: typeof routingAssertions.WithIntegrationRouting.withRouting;
  /** @internal */
  declare createRoutes: typeof routingAssertions.WithIntegrationRouting.createRoutes;
  /** @internal */
  declare resetRoutes: typeof routingAssertions.WithIntegrationRouting.resetRoutes;
  declare urlFor: typeof urlForMod.urlFor;
  declare fullUrlFor: typeof urlForMod.fullUrlFor;
  declare routeFor: typeof urlForMod.routeFor;
  /** @internal */
  declare optimizeRoutesGeneration: typeof urlForMod.optimizeRoutesGeneration;
  declare _withRoutes: typeof urlForMod._withRoutes;
  declare _routesContext: typeof urlForMod._routesContext;
  declare polymorphicUrl: typeof polymorphicRoutes.polymorphicUrl;
  declare polymorphicPath: typeof polymorphicRoutes.polymorphicPath;
  declare polymorphicUrlForAction: typeof polymorphicRoutes.polymorphicUrlForAction;
  declare polymorphicPathForAction: typeof polymorphicRoutes.polymorphicPathForAction;
  declare polymorphicMapping: typeof polymorphicRoutes.polymorphicMapping;
  declare saveAndOpenPage: typeof pageDumpHelper.saveAndOpenPage;
  /** @internal */
  declare savePage: typeof pageDumpHelper.savePage;
  /** @internal */
  declare openFile: typeof pageDumpHelper.openFile;
  /** @internal */
  declare htmlDumpDefaultPath: typeof pageDumpHelper.htmlDumpDefaultPath;

  reset(): void {
    this.resetBang();
  }
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function spliceMethodMissing(proto: object): void {
  Object.setPrototypeOf(
    proto,
    new Proxy(Object.create(Object.getPrototypeOf(proto) as object) as object, {
      get(target, prop, receiver: IntegrationTest) {
        if (
          typeof prop === "symbol" ||
          Reflect.has(target, prop) ||
          prop.startsWith("_") ||
          prop === "respondToMissing" ||
          prop === "methodMissing" ||
          !Object.hasOwn(receiver, "_integrationSession") ||
          !receiver.respondToMissing(prop, false)
        ) {
          return Reflect.get(target, prop, receiver);
        }
        if (typeof Reflect.get(receiver.integrationSession, prop) === "function") {
          return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
        }
        return receiver.methodMissing(prop);
      },
      set(target, prop, value, receiver: IntegrationTest) {
        if (
          typeof prop === "symbol" ||
          Reflect.has(target, prop) ||
          prop.startsWith("_") ||
          !Object.hasOwn(receiver, "_integrationSession") ||
          !Reflect.has(Session.prototype, prop)
        ) {
          return Reflect.set(target, prop, value, receiver);
        }
        Reflect.set(receiver.integrationSession, prop, value);
        receiver.copySessionVariablesBang();
        return true;
      },
    }),
  );
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include TestProcess::FixtureFile` and `include Integration::Runner` (`actionpack/lib/action_dispatch/testing/integration.rb:651,662`), with TestProcess reached through `method_missing`; the class/interface merge is how a mixin surfaces on the type side. */
export interface IntegrationTest
  extends
    SessionMethodMissing,
    Included<typeof FixtureFile>,
    Omit<Assertions, "withRouting" | "createRoutes" | "resetRoutes">,
    Runner {}

include(IntegrationTest, FixtureFile);
include(IntegrationTest, Assertions);
include(IntegrationTest, Runner);

const proto = IntegrationTest.prototype as unknown as Record<string, unknown>;
proto.withRouting = routingAssertions.WithIntegrationRouting.withRouting;
proto.createRoutes = routingAssertions.WithIntegrationRouting.createRoutes;
proto.resetRoutes = routingAssertions.WithIntegrationRouting.resetRoutes;
proto.urlFor = urlForMod.urlFor;
proto.fullUrlFor = urlForMod.fullUrlFor;
proto.routeFor = urlForMod.routeFor;
proto.optimizeRoutesGeneration = urlForMod.optimizeRoutesGeneration;
proto._withRoutes = urlForMod._withRoutes;
proto._routesContext = urlForMod._routesContext;
proto.polymorphicUrl = polymorphicRoutes.polymorphicUrl;
proto.polymorphicPath = polymorphicRoutes.polymorphicPath;
proto.polymorphicUrlForAction = polymorphicRoutes.polymorphicUrlForAction;
proto.polymorphicPathForAction = polymorphicRoutes.polymorphicPathForAction;
proto.polymorphicMapping = polymorphicRoutes.polymorphicMapping;
proto.saveAndOpenPage = pageDumpHelper.saveAndOpenPage;
proto.savePage = pageDumpHelper.savePage;
proto.openFile = pageDumpHelper.openFile;
proto.htmlDumpDefaultPath = pageDumpHelper.htmlDumpDefaultPath;
spliceMethodMissing(proto);
include(IntegrationTest, urlForMod.UrlFor);

runLoadHooks("action_dispatch_integration_test", IntegrationTest);
