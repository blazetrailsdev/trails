import type { Base } from "./base.js";
import { reload as persistenceReload } from "./persistence.js";
import { AggregateReflection } from "./reflection.js";

/**
 * Aggregation cache and composed-of value-object support.
 *
 * Mirrors: ActiveRecord::Aggregations
 */

// ---------------------------------------------------------------------------
// Cache accessors
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ClassMethods
// ---------------------------------------------------------------------------

interface ComposedOfOptions {
  className: new (...args: any[]) => any;
  mapping: [string, string][];
  constructorFn?: (...args: any[]) => any;
  converter?: (value: unknown) => unknown;
  allowNil?: boolean;
}

/**
 * Configure a composed-of value object on a model.
 *
 * Mirrors: ActiveRecord::Aggregations::ClassMethods#composed_of
 */
export function composedOf(
  modelClass: typeof Base,
  name: string,
  options: ComposedOfOptions,
): void {
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_aggregateReflections")) {
    const parent: Map<string, AggregateReflection> | undefined = (modelClass as any)
      ._aggregateReflections;
    (modelClass as any)._aggregateReflections = parent ? new Map(parent) : new Map();
  }
  (modelClass as any)._aggregateReflections.set(
    name,
    new AggregateReflection(
      name,
      null,
      {
        className: options.className.name,
        mapping: options.mapping,
        anonymousClass: options.className,
      },
      modelClass,
    ),
  );

  readerMethod(modelClass, name, options.mapping, options.className, options.constructorFn);
  writerMethod(
    modelClass,
    name,
    options.mapping,
    options.className,
    options.converter,
    options.allowNil,
  );
}

/**
 * @internal
 * Mirrors: ActiveRecord::Aggregations::ClassMethods#reader_method
 */
function readerMethod(
  modelClass: typeof Base,
  name: string,
  mapping: [string, string][],
  klass: new (...args: any[]) => any,
  constructorFn?: (...args: any[]) => any,
): void {
  const existing = Object.getOwnPropertyDescriptor(modelClass.prototype, name);
  Object.defineProperty(modelClass.prototype, name, {
    enumerable: existing?.enumerable ?? false,
    get(this: Base): unknown {
      const cache = getAggregationCache(this);
      if (cache.has(name)) return cache.get(name);
      const args = mapping.map(([modelAttr]) => this.readAttribute(modelAttr));
      if (args.every((a) => a === null || a === undefined)) return null;
      const built = constructorFn ? constructorFn(...args) : new klass(...args);
      if (built == null) return null;
      const obj = Object.freeze(built);
      cache.set(name, obj);
      return obj;
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
  // Mirrors Rails: part.dup.freeze — copy first, then freeze the copy.
  const proto = Object.getPrototypeOf(value as object) ?? Object.prototype;
  cache.set(name, Object.freeze(Object.assign(Object.create(proto), value)));
}

/**
 * @internal
 * Mirrors: ActiveRecord::Aggregations::ClassMethods#writer_method
 */
function writerMethod(
  modelClass: typeof Base,
  name: string,
  mapping: [string, string][],
  klass: new (...args: any[]) => any,
  converter?: (value: unknown) => unknown,
  allowNil?: boolean,
): void {
  const existing = Object.getOwnPropertyDescriptor(modelClass.prototype, name);
  Object.defineProperty(modelClass.prototype, name, {
    enumerable: existing?.enumerable ?? false,
    get: existing?.get,
    set(this: Base, value: unknown): void {
      const cache = getAggregationCache(this);
      // allow_nil: true → clear all mapped columns when nil and store null in cache.
      // allow_nil: false (default) → fall through so decomposition raises naturally
      // (mirrors Rails: nil.send(:method) → NoMethodError).
      if ((value === null || value === undefined) && allowNil === true) {
        for (const [modelAttr] of mapping) this.writeAttribute(modelAttr, null);
        cache.set(name, null);
        return;
      }
      if (value instanceof klass) {
        for (const [modelAttr, valueAttr] of mapping)
          this.writeAttribute(modelAttr, (value as any)[valueAttr]);
        cache.set(
          name,
          Object.freeze(Object.assign(Object.create(Object.getPrototypeOf(value)), value)),
        );
        return;
      }
      // Rails guard: converter is never called when part.nil? (aggregations.rb:265).
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
          // Converter returned a non-null non-klass value: decompose via the mapped
          // accessor, mirroring Rails which falls through unconditionally after conversion
          // (aggregations.rb:279-281 — no second is_a?(klass) check).
          _decompose(this, cache, name, mapping, converted);
        }
        return;
      }
      // Non-klass, no converter (or nil with allowNil:false): decompose by reading each
      // mapped attribute. Mirrors Rails: part.send(value_attr) raises NoMethodError when
      // the method doesn't exist; we throw if the property is absent.
      _decompose(this, cache, name, mapping, value);
    },
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Instance methods
// ---------------------------------------------------------------------------

/**
 * Shallow-copy the aggregation cache into the duped record.
 * Cached value objects are frozen so sharing references is safe.
 *
 * Mirrors: ActiveRecord::Aggregations#initialize_dup
 */
export function initializeDup(this: Base, _other: unknown): void {
  const self = this as any;
  if (self._aggregationCache) {
    self._aggregationCache = new Map(self._aggregationCache as Map<string, unknown>);
  }
}

/**
 * Clear the aggregation cache before reloading from the database.
 *
 * Mirrors: ActiveRecord::Aggregations#reload
 */
export async function reload<T extends Base>(
  this: T,
  options?: { lock?: boolean | string; unscoped?: boolean },
): Promise<T> {
  clearAggregationCache(this);
  return (
    persistenceReload as unknown as (
      this: T,
      options?: { lock?: boolean | string; unscoped?: boolean },
    ) => Promise<T>
  ).call(this, options);
}

export const InstanceMethods = {
  initializeDup,
  reload,
};

/**
 * @internal
 * Mirrors: ActiveRecord::Aggregations#init_internals
 */
function initInternals(this: Base): void {
  (this as any)._aggregationCache = new Map<string, unknown>();
}
