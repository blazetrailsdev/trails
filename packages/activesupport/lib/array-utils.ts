/** @noRailsEquivalent PERMANENT */
export function kernelArray<T>(value: T | T[] | null | undefined): T[];
export function kernelArray<T>(value: Iterable<T> | null | undefined): T[];
export function kernelArray<T>(value: T | T[] | Iterable<T> | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && typeof (value as any)[Symbol.iterator] === "function") {
    return [...(value as unknown as Iterable<T>)];
  }
  if (typeof (value as { toA?: unknown } | null)?.toA === "function") {
    return (value as unknown as { toA(): T[] }).toA();
  }
  return [value] as T[];
}

/** @noRailsEquivalent PERMANENT */
export function selectBang<T>(array: T[], predicate: (item: T) => boolean): T[] {
  array.splice(0, array.length, ...array.filter(predicate));
  return array;
}

/** @noRailsEquivalent PERMANENT */
export function min<T>(collection: readonly T[]): T | undefined {
  let result: T | undefined;
  let seen = false;
  for (const item of collection) {
    if (!seen || item < (result as T)) {
      result = item;
      seen = true;
    }
  }
  return result;
}
