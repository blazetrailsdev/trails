export function wrap<T>(object: T | T[] | null | undefined): T[] {
  if (object === null || object === undefined) return [];
  if (Array.isArray(object)) return object;
  if ("toAry" in Object(object)) {
    const toAry = (object as { toAry?: () => T[] | null }).toAry;
    if (typeof toAry === "function") return toAry.call(object) ?? ([object] as T[]);
  }
  return [object] as T[];
}
