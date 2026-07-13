import type { Base } from "./base.js";

/**
 * Interpose a per-class prototype carrier directly below `modelClass.prototype`,
 * memoized per (class, purpose). This is the shared implementation of the RFC
 * 0058 module-carrier mechanism — the runtime analogue of a Ruby `include` of an
 * anonymous module into a class. `store()` and `enum` each drive one instance of
 * it (each keyed by its own `cache`), so an override on `modelClass.prototype`
 * can reach the generated method via `super`.
 *
 * On first call for a `modelClass` the carrier is spliced into the chain between
 * `modelClass.prototype` and its current parent. The current parent is captured
 * at call time, so carriers from different purposes stack in `include` order
 * (last-interposed nearest to the prototype — Ruby's last-included-module-wins).
 *
 * The `cache` doubles as the per-purpose key: pass a distinct
 * `WeakMap<typeof Base, object>` per mechanism so their carriers memoize
 * independently.
 *
 * @internal
 */
export function getOrCreateModuleCarrier(
  modelClass: typeof Base,
  cache: WeakMap<typeof Base, object>,
): object {
  const existing = cache.get(modelClass);
  if (existing) return existing;
  const proto = modelClass.prototype as object;
  const carrier = Object.create(Object.getPrototypeOf(proto)) as object;
  Object.setPrototypeOf(proto, carrier);
  cache.set(modelClass, carrier);
  return carrier;
}
