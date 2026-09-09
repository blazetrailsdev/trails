import { extractOptionsBang, isPlainObject, symbolizeKeys } from "@blazetrails/activesupport";
import { isSymbol, symbolToS } from "@blazetrails/ruby-compat";
import { _UrlFor } from "./routing-url-for-slot.js";

export interface RoutingUrlForHost {
  controller: unknown;
  _backUrl(): string;
}

export type UrlForOptions = string | null | undefined | object | ReadonlyArray<unknown>;

export function urlFor(this: RoutingUrlForHost, options: UrlForOptions = null): string {
  if (typeof options === "string" && !isSymbol(options)) {
    return options;
  } else if (options == null) {
    return _UrlFor!.urlFor.call(this, { only_path: _generatePathsByDefault.call(this) });
  } else if (isPlainObject(options)) {
    const hash = symbolizeKeys(options as Record<string, unknown>);
    ensureOnlyPathOption.call(this, hash);

    return _UrlFor!.urlFor.call(this, hash);
  } else if (_UrlFor!.isParameters(options)) {
    ensureOnlyPathOption.call(this, options as Record<string, unknown>);

    return _UrlFor!.urlFor.call(this, options);
  } else if (options === ":back") {
    return this._backUrl();
  } else if (Array.isArray(options)) {
    const [components, opts] = extractOptionsBang([...options]);
    ensureOnlyPathOption.call(this, opts as Record<string, unknown>);

    if ((opts as Record<string, unknown>)["only_path"]) {
      return _UrlFor!.polymorphicPath.call(this, components, opts as Record<string, unknown>);
    } else {
      return _UrlFor!.polymorphicUrl.call(this, components, opts as Record<string, unknown>);
    }
  } else {
    const method = _generatePathsByDefault.call(this) ? "path" : "url";
    const builder = _UrlFor!.helperMethodBuilder[method]();

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
export function urlOptions(this: RoutingUrlForHost): Record<string, unknown> {
  const controller = this.controller as { urlOptions?: () => Record<string, unknown> } | null;
  if (typeof controller?.urlOptions !== "function") return _UrlFor!.urlOptions.call(this);
  return controller.urlOptions();
}

/** @internal */
export function _routesContext(this: RoutingUrlForHost): unknown {
  return this.controller;
}

/** @internal */
export function optimizeRoutesGeneration(this: RoutingUrlForHost): boolean {
  const controller = this.controller as { optimizeRoutesGeneration?: () => boolean } | null;
  return typeof controller?.optimizeRoutesGeneration === "function"
    ? controller.optimizeRoutesGeneration()
    : _UrlFor!.optimizeRoutesGeneration.call(this);
}

/** @internal */
export function _generatePathsByDefault(this: RoutingUrlForHost): boolean {
  return true;
}

/** @internal */
export function ensureOnlyPathOption(
  this: RoutingUrlForHost,
  options: Record<string, unknown>,
): void {
  if (!Object.prototype.hasOwnProperty.call(options, "only_path")) {
    if (!options["host"]) options["only_path"] = _generatePathsByDefault.call(this);
  }
}
