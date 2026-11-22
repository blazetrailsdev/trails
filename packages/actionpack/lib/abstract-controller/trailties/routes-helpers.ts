/** @internal */

import {
  defineModule,
  include,
  includedModules,
  isModuleIncluded,
  constSet,
  rbClearMethodCache,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { moduleParents } from "@blazetrails/activesupport";

import { AbstractController } from "../../namespaces.js";

import type { RouteSet } from "../../action-dispatch/routing/route-set.js";
import type { HelpersClassMethods } from "../helpers.js";

type HelperMethodsModule = Record<string, (...args: unknown[]) => unknown>;
type ClassModule = { prototype: object };

export interface UrlHelpersRouteSet {
  urlHelpers(includePathHelpers?: boolean): HelperMethodsModule | ClassModule;
}

export interface RoutesHelpersClassMethods extends HelpersClassMethods {
  trailtieRoutesUrlHelpers?(includePathHelpers?: boolean): HelperMethodsModule;
  _routes?: unknown;
}

interface RoutesHelpersModule {
  /** @inventedArm if — PERMANENT */
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
      const inheritedDescriptor = (
        owner: object,
        key: string,
        descriptor: PropertyDescriptor,
      ): PropertyDescriptor => {
        const previous = Object.getOwnPropertyDescriptor(owner, key);
        const isWired = (self: object): boolean =>
          self === cls || (self as { constructor?: unknown }).constructor === cls;
        const fallback = (self: object): unknown => {
          if (previous) return previous.get ? previous.get.call(self) : previous.value;
          return Reflect.get(Object.getPrototypeOf(owner) as object, key, self);
        };
        if (typeof descriptor.value === "function") {
          const method = descriptor.value as (...args: unknown[]) => unknown;
          return {
            configurable: true,
            enumerable: false,
            writable: true,
            value: function (this: object, ...args: unknown[]): unknown {
              if (!isWired(this)) return method.apply(this, args);
              return (fallback(this) as (...args: unknown[]) => unknown).apply(this, args);
            },
          };
        }
        return {
          configurable: true,
          enumerable: false,
          get(this: object) {
            if (isWired(this)) return fallback(this);
            return descriptor.get ? descriptor.get.call(this) : descriptor.value;
          },
          set(this: object, value: unknown) {
            Object.defineProperty(this, key, {
              value,
              writable: true,
              configurable: true,
              enumerable: false,
            });
          },
        };
      };
      const namespace = moduleParents(cls).find((m) =>
        rbObjRespondTo(m, "trailtieRoutesUrlHelpers"),
      ) as RoutesHelpersClassMethods | undefined;
      const mod =
        namespace !== undefined
          ? namespace.trailtieRoutesUrlHelpers!(includePathHelpers)
          : routes.urlHelpers(includePathHelpers);
      const proto = cls.prototype;
      let earlier = installedMembers.get(proto);
      if (!earlier) installedMembers.set(proto, (earlier = []));
      const installed = new Map<string, PropertyDescriptor>();
      const inherited = (key: string, descriptor: PropertyDescriptor): PropertyDescriptor =>
        inheritedDescriptor(proto, key, descriptor);
      for (const [key, descriptor] of includedDescriptors(cls, mod)) {
        if (
          Object.hasOwn(proto, key) &&
          !earlier.some((included) => isIncludedMember(proto, key, included)) &&
          !isCopiedFromIncludedModule(cls, key)
        ) {
          continue;
        }
        const wrapped = inherited(key, descriptor);
        Object.defineProperty(proto, key, wrapped);
        rbClearMethodCache();
        installed.set(key, wrapped);
      }
      const moduleRoutes = (mod as { _routes?: Partial<RouteSet> })._routes;
      earlier.push(installed);
      moduleRoutes?.namedRoutes?._appendIncluder(
        proto,
        includePathHelpers,
        installed,
        earlier,
        inherited,
      );
      Object.defineProperty(
        cls,
        "_routes",
        inheritedDescriptor(cls, "_routes", { value: moduleRoutes ?? routes }),
      );
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

function isCopiedFromIncludedModule(cls: RoutesHelpersControllerClass, key: string): boolean {
  const own = Object.getOwnPropertyDescriptor(cls.prototype, key)!;
  return includedModules(cls).some((m) => {
    let source: PropertyDescriptor | undefined;
    if (typeof m === "function") {
      for (
        let p: object | null = (m as ClassModule).prototype;
        p && !source;
        p = Object.getPrototypeOf(p) as object | null
      ) {
        source = Object.getOwnPropertyDescriptor(p, key);
      }
    } else if (m !== null && typeof m === "object") {
      source = Object.getOwnPropertyDescriptor(m, key);
    }
    if (!source) return false;
    return (
      (source.value !== undefined && source.value === own.value) ||
      (source.get !== undefined && source.get === own.get)
    );
  });
}

function includedDescriptors(
  cls: RoutesHelpersControllerClass,
  mod: HelperMethodsModule | ClassModule,
): Map<string, PropertyDescriptor> {
  const descriptors = new Map<string, PropertyDescriptor>();
  if (typeof mod === "function") {
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

export const Trailties = { RoutesHelpers };

constSet(AbstractController, "Trailties", Trailties);
