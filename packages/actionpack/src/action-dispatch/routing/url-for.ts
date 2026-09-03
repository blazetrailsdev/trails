import { NO_ROUTES_MESSAGE } from "../../abstract-controller/url-for.js";
import { Parameters } from "../../action-controller/metal/strong-parameters.js";
import {
  HelperMethodBuilder,
  isModelClass,
  symbolToString,
  type PolymorphicHost,
  type PolymorphicMappingEntry,
  type ToModel,
} from "./polymorphic-routes.js";

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

export interface UrlForRoutes {
  urlFor(options: Record<string, unknown>, routeName?: string | null): string;
  /** @internal */
  optimizeRoutesGeneration?(): boolean;
  polymorphicMappings?: Map<string, PolymorphicMappingEntry>;
}

export interface UrlForHost {
  /** @internal */
  _routes: UrlForRoutes | null;
  defaultUrlOptions: Record<string, unknown>;
  urlOptions(): Record<string, unknown>;
  polymorphicUrl?(record: unknown, options: Record<string, unknown>): string;
}

export function initialize(this: UrlForHost): void {
  this._routes = null;
}

export function urlOptions(this: UrlForHost): Record<string, unknown> {
  return this.defaultUrlOptions;
}

export function urlFor(this: UrlForHost, options?: UrlForOptions): string {
  return fullUrlFor.call(this, options);
}

export type UrlForOptions = null | undefined | string | symbol | object;

/** @internal */
export function fullUrlFor(this: UrlForHost, options?: UrlForOptions): string {
  if (options == null) {
    return requireRoutes(this).urlFor({ ...this.urlOptions() });
  }
  if (typeof options === "string") {
    return options;
  }
  if (Array.isArray(options)) {
    const components = [...options];
    const opts = extractOptions(components);
    if (typeof this.polymorphicUrl !== "function") {
      throw new Error("urlFor(Array) requires PolymorphicRoutes#polymorphicUrl on the host.");
    }
    return this.polymorphicUrl(components, opts);
  }
  const asHash = coerceHashOrParameters(options);
  if (asHash) {
    const hash = { ...asHash };
    const rawRouteName = hash["use_route"];
    delete hash["use_route"];
    const merged = { ...this.urlOptions(), ...hash };
    const routeName =
      rawRouteName == null
        ? null
        : typeof rawRouteName === "symbol"
          ? symbolToString(rawRouteName)
          : String(rawRouteName);
    return requireRoutes(this).urlFor(merged, routeName);
  }
  const builder = HelperMethodBuilder.url();
  const target = this as unknown as PolymorphicHost;
  if (typeof options === "symbol") {
    return builder.handleStringCall(target, symbolToString(options));
  }
  if (isModelClass(options)) {
    return builder.handleClassCall(target, options);
  }
  return builder.handleModelCall(target, options as ToModel);
}

export function routeFor(this: UrlForHost, name: string, ...args: unknown[]): string {
  const helper = `${name}_url`;
  const fn = (this as unknown as Record<string, unknown>)[helper];
  if (typeof fn !== "function") {
    throw new Error(`No url helper "${helper}" defined`);
  }
  return (fn as (...a: unknown[]) => string).apply(this, args);
}

/** @internal */
export function optimizeRoutesGeneration(this: UrlForHost): boolean {
  const routes = requireRoutes(this);
  return (
    (routes.optimizeRoutesGeneration?.() ?? true) &&
    Object.keys(this.defaultUrlOptions).length === 0
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
function requireRoutes(host: UrlForHost): UrlForRoutes {
  if (!host._routes) {
    throw new Error(NO_ROUTES_MESSAGE);
  }
  return host._routes;
}

/** @internal */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/** @internal */
function coerceHashOrParameters(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value)) return value;
  if (value instanceof Parameters) return value.toH();
  return null;
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
