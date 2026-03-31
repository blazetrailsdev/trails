/**
 * Duplicable — checks whether an object can safely be duplicated.
 * Mirrors Rails' core_ext/object/duplicable.rb.
 *
 * In JS, most values are duplicable (via structuredClone or spread).
 * Notable exceptions include functions, symbols, WeakRef, WeakMap, and WeakSet.
 */

export function isDuplicable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "function") return false;
  if (typeof value === "symbol") return false;
  if (value instanceof WeakMap || value instanceof WeakSet) return false;
  if (typeof WeakRef !== "undefined" && value instanceof WeakRef) return false;
  return true;
}

export class Method {
  static isDuplicable(): false {
    return false;
  }
}

export class UnboundMethod {
  static isDuplicable(): false {
    return false;
  }
}

export namespace Singleton {
  export function isDuplicable(): false {
    return false;
  }
}
