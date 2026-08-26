// Ruby's `Object#clone` / `#clone` on a slot value, which the arel
// `initialize_copy` bodies are written on top of.
//
// Ruby allocates a copy of the same class carrying EVERY ivar and then runs
// `initialize_copy` on it, so a Rails `initialize_copy` only has to name the
// slots it duplicates — a field nobody thought about still rides along. JS has
// no such primitive, so every arel `clone()` starts from `objectClone(this)`
// and then does exactly what its Ruby `initialize_copy` does.
//
// This file has no Rails counterpart because Ruby gets both functions from
// core; it is not a trails abstraction over a Rails one.

/**
 * Ruby `Object#clone`: a copy of the same class carrying every own property.
 *
 * @internal
 */
export function objectClone<T extends object>(self: T): T {
  return Object.assign(Object.create(Object.getPrototypeOf(self) as object) as T, self);
}

/**
 * Ruby `#clone` on whatever occupies a node slot: an object that defines its
 * own `clone` runs it (Ruby would run its `initialize_copy` the same way), an
 * Array copies, a non-object is returned as-is, and anything else gets the
 * shallow same-class copy `Object#clone` is.
 *
 * @internal
 */
export function cloneSlot<T>(value: T): T {
  if (Array.isArray(value)) return [...value] as T;
  if (typeof value !== "object" || value === null) return value;
  const cloneable = value as { clone?: () => T };
  if (typeof cloneable.clone === "function") return cloneable.clone();
  return objectClone(value as object) as T;
}
