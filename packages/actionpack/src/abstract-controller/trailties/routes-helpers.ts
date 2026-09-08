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
          const mod = urlHelpersModule();
          if (typeof key === "string" && isEnumerableMember(mod, key)) {
            return (mod as Record<string, unknown>)[key];
          }
          return Reflect.get(target, key, receiver);
        },
        has(target, key) {
          if (typeof key === "string" && isEnumerableMember(urlHelpersModule(), key)) return true;
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

function isEnumerableMember(mod: HelperMethodsModule, key: string): boolean {
  let current: object | null = mod;
  while (current && current !== Object.prototype) {
    if (Object.prototype.propertyIsEnumerable.call(current, key)) return true;
    current = Object.getPrototypeOf(current) as object | null;
  }
  return false;
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
