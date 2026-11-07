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
  rbFSend,
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
  }

  get _routes(): UrlForRoutes {
    return this.routes;
  }
  set _routes(value: UrlForRoutes) {
    this.routes = value;
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
        options["scriptName"] = this.mergeScriptNames(
          options["scriptName"] as string | null | undefined,
          this._scriptNamer(options),
        );
      }

      args.push(options);
      return rbFSend(this._helpers, method, ...args);
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

  /** @internal */
  private mergeScriptNames(
    previousScriptName: string | null | undefined,
    newScriptName: string,
  ): string {
    if (previousScriptName == null) return newScriptName;

    const resolvedParts = newScriptName.split("/").length - 1;
    const previousParts = previousScriptName.split("/").length - 1;
    const contextParts = previousParts - resolvedParts + 1;

    return previousScriptName.split("/").slice(0, contextParts).join("/") + newScriptName;
  }
}

Object.setPrototypeOf(
  RoutesProxy.prototype,
  new Proxy(Object.create(Object.getPrototypeOf(RoutesProxy.prototype) as object) as object, {
    get(
      target,
      prop,
      receiver: {
        respondToMissing(method: string, _: boolean): boolean;
        methodMissing(method: string, ...args: unknown[]): unknown;
      },
    ) {
      if (
        typeof prop === "string" &&
        !(prop in target) &&
        (receiver as object) !== RoutesProxy.prototype &&
        receiver.respondToMissing(prop, false)
      ) {
        return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
      }
      return Reflect.get(target, prop, receiver);
    },
  }),
);

Routing.RoutesProxy = RoutesProxy;

include(RoutesProxy, UrlFor);
