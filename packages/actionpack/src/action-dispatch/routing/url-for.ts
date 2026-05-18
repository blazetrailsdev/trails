/**
 * ActionDispatch::Routing::UrlFor
 *
 * Mirrors `action_dispatch/routing/url_for.rb`. Provides the `urlFor` /
 * `fullUrlFor` / `routeFor` instance methods that hosts (controllers,
 * mailers, `Rails.application.routes.urlHelpers`) mix in via the
 * `this`-typed function pattern.
 *
 * @see https://api.rubyonrails.org/classes/ActionDispatch/Routing/UrlFor.html
 */

import { NO_ROUTES_MESSAGE } from "../../abstract-controller/url-for.js";
import { Parameters } from "../../action-controller/metal/strong-parameters.js";
import type { PolymorphicMappingEntry } from "./polymorphic-routes.js";

// Re-export the PolymorphicRoutes mixin functions. Rails: `module UrlFor;
// include PolymorphicRoutes`. The functions are `this`-typed and hosts attach
// them via the module-mixin pattern (see routes-proxy.ts).
export {
  polymorphicUrl,
  polymorphicPath,
  editPolymorphicUrl,
  editPolymorphicPath,
  newPolymorphicUrl,
  newPolymorphicPath,
  polymorphicUrlForAction,
  polymorphicPathForAction,
  polymorphicMapping,
} from "./polymorphic-routes.js";

/**
 * The minimal RouteSet surface UrlFor calls into. Matches Rails'
 * `_routes.url_for(options, route_name)` shape (see vendor
 * `routing/route_set.rb#url_for`). The existing trails `RouteSet.urlFor`
 * has a different positional signature (`urlFor(routeName, params,
 * options)`) and is not yet plug-compatible — adapting it is tracked as
 * a follow-up; hosts must wrap their `RouteSet` until then.
 */
export interface UrlForRoutes {
  urlFor(options: Record<string, unknown>, routeName?: string | null): string;
  optimizeRoutesGeneration?(): boolean;
  /**
   * Rails' UrlFor includes PolymorphicRoutes, whose helpers read
   * `_routes.polymorphic_mappings`. Optional here so existing test doubles
   * keep working; `polymorphicUrl`/`polymorphicPath` treat a missing map as
   * "no custom direct routes".
   */
  polymorphicMappings?: Map<string, PolymorphicMappingEntry>;
}

export interface UrlForHost {
  /** @internal Rails: `@_routes` */
  _routes: UrlForRoutes | null;
  defaultUrlOptions: Record<string, unknown>;
  urlOptions(): Record<string, unknown>;
  /**
   * Provided by `PolymorphicRoutes`, which Rails' `UrlFor` includes. Hosts
   * that include the polymorphic mixin must implement this; the array
   * branch of `fullUrlFor` delegates here.
   */
  polymorphicUrl?(record: unknown, options: Record<string, unknown>): string;
}

/**
 * Rails: `def initialize(...); @_routes = nil; super; end`.
 * Call this from a host constructor to mirror that hook.
 */
export function initialize(this: UrlForHost): void {
  this._routes = null;
}

/**
 * Hook overridden in controllers to add request information. Application
 * logic should not go into urlOptions.
 */
export function urlOptions(this: UrlForHost): Record<string, unknown> {
  return this.defaultUrlOptions;
}

/**
 * Generate a URL based on the options provided, `defaultUrlOptions`, and
 * the routes defined in `config/routes.rb`. Delegates to `fullUrlFor`.
 */
export function urlFor(this: UrlForHost, options?: UrlForOptions): string {
  return fullUrlFor.call(this, options);
}

export type UrlForOptions =
  | null
  | undefined
  | string
  | symbol
  | unknown[]
  | Record<string, unknown>
  // Rails dispatch matches `Class` and arbitrary models in addition to the
  // explicit `Hash`/`Array`/`String`/`Symbol` cases; widening to `object`
  // and any function lets callers pass model instances and class refs
  // without casting (the unsupported branches throw at runtime).
  | object
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  | Function;

/** @internal */
export function fullUrlFor(this: UrlForHost, options?: UrlForOptions): string {
  if (options == null) {
    return requireRoutes(this).urlFor({ ...this.urlOptions() });
  }
  if (typeof options === "string") {
    return options;
  }
  if (Array.isArray(options)) {
    const components = [...options];
    const opts = extractOptions(components);
    if (typeof this.polymorphicUrl !== "function") {
      throw new Error("urlFor(Array) requires PolymorphicRoutes#polymorphicUrl on the host.");
    }
    return this.polymorphicUrl(components, opts);
  }
  const asHash = coerceHashOrParameters(options);
  if (asHash) {
    const hash = { ...asHash };
    const rawRouteName = hash["use_route"];
    delete hash["use_route"];
    const merged = { ...this.urlOptions(), ...hash };
    // Rails accepts `use_route: :name` (Symbol). In TS we accept both strings
    // and JS symbols; symbols carry their name in `description`.
    const routeName =
      rawRouteName == null
        ? null
        : typeof rawRouteName === "symbol"
          ? (rawRouteName.description ?? null)
          : String(rawRouteName);
    return requireRoutes(this).urlFor(merged, routeName);
  }
  // Symbol / Function / model — Rails delegates to HelperMethodBuilder.url
  // (in route_set.rb), which is not yet ported. Mirror the dispatch shape
  // so callers see the right surface area.
  throw new Error(
    `urlFor(${typeof options}) requires HelperMethodBuilder (not yet ported from route_set.rb)`,
  );
}

/**
 * Allows calling direct or regular named route.
 *
 *     threadable_path(threadable)  // => "/buckets/1"
 *     threadable_url(threadable)   // => "http://example.com/buckets/1"
 */
export function routeFor(this: UrlForHost, name: string, ...args: unknown[]): string {
  // Rails: `public_send(:"#{name}_url", *args)`. Helper names generated by
  // `generateRouteHelpers` are snake_case `${name}_url`.
  const helper = `${name}_url`;
  const fn = (this as unknown as Record<string, unknown>)[helper];
  if (typeof fn !== "function") {
    throw new Error(`No url helper "${helper}" defined`);
  }
  return (fn as (...a: unknown[]) => string).apply(this, args);
}

/** @internal Rails: `protected def optimize_routes_generation?` */
export function optimizeRoutesGeneration(this: UrlForHost): boolean {
  const routes = requireRoutes(this);
  return (
    (routes.optimizeRoutesGeneration?.() ?? true) &&
    Object.keys(this.defaultUrlOptions).length === 0
  );
}

/**
 * Rails: `private def _with_routes(routes) ... ensure ... end`. The block
 * **must be synchronous** — Rails uses `ensure` around a `yield`. Passing
 * an `async () => ...` block will restore `_routes` before the awaited
 * work runs and is unsupported; an async-aware variant would have to be
 * a separate API.
 * @internal
 */
export function _withRoutes<T>(
  this: UrlForHost,
  routes: UrlForRoutes,
  block: () => Exclude<T, Promise<unknown>>,
): Exclude<T, Promise<unknown>> {
  // Pre-call guard: an async function executes synchronously up to its
  // first `await` and schedules its continuation, so detecting a Promise
  // *after* `block()` returns is too late — the continuation still runs
  // after `_routes` is restored in `finally`. Reject before invocation.
  if (block.constructor?.name === "AsyncFunction") {
    throw new Error(
      "_withRoutes block must be synchronous; got an AsyncFunction. Use an async-aware helper instead.",
    );
  }
  const old = this._routes;
  this._routes = routes;
  try {
    const result = block();
    if (result != null && typeof (result as { then?: unknown }).then === "function") {
      throw new Error(
        "_withRoutes block must be synchronous; got a Promise. Use an async-aware helper instead.",
      );
    }
    return result;
  } finally {
    this._routes = old;
  }
}

/** @internal Rails: `private def _routes_context` */
export function _routesContext(this: UrlForHost): UrlForHost {
  return this;
}

/** @internal */
function requireRoutes(host: UrlForHost): UrlForRoutes {
  if (!host._routes) {
    throw new Error(NO_ROUTES_MESSAGE);
  }
  return host._routes;
}

/** @internal Plain-object check (proto null or Object.prototype). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Rails: `case options when Hash, ActionController::Parameters`. Treats both
 * plain hashes and `Parameters` instances as the hash branch. For
 * `Parameters` we call `toH()` (Rails: `options.to_h`), preserving the
 * permitted/unpermitted error semantics.
 * @internal
 */
function coerceHashOrParameters(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value)) return value;
  if (value instanceof Parameters) return value.toH();
  return null;
}

/** @internal Rails: `Array#extract_options!` — pops a trailing options hash. */
function extractOptions(arr: unknown[]): Record<string, unknown> {
  const last = arr[arr.length - 1];
  if (isPlainObject(last)) {
    arr.pop();
    return last;
  }
  return {};
}
