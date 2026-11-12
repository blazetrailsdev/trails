import {
  SafeBuffer,
  TopLevel,
  extractOptionsBang,
  isPlainObject,
} from "@blazetrails/activesupport";
import {
  classModule,
  hasKey,
  hashAref,
  hashAset,
  isSymbol,
  rbCallSuper,
  rtest,
  symbolToS,
} from "@blazetrails/ruby-compat";

import type { UrlHelperHost } from "./helpers/url-helper.js";

export interface RoutingUrlForHost {
  controller: unknown;
}

export type UrlForOptions = string | null | undefined | object | ReadonlyArray<unknown>;

type Host = RoutingUrlFor & RoutingUrlForHost & Pick<UrlHelperHost, "_backUrl">;

type Parameters = InstanceType<NonNullable<typeof TopLevel.ActionController>["Parameters"]>;

export class RoutingUrlFor {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  declare urlFor: (options?: unknown) => string;
  declare urlOptions: () => Record<string, unknown>;
  /** @internal */
  declare optimizeRoutesGeneration: () => boolean;
  declare polymorphicPath: (record: unknown, options: Record<string, unknown>) => string;
  declare polymorphicUrl: (record: unknown, options: Record<string, unknown>) => string;
  /** @internal */
  declare _routesContext: () => unknown;
  /** @internal */
  declare _generatePathsByDefault: () => boolean;
  /** @internal */
  declare ensureOnlyPathOption: (options: Record<string, unknown> | Parameters) => void;
}

export function urlFor(this: Host, options: UrlForOptions = null): string {
  if ((typeof options === "string" && !isSymbol(options)) || options instanceof SafeBuffer) {
    return options as unknown as string;
  } else if (options == null) {
    return rbCallSuper(this, urlFor, {
      onlyPath: this._generatePathsByDefault(),
    }) as string;
  } else if (isPlainObject(options)) {
    options = { ...(options as Record<string, unknown>) };
    this.ensureOnlyPathOption(options as Record<string, unknown>);

    return rbCallSuper(this, urlFor, options) as string;
  } else if (options instanceof TopLevel.ActionController!.Parameters) {
    this.ensureOnlyPathOption(options);

    return rbCallSuper(this, urlFor, options) as string;
  } else if (options === ":back") {
    return this._backUrl();
  } else if (Array.isArray(options)) {
    const components = [...options];
    options = extractOptionsBang(components) as Record<string, unknown>;
    this.ensureOnlyPathOption(options as Record<string, unknown>);

    if (
      (options as Record<string, unknown>)["onlyPath"] != null &&
      (options as Record<string, unknown>)["onlyPath"] !== false
    ) {
      return this.polymorphicPath(components, options as Record<string, unknown>);
    } else {
      return this.polymorphicUrl(components, options as Record<string, unknown>);
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
    return rbCallSuper(this, urlOptions) as Record<string, unknown>;
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
    : (rbCallSuper(this, optimizeRoutesGeneration) as boolean);
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
  if (!hasKey(options, "onlyPath")) {
    if (!rtest(hashAref(options, "host")))
      hashAset(options, "onlyPath", this._generatePathsByDefault());
  }
}

Object.assign(RoutingUrlFor.prototype, {
  urlFor,
  urlOptions,
  _routesContext,
  optimizeRoutesGeneration,
  _generatePathsByDefault,
  ensureOnlyPathOption,
});
