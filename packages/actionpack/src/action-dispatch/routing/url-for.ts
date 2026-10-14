import {
  camelize,
  classAttribute,
  Concern,
  mattrWriter,
  reverseMergeBang,
} from "@blazetrails/activesupport";
import {
  extend,
  type Hash,
  dup,
  hashDelete,
  include,
  isSymbol,
  Module,
  rbFPublicSend,
  rbModMethodDefined,
  rbObjRespondTo,
  symbolToS,
  toH,
} from "@blazetrails/ruby-compat";
import { Parameters } from "../../action-controller/metal/strong-parameters.js";
import {
  HelperMethodBuilder,
  isModelClass,
  type PolymorphicHost,
  type PolymorphicMappingEntry,
  type ToModel,
} from "./polymorphic-routes.js";
import * as PolymorphicRoutes from "./polymorphic-routes.js";
import type { RouteSet } from "./route-set.js";

export {
  polymorphicUrl,
  polymorphicPath,
  editPolymorphicUrl,
  editPolymorphicPath,
  newPolymorphicUrl,
  newPolymorphicPath,
  polymorphicUrlForAction,
  polymorphicPathForAction,
  polymorphicMapping,
} from "./polymorphic-routes.js";

export type UrlForRoutes = Pick<RouteSet, "urlFor" | "isOptimizeRoutesGeneration"> & {
  polymorphicMappings?: Map<string, PolymorphicMappingEntry>;
};

export interface UrlForHost {
  /** @internal */
  _routes: UrlForRoutes | null;
  defaultUrlOptions: Record<string, unknown>;
  urlOptions(): Record<string, unknown>;
  polymorphicUrl?(record: unknown, options: Record<string, unknown>): string;
}

export function urlOptions(this: UrlForHost): Record<string, unknown> {
  return this.defaultUrlOptions;
}

export function urlFor(this: UrlForHost, options?: UrlForOptions): string {
  return fullUrlFor.call(this, options);
}

export type UrlForOptions = null | undefined | string | object;

/** @internal */
export function fullUrlFor(this: UrlForHost, options?: UrlForOptions): string {
  if (options == null) {
    return this._routes!.urlFor({ ...this.urlOptions() });
  }
  if (isPlainObject(options) || options instanceof Parameters) {
    const routeName =
      options instanceof Parameters ? options.delete("useRoute") : hashDelete(options, "useRoute");
    const mergedUrlOptions = reverseMergeBang(
      dup(toH<Record<string, unknown> | Hash<string, unknown>>(options)),
      this.urlOptions(),
    );
    return this._routes!.urlFor(
      mergedUrlOptions,
      routeName == null ? null : isSymbol(routeName) ? symbolToS(routeName) : String(routeName),
    );
  }
  if (typeof options === "string" && !isSymbol(options)) {
    return options;
  }
  const target = this as unknown as PolymorphicHost;
  if (isSymbol(options)) {
    return HelperMethodBuilder.url().handleStringCall(target, options);
  }
  if (Array.isArray(options)) {
    const components = [...options];
    const opts = extractOptions(components);
    return this.polymorphicUrl!(components, opts);
  }
  if (isModelClass(options)) {
    return HelperMethodBuilder.url().handleClassCall(target, options);
  }
  return HelperMethodBuilder.url().handleModelCall(target, options as ToModel);
}

export function routeFor(this: UrlForHost, name: string, ...args: unknown[]): string {
  return rbFPublicSend(this, camelize(`${name}_url`, "lower"), ...args) as string;
}

/** @internal */
export function optimizeRoutesGeneration(this: UrlForHost): boolean {
  return (
    this._routes!.isOptimizeRoutesGeneration() && Object.keys(this.defaultUrlOptions).length === 0
  );
}

/** @internal */
export function _withRoutes<T>(
  this: UrlForHost,
  routes: UrlForRoutes,
  block: () => Exclude<T, Promise<unknown>>,
): Exclude<T, Promise<unknown>> {
  if (block.constructor?.name === "AsyncFunction") {
    throw new Error(
      "_withRoutes block must be synchronous; got an AsyncFunction. Use an async-aware helper instead.",
    );
  }
  const old = this._routes;
  this._routes = routes;
  try {
    const result = block();
    if (result != null && typeof (result as { then?: unknown }).then === "function") {
      throw new Error(
        "_withRoutes block must be synchronous; got a Promise. Use an async-aware helper instead.",
      );
    }
    return result;
  } finally {
    this._routes = old;
  }
}

/** @internal */
export function _routesContext(this: UrlForHost): UrlForHost {
  return this;
}

/** @internal */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/** @internal */
function extractOptions(arr: unknown[]): Record<string, unknown> {
  const last = arr[arr.length - 1];
  if (isPlainObject(last)) {
    arr.pop();
    return last;
  }
  return {};
}

type UrlForIncluder = (new (...args: never[]) => unknown) & {
  defaultUrlOptions: Record<string, unknown>;
  _urlForModules?(): new (...args: never[]) => unknown;
};

export const UrlFor = new Module((mod) => {
  extend(mod, Concern);
  mod.include(PolymorphicRoutes);

  (
    mod as unknown as { included(base: null, block: (this: UrlForIncluder) => void): void }
  ).included(null, function (this: UrlForIncluder) {
    if (!rbModMethodDefined(this, "defaultUrlOptions")) {
      if (typeof this === "function") {
        classAttribute.call(this, "defaultUrlOptions");
      } else {
        mattrWriter.call(this, "defaultUrlOptions");
      }

      this.defaultUrlOptions = {};
    }

    if (rbObjRespondTo(this, "_urlForModules")) include(this, this._urlForModules!());
  });

  mod.moduleEval((m) => {
    Object.assign(m, {
      urlOptions,
      urlFor,
      fullUrlFor,
      routeFor,
      optimizeRoutesGeneration,
      _withRoutes,
      _routesContext,
    });
  });
});
