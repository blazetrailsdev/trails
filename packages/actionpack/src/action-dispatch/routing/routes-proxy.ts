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

export type RoutesProxyHelpers = Record<string, unknown>;

export type ScriptNamer = (options: Record<string, unknown>) => string;

export type RoutesProxyInstance = RoutesProxy & {
  [helper: string]: any;
};

export class RoutesProxy implements UrlForHost {
  scope: UrlForHost;
  routes: UrlForRoutes;
  defaultUrlOptions: Record<string, unknown> = {};
  /** @internal */
  private _helpers: RoutesProxyHelpers;
  /** @internal */
  private _scriptNamer: ScriptNamer | null;

  urlFor = urlFor;
  fullUrlFor = fullUrlFor;
  routeFor = routeFor;
  /** @internal */
  optimizeRoutesGeneration = optimizeRoutesGeneration;
  /** @internal */
  _withRoutes = _withRoutes;
  /** @internal */
  _routesContext = _routesContext;

  polymorphicUrl = polymorphicUrl;
  polymorphicPath = polymorphicPath;
  editPolymorphicUrl = editPolymorphicUrl;
  editPolymorphicPath = editPolymorphicPath;
  newPolymorphicUrl = newPolymorphicUrl;
  newPolymorphicPath = newPolymorphicPath;
  /** @internal */
  polymorphicUrlForAction = polymorphicUrlForAction;
  /** @internal */
  polymorphicPathForAction = polymorphicPathForAction;
  /** @internal */
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

  /** @internal */
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

/** @internal */
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

/** @internal */
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
