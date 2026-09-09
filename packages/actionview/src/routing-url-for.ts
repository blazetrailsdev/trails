import { extractOptionsBang, isPlainObject, symbolizeKeys } from "@blazetrails/activesupport";
import { isSymbol, symbolToS } from "@blazetrails/ruby-compat";
import { _UrlFor, type ParametersLike } from "./routing-url-for-slot.js";

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
    ensureOnlyPathOption.call(this, options);

    return _UrlFor!.urlFor.call(this, options);
  } else if (options === ":back") {
    return this._backUrl();
  } else if (Array.isArray(options)) {
    const [components, extracted] = extractOptionsBang([...options]);
    const opts = extracted as Record<string, unknown>;
    ensureOnlyPathOption.call(this, opts);

    if (opts["only_path"]) {
      return _UrlFor!.polymorphicPath.call(this, components, opts);
    } else {
      return _UrlFor!.polymorphicUrl.call(this, components, opts);
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
  options: Record<string, unknown> | ParametersLike,
): void {
  const params = _UrlFor!.isParameters(options) ? options : null;
  const hash = params ? null : (options as Record<string, unknown>);
  if (
    !(params
      ? params.hasKey("only_path")
      : Object.prototype.hasOwnProperty.call(hash!, "only_path"))
  ) {
    if (!(params ? params.get("host") : hash!["host"])) {
      const onlyPath = _generatePathsByDefault.call(this);
      if (params) params.set("only_path", onlyPath);
      else hash!["only_path"] = onlyPath;
    }
  }
}
