/**
 * @noRailsEquivalent PERMANENT — `Visitor#visit` dispatches on
 * `dispatch[object.class]` (visitor.rb:29), and every Ruby value has a class.
 * A JS primitive has none, so the class name Ruby would have dispatched on has
 * to be computed; `visitor.ts:102-121` is the call site. No Ruby file has a
 * counterpart because Ruby needs none.
 */
import { temporalClassName, temporalTag } from "../temporal-tag.js";

/**
 * visitor.rb:29, visitor.rb:17-21
 */
export function rubyClassName(v: unknown): string | null {
  // to_sql.rb:106
  if (v !== null && typeof v === "object" && "ast" in v && "toSql" in v) {
    return "ArelSelectManager";
  }
  if (Array.isArray(v)) return "Array";
  if (typeof v === "number") {
    // to_sql.rb:824, to_sql.rb:839
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

/**
 * visitor.rb:36-41
 */
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

// to_sql.rb:836-844
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
