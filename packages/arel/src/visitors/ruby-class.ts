/** @noRailsEquivalent PERMANENT */
import { temporalClassName, temporalTag } from "../temporal-tag.js";

export function rubyClassName(v: unknown): string | null {
  if (v !== null && typeof v === "object" && "ast" in v && "toSql" in v) {
    return "ArelSelectManager";
  }
  if (Array.isArray(v)) return "Array";
  if (typeof v === "number") {
    return Number.isInteger(v) ? "Integer" : "Float";
  }
  if (typeof v === "bigint") return "Integer";
  if (v === null || v === undefined) return "NilClass";
  if (typeof v === "string") return "String";
  if (typeof v === "boolean") return v ? "TrueClass" : "FalseClass";
  const dateTime = dateTimeClassName(v);
  if (dateTime !== null) return dateTime;
  if (isHashAnalogue(v)) return "Hash";
  return null;
}

export function isHashAnalogue(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  for (let proto = Object.getPrototypeOf(v); proto !== null; proto = Object.getPrototypeOf(proto)) {
    if (proto === Object.prototype) return true;
    const ctor = Object.getOwnPropertyDescriptor(proto, "constructor")?.value as
      | { prototype?: unknown }
      | undefined;
    if (typeof ctor === "function" && ctor.prototype === proto) {
      return false;
    }
  }
  return true;
}

function dateTimeClassName(v: unknown): string | null {
  const temporalClass = temporalClassName(v);
  if (temporalClass !== null) return temporalClass;
  if (temporalTag(v) !== null) return null;
  const isInstantDuckType =
    typeof v === "object" &&
    v !== null &&
    "toISOString" in v &&
    typeof (v as { toISOString: unknown }).toISOString === "function";
  return isInstantDuckType ? "Time" : null;
}
