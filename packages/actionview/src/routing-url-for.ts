import {
  SafeBuffer,
  TopLevel,
  extractOptionsBang,
  isPlainObject,
} from "@blazetrails/activesupport";
import { Module, isSymbol, symbolToS } from "@blazetrails/ruby-compat";

import type { UrlHelperHost } from "./helpers/url-helper.js";

export interface RoutingUrlForHost {
  controller: unknown;
}

export type UrlForOptions = string | null | undefined | object | ReadonlyArray<unknown>;

type Host = RoutingUrlFor & RoutingUrlForHost & Pick<UrlHelperHost, "_backUrl">;

type Parameters = InstanceType<NonNullable<typeof TopLevel.ActionController>["Parameters"]>;

export interface RoutingUrlFor {
  urlFor(options?: unknown): string;
  urlOptions(): Record<string, unknown>;
  /** @internal */
  optimizeRoutesGeneration(): boolean;
  polymorphicPath(record: unknown, options: Record<string, unknown>): string;
  polymorphicUrl(record: unknown, options: Record<string, unknown>): string;
  /** @internal */
  _routesContext(): unknown;
  /** @internal */
  _generatePathsByDefault(): boolean;
  /** @internal */
  ensureOnlyPathOption(options: Record<string, unknown> | Parameters): void;
}

export function urlFor(this: Host, options: UrlForOptions = null): string {
  if ((typeof options === "string" && !isSymbol(options)) || options instanceof SafeBuffer) {
    return options as unknown as string;
  } else if (options == null) {
    return RoutingUrlFor.superMethod(this, "urlFor")!({
      onlyPath: this._generatePathsByDefault(),
    }) as string;
  } else if (isPlainObject(options)) {
    const hash = { ...(options as Record<string, unknown>) };
    this.ensureOnlyPathOption(hash);

    return RoutingUrlFor.superMethod(this, "urlFor")!(hash) as string;
  } else if (options instanceof TopLevel.ActionController!.Parameters) {
    this.ensureOnlyPathOption(options);

    return RoutingUrlFor.superMethod(this, "urlFor")!(options) as string;
  } else if (options === ":back") {
    return this._backUrl();
  } else if (Array.isArray(options)) {
    const components = [...options];
    const opts = extractOptionsBang(components) as Record<string, unknown>;
    this.ensureOnlyPathOption(opts);

    if (opts["onlyPath"] != null && opts["onlyPath"] !== false) {
      return this.polymorphicPath(components, opts);
    } else {
      return this.polymorphicUrl(components, opts);
    }
  } else {
    const method = this._generatePathsByDefault() ? "path" : "url";
    const builder =
      TopLevel.ActionDispatch!.Routing.PolymorphicRoutes.HelperMethodBuilder[method]();

    if (isSymbol(options)) {
      return builder.handleStringCall(this, symbolToS(options));
    } else if (typeof options === "function") {
      return builder.handleClassCall(this, options);
    } else {
      return builder.handleModelCall(this, options);
    }
  }
}

/** @internal */
export function urlOptions(this: Host): Record<string, unknown> {
  const controller = this.controller as { urlOptions?: () => Record<string, unknown> } | null;
  if (typeof controller?.urlOptions !== "function")
    return RoutingUrlFor.superMethod(this, "urlOptions")!() as Record<string, unknown>;
  return controller.urlOptions();
}

/** @internal */
export function _routesContext(this: Host): unknown {
  return this.controller;
}

/** @internal */
export function optimizeRoutesGeneration(this: Host): boolean {
  const controller = this.controller as { optimizeRoutesGeneration?: () => boolean } | null;
  return typeof controller?.optimizeRoutesGeneration === "function"
    ? controller.optimizeRoutesGeneration()
    : (RoutingUrlFor.superMethod(this, "optimizeRoutesGeneration")!() as boolean);
}

/** @internal */
export function _generatePathsByDefault(this: Host): boolean {
  return true;
}

/** @internal */
export function ensureOnlyPathOption(
  this: Host,
  options: Record<string, unknown> | Parameters,
): void {
  const params = options instanceof TopLevel.ActionController!.Parameters ? options : null;
  const hash = params ? null : (options as Record<string, unknown>);
  if (
    !(params ? params.hasKey("only_path") : Object.prototype.hasOwnProperty.call(hash!, "onlyPath"))
  ) {
    const host = params ? params.get("host") : hash!["host"];
    if (!(host != null && host !== false)) {
      const onlyPath = this._generatePathsByDefault();
      if (params) params.set("only_path", onlyPath);
      else hash!["onlyPath"] = onlyPath;
    }
  }
}

export const RoutingUrlFor = new Module((mod) => {
  mod.defineMethod("urlFor", urlFor);
  mod.defineMethod("urlOptions", urlOptions);
  mod.defineMethod("_routesContext", _routesContext);
  mod.defineMethod("optimizeRoutesGeneration", optimizeRoutesGeneration);
  mod.defineMethod("_generatePathsByDefault", _generatePathsByDefault);
  mod.defineMethod("ensureOnlyPathOption", ensureOnlyPathOption);
});
