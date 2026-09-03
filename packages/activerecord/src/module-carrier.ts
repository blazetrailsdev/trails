import type { Base } from "./base.js";

/**
 * @internal
 * @noRailsEquivalent PERMANENT
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
