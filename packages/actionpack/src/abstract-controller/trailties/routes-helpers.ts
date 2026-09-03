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
    const mod = namespaceBuilder
      ? namespaceBuilder(includePathHelpers)
      : routes.urlHelpers(includePathHelpers);
    const proto = cls.prototype as Record<string, unknown>;
    for (const name in mod) {
      const fn = (mod as Record<string, unknown>)[name];
      if (typeof fn === "function") proto[name] = fn;
    }
    cls._routes = (mod as { _routes?: unknown })._routes ?? routes;
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
