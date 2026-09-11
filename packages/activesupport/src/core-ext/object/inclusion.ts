import { Range } from "@blazetrails/ruby-compat/range";
import { ArgumentError, isPlainObject } from "../../hash-utils.js";

export function isIn<T>(
  value: T,
  anotherObject: Range<T> | T[] | Set<T> | Map<T, unknown> | string | Record<string, unknown>,
): boolean {
  if (anotherObject instanceof Range) return anotherObject.cover(value);
  if (Array.isArray(anotherObject)) return anotherObject.includes(value);
  if (anotherObject instanceof Set) return anotherObject.has(value);
  if (typeof anotherObject === "string") return anotherObject.includes(value as unknown as string);
  if (anotherObject instanceof Map) return anotherObject.has(value);
  if (isPlainObject(anotherObject)) {
    return Object.prototype.hasOwnProperty.call(anotherObject, value as string);
  }
  throw new ArgumentError("The parameter passed to #in? must respond to #include?");
}

export function presenceIn<T>(
  value: T,
  anotherObject: Range<T> | T[] | Set<T> | Map<T, unknown> | string | Record<string, unknown>,
): T | null {
  return isIn(value, anotherObject) ? value : null;
}
