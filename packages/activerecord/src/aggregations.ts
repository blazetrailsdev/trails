import type { Base } from "./base.js";
import { addAggregateReflection, create } from "./reflection.js";
import { assertValidKeys, camelize, constantize, isPlainObject } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { include, isModuleIncluded, Module } from "@blazetrails/ruby-compat";

export const Aggregations = new Module();

/** @internal */
function clearAggregationCache(this: Base): void {
  const self = this as any;
  if (self._aggregationCache && this.isPersisted()) {
    (self._aggregationCache as Map<string, unknown>).clear();
  }
}

interface ComposedOfOptions {
  className?: (new (...args: any[]) => any) | string;
  mapping?: [string, string][] | [string, string];
  constructorFn?: ((...args: any[]) => any) | string;
  converter?: (value: unknown) => unknown;
  allowNil?: boolean;
}

export function composedOf(this: typeof Base, partId: string, options: ComposedOfOptions): void {
  assertValidKeys(options as unknown as Record<string, unknown>, [
    "className",
    "mapping",
    "allowNil",
    "constructorFn",
    "converter",
  ]);

  if (!isModuleIncluded(this, Aggregations)) include(this, Aggregations);

  const name = partId;
  const className = options.className ?? camelize(name);
  let mapping: [string, string][] | [string, string] = options.mapping ?? [name, name];
  if (!Array.isArray(mapping[0])) mapping = [mapping] as [string, string][];
  const allowNil = options.allowNil ?? false;
  const constructor = options.constructorFn ?? "new";
  const converter = options.converter;

  readerMethod.call(this, name, className, mapping as [string, string][], allowNil, constructor);
  writerMethod.call(this, name, className, mapping as [string, string][], allowNil, converter);

  const reflection = create(
    "composedOf",
    partId,
    null,
    typeof options.className === "function"
      ? { ...options, className: options.className.name, anonymousClass: options.className }
      : { ...options },
    this,
  );
  addAggregateReflection(this, partId, reflection);
}

export const ClassMethods = {
  composedOf,
};

/** @internal */
function resolveClass(
  className: (new (...args: any[]) => any) | string,
): new (...args: any[]) => any {
  return typeof className === "string"
    ? (constantize(className) as new (...args: any[]) => any)
    : className;
}

/** @internal */
function readerMethod(
  this: typeof Base,
  name: string,
  className: (new (...args: any[]) => any) | string,
  mapping: [string, string][],
  allowNil: boolean,
  constructor: ((...args: any[]) => any) | string,
): void {
  const existing = Object.getOwnPropertyDescriptor(this.prototype, name);
  Object.defineProperty(this.prototype, name, {
    enumerable: existing?.enumerable ?? false,
    get(this: Base): unknown {
      const cache: Map<string, unknown> = (this as any)._aggregationCache;
      if (
        cache.get(name) == null &&
        (!allowNil || mapping.some(([key]) => this.readAttribute(key) != null))
      ) {
        const attrs = mapping.map(([key]) => this.readAttribute(key));
        const object =
          typeof constructor === "function"
            ? constructor(...attrs)
            : constructor === "new"
              ? new (resolveClass(className))(...attrs)
              : (resolveClass(className) as any)[constructor](...attrs);
        cache.set(name, object == null ? object : Object.freeze(object));
      }
      return cache.get(name) ?? null;
    },
    configurable: true,
  });
}

function _decompose(
  record: Base,
  cache: Map<string, unknown>,
  name: string,
  mapping: [string, string][],
  value: unknown,
): void {
  const result: Record<string, unknown> = {};
  for (const [modelAttr, valueAttr] of mapping) {
    const prop = (value as any)[valueAttr];
    const resolved = typeof prop === "function" ? (prop as () => unknown).call(value) : prop;
    if (resolved === undefined) {
      throw new TypeError(
        `Cannot decompose value: '${valueAttr}' is not a property of the assigned object`,
      );
    }
    result[modelAttr] = resolved;
  }
  for (const [modelAttr] of mapping) record.writeAttribute(modelAttr, result[modelAttr]);
  const proto = Object.getPrototypeOf(value as object) ?? Object.prototype;
  cache.set(name, Object.freeze(Object.assign(Object.create(proto), value)));
}

/** @internal */
function writerMethod(
  this: typeof Base,
  name: string,
  className: (new (...args: any[]) => any) | string,
  mapping: [string, string][],
  allowNil: boolean,
  converter?: (value: unknown) => unknown,
): void {
  const existing = Object.getOwnPropertyDescriptor(this.prototype, name);
  Object.defineProperty(this.prototype, name, {
    enumerable: existing?.enumerable ?? false,
    get: existing?.get,
    set(this: Base, part: unknown): void {
      const klass = resolveClass(className);
      const cache: Map<string, unknown> = (this as any)._aggregationCache;

      if (!(part instanceof klass || converter == null || part == null)) {
        part = converter(part);
      }

      const hashFromMultiparameterAssignment =
        isPlainObject(part) && Object.keys(part).every((key) => /^\d+$/.test(key));
      if (hashFromMultiparameterAssignment) {
        const keys = Object.keys(part as object).map(Number);
        if (keys.length !== Math.max(...keys)) throw new ArgumentError();
        part = new klass(
          ...keys.sort((a, b) => a - b).map((key) => (part as Record<number, unknown>)[key]),
        );
      }

      if (part == null && allowNil) {
        for (const [key] of mapping) this.writeAttribute(key, null);
        cache.set(name, null);
      } else if (part instanceof klass) {
        for (const [key, value] of mapping) this.writeAttribute(key, part[value]);
        cache.set(
          name,
          Object.freeze(Object.assign(Object.create(Object.getPrototypeOf(part)), part)),
        );
      } else {
        _decompose(this, cache, name, mapping, part);
      }
    },
    configurable: true,
  });
}

type ReloadOptions = { lock?: boolean | string; unscoped?: boolean };

export function initializeDup(this: Base, other: unknown): void {
  (this as any)._aggregationCache = new Map((this as any)._aggregationCache);
  Aggregations.superMethod(this, "initializeDup")!(other);
}

export function reload(this: Base, options?: ReloadOptions): Promise<Base> {
  (this as any).clearAggregationCache();
  return Aggregations.superMethod(this, "reload")!(options) as Promise<Base>;
}

/** @internal */
function initInternals(this: Base): void {
  Aggregations.superMethod(this, "initInternals")!();
  (this as any)._aggregationCache = new Map<string, unknown>();
}

Aggregations.defineMethod("initializeDup", initializeDup);
Aggregations.defineMethod("reload", reload);
Aggregations.defineMethod("clearAggregationCache", clearAggregationCache);
Aggregations.defineMethod("initInternals", initInternals);
