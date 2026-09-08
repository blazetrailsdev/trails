/** @internal */

import type { HelperMethodsModule, HelpersClassMethods } from "../helpers.js";

export interface UrlHelpersRouteSet {
  urlHelpers(includePathHelpers?: boolean): HelperMethodsModule;
}

export interface RoutesHelpersClassMethods extends HelpersClassMethods {
  trailtieRoutesUrlHelpers?(includePathHelpers?: boolean): HelperMethodsModule;
  _routes?: unknown;
}

export function withRoutesHelpers(
  routes: UrlHelpersRouteSet,
  includePathHelpers = true,
): (cls: RoutesHelpersControllerClass) => void {
  return (cls) => {
    const namespaceBuilder = findTrailtieUrlHelpers(cls);
    const urlHelpersModule = (): HelperMethodsModule =>
      namespaceBuilder
        ? namespaceBuilder(includePathHelpers)
        : routes.urlHelpers(includePathHelpers);
    const proto = cls.prototype;
    Object.setPrototypeOf(
      proto,
      new Proxy(Object.getPrototypeOf(proto) as object, {
        get(target, key, receiver) {
          if (typeof key === "string") {
            const mod = urlHelpersModule() as Record<string, unknown>;
            const helper = mod[key];
            if (typeof helper === "function") {
              return function (this: { _routes?: unknown }, ...args: unknown[]): unknown {
                const host = this?._routes ? this : mod;
                return (helper as (this: unknown, ...a: unknown[]) => unknown).apply(host, args);
              };
            }
          }
          return Reflect.get(target, key, receiver);
        },
        has(target, key) {
          if (typeof key === "string" && key in (urlHelpersModule() as object)) return true;
          return Reflect.has(target, key);
        },
      }),
    );
    cls._routes = (urlHelpersModule() as { _routes?: unknown })._routes ?? routes;
  };
}

export interface RoutesHelpersControllerClass extends RoutesHelpersClassMethods {
  prototype: object;
}

function findTrailtieUrlHelpers(
  cls: RoutesHelpersClassMethods,
): RoutesHelpersClassMethods["trailtieRoutesUrlHelpers"] {
  let current: object | null = cls;
  while (current && current !== Function.prototype && current !== Object.prototype) {
    const own = Object.getOwnPropertyDescriptor(current, "trailtieRoutesUrlHelpers")?.value as
      | RoutesHelpersClassMethods["trailtieRoutesUrlHelpers"]
      | undefined;
    if (typeof own === "function") return own;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

export { withRoutesHelpers as with };
