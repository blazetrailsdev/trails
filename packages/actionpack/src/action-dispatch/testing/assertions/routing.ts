import { deleteIf, hasKey } from "@blazetrails/ruby-compat";
import { RouteSet } from "../../routing/route-set.js";
import { RoutingError } from "../../../action-controller/metal/exceptions.js";
import { TestRequest } from "../test-request.js";

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

export function setup(this: RoutingAssertionsHost): void {
  if (this.routes == null) this.routes = undefined;
}

export function withRouting<T>(
  this: RoutingAssertionsHost,
  config: unknown,
  block?: (routes: RouteSet) => T,
): T {
  let cb: (routes: RouteSet) => T;
  let configHash: unknown;
  if (typeof config === "function") {
    cb = config as (routes: RouteSet) => T;
  } else {
    configHash = config;
    if (typeof block !== "function") {
      throw new TypeError("withRouting requires a callback block");
    }
    cb = block;
  }
  const oldRoutes = this.routes;
  const oldController = this.controller;
  const restore = () => resetRoutes.call(this, oldRoutes, oldController);
  let result: T;
  try {
    result = createRoutes.call<RoutingAssertionsHost, [(r: RouteSet) => T, unknown], T>(
      this,
      cb,
      configHash,
    );
  } catch (e) {
    restore();
    throw e;
  }
  if (result != null && typeof (result as { then?: unknown }).then === "function") {
    try {
      return (result as unknown as PromiseLike<unknown>).then(
        (v) => {
          restore();
          return v;
        },
        (e) => {
          restore();
          throw e;
        },
      ) as T;
    } catch (e) {
      restore();
      throw e;
    }
  }
  restore();
  return result;
}

export function assertRecognizes(
  this: RoutingAssertionsHost,
  expectedOptions: Options,
  path: string | PathWithMethod,
  extras: Options = {},
  msg?: string,
): void {
  if (typeof path !== "string" && String(path.method ?? "").toLowerCase() === "all") {
    for (const method of ["get", "post", "put", "delete"] as const) {
      assertRecognizes.call(this, expectedOptions, { ...path, method }, extras, msg);
    }
    return;
  }
  const request = recognizedRequestFor.call(this, path, extras, msg);
  const expected = { ...expectedOptions };
  const actual = request.pathParameters as unknown as Options;
  if (!deepEqual(expected, actual)) {
    throw new Error(
      msg ??
        `The recognized options <${inspect(actual)}> did not match <${inspect(expected)}>, difference:`,
    );
  }
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
    path = failOn(TypeError, message, () => {
      let parsed: URL;
      try {
        parsed = new URL(expectedPath);
      } catch {
        parsed = new URL(expectedPath, "http://localhost");
      }
      return parsed.pathname === "" ? "/" : parsed.pathname;
    });
  } else {
    path = expectedPath.startsWith("/") ? expectedPath : `/${expectedPath}`;
  }
  const routes = requireRoutes(this);
  const opts = { ...options };
  const [generatedPath, queryStringKeys] = routes.generateExtras(opts, defaults);
  const foundExtras: Options = Object.create(null);
  for (const k of queryStringKeys) {
    if (Object.hasOwn(opts, k)) foundExtras[k] = opts[k];
  }
  if (!deepEqual(extras, foundExtras)) {
    throw new Error(message ?? `found extras <${inspect(foundExtras)}>, not <${inspect(extras)}>`);
  }
  if (generatedPath !== path) {
    throw new Error(message ?? `The generated path <${generatedPath}> did not match <${path}>`);
  }
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

  const request = new TestRequest();
  if (URL_FORM_RE.test(pathStr)) {
    let parsed: URL;
    let isAbsolute = true;
    try {
      parsed = new URL(pathStr);
    } catch {
      isAbsolute = false;
      parsed = failOn(TypeError, msg, () => new URL(pathStr, "http://localhost"));
    }
    if (isAbsolute) {
      const scheme = parsed.protocol.replace(/:$/, "");
      request.env["rack.url_scheme"] = scheme;
      if (parsed.host) request.env["HTTP_HOST"] = parsed.host;
      if (parsed.hostname) request.env["SERVER_NAME"] = parsed.hostname;
      if (parsed.port) {
        request.env["SERVER_PORT"] = parsed.port;
      } else if (scheme === "https") {
        request.env["SERVER_PORT"] = "443";
      } else if (scheme === "http") {
        request.env["SERVER_PORT"] = "80";
      }
    }
    pathStr = parsed.pathname || "/";
  } else if (!pathStr.startsWith("/")) {
    pathStr = `/${pathStr}`;
  }
  request.env["PATH_INFO"] = pathStr;
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
  block: (routes: RouteSet) => T,

  _config?: unknown,
): T {
  const routes = new RouteSet();
  this.routes = routes;
  return block(routes);
}

/** @internal */
export function resetRoutes(
  this: RoutingAssertionsHost,
  oldRoutes: RouteSet | undefined,
  oldController: unknown,
): void {
  this.routes = oldRoutes;
  if (this.controller != null) this.controller = oldController;
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
      throw new Error(message ?? e.message, { cause: e });
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

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ao = a as Options;
  const bo = b as Options;
  const ak = Object.keys(ao);
  if (ak.length !== Object.keys(bo).length) return false;
  for (const k of ak) {
    if (!Object.hasOwn(bo, k) || !deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

const inspect = (v: unknown): string => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
