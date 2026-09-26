import { TopLevel, extractOptionsBang, isPlainObject } from "@blazetrails/activesupport";
import { isSymbol, symbolToS } from "@blazetrails/ruby-compat";

import type { UrlHelperHost } from "./helpers/url-helper.js";

export interface RoutingUrlForHost {
  controller: unknown;
}

export type UrlForOptions = string | null | undefined | object | ReadonlyArray<unknown>;

type Host = RoutingUrlFor & RoutingUrlForHost & Pick<UrlHelperHost, "_backUrl">;

type Parameters = InstanceType<NonNullable<typeof TopLevel.ActionController>["Parameters"]>;

interface UrlFor {
  urlFor(options?: unknown): string;
  urlOptions(): Record<string, unknown>;
  optimizeRoutesGeneration(): boolean;
  polymorphicPath(record: unknown, options: Record<string, unknown>): string;
  polymorphicUrl(record: unknown, options: Record<string, unknown>): string;
}

export class RoutingUrlFor extends (Object as unknown as new () => UrlFor) {
  urlFor(this: Host, options: UrlForOptions = null): string {
    if (typeof options === "string" && !isSymbol(options)) {
      return options;
    } else if (options == null) {
      return super.urlFor({ onlyPath: this._generatePathsByDefault() });
    } else if (isPlainObject(options)) {
      const hash = { ...(options as Record<string, unknown>) };
      this.ensureOnlyPathOption(hash);

      return super.urlFor(hash);
    } else if (options instanceof TopLevel.ActionController!.Parameters) {
      this.ensureOnlyPathOption(options);

      return super.urlFor(options);
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
  urlOptions(this: Host): Record<string, unknown> {
    const controller = this.controller as { urlOptions?: () => Record<string, unknown> } | null;
    if (typeof controller?.urlOptions !== "function") return super.urlOptions();
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
      : super.optimizeRoutesGeneration();
  }

  /** @internal */
  _generatePathsByDefault(this: Host): boolean {
    return true;
  }

  /** @internal */
  ensureOnlyPathOption(this: Host, options: Record<string, unknown> | Parameters): void {
    const params = options instanceof TopLevel.ActionController!.Parameters ? options : null;
    const hash = params ? null : (options as Record<string, unknown>);
    if (
      !(params
        ? params.hasKey("only_path")
        : Object.prototype.hasOwnProperty.call(hash!, "onlyPath"))
    ) {
      const host = params ? params.get("host") : hash!["host"];
      if (!(host != null && host !== false)) {
        const onlyPath = this._generatePathsByDefault();
        if (params) params.set("only_path", onlyPath);
        else hash!["onlyPath"] = onlyPath;
      }
    }
  }
}
