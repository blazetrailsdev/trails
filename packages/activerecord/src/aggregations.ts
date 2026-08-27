import type { Base } from "./base.js";
import { addAggregateReflection, create } from "./reflection.js";
import { assertValidKeys, camelize, constantize, prepend } from "@blazetrails/activesupport";

export function getAggregationCache(record: Base): Map<string, unknown> {
  const self = record as any;
  if (!self._aggregationCache) self._aggregationCache = new Map<string, unknown>();
  return self._aggregationCache as Map<string, unknown>;
}

/** @internal */
export function clearAggregationCache(record: Base): void {
  const self = record as any;
  if (self._aggregationCache && record.isPersisted()) {
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

/** @missingRailsCall include — PERMANENT */
export function composedOf(
  modelClass: typeof Base,
  partId: string,
  options: ComposedOfOptions,
): void {
  assertValidKeys(options as unknown as Record<string, unknown>, [
    "className",
    "mapping",
    "allowNil",
    "constructorFn",
    "converter",
  ]);

  includeAggregations(modelClass);

  const name = partId;
  const className = options.className ?? camelize(name);
  let mapping: [string, string][] | [string, string] = options.mapping ?? [name, name];
  if (!Array.isArray(mapping[0])) mapping = [mapping] as [string, string][];
  const allowNil = options.allowNil ?? false;
  const constructor = options.constructorFn ?? "new";
  const converter = options.converter;

  readerMethod(modelClass, name, className, mapping as [string, string][], allowNil, constructor);
  writerMethod(modelClass, name, className, mapping as [string, string][], allowNil, converter);

  const reflection = create(
    "composedOf",
    partId,
    null,
    typeof options.className === "function"
      ? { ...options, className: options.className.name, anonymousClass: options.className }
      : { ...options },
    modelClass,
  );
  addAggregateReflection(modelClass, partId, reflection);
}

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
  modelClass: typeof Base,
  name: string,
  className: (new (...args: any[]) => any) | string,
  mapping: [string, string][],
  allowNil: boolean,
  constructor: ((...args: any[]) => any) | string,
): void {
  const existing = Object.getOwnPropertyDescriptor(modelClass.prototype, name);
  Object.defineProperty(modelClass.prototype, name, {
    enumerable: existing?.enumerable ?? false,
    get(this: Base): unknown {
      const cache = getAggregationCache(this);
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
  modelClass: typeof Base,
  name: string,
  className: (new (...args: any[]) => any) | string,
  mapping: [string, string][],
  allowNil: boolean,
  converter?: (value: unknown) => unknown,
): void {
  const existing = Object.getOwnPropertyDescriptor(modelClass.prototype, name);
  Object.defineProperty(modelClass.prototype, name, {
    enumerable: existing?.enumerable ?? false,
    get: existing?.get,
    set(this: Base, value: unknown): void {
      const klass = resolveClass(className);
      const cache = getAggregationCache(this);
      if ((value === null || value === undefined) && allowNil === true) {
        for (const [modelAttr] of mapping) this.writeAttribute(modelAttr, null);
        cache.set(name, null);
        return;
      }
      if (value instanceof klass) {
        for (const [modelAttr, valueAttr] of mapping)
          this.writeAttribute(modelAttr, value[valueAttr]);
        cache.set(
          name,
          Object.freeze(Object.assign(Object.create(Object.getPrototypeOf(value)), value)),
        );
        return;
      }
      if (converter && value != null) {
        const converted = converter(value);
        if (converted == null) {
          for (const [modelAttr] of mapping) this.writeAttribute(modelAttr, null);
          cache.set(name, null);
        } else if (converted instanceof klass) {
          for (const [modelAttr, valueAttr] of mapping)
            this.writeAttribute(modelAttr, (converted as any)[valueAttr]);
          cache.set(
            name,
            Object.freeze(
              Object.assign(Object.create(Object.getPrototypeOf(converted)), converted),
            ),
          );
        } else {
          _decompose(this, cache, name, mapping, converted);
        }
        return;
      }
      _decompose(this, cache, name, mapping, value);
    },
    configurable: true,
  });
}

export function copyAggregationCacheForDup(this: Base, other: unknown): void {
  const src = (other as { _aggregationCache?: Map<string, unknown> })?._aggregationCache;
  if (src) (this as { _aggregationCache?: Map<string, unknown> })._aggregationCache = new Map(src);
}

type ReloadOptions = { lock?: boolean | string; unscoped?: boolean };
type ReloadFn<T extends Base> = (this: T, options?: ReloadOptions) => Promise<T>;

export function reload<T extends Base>(inheritedReload: ReloadFn<T>): ReloadFn<T> {
  return function (this: T, options?: ReloadOptions): Promise<T> {
    clearAggregationCache(this);
    return inheritedReload.call(this, options);
  };
}

const aggregationsIncluded = Symbol.for("@blazetrails/activerecord:aggregationsIncluded");

export function includeAggregations(modelClass: typeof Base): void {
  const proto = modelClass.prototype as Record<string | symbol, any>;
  if (proto[aggregationsIncluded]) return;
  Object.defineProperty(proto, aggregationsIncluded, {
    value: true,
    configurable: true,
    enumerable: false,
  });

  const inheritedReload = proto.reload as ReloadFn<Base>;
  Object.defineProperty(proto, "reload", {
    value: reload(inheritedReload),
    writable: true,
    configurable: true,
    enumerable: false,
  });

  prepend(proto, {
    initInternals,
    initializeDup(this: Base, super_: (other: unknown) => void, other: unknown): void {
      copyAggregationCacheForDup.call(this, other);
      super_(other);
    },
  });
}

/** @internal */
function initInternals(this: Base, super_: () => void): void {
  super_();
  (this as any)._aggregationCache = new Map<string, unknown>();
}
