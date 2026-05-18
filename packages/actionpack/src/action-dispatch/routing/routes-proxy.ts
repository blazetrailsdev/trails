/**
 * ActionDispatch::Routing::RoutesProxy
 *
 * Mirrors `action_dispatch/routing/routes_proxy.rb`. A `RoutesProxy` wraps a
 * `RouteSet` together with a host scope (typically the application's main
 * `UrlFor` context) and forwards URL helper calls to a helpers module, with
 * the scope's `urlOptions` mixed in and the `scriptName` resolved relative
 * to the mount point.
 *
 * Rails uses `method_missing` to dispatch arbitrary helper calls; in TS we
 * use a `Proxy` so callers can write `proxy.usersUrl(1)` directly.
 *
 * @see https://api.rubyonrails.org/classes/ActionDispatch/Routing/RoutesProxy.html
 */
import {
  _routesContext,
  _withRoutes,
  editPolymorphicPath,
  editPolymorphicUrl,
  fullUrlFor,
  newPolymorphicPath,
  newPolymorphicUrl,
  optimizeRoutesGeneration,
  polymorphicMapping,
  polymorphicPath,
  polymorphicPathForAction,
  polymorphicUrl,
  polymorphicUrlForAction,
  routeFor,
  urlFor,
  type UrlForHost,
  type UrlForRoutes,
} from "./url-for.js";
import type { PolymorphicHost } from "./polymorphic-routes.js";

/** The minimal helpers-module surface RoutesProxy dispatches into. */
export type RoutesProxyHelpers = Record<string, unknown>;

/** Rails: `script_namer` is a callable taking `options` and returning a string. */
export type ScriptNamer = (options: Record<string, unknown>) => string;

/**
 * RoutesProxy instance shape. Indexed access surfaces forwarded helpers; the
 * named members mirror `attr_accessor :scope, :routes` plus `urlOptions`.
 */
export type RoutesProxyInstance = RoutesProxy & {
  [helper: string]: any;
};

export class RoutesProxy implements UrlForHost {
  scope: UrlForHost;
  routes: UrlForRoutes;
  /**
   * Rails: `UrlFor` declares `class_attribute :default_url_options` and
   * initializes it to `{}` in its `included` block. RoutesProxy inherits
   * that writable accessor — callers may set `proxy.defaultUrlOptions =
   * { host: "..." }` per-instance.
   */
  defaultUrlOptions: Record<string, unknown> = {};
  /** @internal Rails: `@helpers` */
  private _helpers: RoutesProxyHelpers;
  /** @internal Rails: `@script_namer` */
  private _scriptNamer: ScriptNamer | null;

  // UrlFor mixin (`include ActionDispatch::Routing::UrlFor` in Rails).
  // Attached as `this`-typed functions per CLAUDE.md module-mixin pattern.
  urlFor = urlFor;
  fullUrlFor = fullUrlFor;
  routeFor = routeFor;
  optimizeRoutesGeneration = optimizeRoutesGeneration;
  /** @internal Rails: `private def _with_routes` */
  _withRoutes = _withRoutes;
  /** @internal Rails: `private def _routes_context` */
  _routesContext = _routesContext;

  // PolymorphicRoutes mixin — Rails `UrlFor` `include`s it, so it's
  // transitively present on RoutesProxy. Attaching here makes the methods
  // visible on the instance for `api:compare` and direct callers.
  polymorphicUrl = polymorphicUrl;
  polymorphicPath = polymorphicPath;
  editPolymorphicUrl = editPolymorphicUrl;
  editPolymorphicPath = editPolymorphicPath;
  newPolymorphicUrl = newPolymorphicUrl;
  newPolymorphicPath = newPolymorphicPath;
  /** @internal Rails-private helper. */
  polymorphicUrlForAction = polymorphicUrlForAction;
  /** @internal Rails-private helper. */
  polymorphicPathForAction = polymorphicPathForAction;
  /** @internal Rails-private helper. */
  polymorphicMapping = (record: unknown) =>
    polymorphicMapping(this as unknown as PolymorphicHost, record);

  constructor(
    routes: UrlForRoutes,
    scope: UrlForHost,
    helpers: RoutesProxyHelpers,
    scriptNamer: ScriptNamer | null = null,
  ) {
    this.routes = routes;
    this.scope = scope;
    this._helpers = helpers;
    this._scriptNamer = scriptNamer;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !(prop in target)) {
          const fn = target._helpers[prop];
          if (typeof fn === "function") {
            return (...args: unknown[]) => target._dispatch(prop, args);
          }
        }
        return Reflect.get(target, prop, receiver);
      },
      has(target, prop) {
        if (typeof prop === "string" && prop in target._helpers) return true;
        return Reflect.has(target, prop);
      },
    }) as RoutesProxy;
  }

  /** Rails: `alias :_routes :routes`. */
  get _routes(): UrlForRoutes {
    return this.routes;
  }
  set _routes(value: UrlForRoutes | null) {
    if (value != null) this.routes = value;
  }

  urlOptions(): Record<string, unknown> {
    return _withRoutes.call<
      UrlForHost,
      [UrlForRoutes, () => Record<string, unknown>],
      Record<string, unknown>
    >(this.scope, this.routes, () => this.scope.urlOptions());
  }

  /** @internal Rails: `method_missing(method, *args)` */
  private _dispatch(method: string, args: unknown[]): unknown {
    const fn = this._helpers[method];
    if (typeof fn !== "function") {
      throw new TypeError(`undefined helper '${method}' on RoutesProxy`);
    }
    const inlineOptions = extractOptions(args);
    const options: Record<string, unknown> = { ...this.urlOptions(), ...inlineOptions };

    if (this._scriptNamer) {
      options["script_name"] = mergeScriptNames(
        options["script_name"] as string | null | undefined,
        this._scriptNamer(options),
      );
    }

    args.push(options);
    return (fn as (...a: unknown[]) => unknown).apply(this._helpers, args);
  }
}

/**
 * Keeps the part of the script name provided by the global context via
 * `ENV["SCRIPT_NAME"]`, which `mount` doesn't know about since it depends on
 * the specific request, but uses the script-name resolver for the mount-point
 * dependent part.
 *
 * @internal Rails: `private def merge_script_names`
 */
export function mergeScriptNames(
  previousScriptName: string | null | undefined,
  newScriptName: string,
): string {
  if (previousScriptName == null) return newScriptName;

  const resolvedParts = countSlashes(newScriptName);
  const previousParts = countSlashes(previousScriptName);
  const contextParts = previousParts - resolvedParts + 1;

  return previousScriptName.split("/").slice(0, contextParts).join("/") + newScriptName;
}

/** @internal */
function countSlashes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 47) n++;
  return n;
}

/** @internal Rails: `Array#extract_options!` — pops a trailing options hash. */
function extractOptions(arr: unknown[]): Record<string, unknown> {
  const last = arr[arr.length - 1];
  if (last != null && typeof last === "object" && !Array.isArray(last)) {
    const proto = Object.getPrototypeOf(last);
    if (proto === null || proto === Object.prototype) {
      arr.pop();
      return last as Record<string, unknown>;
    }
  }
  return {};
}
