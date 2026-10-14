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
  UrlFor,
  type UrlForHost,
  type UrlForRoutes,
} from "./url-for.js";
import type { PolymorphicHost } from "./polymorphic-routes.js";
import { extractOptionsBang, include } from "@blazetrails/activesupport";
import {
  NoMethodError,
  objRespondToMissing,
  rbFPublicSend,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Routing } from "../../namespaces.js";

export type RoutesProxyHelpers = Record<string, unknown>;

export type ScriptNamer = (options: Record<string, unknown>) => string;

export type RoutesProxyInstance = RoutesProxy & {
  [helper: string]: any;
};

export class RoutesProxy implements UrlForHost {
  scope: UrlForHost;
  routes: UrlForRoutes;
  declare static defaultUrlOptions: Record<string, unknown>;
  declare static isDefaultUrlOptions: boolean;
  declare defaultUrlOptions: Record<string, unknown>;
  declare isDefaultUrlOptions: boolean;
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
        if (typeof prop === "string" && !(prop in target) && target.respondToMissing(prop, false)) {
          return (...args: unknown[]) => target.methodMissing(prop, ...args);
        }
        return Reflect.get(target, prop, receiver);
      },
      has(target, prop) {
        if (typeof prop === "string" && target.respondToMissing(prop, false)) return true;
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
  private respondToMissing(method: string, _: boolean): boolean {
    return objRespondToMissing(this, method, _) || rbObjRespondTo(this._helpers, method);
  }

  /** @internal */
  private methodMissing(method: string, ...args: unknown[]): unknown {
    if (rbObjRespondTo(this._helpers, method)) {
      let options: Record<string, unknown> = extractOptionsBang(args);
      options = { ...this.urlOptions(), ...(options ?? {}) };

      if (this._scriptNamer) {
        options["scriptName"] = mergeScriptNames(
          options["scriptName"] as string | null | undefined,
          this._scriptNamer(options),
        );
      }

      args.push(options);
      return rbFPublicSend(this._helpers, method, ...args);
    } else {
      throw new NoMethodError(
        `undefined method '${method}' for an instance of RoutesProxy`,
        method,
        args,
        false,
        { receiver: this },
      );
    }
  }
}

Routing.RoutesProxy = RoutesProxy;

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

include(RoutesProxy, UrlFor);
