import type { Base } from "./base.js";
import { reload as persistenceReload } from "./persistence.js";

/**
 * Aggregation cache — memoizes composed-of value objects so repeated reads
 * return the same cached instance instead of allocating new ones each time.
 *
 * Mirrors: ActiveRecord::Aggregations
 */

// ---------------------------------------------------------------------------
// Cache accessors used by composed-of.ts
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
// Public instance methods
// ---------------------------------------------------------------------------

/**
 * Shallow-copy the aggregation cache into the duped record.
 * Cached value objects are frozen so sharing references across the dup is safe.
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
 * Clear the aggregation cache before reloading from the database so stale
 * value objects are not returned after the reload.
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
