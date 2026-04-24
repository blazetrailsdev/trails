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

  Object.defineProperty(modelClass.prototype, name, {
    get(this: Base): unknown {
      const cache = getAggregationCache(this);
      if (cache.has(name)) return cache.get(name);

      const args = options.mapping.map(([modelAttr]) => this.readAttribute(modelAttr));
      if (args.every((a) => a === null || a === undefined)) return null;

      const obj = Object.freeze(new options.className(...args));
      cache.set(name, obj);
      return obj;
    },
    set(this: Base, value: unknown): void {
      const cache = getAggregationCache(this);

      if (value === null || value === undefined) {
        for (const [modelAttr] of options.mapping) this.writeAttribute(modelAttr, null);
        cache.delete(name);
        return;
      }

      if (value instanceof options.className) {
        for (const [modelAttr, valueAttr] of options.mapping)
          this.writeAttribute(modelAttr, (value as any)[valueAttr]);
        cache.set(
          name,
          Object.freeze(Object.assign(Object.create(Object.getPrototypeOf(value)), value)),
        );
        return;
      }

      if (options.converter) {
        const converted = options.converter(value);
        if (converted instanceof options.className) {
          for (const [modelAttr, valueAttr] of options.mapping)
            this.writeAttribute(modelAttr, (converted as any)[valueAttr]);
          cache.set(
            name,
            Object.freeze(
              Object.assign(Object.create(Object.getPrototypeOf(converted)), converted),
            ),
          );
        }
      }
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
export async function reload<T extends Base>(this: T): Promise<T> {
  clearAggregationCache(this);
  return (persistenceReload as unknown as (this: T) => Promise<T>).call(this);
}

export const InstanceMethods = {
  initializeDup,
  reload,
};
