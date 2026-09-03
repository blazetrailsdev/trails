import { Request } from "../http/request.js";
import { Response } from "../http/response.js";
import { TestSession } from "../../action-controller/test-case.js";
import { Parameters } from "../../action-controller/metal/strong-parameters.js";
import { CookieJar } from "../middleware/cookies.js";
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
import { buildNestedQuery } from "@blazetrails/rack";
import type { UploadedFile } from "../http/upload.js";

type ControllerClass = new () => Metal;

export interface IntegrationRequestOptions {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: string;
  format?: string;
  xhr?: boolean;
  env?: Record<string, unknown>;
  as?: string;
}

const STATUS_RANGES: Record<string, [number, number]> = {
  success: [200, 299],
  redirect: [300, 399],
  missing: [400, 499],
  error: [500, 599],
};

const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const DEFAULT_HOST = "www.example.com";

/** @internal */
function splitHostPort(host: string): [string, string | undefined] {
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close === -1) return [host, undefined];
    const rest = host.slice(close + 1);
    return [host.slice(0, close + 1), rest.startsWith(":") ? rest.slice(1) : undefined];
  }
  const colons = (host.match(/:/g) ?? []).length;
  if (colons > 1) return [host, undefined];
  const idx = host.indexOf(":");
  return idx === -1 ? [host, undefined] : [host.slice(0, idx), host.slice(idx + 1)];
}
const DEFAULT_REMOTE_ADDR = "127.0.0.1";
const DEFAULT_ACCEPT =
  "text/xml,application/xml,application/xhtml+xml," +
  "text/html;q=0.9,text/plain;q=0.8,image/png," +
  "*/*;q=0.5";

export class IntegrationTest {
  routes: RouteSet = new RouteSet();

  private controllers: Map<string, ControllerClass> = new Map();

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

  constructor() {
    this.resetBang();
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
      this._urlOptions = {
        ...this._defaultUrlOptions,
        host: this.host,
        protocol: this._https ? "https" : "http",
      };
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
    return this._routesOverride ?? this.routes._routes;
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
  buildExpandedPath(path: string, onLocation?: (url: URL) => void): string {
    if (!ABSOLUTE_URL_RE.test(path)) return path;
    const location = new URL(path);
    onLocation?.(location);
    return location.search ? `${location.pathname}${location.search}` : location.pathname;
  }

  async process(
    method: string,
    path: string,
    options: IntegrationRequestOptions = {},
  ): Promise<number> {
    let expanded = path;
    if (ABSOLUTE_URL_RE.test(path)) {
      expanded = this.buildExpandedPath(path, (loc) => {
        this.httpsBang(loc.protocol === "https:");
        if (loc.host) this.host = loc.host;
      });
    }
    await this._processPath(method.toUpperCase(), expanded, options);
    return this.status;
  }

  async followRedirectBang(options: IntegrationRequestOptions = {}): Promise<number> {
    if (!this.response || this.status < 300 || this.status >= 400) {
      throw new Error(`not a redirect! ${this.status}`);
    }
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

  private _mockSessionMemo?: MockSession;

  controller!: Metal;

  request!: Request;

  response!: Response;

  get status(): number {
    return this.response?.statusCode ?? this.controller?.status ?? 0;
  }

  get responseBody(): string {
    return this.response?.body ?? this.controller?.body ?? "";
  }

  get parsedBody(): unknown {
    return JSON.parse(this.responseBody);
  }

  get redirectUrl(): string | undefined {
    return this.response?.getHeader("location") ?? this.controller?.getHeader("location");
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
  get _mockSession(): MockSession {
    this._mockSessionMemo ??= new MockSession(this.app, this.host);
    return this._mockSessionMemo;
  }

  registerController(name: string, klass: ControllerClass): void {
    this.controllers.set(name, klass);
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
    sess.controllers = this.controllers;
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
  beforeSetup(): void {
    this._app = undefined;
  }

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

  static app: unknown = null;

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
  declare withRouting: typeof routingAssertions.withRouting;
  /** @internal */
  declare createRoutes: typeof routingAssertions.createRoutes;
  /** @internal */
  declare resetRoutes: typeof routingAssertions.resetRoutes;
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

  assertResponse(expected: number | string): void {
    const actual = this.status;
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
    const location = this.redirectUrl;
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

  private async _processPath(
    method: string,
    path: string,
    options: IntegrationRequestOptions,
  ): Promise<void> {
    this.requestCount += 1;
    this._urlOptions = undefined;
    this._htmlDocument?.dispose();
    this._htmlDocument = undefined;

    const qIdx = path.indexOf("?");
    const pathInfo = qIdx >= 0 ? path.slice(0, qIdx) : path;
    let queryString = qIdx >= 0 ? path.slice(qIdx + 1) : "";
    if (options.params && (method === "GET" || method === "HEAD")) {
      const extra = buildNestedQuery(options.params);
      if (extra) queryString = queryString ? `${queryString}&${extra}` : extra;
    }
    const matched = this.routes.recognize(method, pathInfo);
    if (!matched) {
      const [noRouteHostname, noRoutePort] = splitHostPort(this.host);
      const noRouteEnv: Record<string, unknown> = {
        REQUEST_METHOD: method,
        PATH_INFO: pathInfo,
        QUERY_STRING: queryString,
        HTTP_HOST: this.host,
        SERVER_NAME: noRouteHostname,
        SERVER_PORT: noRoutePort ?? (this._https ? "443" : "80"),
        HTTPS: this._https ? "on" : "off",
        "rack.url_scheme": this._https ? "https" : "http",
        REMOTE_ADDR: this.remoteAddr,
        HTTP_ACCEPT: this.accept,
        ...(options.env ?? {}),
      };
      const noRouteCookieHeader = this._mockSession.httpCookie();
      if (noRouteCookieHeader !== undefined) {
        noRouteEnv.HTTP_COOKIE = noRouteCookieHeader;
      }
      if (options.headers) {
        for (const [name, value] of Object.entries(options.headers)) {
          const envKey = name.startsWith("HTTP_")
            ? name
            : "HTTP_" + name.toUpperCase().replace(/-/g, "_");
          noRouteEnv[envKey] = value;
        }
      }
      if (options.body) {
        noRouteEnv["rack.input"] = options.body;
      }
      noRouteEnv.REQUEST_URI = this.buildFullUri(
        (noRouteEnv.PATH_INFO as string) +
          (noRouteEnv.QUERY_STRING ? `?${noRouteEnv.QUERY_STRING as string}` : ""),
        noRouteEnv,
      );
      this.request = new Request(noRouteEnv);
      this.response = new Response();
      this.response.status = 404;
      this.response.body = `No route matches [${method}] "${pathInfo}"`;
      this.controller = undefined!;
      return;
    }

    const { route, params } = matched;
    const controllerName = route.controller;
    const action = route.action;

    const ControllerClass = this.controllers.get(controllerName);
    if (!ControllerClass) {
      throw new Error(
        `No controller registered for "${controllerName}". ` +
          `Call registerController("${controllerName}", YourController) first.`,
      );
    }

    const sessionSeed = { ...this.session };
    const [hostname, port] = splitHostPort(this.host);
    const env: Record<string, unknown> = {
      REQUEST_METHOD: method,
      PATH_INFO: pathInfo,
      QUERY_STRING: queryString,
      HTTP_HOST: this.host,
      SERVER_NAME: hostname,
      SERVER_PORT: port ?? (this._https ? "443" : "80"),
      HTTPS: this._https ? "on" : "off",
      "rack.url_scheme": this._https ? "https" : "http",
      REMOTE_ADDR: this.remoteAddr,
      HTTP_ACCEPT: this.accept,
      "rack.session": new TestSession(sessionSeed),
      "action_dispatch.request.path_parameters": {
        controller: controllerName,
        action,
        ...params,
      },
      ...(options.env ?? {}),
    };
    const finalPath =
      (env.PATH_INFO as string) + (env.QUERY_STRING ? `?${env.QUERY_STRING as string}` : "");
    env.REQUEST_URI = this.buildFullUri(finalPath, env);

    const cookieHeader = this._mockSession.httpCookie();
    if (cookieHeader !== undefined) {
      env.HTTP_COOKIE = cookieHeader;
    }

    if (options.format || options.as) {
      const fmt = options.format ?? options.as;
      env.HTTP_ACCEPT = formatToMime(fmt!);
      if (fmt === "json" && (method === "POST" || method === "PUT" || method === "PATCH")) {
        env.CONTENT_TYPE = "application/json";
      }
    }

    if (options.xhr) {
      env.HTTP_X_REQUESTED_WITH = "XMLHttpRequest";
    }

    if (options.headers) {
      for (const [name, value] of Object.entries(options.headers)) {
        const envKey = name.startsWith("HTTP_")
          ? name
          : "HTTP_" + name.toUpperCase().replace(/-/g, "_");
        env[envKey] = value;
      }
    }

    if (options.body) {
      env["rack.input"] = options.body;
    } else if (options.params && options.as === "json" && method !== "GET" && method !== "HEAD") {
      env["rack.input"] = JSON.stringify(options.params);
    }

    this.request = new Request(env);
    this.response = new Response();

    const allParams: Record<string, unknown> = { ...params };
    if (env.QUERY_STRING) {
      Object.assign(allParams, this.request.queryParameters);
    }
    if (options.params) {
      Object.assign(allParams, options.params);
    }
    (this.request as any).parameters = new Parameters(
      Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, v])),
    );

    this.controller = new ControllerClass();

    await this.controller.dispatch(action, this.request, this.response);

    const committed = (env["rack.session"] as TestSession).toHash();
    for (const key of Object.keys(sessionSeed)) {
      if (!(key in committed)) delete this.session[key];
    }
    Object.assign(this.session, committed);

    const cookieJar = this._mockSession.cookieJar;
    const setCookies = this.response.getHeader("set-cookie");
    if (setCookies) {
      for (const cookie of setCookies.split(",")) {
        const parts = cookie.trim().split(";")[0];
        const eqIdx = parts.indexOf("=");
        if (eqIdx > 0) {
          const name = parts.slice(0, eqIdx).trim();
          const value = parts.slice(eqIdx + 1).trim();
          cookieJar.set(name, value);
        }
      }
    }

    cookieJar._request = this.request as unknown as CookieJar["_request"];

    const updatedCookieHeader = this._mockSession.httpCookie();
    if (updatedCookieHeader !== undefined) {
      this.request.env.HTTP_COOKIE = updatedCookieHeader;
    }
  }
}

class MockSession {
  readonly cookieJar: CookieJar = CookieJar.build(undefined, {});

  constructor(
    readonly app: unknown,
    readonly host: string,
  ) {}

  httpCookie(): string | undefined {
    const entries = Object.entries(this.cookieJar.toHash());
    if (entries.length === 0) return undefined;
    return entries.map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

const proto = IntegrationTest.prototype as unknown as Record<string, unknown>;
proto.assertRecognizes = routingAssertions.assertRecognizes;
proto.assertGenerates = routingAssertions.assertGenerates;
proto.assertRouting = routingAssertions.assertRouting;
proto.withRouting = routingAssertions.withRouting;
proto.createRoutes = routingAssertions.createRoutes;
proto.resetRoutes = routingAssertions.resetRoutes;
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
