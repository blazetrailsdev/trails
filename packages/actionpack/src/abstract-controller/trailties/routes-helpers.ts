/** @internal */

import { Module } from "@blazetrails/ruby-compat";

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
            const accessor = includedAccessor(urlHelpersModule(), key);
            if (accessor) return accessor.get!.call(receiver);
            const member = includedMember(urlHelpersModule(), key);
            if (member !== undefined) return member;
          }
          return Reflect.get(target, key, receiver);
        },
        set(target, key, value, receiver) {
          const accessor =
            typeof key === "string" ? includedAccessor(urlHelpersModule(), key) : undefined;
          if (accessor?.set) {
            accessor.set.call(receiver, value);
            return true;
          }
          return Reflect.set(target, key, value, receiver);
        },
        has(target, key) {
          if (typeof key === "string" && includedMember(urlHelpersModule(), key) !== undefined) {
            return true;
          }
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

function includedAccessor(mod: HelperMethodsModule, key: string): PropertyDescriptor | undefined {
  if (!(mod instanceof Module)) return undefined;
  const descriptor = mod.instanceMethod(key);
  return descriptor?.get ? descriptor : undefined;
}

function includedMember(mod: HelperMethodsModule, key: string): unknown {
  let current: object | null = mod;
  if (mod instanceof Module) {
    current = Object.getPrototypeOf(mod) as object | null;
  }
  while (current && current !== Object.prototype) {
    const own = Object.getOwnPropertyDescriptor(current, key);
    if (own && (own.enumerable || !Object.prototype.hasOwnProperty.call(current, "constructor"))) {
      const value = (mod as Record<string, unknown>)[key];
      return typeof value === "function" || key === "_routes" ? value : undefined;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
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
