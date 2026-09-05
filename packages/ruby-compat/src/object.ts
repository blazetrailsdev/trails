import { stringInspect } from "./string/inspect.js";
import { isSymbol } from "./symbol.js";
import { rubyClass, type Comparable } from "./comparable.js";

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

function hasEpochNanoseconds(value: unknown): value is { epochNanoseconds: bigint } {
  return (
    typeof (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === "string" &&
    (value as { [Symbol.toStringTag]: string })[Symbol.toStringTag].startsWith("Temporal.") &&
    typeof (value as { epochNanoseconds?: unknown }).epochNanoseconds === "bigint"
  );
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

/**
 * `rb_inspect` (`vendor/ruby/object.c:704`) over the core classes a JS value
 * can be: `nil`, `true` / `false`, Integer and Float, Symbol, String, Array and
 * Hash. Anything else falls through to the receiver's own `inspect`.
 *
 * The default arm is `to_s`, not Ruby's `#<Foo:0x… @a=1>` (`rb_obj_inspect`,
 * `vendor/ruby/object.c:764`): reproducing that needs an object id JS does not
 * expose. Callers hand this plain data structures only, so the arm is unreached
 * today — a caller that does pass a class instance gets its `to_s`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_inspect` (`vendor/ruby/object.c:704`).
 */
export function rbInspect(value: unknown): string {
  return inspectValue(value, new Set());
}

/**
 * The dispatch under the `rb_exec_recursive` stack its collection arms are
 * wrapped in (`vendor/ruby/hash.c:3487`, `vendor/ruby/array.c:2918`).
 * `recursing` is that stack, which `rb_exec_recursive` keeps per-thread.
 */
function inspectValue(value: unknown, recursing: Set<object>): string {
  if (value == null) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (isSymbol(value)) return value;
  if (typeof value === "string") return stringInspect(value);
  if (Array.isArray(value)) return inspectAry(value, recursing);
  if (isPlainHash(value) || value instanceof Map) return inspectHash(value, recursing);
  const own = (value as { inspect?: unknown }).inspect;
  if (typeof own === "function") return String((own as () => unknown).call(value));
  return String(value);
}

/**
 * `inspect_hash` (`vendor/ruby/hash.c:3459`) under the `rb_exec_recursive`
 * (`hash.c:3487`) its caller wraps it in: a hash already on the recursion
 * stack renders as `"{...}"` rather than recursing forever.
 *
 * It sits beside {@link rbInspect} rather than in `hash.ts` because the
 * recursion stack is threaded through it and {@link inspectAry} alike, and a
 * value graph alternates between the two.
 */
function inspectHash(
  hash: Record<string, unknown> | Map<unknown, unknown>,
  recursing: Set<object>,
): string {
  if (recursing.has(hash)) return "{...}";
  const pairs: [unknown, unknown][] =
    hash instanceof Map ? [...hash.entries()] : Object.keys(hash).map((key) => [key, hash[key]]);
  if (pairs.length === 0) return "{}";
  recursing.add(hash);
  try {
    return `{${pairs
      .map(([key, value]) => `${inspectValue(key, recursing)}=>${inspectValue(value, recursing)}`)
      .join(", ")}}`;
  } finally {
    recursing.delete(hash);
  }
}

/**
 * `inspect_ary` (`vendor/ruby/array.c:2888`) under the `rb_exec_recursive`
 * `rb_ary_inspect` (`array.c:2918`) wraps it in — the Array twin of
 * {@link inspectHash}, down to the `"[...]"` recursive slot.
 */
function inspectAry(ary: unknown[], recursing: Set<object>): string {
  if (recursing.has(ary)) return "[...]";
  recursing.add(ary);
  try {
    return `[${ary.map((element) => inspectValue(element, recursing)).join(", ")}]`;
  } finally {
    recursing.delete(ary);
  }
}

function isPlainHash(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * `rb_obj_as_string` (`vendor/ruby/string.c:1653`) — the `to_s` of any value.
 * `Array#to_s` and `Hash#to_s` are aliases of `inspect`
 * (`vendor/ruby/array.c:8616`, `vendor/ruby/hash.c:7197`), so those two classes
 * render through {@link rbInspect}; every other value — a String above all,
 * which `rb_obj_as_string` returns unquoted — is its own `to_s`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_obj_as_string`
 * (`vendor/ruby/string.c:1653`); JS `String(x)` is not the same function, since
 * it gives the comma-joined form for a nested Array and `[object Object]` for a
 * Hash.
 */
export function rbObjAsString(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return rbInspect(value);
  if (isPlainHash(value) || value instanceof Map) return rbInspect(value);
  return String(value);
}
