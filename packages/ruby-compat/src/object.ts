import { stringInspect } from "./string/inspect.js";
import { isSymbol } from "./symbol.js";
import { rubyClass, type Comparable } from "./comparable.js";
import { TypeError } from "./type-error.js";

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
  if (x instanceof Number) return "Float";
  if (typeof x === "string") return "String";
  const branded = (x as Comparable)[rubyClass];
  if (branded != null) return branded;
  if (hasEpochNanoseconds(x)) return "Time";
  if (isPlainHash(x)) return "Hash";
  return (x as object).constructor?.name ?? typeof x;
}

function hasEpochNanoseconds(value: unknown): value is { epochNanoseconds: bigint } {
  return (
    typeof (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === "string" &&
    (value as { [Symbol.toStringTag]: string })[Symbol.toStringTag].startsWith("Temporal.") &&
    typeof (value as { epochNanoseconds?: unknown }).epochNanoseconds === "bigint"
  );
}

const FL_SINGLETON = Symbol.for("@blazetrails/ruby-compat:FL_SINGLETON");

/**
 * `rb_obj_singleton_class` (`vendor/ruby/object.c:288`), Ruby's
 * `Kernel#singleton_class`, over `singleton_class_of` (`vendor/ruby/class.c:2215`):
 * the receiver's own class, created on first call and inserted between the
 * object and its class. The JS seat is a subclass of `obj.constructor` that
 * becomes the object's prototype. Its `prototype.constructor` stays the
 * attached object's class, because `rb_obj_class` skips a singleton class
 * (`vendor/ruby/object.c:296`): `obj.constructor` keeps answering Ruby's
 * `obj.class`. A JS class's statics already are its singleton, so a class
 * receiver answers itself.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjSingletonClass(obj: object): abstract new (...args: never) => object {
  if (typeof obj === "function") return obj as abstract new (...args: never) => object;
  const proto = Object.getPrototypeOf(obj);
  if (proto !== null && Object.prototype.hasOwnProperty.call(proto, FL_SINGLETON)) {
    return proto[FL_SINGLETON] as abstract new (...args: never) => object;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS2545: a mixin base's constructor rest parameter must be typed `any[]`.
  const superclass = obj.constructor as new (...args: any[]) => object;
  const klass = class extends superclass {};
  Object.defineProperty(klass, FL_SINGLETON, { value: obj });
  Object.defineProperty(klass.prototype, FL_SINGLETON, { value: klass });
  Object.defineProperty(klass.prototype, "constructor", {
    value: superclass,
    writable: true,
    configurable: true,
  });
  Object.setPrototypeOf(obj, klass.prototype);
  return klass;
}

/**
 * `rb_mod_singleton_p` (`vendor/ruby/object.c:3050`), `Module#singleton_class?`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModSingletonP(klass: unknown): boolean {
  return typeof klass === "function" && Object.prototype.hasOwnProperty.call(klass, FL_SINGLETON);
}

/**
 * `rb_class_attached_object` (`vendor/ruby/class.c:1707`), `Class#attached_object`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbClassAttachedObject(klass: { name: string }): unknown {
  if (!rbModSingletonP(klass)) {
    throw new TypeError(`\`${klass.name}' is not a singleton class`);
  }
  return (klass as unknown as Record<symbol, unknown>)[FL_SINGLETON];
}

/**
 * `basic_obj_respond_to` (`vendor/ruby/vm_method.c:2864`) — the default
 * `Object#respond_to?`, which answers whether the receiver's class defines the
 * method. A JS object answers a name whether it carries a method or a
 * property, so `in` is the whole `method_boundp` here; `respond_to_missing?`
 * has no JS analogue and `method_boundp` never reports the `2` (undefined
 * method) case for one.
 *
 * `pub` is declared and plumbed but cannot be read: JS carries no runtime
 * notion of method visibility, so `in` answers the same at both values. See
 * CLAUDE.md, "Method visibility is not a runtime fact in JS".
 *
 * @noRailsEquivalent PERMANENT — Ruby core `basic_obj_respond_to`
 * (`vendor/ruby/vm_method.c:2864`).
 */
export function basicObjRespondTo(obj: unknown, mid: string, pub: boolean = true): boolean {
  void pub;
  return mid in Object(obj);
}

/**
 * `rb_obj_respond_to` (`vendor/ruby/vm_method.c:2934`) — the SEND of
 * `respond_to?`, which `vm_respond_to` (`vm_method.c:2882`) routes through an
 * overridden `respond_to?` when the receiver's class defines one (as
 * `ActiveModel::AttributeMethods` does) — passing the private-methods argument
 * only where `priv` asks for it (`vm_method.c:2896-2905`) — and otherwise
 * falls back to {@link basicObjRespondTo} (`vm_method.c:2945`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_obj_respond_to`
 * (`vendor/ruby/vm_method.c:2934`).
 */
export function rbObjRespondTo(obj: unknown, mid: string, priv: boolean = false): boolean {
  const respondTo = (Object(obj) as { respondTo?: unknown }).respondTo;
  if (typeof respondTo === "function") {
    const result = priv
      ? (respondTo as (mid: string, priv: boolean) => unknown).call(obj, mid, true)
      : (respondTo as (mid: string) => unknown).call(obj, mid);
    return result != null && result !== false;
  }
  return basicObjRespondTo(obj, mid, !priv);
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
 * `rb_obj_inspect` (`vendor/ruby/object.c:783-795`), Ruby's `Kernel#inspect`:
 * `#<Class:0x… @ivar=value, …>`, or `rb_any_to_s` when there are no ivars.
 * A trails field `fooBar` / `_fooBar` is Ruby's `@foo_bar`. JS exposes no
 * object address, so each object is assigned a stable one on first inspection.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjInspect(obj: object): string {
  const c = obj.constructor.name;
  let address = objAddresses.get(obj);
  if (address === undefined) {
    address = nextObjAddress += 8;
    objAddresses.set(obj, address);
  }
  const str = `#<${c}:0x${address.toString(16).padStart(16, "0")}`;
  const ivars = Object.keys(obj);
  if (ivars.length === 0) return `${str}>`;
  if (objInspectRecursing.has(obj)) return `${str} ...>`;
  objInspectRecursing.add(obj);
  try {
    return `${str} ${ivars
      .map(
        (name) =>
          `@${name
            .replace(/^_/, "")
            .replace(/([a-z\d])([A-Z])/g, "$1_$2")
            .toLowerCase()}=${rbInspect((obj as Record<string, unknown>)[name])}`,
      )
      .join(", ")}>`;
  } finally {
    objInspectRecursing.delete(obj);
  }
}

const objInspectRecursing = new Set<object>();
const objAddresses = new WeakMap<object, number>();
let nextObjAddress = 0x7f0000000000;

/**
 * The dispatch under the `rb_exec_recursive` stack its collection arms are
 * wrapped in (`vendor/ruby/hash.c:3487`, `vendor/ruby/array.c:2918`).
 * `recursing` is that stack, which `rb_exec_recursive` keeps per-thread.
 */
function inspectValue(value: unknown, recursing: Set<object>): string {
  if (value == null) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || value instanceof Number) return floToS(value);
  if (typeof value === "bigint") return String(value);
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
  if (typeof value === "number" || value instanceof Number) return floToS(value);
  return String(value);
}

/**
 * `flo_to_s` (`vendor/ruby/numeric.c:1059`), `Float#to_s`: always a decimal
 * point, and the exponent form outside `1e-4 ... 1e16`.
 *
 * JS has one `number` where Ruby has Integer and Float, and `1.0 === 1`, so the
 * seat cannot be recovered from the value. A whole-valued `number` is read as
 * an Integer and renders without a point: it is what nearly every caller hands
 * over (ids, counts, sizes), and a `bigint` is not what those seats hold in
 * trails. `-0` is the one whole value no Integer can be, so it stays a Float.
 * A seat that must stay a Float whatever its value arrives boxed — `new Number(1)`,
 * JS's own object wrapper — and takes the Float reading before that one.
 */
function floToS(flo: number | { valueOf(): number }): string {
  if (typeof flo === "number" && Number.isInteger(flo) && !Object.is(flo, -0)) return String(flo);
  const value = flo.valueOf();
  if (!Number.isFinite(value)) {
    return Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";
  }
  const [mant, e] = Math.abs(value).toExponential().split("e");
  let buf = mant.replace(".", "");
  if (value === 0) buf = "0";
  const digs = buf.length;
  const decpt = value === 0 ? 1 : Number(e) + 1;
  const s = value < 0 || Object.is(value, -0) ? "-" : "";
  if (decpt > 0) {
    if (decpt < digs) return `${s}${buf.slice(0, decpt)}.${buf.slice(decpt)}`;
    if (decpt <= 15) return `${s}${buf}${"0".repeat(decpt - digs)}.0`;
  } else if (decpt > -4) {
    return `${s}0.${"0".repeat(-decpt)}${buf}`;
  }
  return `${s}${buf[0]}.${digs > 1 ? buf.slice(1) : "0"}e${decpt - 1 < 0 ? "-" : "+"}${String(Math.abs(decpt - 1)).padStart(2, "0")}`;
}
