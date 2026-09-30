/** @internal */

import { include, includedModules, isModuleIncluded, Module } from "@blazetrails/ruby-compat";

import type { HelperMethodsModule, HelpersClassMethods } from "../helpers.js";

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
  skipped: Set<string>;
}

const includedMethodTables = new WeakMap<object, WeakMap<Module, IncludedMethodTable>>();

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
    const probe = class {};
    include(probe, mod);
    const kept = new Set<string>();
    const skipped = new Set<string>();
    for (const included of includedModules(probe)) {
      const names = moduleMethodNames(included);
      const target = isModuleIncluded(cls, included as object) ? skipped : kept;
      for (const name of names) target.add(name);
    }
    for (const name of kept) skipped.delete(name);
    table = { prototype: probe.prototype, skipped };
    tables.set(mod, table);
  }
  if (table.skipped.has(key)) return undefined;
  for (
    let current: object | null = table.prototype;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return descriptor;
  }
  return undefined;
}

function moduleMethodNames(mod: unknown): string[] {
  if (mod instanceof Module) return mod.instanceMethods();
  if (typeof mod === "function")
    return Object.getOwnPropertyNames((mod as { prototype: object }).prototype);
  return Object.getOwnPropertyNames(mod);
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
