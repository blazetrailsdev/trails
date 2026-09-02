import { rubyClass, hasEpochNanoseconds, type Comparable } from "./comparable.js";

/**
 * `rb_obj_class` (`vendor/ruby/object.c:296`) over the values trails carries:
 * the immediates Ruby answers a class for without a heap object, the
 * {@link rubyClass} brand, and otherwise the constructor's own name.
 *
 * @boundary: a JS `number` is the seat for both `Integer` and `Float`, so
 *  which one it is is read off the value; a Temporal value carrying an instant
 *  is a Ruby `Time`, by the same reading `cmp` orders it with.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_obj_class` (`vendor/ruby/object.c:296`).
 */
export function rbObjClass(x: unknown): string {
  if (x === null || x === undefined) return "NilClass";
  if (typeof x === "boolean") return x ? "TrueClass" : "FalseClass";
  if (typeof x === "bigint") return "Integer";
  if (typeof x === "number") return Number.isInteger(x) ? "Integer" : "Float";
  if (typeof x === "string") return "String";
  const branded = (x as Comparable)[rubyClass];
  if (branded != null) return branded;
  if (hasEpochNanoseconds(x)) return "Time";
  return (x as object).constructor?.name ?? typeof x;
}

/**
 * `rb_builtin_class_name` (`vendor/ruby/error.c:1216`), which the conversion
 * errors name their operand by: `builtin_class_name` (`error.c:1189`) answers
 * the LOWERCASE `"nil"` / `"true"` / `"false"` for those three immediates —
 * `Float(nil)` is `can't convert nil into Float`, not `NilClass` — and
 * everything else falls through to {@link rbObjClass}.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_builtin_class_name` (`vendor/ruby/error.c:1216`).
 */
export function rbBuiltinClassName(x: unknown): string {
  if (x === null || x === undefined) return "nil";
  if (x === true) return "true";
  if (x === false) return "false";
  return rbObjClass(x);
}
