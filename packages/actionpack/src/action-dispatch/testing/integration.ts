import { Request } from "../http/request.js";
import { Headers } from "../http/headers.js";
import { Mime } from "../http/mime-type.js";
import { isPresent, reverseMergeBang, runLoadHooks } from "@blazetrails/activesupport";
import {
  HTTPS,
  RuntimeError,
  URI,
  include,
  NoMethodError,
  rbFPublicSend,
  rbModConstSet,
  rbObjClassname,
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

const DEFAULT_HOST = "www.example.com";

const APP_SESSIONS = new Map<unknown, typeof Session>();

const DEFAULT_REMOTE_ADDR = "127.0.0.1";
const DEFAULT_ACCEPT =
  "text/xml,application/xml,application/xhtml+xml," +
  "text/html;q=0.9,text/plain;q=0.8,image/png," +
  "*/*;q=0.5";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class Session {
  static DEFAULT_HOST = DEFAULT_HOST;

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
  _htmlDocument?: XmlDocument;

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

    this.host = DEFAULT_HOST;
    this.remoteAddr = DEFAULT_REMOTE_ADDR;
    this.accept = DEFAULT_ACCEPT;
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

    if (isPresent(wrappedHeaders.env)) {
      Headers.fromHash(requestEnv).mergeBang(wrappedHeaders.env);
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
    this._htmlDocument = undefined;
    this._urlOptions = undefined;

    this.controller = this.request.controllerInstance as Metal;

    return response.status;
  }

  hostBang(value: string): void {
    this.host = value;
  }

  /** @internal */
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

  get(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    return this.process("GET", path, options);
  }

  post(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    return this.process("POST", path, options);
  }

  patch(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    return this.process("PATCH", path, options);
  }

  put(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    return this.process("PUT", path, options);
  }

  delete(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    return this.process("DELETE", path, options);
  }

  head(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    return this.process("HEAD", path, options);
  }

  options(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    return this.process("OPTIONS", path, options);
  }

  async followRedirectBang({ headers = {}, ...args }: IntegrationRequestOptions = {}): Promise<
    number | null
  > {
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
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include TestProcess, RequestHelpers, Assertions` (`actionpack/lib/action_dispatch/testing/integration.rb:95`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Session
  extends Omit<Included<typeof TestProcess>, "cookies">, Omit<Assertions, "withRouting"> {}

include(Session, Assertions);
include(Session, TestProcess);
include(Session, urlForMod.UrlFor);

rbModConstSet(ActionDispatch, "Integration", { name: "ActionDispatch::Integration", Session });

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
  | "options"
  | "urlOptions"
>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class IntegrationTest extends TestCase {
  routes: RouteSet = new RouteSet();

  /** @inlinedFrom ActionDispatch::Routing::UrlFor#initialize rails/v8.0.2/actionpack/lib/action_dispatch/routing/url_for.rb:111-114 */
  constructor(...args: ConstructorParameters<typeof TestCase>) {
    super(...args);
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

  get documentRootElement() {
    return this.htmlDocument.root;
  }

  urlOptions(): Record<string, unknown> {
    return this.integrationSession.urlOptions();
  }

  /** @internal */
  _integrationSession: Session | null;

  get integrationSession(): Session {
    return (this._integrationSession ??= this.createSession(this.app));
  }

  resetBang(): void {
    this._integrationSession = this.createSession(this.app);
  }

  /** @internal */
  createSession(app: unknown): Session {
    let klass = APP_SESSIONS.get(app);
    if (klass === undefined) {
      klass = class extends Session {};
      const railsApp = app as { routes: RouteSet | (() => RouteSet) };
      if (
        rbObjRespondTo(app, "routes") &&
        (typeof railsApp.routes === "function" ? railsApp.routes() : railsApp.routes) instanceof
          RouteSet
      ) {
        const routes = typeof railsApp.routes === "function" ? railsApp.routes() : railsApp.routes;
        include(klass, routes.urlHelpers());
        include(klass, routes.mountedHelpers());
      }
      APP_SESSIONS.set(app, klass);
    }
    return new klass(app);
  }

  /** @internal */
  removeBang(): void {
    this._integrationSession = null;
  }

  async get(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    this._htmlDocument = undefined;

    const result = await this.integrationSession.get(path, options);
    this.copySessionVariablesBang();
    return result;
  }

  async post(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    this._htmlDocument = undefined;

    const result = await this.integrationSession.post(path, options);
    this.copySessionVariablesBang();
    return result;
  }

  async patch(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    this._htmlDocument = undefined;

    const result = await this.integrationSession.patch(path, options);
    this.copySessionVariablesBang();
    return result;
  }

  async put(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    this._htmlDocument = undefined;

    const result = await this.integrationSession.put(path, options);
    this.copySessionVariablesBang();
    return result;
  }

  async head(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    this._htmlDocument = undefined;

    const result = await this.integrationSession.head(path, options);
    this.copySessionVariablesBang();
    return result;
  }

  async delete(path: string, options: IntegrationRequestOptions = {}): Promise<number> {
    this._htmlDocument = undefined;

    const result = await this.integrationSession.delete(path, options);
    this.copySessionVariablesBang();
    return result;
  }

  get cookies(): CookieJar {
    const result = this.integrationSession.cookies;
    this.copySessionVariablesBang();
    return result;
  }

  assigns(key?: string | symbol): never {
    const result = this.integrationSession.assigns(key);
    this.copySessionVariablesBang();
    return result;
  }

  async followRedirectBang(options: IntegrationRequestOptions = {}): Promise<number | null> {
    this._htmlDocument = undefined;

    const result = await this.integrationSession.followRedirectBang(options);
    this.copySessionVariablesBang();
    return result;
  }

  openSession(block?: (sess: IntegrationTest) => void): IntegrationTest {
    const sess: IntegrationTest = Object.assign(
      Object.create(Object.getPrototypeOf(this) as object),
      this,
    );
    sess._htmlDocument = undefined;
    sess.resetBang();
    sess.rootSession = this.rootSession ?? this;
    block?.(sess);
    return sess;
  }

  /** @internal */
  rootSession?: IntegrationTest;

  /** @internal */
  override get assertions(): number {
    return this.rootSession ? this.rootSession.assertions : super.assertions;
  }

  override set assertions(assertions: number) {
    if (this.rootSession) this.rootSession.assertions = assertions;
    else super.assertions = assertions;
  }

  /** @internal */
  _htmlDocument?: XmlDocument;

  /** @internal */
  copySessionVariablesBang(): void {
    this.controller = this._integrationSession!.controller!;
    this.response = this._integrationSession!.response!;
    this.request = this._integrationSession!.request!;
  }

  get defaultUrlOptions(): Record<string, unknown> {
    return this.integrationSession.defaultUrlOptions;
  }

  set defaultUrlOptions(options: Record<string, unknown>) {
    this.integrationSession.defaultUrlOptions = options;
  }

  /** @internal */
  respondToMissing(method: string, _: boolean): boolean {
    if (rbObjRespondTo(this.integrationSession, method)) return true;
    const sup = Reflect.get(
      Object.getPrototypeOf(IntegrationTest.prototype),
      "respondToMissing",
      this,
    );
    return typeof sup === "function" && sup.call(this, method, _) === true;
  }

  /** @internal */
  methodMissing(method: string, ...args: unknown[]): unknown {
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
      const sup = Reflect.get(
        Object.getPrototypeOf(IntegrationTest.prototype),
        "methodMissing",
        this,
      );
      if (typeof sup === "function") return sup.call(this, method, ...args);
      throw new NoMethodError(
        `undefined method '${method}' for an instance of ${rbObjClassname(this)}`,
        method,
        args,
        false,
        { receiver: this },
      );
    }
  }

  /** @internal */
  override beforeSetup(): unknown {
    this._app = undefined;
    return super.beforeSetup();
  }

  static withRouting = routingAssertions.WithIntegrationRouting.ClassMethods.withRouting;

  /** @internal */
  _originalRoutes?: RouteSet;

  /** @internal */
  _app?: unknown;

  get app(): unknown {
    return this._app ?? (this.constructor as typeof IntegrationTest).app;
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

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include TestProcess` and `include TestProcess::FixtureFile` (`actionpack/lib/action_dispatch/testing/integration.rb:95,651`); the class/interface merge is how a mixin surfaces on the type side. */
export interface IntegrationTest
  extends
    SessionMethodMissing,
    Omit<Included<typeof TestProcess>, "cookies" | "assigns">,
    Included<typeof FixtureFile>,
    Omit<Assertions, "withRouting" | "createRoutes" | "resetRoutes"> {}

include(IntegrationTest, Assertions);
include(IntegrationTest, TestProcess);
include(IntegrationTest, FixtureFile);

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
