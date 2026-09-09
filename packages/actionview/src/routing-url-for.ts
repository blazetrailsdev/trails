import { extractOptionsBang, isPlainObject, symbolizeKeys } from "@blazetrails/activesupport";
import { isSymbol, symbolToS } from "@blazetrails/ruby-compat";
import { _UrlFor, type ParametersLike } from "./routing-url-for-slot.js";

export interface RoutingUrlForHost {
  controller: unknown;
  _backUrl(): string;
}

export type UrlForOptions = string | null | undefined | object | ReadonlyArray<unknown>;

type Host = RoutingUrlFor & RoutingUrlForHost;

export class RoutingUrlFor {
  urlFor(this: Host, options: UrlForOptions = null): string {
    if (typeof options === "string" && !isSymbol(options)) {
      return options;
    } else if (options == null) {
      return _UrlFor!.urlFor.call(this, { only_path: this._generatePathsByDefault() });
    } else if (isPlainObject(options)) {
      const hash = symbolizeKeys(options as Record<string, unknown>);
      this.ensureOnlyPathOption(hash);

      return _UrlFor!.urlFor.call(this, hash);
    } else if (_UrlFor!.isParameters(options)) {
      this.ensureOnlyPathOption(options);

      return _UrlFor!.urlFor.call(this, options);
    } else if (options === ":back") {
      return this._backUrl();
    } else if (Array.isArray(options)) {
      const [components, extracted] = extractOptionsBang([...options]);
      const opts = extracted as Record<string, unknown>;
      this.ensureOnlyPathOption(opts);

      if (opts["only_path"]) {
        return _UrlFor!.polymorphicPath.call(this, components, opts);
      } else {
        return _UrlFor!.polymorphicUrl.call(this, components, opts);
      }
    } else {
      const method = this._generatePathsByDefault() ? "path" : "url";
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
  urlOptions(this: Host): Record<string, unknown> {
    const controller = this.controller as { urlOptions?: () => Record<string, unknown> } | null;
    if (typeof controller?.urlOptions !== "function") return _UrlFor!.urlOptions.call(this);
    return controller.urlOptions();
  }

  /** @internal */
  _routesContext(this: Host): unknown {
    return this.controller;
  }

  /** @internal */
  optimizeRoutesGeneration(this: Host): boolean {
    const controller = this.controller as { optimizeRoutesGeneration?: () => boolean } | null;
    return typeof controller?.optimizeRoutesGeneration === "function"
      ? controller.optimizeRoutesGeneration()
      : _UrlFor!.optimizeRoutesGeneration.call(this);
  }

  /** @internal */
  _generatePathsByDefault(this: Host): boolean {
    return true;
  }

  /** @internal */
  ensureOnlyPathOption(this: Host, options: Record<string, unknown> | ParametersLike): void {
    const params = _UrlFor!.isParameters(options) ? options : null;
    const hash = params ? null : (options as Record<string, unknown>);
    if (
      !(params
        ? params.hasKey("only_path")
        : Object.prototype.hasOwnProperty.call(hash!, "only_path"))
    ) {
      if (!(params ? params.get("host") : hash!["host"])) {
        const onlyPath = this._generatePathsByDefault();
        if (params) params.set("only_path", onlyPath);
        else hash!["only_path"] = onlyPath;
      }
    }
  }
}
