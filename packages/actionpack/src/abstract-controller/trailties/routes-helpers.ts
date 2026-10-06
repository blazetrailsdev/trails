/** @internal */

import { include, includedModules, isModuleIncluded, Module } from "@blazetrails/ruby-compat";

import type { HelpersClassMethods } from "../helpers.js";

type HelperMethodsModule = Record<string, (...args: unknown[]) => unknown>;

export interface UrlHelpersRouteSet {
  urlHelpers(includePathHelpers?: boolean): HelperMethodsModule | Module;
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
    const urlHelpersModule = (): HelperMethodsModule | Module =>
      namespaceBuilder
        ? namespaceBuilder(includePathHelpers)
        : routes.urlHelpers(includePathHelpers);
    const proto = cls.prototype;
    Object.setPrototypeOf(
      proto,
      new Proxy(Object.getPrototypeOf(proto) as object, {
        get(target, key, receiver) {
          if (typeof key === "string") {
            const accessor = includedAccessor(cls, urlHelpersModule(), key);
            if (accessor) return accessor.get!.call(receiver);
            const member = includedMember(cls, urlHelpersModule(), key);
            if (member !== undefined) return member;
          }
          return Reflect.get(target, key, receiver);
        },
        set(target, key, value, receiver) {
          const accessor =
            typeof key === "string" ? includedAccessor(cls, urlHelpersModule(), key) : undefined;
          if (accessor?.set) {
            accessor.set.call(receiver, value);
            return true;
          }
          return Reflect.set(target, key, value, receiver);
        },
        has(target, key) {
          if (
            typeof key === "string" &&
            (includedAccessor(cls, urlHelpersModule(), key) ||
              includedMember(cls, urlHelpersModule(), key) !== undefined)
          ) {
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

function includedAccessor(
  cls: RoutesHelpersControllerClass,
  mod: HelperMethodsModule | Module,
  key: string,
): PropertyDescriptor | undefined {
  if (!(mod instanceof Module)) return undefined;
  const descriptor = moduleInstanceMethod(cls, mod, key);
  return descriptor?.get ? descriptor : undefined;
}

function includedMember(
  cls: RoutesHelpersControllerClass,
  mod: HelperMethodsModule | Module,
  key: string,
): unknown {
  if (mod instanceof Module) return moduleInstanceMethod(cls, mod, key)?.value;
  let current: object | null = mod;
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

interface IncludedMethodTable {
  prototype: object;
  ancestry: object;
}

const includedMethodTables = new WeakMap<object, WeakMap<Module, IncludedMethodTable>>();

/** @noRailsEquivalent PERMANENT */
function moduleInstanceMethod(
  cls: RoutesHelpersControllerClass,
  mod: Module,
  key: string,
): PropertyDescriptor | undefined {
  if (key === "constructor") return undefined;
  let tables = includedMethodTables.get(cls);
  if (!tables) includedMethodTables.set(cls, (tables = new WeakMap()));
  let table = tables.get(mod);
  if (!table) {
    const scan = class {};
    include(scan, mod);
    const ancestry = class {};
    for (const included of includedModules(scan).reverse()) {
      if (included !== mod && isModuleIncluded(cls, included as object)) {
        include(ancestry, included as object);
      }
    }
    const probe = class extends ancestry {};
    include(probe, mod);
    table = { prototype: probe.prototype, ancestry: ancestry.prototype };
    tables.set(mod, table);
  }
  for (
    let current: object | null = table.prototype;
    current && current !== table.ancestry;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return descriptor;
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
