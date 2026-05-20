/**
 * ActionDispatch::Assertions::RoutingAssertions — `this`-typed port of
 * Rails' `assertions/routing.rb`. Class-level `with_routing` (via
 * Minitest setup/teardown) and the `WithIntegrationRouting` flavour are
 * deferred until integration-session cloning is ported; Ruby's
 * `method_missing` named-route forwarding has no TS equivalent.
 */

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

/** Mirrors Rails' `%r{://}` test for "is this a full URL, not a path?" */
const URL_FORM_RE = /:\/\//;

/** Initialises `@routes`. Mirrors Rails' `setup`. Call from your own setup. */
export function setup(this: RoutingAssertionsHost): void {
  if (this.routes == null) this.routes = undefined;
}

/**
 * Temporarily replaces `this.routes` with a fresh RouteSet, yields it to
 * `block`, and restores the previous routes (and controller) on exit.
 * Mirrors Rails' instance-level `with_routing`. `config` is accepted for
 * parity and forwarded to `createRoutes` (Rails passes it to
 * `RouteSet.new`, which trails doesn't yet wire).
 */
export function withRouting<T>(
  this: RoutingAssertionsHost,
  configOrBlock: unknown,
  block?: (routes: RouteSet) => T,
): T {
  let cb: (routes: RouteSet) => T;
  let config: unknown;
  if (typeof configOrBlock === "function") {
    cb = configOrBlock as (routes: RouteSet) => T;
  } else {
    config = configOrBlock;
    if (typeof block !== "function") {
      throw new TypeError("withRouting requires a callback block");
    }
    cb = block;
  }
  const oldRoutes = this.routes;
  const oldController = this.controller;
  // Mirrors Ruby's `ensure`: cleanup runs after the block's work has
  // completed. For sync blocks that's the synchronous return; for
  // Promise-returning blocks we defer until the promise settles so the
  // temporary RouteSet stays installed across `await` points.
  const restore = () => resetRoutes.call(this, oldRoutes, oldController);
  let result: T;
  try {
    result = createRoutes.call<RoutingAssertionsHost, [(r: RouteSet) => T, unknown], T>(
      this,
      cb,
      config,
    );
  } catch (e) {
    restore();
    throw e;
  }
  // Treat anything thenable as async (matches the check used in url-for.ts)
  // so cross-realm promises and library thenables don't fall through to the
  // synchronous restore path before their awaited work runs.
  if (result != null && typeof (result as { then?: unknown }).then === "function") {
    // Wrap the .then() call so a thenable that throws synchronously from
    // its then() still triggers restore — otherwise the temp RouteSet
    // would leak across tests.
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

/** Asserts that `path` recognizes to `expectedOptions`. */
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

/** Inverse of `assertRecognizes`. */
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
    // Rails: `URI.parse(expected_path).path` (falls back to "/" when empty).
    // Ruby's URI accepts relative inputs that contain `://` (e.g. inside a
    // query string), so use a base URL when WHATWG's absolute parse fails.
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
  // Null-prototype map so an extra key named `__proto__` becomes an own
  // property rather than hitting the inherited setter.
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

/** Combined `assertRecognizes` + `assertGenerates`. */
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
  const generateOptions: Options = {};
  for (const [k, v] of Object.entries(options)) {
    if (!Object.hasOwn(defaults, k)) generateOptions[k] = v;
  }
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
    // Rails uses Ruby's `URI.parse`, which is more permissive than
    // WHATWG `URL`: a relative path that happens to contain `://` (e.g.
    // `/items?next=http://example.com`) parses to a `URI::Generic` with
    // no scheme/host/port. Mirror that by attempting an absolute parse
    // first and falling back to a base URL when WHATWG rejects the input.
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
      // Rails: `request.port = uri.port if uri.port`. Ruby's URI yields
      // the default port for known schemes (80/443) and nil otherwise.
      // WHATWG URL returns "" for default ports, so reapply defaults for
      // http/https only and leave SERVER_PORT alone for other schemes.
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

/** @internal Mirrors Rails' private `create_routes`. */
export function createRoutes<T>(
  this: RoutingAssertionsHost,
  block: (routes: RouteSet) => T,

  _config?: unknown,
): T {
  const routes = new RouteSet();
  this.routes = routes;
  // Rails additionally clones `@controller` and mixes in `_routes.url_helpers`
  // (and `view_context_class`). That depends on singleton-class re-opening
  // which has no direct TS equivalent; consumers that need helpers on the
  // controller assign them explicitly.
  return block(routes);
}

/** @internal Mirrors Rails' private `reset_routes`. */
export function resetRoutes(
  this: RoutingAssertionsHost,
  oldRoutes: RouteSet | undefined,
  oldController: unknown,
): void {
  this.routes = oldRoutes;
  if (this.controller != null) this.controller = oldController;
}

/**
 * @internal Mirrors Rails' private `fail_on`. Runs `block`; if it throws
 * an instance of `ExceptionClass`, re-raises as an assertion error with
 * the caller-supplied `message` (or the original message when omitted).
 */
export function failOn<T>(
  ExceptionClass: new (...args: never[]) => Error,
  message: string | undefined,
  block: () => T,
): T {
  try {
    return block();
  } catch (e) {
    if (e instanceof ExceptionClass) {
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
  // Strict value comparison. Rails' `assert_recognizes` stringifies expected
  // option *keys* (`expected_options.stringify_keys!`) only; values in
  // `request.path_parameters` are URL-decoded strings, so an expected
  // `id: 1` is meant to fail against actual `id: "1"`.
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
