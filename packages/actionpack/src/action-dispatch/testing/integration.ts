import { Request } from "../http/request.js";
import { Headers } from "../http/headers.js";
import { MimeType } from "../http/mime-type.js";
import {
  isPresent,
  reverseMergeBang,
  runLoadHooks,
  SetupAndTeardown,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import {
  HTTPS,
  URI,
  include,
  rbObjRespondTo,
  stringSplit,
  type Generic,
} from "@blazetrails/ruby-compat";
import { TestResponse } from "./test-response.js";
import { FlashHash } from "../middleware/flash.js";
import { RouteSet } from "../routing/route-set.js";
import type { Metal } from "../../action-controller/metal.js";
import {
  flash as testProcessFlash,
  redirectToUrl as testProcessRedirectToUrl,
  fileFixtureUpload as testProcessFileFixtureUpload,
  fixtureFileUpload as testProcessFixtureFileUpload,
  assigns as assignsFn,
  type TestProcessHost,
} from "./test-process.js";
import * as routingAssertions from "./assertions/routing.js";
import * as responseAssertions from "./assertions/response.js";
import { htmlDocument as parseHtmlDocument } from "./assertions.js";
import type { XmlDocument } from "@blazetrails/nokogiri";
import * as urlForMod from "../routing/url-for.js";
import * as polymorphicRoutes from "../routing/polymorphic-routes.js";
import type { UrlForRoutes } from "../routing/url-for.js";
import { RequestEncoder } from "./request-encoder.js";
import { ActionDispatch } from "../../namespaces.js";
import { Session as RackTestSession, type CookieJar } from "@blazetrails/rack-test";
import { DEFAULT_PORTS, type RackApp, type RackMiddleware } from "@blazetrails/rack";
import type { UploadedFile } from "@blazetrails/rack-test";
import { TestCase } from "@blazetrails/activesupport/test-case";

export interface IntegrationRequestOptions {
  params?: Record<string, unknown>;
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

export class IntegrationTest extends TestCase {
  routes: RouteSet = new RouteSet();

  session: Record<string, unknown> = {};

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

  constructor(name?: string) {
    super(name!);
    this.resetBang();
    const app = this.app as { routes?: unknown } | null;
    if (rbObjRespondTo(app, "routes") && app!.routes instanceof RouteSet) {
      const session = this.constructor as typeof IntegrationTest;
      let klass = APP_SESSIONS.get(app);
      if (klass === undefined || Object.getPrototypeOf(klass) !== session) {
        klass = class extends session {};
        klass.prototype.constructor = session;
        include(klass, app!.routes.urlHelpers());
        include(klass, app!.routes.mountedHelpers());
        APP_SESSIONS.set(app, klass);
      }
      Object.setPrototypeOf(this, klass.prototype);
    }
  }

  resetBang(): void {
    this.session = {};
    this._mockSessionMemo = undefined;
    this._htmlDocument?.dispose();
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
            MimeType.lookup("js").toString(),
            MimeType.lookup("html").toString(),
            MimeType.lookup("xml").toString(),
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
    this._htmlDocument?.dispose();
    this._htmlDocument = undefined;
    this._urlOptions = undefined;

    this.controller = this.request.controllerInstance as Metal;

    return response.status;
  }

  hostBang(host: string): void {
    this.host = host;
  }

  async followRedirectBang(options: IntegrationRequestOptions = {}): Promise<number> {
    if (!this.isRedirect) throw new Error(`not a redirect! ${this.status} ${this.statusMessage}`);
    const location = this.redirectUrl;
    if (!location) throw new Error("not a redirect! (no Location header)");

    const preserveVerb = this.status === 307 || this.status === 308;
    const method = preserveVerb
      ? ((this.request?.env?.REQUEST_METHOD as string | undefined)?.toLowerCase() ?? "get")
      : "get";

    const headers = { ...(options.headers ?? {}) };
    const hasReferer = Object.keys(headers).some(
      (k) => k === "HTTP_REFERER" || k.toLowerCase() === "referer",
    );
    if (!hasReferer && this.request) {
      const env = this.request.env as Record<string, string | undefined>;
      const qs = env.QUERY_STRING ? `?${env.QUERY_STRING}` : "";
      const prev =
        `${env["rack.url_scheme"] ?? "http"}://${env.HTTP_HOST ?? this.host}` +
        `${env.PATH_INFO ?? ""}${qs}`;
      headers["HTTP_REFERER"] = prev;
    }

    await this.process(method, location, { ...options, headers });
    return this.status;
  }

  private _mockSessionMemo?: RackTestSession;

  controller!: Metal;

  request!: Request;

  response!: TestResponse;

  get status(): number {
    return this.response?.statusCode ?? this.controller?.status ?? 0;
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

  get responseBody(): string {
    return this.response?.body ?? this.controller?.responseBody ?? "";
  }

  get parsedBody(): unknown {
    return JSON.parse(this.responseBody);
  }

  get redirectUrl(): string | undefined {
    return this.response?.getHeader("location") ?? this.controller?.headers.get("location");
  }

  get flash(): FlashHash {
    if (!this.request) return new FlashHash();
    return testProcessFlash.call(this as unknown as TestProcessHost);
  }

  get cookies(): CookieJar {
    return this._mockSession.cookieJar;
  }

  get redirectToUrl(): string | undefined {
    return testProcessRedirectToUrl.call(this as unknown as TestProcessHost);
  }

  get htmlDocument(): XmlDocument {
    if (!this._htmlDocument) {
      const mimeType = this.response?.getHeader("content-type") ?? undefined;
      this._htmlDocument = parseHtmlDocument(this.responseBody, mimeType);
    }
    return this._htmlDocument;
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

  async followRedirect(): Promise<void> {
    const location = this.redirectUrl;
    if (!location) {
      throw new Error("No redirect to follow (no Location header)");
    }
    await this.get(location);
  }

  get integrationSession(): this {
    return this;
  }

  /** @internal */
  createSession(app?: unknown): IntegrationTest {
    const Ctor = this.constructor as new () => IntegrationTest;
    const sess = new Ctor();
    sess.routes = this.routes;
    sess._app = app ?? this._app;
    return sess;
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
  get assertions(): number {
    return this.rootSession ? this.rootSession.assertions : (this._assertions ?? 0);
  }

  set assertions(value: number) {
    if (this.rootSession) this.rootSession.assertions = value;
    else this._assertions = value;
  }

  /** @internal */
  _assertions: number = 0;

  /** @internal */
  _htmlDocument?: XmlDocument;

  /** @internal */
  copySessionVariablesBang(): void {}

  /** @internal */
  async beforeSetup(): Promise<void> {
    this._app = undefined;
    await super.beforeSetup?.();
    SetupAndTeardown.beforeSetup.call(this);
  }

  /** @internal */
  async afterTeardown(
    test: Parameters<typeof SetupAndTeardown.afterTeardown>[0] = { failures: [] },
  ): Promise<void> {
    SetupAndTeardown.afterTeardown.call(this, test);
    await super.afterTeardown?.(test as never);
  }

  static override setup(this: object, ...args: FilterListEntry<object>[]): void {
    SetupAndTeardown.setup.call((this as { prototype: object }).prototype, ...args);
  }

  static override teardown(this: object, ...args: FilterListEntry<object>[]): void {
    SetupAndTeardown.teardown.call((this as { prototype: object }).prototype, ...args);
  }

  static withRouting = routingAssertions.WithIntegrationRouting.ClassMethods.withRouting;

  /** @internal */
  _originalRoutes?: RouteSet;

  setup(): void {
    routingAssertions.setup.call(this);
  }

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

  assigns(key?: string | symbol): never {
    return assignsFn.call(this as unknown as TestProcessHost, key);
  }

  fileFixtureUpload(path: string, mimeType?: string | null, binary: boolean = false): UploadedFile {
    return testProcessFileFixtureUpload.call(
      this as unknown as TestProcessHost,
      path,
      mimeType,
      binary,
    );
  }

  fixtureFileUpload(path: string, mimeType?: string | null, binary: boolean = false): UploadedFile {
    return testProcessFixtureFileUpload.call(
      this as unknown as TestProcessHost,
      path,
      mimeType,
      binary,
    );
  }

  inspect(): string {
    const url = this.request?.env?.REQUEST_URI ?? "(no request)";
    return `#<${this.constructor.name} ${url}>`;
  }

  // @internal
  declare assertRecognizes: typeof routingAssertions.assertRecognizes;
  declare assertGenerates: typeof routingAssertions.assertGenerates;
  declare assertRouting: typeof routingAssertions.assertRouting;
  declare withRouting: typeof routingAssertions.WithIntegrationRouting.withRouting;
  /** @internal */
  declare createRoutes: typeof routingAssertions.WithIntegrationRouting.createRoutes;
  /** @internal */
  declare resetRoutes: typeof routingAssertions.WithIntegrationRouting.resetRoutes;
  declare recognizedRequestFor: typeof routingAssertions.recognizedRequestFor;
  declare failOn: typeof routingAssertions.failOn;
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
  declare parameterize: typeof responseAssertions.parameterize;
  declare normalizeArgumentToRedirection: typeof responseAssertions.normalizeArgumentToRedirection;
  declare assertResponse: typeof responseAssertions.assertResponse;
  declare assertRedirectedTo: typeof responseAssertions.assertRedirectedTo;
  /** @internal */
  generateResponseMessage(expected: number | string, actual: number): string {
    return responseAssertions.generateResponseMessage(this, expected, actual);
  }
  /** @internal */
  responseBodyIfShort(): string {
    return responseAssertions.responseBodyIfShort(this);
  }
  /** @internal */
  exceptionIfPresent(): string {
    return responseAssertions.exceptionIfPresent(this);
  }
  /** @internal */
  locationIfRedirected(): string {
    return responseAssertions.locationIfRedirected(this);
  }
  /** @internal */
  codeWithName(codeOrName: number | string): string {
    return responseAssertions.codeWithName(codeOrName);
  }

  assertContentType(expected: string): void {
    const actual = this.response?.getHeader("content-type") ?? this.controller?.contentType ?? "";
    if (!actual.includes(expected)) {
      throw new Error(`Expected content type to include "${expected}", got "${actual}"`);
    }
  }

  assertHeader(name: string, expected: string | RegExp): void {
    const actual = this.response?.getHeader(name) ?? this.controller?.headers.get(name);
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

  reset(): void {
    this.resetBang();
  }
}

const proto = IntegrationTest.prototype as unknown as Record<string, unknown>;
proto.assertRecognizes = routingAssertions.assertRecognizes;
proto.assertGenerates = routingAssertions.assertGenerates;
proto.assertRouting = routingAssertions.assertRouting;
proto.withRouting = routingAssertions.WithIntegrationRouting.withRouting;
proto.createRoutes = routingAssertions.WithIntegrationRouting.createRoutes;
proto.resetRoutes = routingAssertions.WithIntegrationRouting.resetRoutes;
proto.recognizedRequestFor = routingAssertions.recognizedRequestFor;
proto.failOn = routingAssertions.failOn;
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
proto.parameterize = responseAssertions.parameterize;
proto.normalizeArgumentToRedirection = responseAssertions.normalizeArgumentToRedirection;
proto.assertResponse = responseAssertions.assertResponse;
proto.assertRedirectedTo = responseAssertions.assertRedirectedTo;
include(IntegrationTest, urlForMod.UrlFor);

SetupAndTeardown.prepended(IntegrationTest.prototype);

runLoadHooks("action_dispatch_integration_test", IntegrationTest);
