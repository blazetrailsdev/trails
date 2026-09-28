import {
  deleteIf,
  extend,
  hasKey,
  include,
  InvalidURIError,
  Module,
  rbObjClone,
  rbObjMethod,
  rbObjRespondTo,
  rbObjSingletonClass,
  URI,
  type Method,
} from "@blazetrails/ruby-compat";
import { Assertion, assertEqual, message } from "@blazetrails/activesupport";
import { RouteSet, type Config } from "../../routing/route-set.js";
import { RoutingError } from "../../../action-controller/metal/exceptions.js";
import { TestRequest } from "../../../action-controller/test-case.js";
import type { IntegrationTest } from "../integration.js";

export interface RoutingAssertionsHost {
  routes?: RouteSet;
  controller?: unknown;
}

export interface PathWithMethod {
  path: string;
  method?: string | null;
}

type Options = Record<string, unknown>;

const URL_FORM_RE = /:\/\//;

interface TestClass<H> {
  setup(...args: ((this: H) => void)[]): void;
  teardown(...args: ((this: H) => void)[]): void;
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby `module WithIntegrationRouting` (`testing/assertions/routing.rb:18`) nests its own `ClassMethods`; a namespace keeps both at their Rails names beside RoutingAssertions' same-named members.
export namespace WithIntegrationRouting {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- `WithIntegrationRouting::ClassMethods` (`routing.rb:21`).
  export namespace ClassMethods {
    export function withRouting(
      this: TestClass<IntegrationTest>,
      block: (routes: RouteSet) => unknown,
    ): void {
      let oldRoutes: RouteSet | undefined;
      let oldRoutesCallMethod: Method | undefined;
      let oldIntegrationSession: IntegrationTest | undefined;

      this.setup(function () {
        oldRoutes = (this.app as { routes: RouteSet }).routes;
        oldRoutesCallMethod = rbObjMethod(oldRoutes, "call");
        oldIntegrationSession = this.integrationSession;
        createRoutes.call(this, block);
      });

      this.teardown(function () {
        resetRoutes.call(this, oldRoutes!, oldRoutesCallMethod!, oldIntegrationSession!);
      });
    }
  }

  export function withRouting<T>(this: IntegrationTest, block: (routes: RouteSet) => T): T {
    const oldRoutes = (this.app as { routes: RouteSet }).routes;
    const oldRoutesCallMethod = rbObjMethod(oldRoutes, "call");
    const oldIntegrationSession = this.integrationSession;
    let result: T;
    try {
      result = createRoutes.call<IntegrationTest, [(r: RouteSet) => T], T>(this, block);
    } catch (e) {
      resetRoutes.call(this, oldRoutes, oldRoutesCallMethod, oldIntegrationSession);
      throw e;
    }
    if (typeof (result as { then?: unknown } | null)?.then === "function") {
      return Promise.resolve(result).finally(() =>
        resetRoutes.call(this, oldRoutes, oldRoutesCallMethod, oldIntegrationSession),
      ) as T;
    }
    resetRoutes.call(this, oldRoutes, oldRoutesCallMethod, oldIntegrationSession);
    return result;
  }

  /** @internal */
  export function createRoutes<T>(this: IntegrationTest, block: (routes: RouteSet) => T): T {
    const app = this.app as { routes: RouteSet };
    const routes = new RouteSet();

    this._originalRoutes ??= app.routes;
    const routesCallMethod = rbObjMethod(routes, "call");
    (rbObjSingletonClass(this._originalRoutes).prototype as { call: unknown }).call = (
      ...args: unknown[]
    ) => routesCallMethod.call(...args);

    const https = this.integrationSession.isHttps();
    const host = this.integrationSession.host;

    app.routes = routes;
    this.integrationSession.httpsBang(https);
    this.integrationSession.hostBang(host);
    this.routes = routes;

    return block(routes);
  }

  /** @internal */
  export function resetRoutes(
    this: IntegrationTest,
    oldRoutes: RouteSet,
    oldRoutesCallMethod: Method,
    _oldIntegrationSession: IntegrationTest,
  ): void {
    (this.app as { routes: RouteSet }).routes = oldRoutes;
    (rbObjSingletonClass(this._originalRoutes!).prototype as { call: unknown }).call = (
      ...args: unknown[]
    ) => oldRoutesCallMethod.call(...args);
    this.routes = oldRoutes;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- `RoutingAssertions::ClassMethods` (`routing.rb:79`), whose `with_routing` shares its name with the instance method.
export namespace ClassMethods {
  export function withRouting(
    this: TestClass<RoutingAssertionsHost>,
    block: (routes: RouteSet) => unknown,
  ): void {
    let oldRoutes: RouteSet | undefined;
    let oldController: unknown;

    this.setup(function () {
      [oldRoutes, oldController] = [this.routes, this.controller];
      createRoutes.call(this, null, block);
    });

    this.teardown(function () {
      resetRoutes.call(this, oldRoutes, oldController);
    });
  }
}

export function setup(this: RoutingAssertionsHost): void {
  if (this.routes == null) this.routes = undefined;
}

export function withRouting<T>(
  this: RoutingAssertionsHost,
  config: Config | null | ((routes: RouteSet) => T),
  block?: (routes: RouteSet) => T,
): T {
  if (typeof config === "function") [config, block] = [null, config];
  const [oldRoutes, oldController] = [this.routes, this.controller];
  let result: T;
  try {
    result = createRoutes.call<RoutingAssertionsHost, [Config | null, (r: RouteSet) => T], T>(
      this,
      config,
      block!,
    );
  } catch (e) {
    resetRoutes.call(this, oldRoutes, oldController);
    throw e;
  }
  if (typeof (result as { then?: unknown } | null)?.then === "function") {
    return Promise.resolve(result).finally(() =>
      resetRoutes.call(this, oldRoutes, oldController),
    ) as T;
  }
  resetRoutes.call(this, oldRoutes, oldController);
  return result;
}

export function assertRecognizes(
  this: RoutingAssertionsHost,
  expectedOptions: Options,
  path: string | PathWithMethod,
  extras: Options = {},
  msg?: string,
): void {
  if (typeof path !== "string" && String(path.method ?? "") === "all") {
    for (const method of ["get", "post", "put", "delete"] as const) {
      assertRecognizes.call(this, expectedOptions, { ...path, method }, extras, msg);
    }
    return;
  }
  const request = recognizedRequestFor.call(this, path, extras, msg);

  expectedOptions = { ...expectedOptions };

  assertEqual(
    expectedOptions,
    request.pathParameters,
    message(
      msg ?? null,
      "",
      () =>
        `The recognized options <${inspect(request.pathParameters)}> did not match <${inspect(expectedOptions)}>, difference:`,
    ),
  );
}

export function assertGenerates(
  this: RoutingAssertionsHost,
  expectedPath: string,
  options: Options,
  defaults: Options = {},
  extras: Options = {},
  message?: string,
): void {
  let path: string;
  if (URL_FORM_RE.test(expectedPath)) {
    path = failOn(InvalidURIError, message, () => {
      const uri = URI.parse(expectedPath);
      return String(uri.path ?? "") === "" ? "/" : uri.path!;
    });
  } else {
    path = expectedPath.startsWith("/") ? expectedPath : `/${expectedPath}`;
  }
  const routes = requireRoutes(this);
  const opts = { ...options };
  const [generatedPath, queryStringKeys] = routes.generateExtras(opts, defaults);
  const foundExtras = Object.fromEntries(
    Object.entries(opts).filter(([k]) => queryStringKeys.includes(k)),
  );
  let msg = message ?? `found extras <${inspect(foundExtras)}>, not <${inspect(extras)}>`;
  assertEqual(extras, foundExtras, msg);

  msg = message ?? `The generated path <${generatedPath}> did not match <${path}>`;
  assertEqual(path, generatedPath, msg);
}

export function assertRouting(
  this: RoutingAssertionsHost,
  path: string | PathWithMethod,
  options: Options,
  defaults: Options = {},
  extras: Options = {},
  message?: string,
): void {
  assertRecognizes.call(this, options, path, extras, message);
  const controller = options["controller"];
  const defaultController = defaults["controller"];
  if (
    typeof controller === "string" &&
    controller.includes("/") &&
    typeof defaultController === "string" &&
    defaultController.includes("/")
  ) {
    options = { ...options, controller: `/${controller}` };
  }
  const generateOptions = deleteIf({ ...options }, (k) => hasKey(defaults, k));
  const pathStr = typeof path === "string" ? path : path.path;
  assertGenerates.call(this, pathStr, generateOptions, defaults, extras, message);
}

/** @internal */
export function recognizedRequestFor(
  this: RoutingAssertionsHost,
  path: string | PathWithMethod,
  extras: Options = {},
  msg?: string,
): TestRequest {
  const method = typeof path === "string" ? "get" : String(path.method ?? "get");
  let pathStr = typeof path === "string" ? path : path.path;

  const controller = this.controller;
  const request = TestRequest.create((controller as object | undefined)?.constructor);
  if (URL_FORM_RE.test(pathStr)) {
    failOn(InvalidURIError, msg, () => {
      const uri = URI.parse(pathStr);
      request.env["rack.url_scheme"] = uri.scheme ?? "http";
      if (uri.host != null) request.host = uri.host;
      if (uri.port != null) request.port = uri.port;
      request.path = String(uri.path ?? "") === "" ? "/" : uri.path!;
    });
  } else {
    if (!pathStr.startsWith("/")) pathStr = `/${pathStr}`;
    request.path = pathStr;
  }
  request.env["REQUEST_METHOD"] = method.toUpperCase();

  const params = failOn(RoutingError, msg, () =>
    requireRoutes(this).recognizePath(pathStr, { method, extras }),
  );
  request.pathParameters = params;
  return request;
}

/** @internal */
export function createRoutes<T>(
  this: RoutingAssertionsHost,
  config: Config | null,
  block: (routes: RouteSet) => T,
): T {
  this.routes = new RouteSet(config ?? RouteSet.DEFAULT_CONFIG);
  if (this.controller != null) {
    this.controller = rbObjClone(this.controller as object);
    const _routes = this.routes;

    include(
      rbObjSingletonClass(this.controller as object) as new () => object,
      _routes.urlHelpers(),
    );

    if (rbObjRespondTo(this.controller, "viewContextClass")) {
      const viewContextClass = class extends (
        this.controller as { viewContextClass(): new (...args: never[]) => object }
      ).viewContextClass() {};
      include(viewContextClass, _routes.urlHelpers());

      const customViewContext = new Module((mod) => {
        mod.defineMethod("viewContextClass", () => viewContextClass);
      });
      extend(this.controller as object, customViewContext);
    }
  }
  return block(this.routes);
}

/** @internal */
export function resetRoutes(
  this: RoutingAssertionsHost,
  oldRoutes: RouteSet | undefined,
  oldController: unknown,
): void {
  this.routes = oldRoutes;
  if (this.controller != null) {
    this.controller = oldController;
  }
}

/** @internal */
export function failOn<T>(
  exceptionClass: new (...args: never[]) => Error,
  message: string | undefined,
  block: () => T,
): T {
  try {
    return block();
  } catch (e) {
    if (e instanceof exceptionClass) {
      throw new Assertion(message ?? e.message);
    }
    throw e;
  }
}

function requireRoutes(host: RoutingAssertionsHost): RouteSet {
  if (!host.routes) {
    throw new Error("No routes available — set `this.routes` to a RouteSet first.");
  }
  return host.routes;
}

const inspect = (v: unknown): string => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
