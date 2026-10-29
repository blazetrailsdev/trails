/** @internal */

import {
  defineModule,
  include,
  includedModules,
  isModuleIncluded,
  Module,
  rbModConstSet,
} from "@blazetrails/ruby-compat";

import { AbstractController } from "../../namespaces.js";

import type { RouteSet } from "../../action-dispatch/routing/route-set.js";
import type { HelpersClassMethods } from "../helpers.js";

type HelperMethodsModule = Record<string, (...args: unknown[]) => unknown>;

export interface UrlHelpersRouteSet {
  urlHelpers(includePathHelpers?: boolean): HelperMethodsModule | Module;
}

export interface RoutesHelpersClassMethods extends HelpersClassMethods {
  trailtieRoutesUrlHelpers?(includePathHelpers?: boolean): HelperMethodsModule;
  _routes?: unknown;
}

interface RoutesHelpersModule {
  with(
    routes: UrlHelpersRouteSet,
    includePathHelpers?: boolean,
  ): (cls: RoutesHelpersControllerClass) => void;
}

export const RoutesHelpers = defineModule({}) as RoutesHelpersModule;
Object.defineProperty(RoutesHelpers, "with", {
  value: function (
    routes: UrlHelpersRouteSet,
    includePathHelpers = true,
  ): (cls: RoutesHelpersControllerClass) => void {
    return (cls) => {
      const namespaceBuilder = findTrailtieUrlHelpers(cls);
      const urlHelpersModule = (): HelperMethodsModule | Module =>
        namespaceBuilder
          ? namespaceBuilder(includePathHelpers)
          : routes.urlHelpers(includePathHelpers);
      const mod = urlHelpersModule();
      const proto = cls.prototype;
      let earlier = installedMembers.get(proto);
      if (!earlier) installedMembers.set(proto, (earlier = []));
      const installed = new Map<string, PropertyDescriptor>();
      for (const [key, descriptor] of includedDescriptors(cls, mod)) {
        if (
          Object.hasOwn(proto, key) &&
          !earlier.some((included) => isIncludedMember(proto, key, included))
        ) {
          continue;
        }
        Object.defineProperty(proto, key, descriptor);
        installed.set(key, descriptor);
      }
      const namedRoutes = (mod as { _proxy?: { _routes?: RouteSet } })._proxy?._routes?.namedRoutes;
      earlier.push(installed);
      namedRoutes?._appendIncluder(proto, includePathHelpers, installed, earlier);
      cls._routes = (mod as { _routes?: unknown })._routes ?? routes;
    };
  },
  writable: true,
  configurable: true,
});

export interface RoutesHelpersControllerClass extends RoutesHelpersClassMethods {
  prototype: object;
}

const installedMembers = new WeakMap<object, Map<string, PropertyDescriptor>[]>();

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function isIncludedMember(
  proto: object,
  key: string,
  installed: Map<string, PropertyDescriptor>,
): boolean {
  const own = Object.getOwnPropertyDescriptor(proto, key);
  if (!own) return true;
  const mine = installed.get(key);
  return mine !== undefined && own.value === mine.value && own.get === mine.get;
}

function includedDescriptors(
  cls: RoutesHelpersControllerClass,
  mod: HelperMethodsModule | Module,
): Map<string, PropertyDescriptor> {
  const descriptors = new Map<string, PropertyDescriptor>();
  if (mod instanceof Module) {
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
    for (
      let current: object | null = probe.prototype;
      current && current !== ancestry.prototype;
      current = Object.getPrototypeOf(current) as object | null
    ) {
      for (const key of Object.getOwnPropertyNames(current)) {
        if (key === "constructor" || descriptors.has(key)) continue;
        descriptors.set(key, Object.getOwnPropertyDescriptor(current, key)!);
      }
    }
    return descriptors;
  }
  for (
    let current: object | null = mod;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (descriptors.has(key)) continue;
      const own = Object.getOwnPropertyDescriptor(current, key)!;
      if (!own.enumerable && Object.hasOwn(current, "constructor")) continue;
      const value = (mod as Record<string, unknown>)[key];
      if (typeof value !== "function" && key !== "_routes") continue;
      descriptors.set(key, { value, writable: true, configurable: true, enumerable: false });
    }
  }
  return descriptors;
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

export const Trailties = { RoutesHelpers };

rbModConstSet(AbstractController, "Trailties", Trailties);
