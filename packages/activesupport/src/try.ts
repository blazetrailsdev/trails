/**
 * ActiveSupport Object#try
 *
 * Calls a method on an object only if it responds to that method (is not null/undefined).
 * Returns nil/undefined otherwise.
 *
 * Rails:  user.try(:name)         # => "Alice" or nil
 *         user.try { |u| u.name } # => "Alice" or nil (block form)
 *
 * TypeScript:
 *   tryCall(user, "name")              // "Alice" | undefined
 *   tryCall(user, "format", "long")    // result or undefined
 *   tryCall(null, "name")              // undefined (safe)
 *   tryCall(user, (u) => u.name)       // block form
 */

/**
 * Call a named method on obj, returning undefined if obj is null/undefined
 * or if the method doesn't exist.
 */
export function tryCall<T extends object>(
  obj: T | null | undefined,
  method: string,
  ...args: unknown[]
): unknown {
  if (obj == null) return undefined;
  const val = (obj as any)[method];
  if (typeof val === "function") return val.apply(obj, args);
  if (val !== undefined && args.length === 0) return val;
  // Check if key truly exists (handles undefined values)
  if (args.length === 0 && typeof obj === "object" && method in obj) return val;
  return undefined;
}

/**
 * Block form — pass a callback that receives the object.
 * Returns undefined if obj is null/undefined.
 */
export function tryWith<T, R>(obj: T | null | undefined, fn: (obj: T) => R): R | undefined {
  if (obj == null) return undefined;
  return fn(obj);
}

/**
 * tryBang — like tryCall but throws if the method doesn't exist (obj must respond).
 */
export function tryBang<T extends object>(
  obj: T | null | undefined,
  method: string,
  ...args: unknown[]
): unknown {
  if (obj == null) return undefined;
  const fn = (obj as any)[method];
  if (typeof fn !== "function") {
    throw new TypeError(`undefined method '${method}' for ${String(obj)}`);
  }
  return fn.apply(obj, args);
}
