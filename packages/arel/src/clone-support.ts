/** @noRailsEquivalent PERMANENT */

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function objectClone<T extends object>(self: T): T {
  return Object.assign(Object.create(Object.getPrototypeOf(self) as object) as T, self);
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function cloneSlot<T>(value: T): T {
  if (Array.isArray(value)) return [...value] as T;
  if (typeof value !== "object" || value === null) return value;
  const cloneable = value as { clone?: () => T };
  if (typeof cloneable.clone === "function") return cloneable.clone();
  return objectClone(value as object) as T;
}
