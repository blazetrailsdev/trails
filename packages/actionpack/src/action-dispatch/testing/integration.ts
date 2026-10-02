import { Request } from "../http/request.js";
import { Headers } from "../http/headers.js";
import { Mime } from "../http/mime-type.js";
import { isPresent, reverseMergeBang, runLoadHooks } from "@blazetrails/activesupport";
import {
  HTTPS,
  RuntimeError,
  URI,
  hasKey,
  include,
  rbFPublicSend,
  rbObjRespondTo,
  stringSplit,
  type Generic,
  type Included,
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
  params?: Record<string, unknown> | string;
  headers?: Record<string, string>;
  xhr?: boolean;
  env?: Record<string, unknown>;
  as?: string;
}

const DEFAULT_HOST = "www.example.com";

const APP_SESSIONS = new Map<unknown, typeof IntegrationTest>();

const DEFAULT_REMOTE_ADDR = "127.0.0.1";
const DEFAULT_ACCEPT =
  "text/xml,application/xml,application/xhtml+xml," +
  "text/html;q=0.9,text/plain;q=0.8,image/png," +
  "*/*;q=0.5";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class IntegrationTest extends TestCase {
  routes: RouteSet = new RouteSet();

  host: string = DEFAULT_HOST;

  remoteAddr: string = DEFAULT_REMOTE_ADDR;

  accept: string = DEFAULT_ACCEPT;

  requestCount: number = 0;

  /** @internal */
  _https: boolean = false;

  /** @internal */
  _urlOptions?: Record<string, unknown>;

  /** @internal */
  _defaultUrlOptions: Record<string, unknown> = {};

  constructor(...args: ConstructorParameters<typeof TestCase>) {
    super(...args);
    this._integrationSession = null;
  }

  resetBang(): void {
    this._mockSessionMemo = undefined;
    this._htmlDocument = undefined;
    this.controller = undefined!;
    this.request = undefined!;
    this.response = undefined!;
    this._https = false;
    this._urlOptions = undefined;
    this.requestCount = 0;
    this.host = DEFAULT_HOST;
    this.remoteAddr = DEFAULT_REMOTE_ADDR;
    this.accept = DEFAULT_ACCEPT;
    this._integrationSession = this.createSession(this.app);
  }

  httpsBang(flag: boolean = true): void {
    this._https = flag;
  }

  isHttps(): boolean {
    return this._https;
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

      const app = this.app as { routes?: RouteSet } | null;
      if (rbObjRespondTo(app, "routes")) {
        reverseMergeBang(urlOptions, app!.routes!.defaultUrlOptions);
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

  async process(
    method: string,
    path: string,
    options: IntegrationRequestOptions = {},
  ): Promise<number> {
    const requestEncoder = RequestEncoder.encoder(options.as);
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
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
      SERVER_PORT: port ?? (this._https ? "443" : "80"),
      HTTPS: this._https ? "on" : "off",
      "rack.url_scheme": this._https ? "https" : "http",

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

    const session = RackTestSession.new(this._mockSession);

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

  hostBang(host: string): void {
    this.host = host;
  }

  async followRedirectBang({ headers = {}, ...args }: IntegrationRequestOptions = {}): Promise<
    number | null
  > {
    if (!this.isRedirect) {
      throw new RuntimeError(`not a redirect! ${this.status} ${this.statusMessage}`);
    }

    const method = [307, 308].includes(this.response.status)
      ? this.request.method.toLowerCase()
      : "get";

    if (![":HTTP_REFERER", "HTTP_REFERER"].some((key) => hasKey(headers, key))) {
      headers["HTTP_REFERER"] = this.request.url;
    }

    await rbFPublicSend(this, method, this.response.location, { headers, ...args });
    return this.status;
  }

  private _mockSessionMemo?: RackTestSession;

  controller!: Metal;

  request!: Request;

  response!: TestResponse;

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

  get cookies(): CookieJar {
    return this._mockSession.cookieJar;
  }

  get documentRootElement() {
    return this.htmlDocument.root;
  }

  /** @internal */
  get _mockSession(): RackTestSession {
    this._mockSessionMemo ??= new RackTestSession(this.app as RackApp | RackMiddleware, this.host);
    return this._mockSessionMemo;
  }

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

  async options(path: string, options: IntegrationRequestOptions = {}): Promise<void> {
    await this.process("OPTIONS", path, options);
  }

  /** @internal */
  _integrationSession: this | null;

  get integrationSession(): this {
    return (this._integrationSession ??= this.createSession(this.app));
  }

  /**
   * @internal
   * @missingRailsCall new — CONVERGEABLE integration-runner-merged-into-session
   */
  createSession(app: unknown): this {
    const session = this.constructor as typeof IntegrationTest;
    let klass = APP_SESSIONS.get(app);
    if (klass === undefined || Object.getPrototypeOf(klass) !== session) {
      klass = class extends session {};
      klass.prototype.constructor = session;
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
    Object.setPrototypeOf(this, klass.prototype);
    return this;
  }

  /** @internal */
  removeBang(): void {
    this.resetBang();
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
  copySessionVariablesBang(): void {}

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
          !Object.hasOwn(receiver, "_integrationSession")
        ) {
          return Reflect.get(target, prop, receiver);
        }
        if (Reflect.has(receiver.integrationSession, prop)) {
          return Reflect.get(receiver.integrationSession, prop, receiver);
        } else {
          return Reflect.get(target, prop, receiver);
        }
      },
    }),
  );
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include TestProcess` and `include TestProcess::FixtureFile` (`actionpack/lib/action_dispatch/testing/integration.rb:95,651`); the class/interface merge is how a mixin surfaces on the type side. */
export interface IntegrationTest
  extends
    Omit<Included<typeof TestProcess>, "cookies">,
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
