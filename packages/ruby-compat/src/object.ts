import { aryIncludes } from "./array.js";
import { hasKey } from "./hash.js";
import { stringInspect } from "./string/inspect.js";
import { rbCheckStringType, stringValue } from "./string/support.js";
import { STRING_METHOD_TABLE, rbStrSend } from "./string/method-table.js";
import { isSymbol, stringToSym, symbolToS } from "./symbol.js";
import { cmp, rbCmpint, rubyClass, type Comparable } from "./comparable.js";
import { rbEql, rbEqual } from "./rb-equal.js";
import { TypeError } from "./type-error.js";
import { NameError } from "./name-error.js";
import { FrozenError } from "./frozen-error.js";
import { temporalTag } from "./temporal-tag.js";
import { NoMethodError } from "./no-method-error.js";
import { Hash } from "./hash.js";

type Klass = abstract new (...args: never) => unknown;

/**
 * `rb_obj_class` (`vendor/ruby/v3.3.11/object.c:265`), `Object#class`: the
 * class object, read as `rb_class_of`
 * (`vendor/ruby/v3.3.11/include/ruby/internal/globals.h:172`) reads it for the
 * immediates Ruby answers a class for without a heap object, and otherwise
 * the constructor, which a singleton class leaves naming the real class.
 *
 * @boundary: a JS `number` is the seat for both `Integer` and `Float`, so
 *  which one it is is read off the value; a `Uint8Array` is the binary
 *  `String` seat; a Temporal value carrying an instant
 *  is a Ruby `Time`, by the same reading `cmp` orders it with, and so are a JS
 *  `Date` and a `Temporal.PlainTime`. A function is a `Class` when its
 *  `prototype` is non-writable and a `Proc` otherwise. `Temporal.PlainDate` and
 *  `Temporal.PlainDateTime` are the seats of `Date` and `DateTime`, and a
 *  record whose prototype chain holds no class is a `Hash`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjClass(obj: unknown): Klass {
  if (obj === null || obj === undefined) return rbCNilClass;
  if (typeof obj === "boolean") return obj ? rbCTrueClass : rbCFalseClass;
  if (typeof obj === "bigint") return rbCInteger;
  if (typeof obj === "number") return Number.isInteger(obj) ? rbCInteger : rbCFloat;
  if (obj instanceof Number) return rbCFloat;
  if (typeof obj === "string" || obj instanceof Uint8Array) return rbCString;
  if (typeof obj === "function") {
    return Object.getOwnPropertyDescriptor(obj, "prototype")?.writable === false
      ? rbCClass
      : rbCProc;
  }
  if (hasEpochNanoseconds(obj)) return rbCTime;
  const tag = temporalTag(obj);
  if (tag === "Temporal.PlainDate") return rbCDate;
  if (tag === "Temporal.PlainDateTime") return rbCDateTime;
  if (tag === "Temporal.PlainTime") return rbCTime;
  if (isPlainHash(obj)) return Hash;
  const klass = (obj as object).constructor as Klass | undefined;
  if (klass === Date) return rbCTime;
  return typeof klass === "function" ? klass : Object;
}

/**
 * `rb_obj_classname` (`vendor/ruby/v3.3.11/variable.c:498`): the
 * {@link rbModToS} of the class {@link rbObjClass} answers, which is how Ruby
 * interpolates `obj.class`, or the {@link rubyClass} brand.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjClassname(x: unknown): string {
  const branded = typeof x === "object" && x !== null ? (x as Comparable)[rubyClass] : null;
  if (branded != null) return branded;
  return rbModToS(rbObjClass(x));
}

/**
 * `rb_set_class_path_string` (`vendor/ruby/v3.3.11/variable.c:407`), by which
 * `declare_under` (`vendor/ruby/v3.3.11/vm_insnhelper.c:5375`) paths a class
 * after the cbase it is declared in: `under`'s path, `::`, and `name`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbSetClassPathString(
  klass: abstract new (...args: never) => unknown,
  under: { readonly name: string | null },
  name: string,
): void {
  const permanent =
    typeof under === "function"
      ? (classpaths.get(under)?.permanent ?? Boolean(under.name))
      : under.name != null;
  const str =
    typeof under === "function"
      ? rbModToS(under as abstract new (...args: never) => unknown)
      : (under.name ?? rbAnyToS(under));
  classpaths.set(klass, { path: `${str}::${name}`, permanent });
}

function hasEpochNanoseconds(value: unknown): value is { epochNanoseconds: bigint } {
  return (
    typeof (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === "string" &&
    (value as { [Symbol.toStringTag]: string })[Symbol.toStringTag].startsWith("Temporal.") &&
    typeof (value as { epochNanoseconds?: unknown }).epochNanoseconds === "bigint"
  );
}

/**
 * `FL_SINGLETON` (`vendor/ruby/v3.3.11/include/ruby/internal/fl_type.h:58`), the
 * flag marking a class as some object's singleton class.
 *
 * @noRailsEquivalent PERMANENT
 */
export const FL_SINGLETON = Symbol.for("@blazetrails/ruby-compat:FL_SINGLETON");

/**
 * `rb_obj_singleton_class` (`vendor/ruby/v3.3.11/object.c:288`), Ruby's
 * `Kernel#singleton_class`, over `singleton_class_of` (`vendor/ruby/v3.3.11/class.c:2215`):
 * the receiver's own class, created on first call and inserted between the
 * object and its class. The JS seat is a subclass of `obj.constructor` that
 * becomes the object's prototype. Its `prototype.constructor` stays the
 * attached object's class, because `rb_obj_class` skips a singleton class
 * (`vendor/ruby/v3.3.11/object.c:296`): `obj.constructor` keeps answering Ruby's
 * `obj.class`. Ruby gives a class receiver a metaclass
 * (`vendor/ruby/v3.3.11/class.c:2240`); a JS class has none apart from its own
 * statics, so a class receiver is unsupported here and raises `TypeError`,
 * a trails limitation rather than Ruby behavior.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjSingletonClass(obj: object): abstract new (...args: never) => object {
  if (typeof obj === "function") throw new TypeError("can't define singleton");
  const proto = Object.getPrototypeOf(obj);
  if (proto !== null && Object.prototype.hasOwnProperty.call(proto, FL_SINGLETON)) {
    return proto[FL_SINGLETON] as abstract new (...args: never) => object;
  }
  const superclass = obj.constructor as ObjectConstructor;
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
 * `T_ICLASS` (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:140`), the
 * type of the hidden class an `include` or `extend` splices into an ancestry. A link
 * carries the module it stands for under this key.
 *
 * @noRailsEquivalent PERMANENT
 */
export const T_ICLASS = Symbol.for("@blazetrails/ruby-compat:T_ICLASS");

/**
 * `rb_class_superclass` (`vendor/ruby/v3.3.11/object.c:2191`), `Class#superclass`:
 * the next `T_CLASS` in the ancestry, so the iclass an `extend` put above the
 * class is skipped, where `Object.getPrototypeOf` answers it.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbClassSuperclass<T extends object>(klass: T): T | null {
  let superclass = Object.getPrototypeOf(klass) as object | null;
  while (superclass && Object.prototype.hasOwnProperty.call(superclass, T_ICLASS)) {
    superclass = Object.getPrototypeOf(superclass) as object | null;
  }
  return superclass === Function.prototype ? null : (superclass as T | null);
}

/**
 * The `classpath` seat `RCLASS_SET_CLASSPATH`
 * (`vendor/ruby/v3.3.11/internal/class.h:258`) writes: the path `const_set`
 * gave a class or module, and whether it is permanent.
 *
 * @noRailsEquivalent PERMANENT
 */
export const classpaths = new WeakMap<object, { path: string; permanent: boolean }>();

/** `rb_define_class` (`vendor/ruby/v3.3.11/class.c:972`) for a core class no JS constructor seats. */
function rbDefineClass(name: string, superclass: Klass = Object): new () => object {
  const klass = class extends (superclass as new () => object) {};
  classpaths.set(klass, { path: name, permanent: true });
  return klass;
}

/**
 * `rb_cBasicObject` (`vendor/ruby/v3.3.11/object.c:4200`). `Object.prototype`
 * is the seat of `Object`, so this prototype has no parent.
 * @noRailsEquivalent PERMANENT
 */
export const rbCBasicObject = rbDefineClass("BasicObject");
Object.setPrototypeOf(rbCBasicObject.prototype, null);

/**
 * `rb_cClass` (`vendor/ruby/v3.3.11/object.c:4203`), a `Module` once include.ts loads.
 * @noRailsEquivalent PERMANENT
 */
export const rbCClass = rbDefineClass("Class");

/**
 * `rb_cNumeric` (`vendor/ruby/v3.3.11/numeric.c:6156`). `Rational`
 * (`vendor/ruby/v3.3.11/rational.c:2759`), `Complex`
 * (`vendor/ruby/v3.3.11/complex.c:2529`) and `BigDecimal`
 * (`vendor/ruby/v3.3.11/ext/bigdecimal/bigdecimal.c:4407`) are seated beneath
 * it at the foot of include.ts, not by `extends`: this module reaches
 * rational.ts through string/method-table.ts and kernel-format.ts, so an
 * `extends rbCNumeric` reads the binding before this module body has run
 * whenever this module is entered first.
 * @noRailsEquivalent PERMANENT
 */
export const rbCNumeric = rbDefineClass("Numeric");

/**
 * `rb_cString` (`vendor/ruby/v3.3.11/string.c:12121`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCString = rbDefineClass("String");

/**
 * `rb_cTime` (`vendor/ruby/v3.3.11/time.c:5832`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCTime = rbDefineClass("Time");

/**
 * `cDate` (`vendor/ruby/v3.3.11/ext/date/date_core.c:9604`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCDate = rbDefineClass("Date");

/**
 * `cDateTime` (`vendor/ruby/v3.3.11/ext/date/date_core.c:9984`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCDateTime = rbDefineClass("DateTime", rbCDate);

/**
 * `rb_cNilClass` (`vendor/ruby/v3.3.11/object.c:4412`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCNilClass = rbDefineClass("NilClass");

/**
 * `rb_cTrueClass` (`vendor/ruby/v3.3.11/object.c:4498`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCTrueClass = rbDefineClass("TrueClass");

/**
 * `rb_cFalseClass` (`vendor/ruby/v3.3.11/object.c:4510`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCFalseClass = rbDefineClass("FalseClass");

/**
 * `rb_cInteger` (`vendor/ruby/v3.3.11/numeric.c:6190`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCInteger = rbDefineClass("Integer", rbCNumeric);

/**
 * `rb_cFloat` (`vendor/ruby/v3.3.11/numeric.c:6259`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCFloat = rbDefineClass("Float", rbCNumeric);
const rbCProc = rbDefineClass("Proc");

/**
 * `rb_mod_singleton_p` (`vendor/ruby/v3.3.11/object.c:3050`), `Module#singleton_class?`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModSingletonP(klass: unknown): boolean {
  return typeof klass === "function" && Object.prototype.hasOwnProperty.call(klass, FL_SINGLETON);
}

/**
 * `rb_mod_to_s` (`vendor/ruby/v3.3.11/object.c:1710-1742`), `Module#to_s` /
 * `Module#inspect`: a singleton class renders `#<Class:` plus its attached
 * object — `rb_inspect` for a class or module, `rb_any_to_s` otherwise — and
 * `>`; any other class renders `rb_class_name`: its name, or for an anonymous
 * class the `#<Class:0x…>` path `make_temporary_path`
 * (`vendor/ruby/v3.3.11/variable.c:320-336`) gives it. Ruby's refinement arm
 * has no JS seat.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModToS(klass: abstract new (...args: never) => unknown): string {
  if (rbModSingletonP(klass)) {
    let s = "#<Class:";
    const v = (klass as unknown as { [FL_SINGLETON]: object })[FL_SINGLETON];

    if (typeof v === "function") {
      s += rbInspect(v);
    } else {
      s += rbAnyToS(v);
    }
    s += ">";

    return s;
  }
  return classpaths.get(klass)?.path ?? (klass.name || `#<Class:${objAddress(klass)}>`);
}

/**
 * `rb_mod_name` (`vendor/ruby/v3.3.11/variable.c:122-127`), `Module#name`: the
 * classpath `const_set` gave the class, else the name its definition gave it,
 * or `nil` while it is anonymous.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModName(klass: object): string | null {
  return classpaths.get(klass)?.path ?? ((klass as { name?: string | null }).name || null);
}

/**
 * The methods a package defines on `Object`, as `rb_define_method` on
 * `rb_cObject` (`vendor/ruby/v3.3.11/class.c:2134`) does, keyed by the camelCased Ruby
 * name, which {@link rbFSend} dispatches for a receiver whose own class
 * defines none: ActiveSupport's `Object#in?`
 * (`activesupport/lib/active_support/core_ext/object/inclusion.rb:15`) is
 * reached by `value.public_send(:in?, range)` on an Integer.
 *
 * @noRailsEquivalent PERMANENT
 */
export const OBJECT_METHOD_TABLE: Record<string, (self: never, ...args: never[]) => unknown> =
  Object.create(null);

/**
 * The methods bound on a Temporal seat, keyed by its `Symbol.toStringTag` and
 * then by the camelCased Ruby name, which {@link rbFSend} dispatches and
 * {@link basicObjRespondTo} answers for: a Temporal value's prototype carries
 * none of them. `to_date` is Ruby's own, for Date and DateTime
 * (`date_to_date` and `datetime_to_date`,
 * `vendor/ruby/v3.3.11/ext/date/date_core.c:10054,10058`). A package that
 * reopens one of those classes, as ActiveSupport's `core_ext/date_time` does,
 * assigns an entry, as it does on `STRING_METHOD_TABLE`.
 *
 * @noRailsEquivalent PERMANENT
 */
export const TEMPORAL_METHOD_TABLE: Record<
  string,
  Record<string, (self: never, ...args: never[]) => unknown>
> = {
  "Temporal.PlainDate": { toDate: (self: unknown) => self },
  "Temporal.PlainDateTime": { toDate: (self: { toPlainDate(): unknown }) => self.toPlainDate() },
  "Temporal.ZonedDateTime": { toDate: (self: { toPlainDate(): unknown }) => self.toPlainDate() },
};

function temporalMethod(obj: unknown, mid: string): ((...args: unknown[]) => unknown) | undefined {
  const table = obj == null ? undefined : TEMPORAL_METHOD_TABLE[temporalTag(obj) ?? ""];
  return table !== undefined && Object.hasOwn(table, mid)
    ? (table[mid] as (...args: unknown[]) => unknown)
    : undefined;
}

/**
 * `basic_obj_respond_to` (`vendor/ruby/v3.3.11/vm_method.c:2864`) — the default
 * `Object#respond_to?`, which answers whether the receiver's class defines the
 * method. A JS object answers a name whether it carries a method or a
 * property, so the prototype-chain lookup is the whole `method_boundp` here,
 * and an own `undefined` value is its `2` (undefined method) case. An unbound
 * name falls through to the receiver's `respond_to_missing?`
 * (`basic_obj_respond_to_missing`, `vm_method.c:2850-2861`), handed `!pub`.
 * Like `callable_method_entry` there, the entry is found by descriptor lookup,
 * never by a property read a `methodMissingProxy` `get` trap would answer.
 * `isEmpty` is bound for the core receivers `ruby-empty.ts`'s `isEmpty` answers
 * `empty?` for (`array.c:2686`, `hash.c:3023`, `string.c:2243`), whose JS
 * values carry no such member. `isInclude` is bound for the same receivers and
 * `Set`, which define `include?` (`array.c:8679`, `hash.c:7255`,
 * `string.c:12215`, `lib/set.rb:393`), and `toSym` for every JS string
 * (`string.c:12212`), which spells both a Ruby String and a Ruby Symbol
 * (`":name"`); Symbol answers `to_sym` too (`symbol.rb:8`). `toAry` is bound for a JS array
 * (`array.c:8619`), whose prototype carries no such member. `isInfinite` and
 * `isFinite` are bound for a JS number and bigint, which spell Float
 * (`numeric.c:6376-6377`) and Integer (`numeric.rb:39-48`). A Temporal seat answers for the methods
 * {@link TEMPORAL_METHOD_TABLE} binds on it.
 *
 * A class receiver (a non-writable `prototype`, which a plain function, the
 * JS spelling of a `Proc`, does not have) answers `Module#respond_to?`: its static data fields hold
 * what Ruby keeps in class-level ivars, not methods, and the lookup stops
 * short of `Function.prototype`, whose `call` / `apply` / `bind` no Ruby
 * `Module` defines. A plain function's own `length` and `name` are its JS
 * arity and function name, which no Ruby `Proc` defines.
 *
 * A writer `name=` is answered by a JS accessor's setter or by a `setName`
 * method, the conventions table's two writer spellings and the entries
 * {@link rbFSend} dispatches it to. An underscore-prefixed writer
 * (`_reflections=`) is a `class_attribute` storage slot and has no `set*`
 * spelling.
 *
 * `method_boundp` (`vm_method.c:1788-1818`) answers `0` for a PRIVATE entry,
 * and under `BOUND_RESPONDS` a PROTECTED one, when `pub` is set. A JS entry
 * carries no visibility, so a defined name answers the same at both `pub`
 * values and `pub` reaches only `respond_to_missing?` (see CLAUDE.md, "Method
 * visibility is compile-time only").
 *
 * @noRailsEquivalent PERMANENT — Ruby core `basic_obj_respond_to`
 * (`vendor/ruby/v3.3.11/vm_method.c:2864`).
 */
export function basicObjRespondTo(obj: unknown, mid: string, pub: boolean = true): boolean {
  if (typeof obj === "string" && (mid === "toStr" || mid === "toSym")) return true;
  if (Array.isArray(obj) && mid === "toAry") return true;
  if (
    (typeof obj === "number" || typeof obj === "bigint") &&
    (mid === "isInfinite" || mid === "isFinite")
  ) {
    return true;
  }
  if (temporalMethod(obj, mid) !== undefined) return true;
  if (
    mid === "get" &&
    (typeof obj === "string" || Array.isArray(obj) || obj instanceof Map || isPlainHash(obj))
  ) {
    return true;
  }
  if (
    (mid === "isEmpty" || mid === "isInclude") &&
    (typeof obj === "string" ||
      Array.isArray(obj) ||
      obj instanceof Set ||
      obj instanceof Map ||
      isPlainHash(obj))
  ) {
    return true;
  }
  const klass =
    typeof obj === "function" &&
    Object.getOwnPropertyDescriptor(obj, "prototype")?.writable === false;
  if (typeof obj === "function" && !klass && (mid === "length" || mid === "name")) return false;
  const attr = mid.endsWith("=") ? mid.slice(0, -1) : undefined;
  const writer = writerSpelling(attr);
  for (
    let o: object | null = Object(obj);
    o && !(klass && o === Function.prototype);
    o = Object.getPrototypeOf(o) as object | null
  ) {
    const entry = Object.getOwnPropertyDescriptor(o, mid);
    if (entry) {
      if (!("value" in entry)) return true;
      return klass ? typeof entry.value === "function" : entry.value !== undefined;
    }
    if (attr !== undefined && Object.getOwnPropertyDescriptor(o, attr)?.set) return true;
    if (
      writer !== undefined &&
      typeof Object.getOwnPropertyDescriptor(o, writer)?.value === "function"
    ) {
      return true;
    }
  }
  let cme: PropertyDescriptor | undefined;
  for (
    let o: object | null = Object(obj);
    o && !cme;
    o = Object.getPrototypeOf(o) as object | null
  ) {
    cme = Object.getOwnPropertyDescriptor(o, "respondToMissing");
  }
  if (typeof cme?.value !== "function") return false;
  const ret = (cme.value as (mid: string, priv: boolean) => unknown).call(obj, mid, !pub);
  return ret != null && ret !== false;
}

/**
 * `Object#respond_to_missing?` (`obj_respond_to_missing`,
 * `vendor/ruby/v3.3.11/vm_method.c:3009`), the default a class's own
 * `respond_to_missing?` reaches through `super`: it answers false for every
 * name.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `obj_respond_to_missing`
 * (`vendor/ruby/v3.3.11/vm_method.c:3009`).
 */
export function objRespondToMissing(_obj: unknown, _mid: string, _priv: boolean): boolean {
  return false;
}

function writerSpelling(attr: string | undefined): string | undefined {
  if (attr === undefined || attr.startsWith("_")) return undefined;
  return camelized(`set_${attr}`);
}

function camelized(name: string): string {
  return name.replace(/_([a-zA-Z\d])/g, (_, c: string) => c.toUpperCase());
}

function checkDefinitionVisibility(mod: { prototype: object }, mid: string): boolean {
  const attr = mid.endsWith("=") ? mid.slice(0, -1) : undefined;
  const writer = writerSpelling(attr);
  for (
    let o: object | null = mod.prototype;
    o && o !== Object.prototype;
    o = Object.getPrototypeOf(o) as object | null
  ) {
    const me = Object.getOwnPropertyDescriptor(o, mid);
    if (me) return typeof me.value === "function" || me.get !== undefined;
    if (attr !== undefined && Object.getOwnPropertyDescriptor(o, attr)?.set) return true;
    if (
      writer !== undefined &&
      typeof Object.getOwnPropertyDescriptor(o, writer)?.value === "function"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * `Module#method_defined?` (`rb_mod_method_defined`,
 * `vendor/ruby/v3.3.11/vm_method.c:2055`). A JS entry carries no visibility, so
 * it answers as {@link rbModPublicMethodDefined} does. A writer `name=` is
 * answered by a JS accessor's setter or a `setName` method, the entries
 * {@link rbFSend} dispatches to.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModMethodDefined(mod: { prototype: object }, mid: string): boolean {
  return checkDefinitionVisibility(mod, mid);
}

/**
 * `rb_attr` (`vendor/ruby/v3.3.11/vm_method.c:1863`). A JS accessor is one
 * descriptor, so the half not being defined keeps the nearest entry's; the
 * ivar lives in the `_`-prefixed field ({@link rbDeclareIvar}).
 */
function rbAttr(klass: { prototype: object }, id: string, read: boolean, write: boolean): void {
  const attriv = `_${id}`;
  rbDeclareIvar(klass, `@${id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`, attriv);
  let me: PropertyDescriptor | undefined;
  for (
    let o: object | null = klass.prototype;
    o && !me;
    o = Object.getPrototypeOf(o) as object | null
  ) {
    me = Object.getOwnPropertyDescriptor(o, id);
  }
  Object.defineProperty(klass.prototype, id, {
    configurable: true,
    get: read
      ? function (this: Record<string, unknown>) {
          return this[attriv] ?? null;
        }
      : me?.get,
    set: write
      ? function (this: Record<string, unknown>, val: unknown) {
          this[attriv] = val;
        }
      : me?.set,
  });
}

/**
 * `Module#attr_reader` (`rb_mod_attr_reader`, `vendor/ruby/v3.3.11/object.c:2279`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModAttrReader(klass: { prototype: object }, ...argv: string[]): void {
  for (const id of argv) {
    rbAttr(klass, id, true, false);
  }
}

/**
 * `Module#attr_writer` (`rb_mod_attr_writer`, `vendor/ruby/v3.3.11/object.c:2335`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModAttrWriter(klass: { prototype: object }, ...argv: string[]): void {
  for (const id of argv) {
    rbAttr(klass, id, false, true);
  }
}

/**
 * `Module#public_method_defined?` (`rb_mod_public_method_defined`,
 * `vendor/ruby/v3.3.11/vm_method.c:2098`, through `check_definition_visibility`,
 * `:1988`): whether `mod`'s instances have a method `mid`. A JS method entry
 * carries no visibility, so every defined one is PUBLIC (see CLAUDE.md, "Method
 * visibility is compile-time only"). A JS method or accessor is a method
 * entry; a data property is not, and neither is an `Object.prototype` member,
 * which no Ruby class defines.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Module#public_method_defined?`
 * (`vendor/ruby/v3.3.11/vm_method.c:2098`).
 */
export function rbModPublicMethodDefined(mod: { prototype: object }, mid: string): boolean {
  return checkDefinitionVisibility(mod, mid);
}

/**
 * `Kernel#public_send` (`rb_f_public_send`, `vendor/ruby/v3.3.11/vm_eval.c:1350`): `send`
 * restricted to public methods. A JS entry carries no visibility, so a defined
 * name dispatches exactly as {@link rbFSend} does (see CLAUDE.md, "Method
 * visibility is compile-time only"). The nearest entry answers: a writer
 * `name=` is a `name=` method, a JS accessor's `name` setter, or a `setName`
 * method. An
 * unbound name goes to the receiver's `method_missing`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#public_send` (`vendor/ruby/v3.3.11/vm_eval.c:1350`).
 */
export function rbFPublicSend(recv: unknown, mid: unknown, ...args: unknown[]): unknown {
  return sendInternal(args.length, [mid, ...args], recv);
}

/**
 * Ruby's `obj.to_sym` send: `String#to_sym` (`rb_str_intern`,
 * `vendor/ruby/v3.3.11/symbol.c:862`, bound at `vendor/ruby/v3.3.11/string.c:12212`)
 * and `Symbol#to_sym` (`vendor/ruby/v3.3.11/symbol.rb:8`). A JS string spells
 * both receivers and answers the Symbol's colon spelling (`":name"`); no other
 * core receiver defines `to_sym`, so the send raises `NoMethodError`. It is
 * the send, where {@link stringToSym} is `rb_str_intern` on a known String,
 * as `toI` is to `rbStrToI`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function toSym(obj: unknown): string {
  if (typeof obj === "string") return stringToSym(obj);
  if (obj == null) throw new NoMethodError("undefined method 'to_sym' for nil", "to_sym");
  throw new NoMethodError(
    `undefined method 'to_sym' for an instance of ${rbObjClassname(obj)}`,
    "to_sym",
    [],
    false,
    { receiver: obj },
  );
}

/**
 * Ruby's `obj.to_s` send for a receiver that may be a Symbol: `Symbol#to_s`
 * (`rb_sym_to_s`, `vendor/ruby/v3.3.11/string.c:11734`) answers the name of a
 * colon-spelled Symbol (`":name"`), and every other receiver answers as
 * {@link rbObjAsString} does (`String#to_s` is `rb_str_to_s`,
 * `vendor/ruby/v3.3.11/string.c:6648`). It is the send, where
 * {@link symbolToS} is `rb_sym_to_s` on a known Symbol, as `toSym` is to
 * `stringToSym`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function toS(obj: unknown): string {
  if (isSymbol(obj)) return symbolToS(obj);
  return rbObjAsString(obj);
}

/**
 * `Kernel#send` (`rb_f_send`, `vendor/ruby/v3.3.11/vm_eval.c:1330`): calls the nearest
 * entry for `mid` whatever its visibility. A zero-argument reader ported as a
 * JS accessor or a field answers through its getter or its value, as the Ruby
 * reader it ports would. `infinite?` is dispatched for a JS number and bigint,
 * whose prototypes carry no such member: `Float#infinite?`
 * (`rb_flo_is_infinite_p`, `vendor/ruby/v3.3.11/numeric.c:1992`) answers `1` /
 * `-1` for an infinity and `nil` otherwise, as `Integer#infinite?`
 * (`vendor/ruby/v3.3.11/numeric.rb:48`) always does. `odd?` and `even?` are
 * dispatched for an Integer alone (`rb_int_odd_p` / `rb_int_even_p`,
 * `vendor/ruby/v3.3.11/numeric.c:3564,3588`): a Float defines neither. A
 * predicate sent by its Ruby name (`:odd?`, the value Rails' `NUMBER_CHECKS`
 * holds) reaches those two arms and `OBJECT_METHOD_TABLE` by its `is`-prefixed
 * TS spelling; every other lookup, `method_missing` included, sees the name as
 * sent. An operator is sent by its
 * Ruby name (`">"`), which has no TS method spelling. `==` is {@link rbEqual},
 * which sends the receiver's own `==`, and `!=` its negation
 * (`rb_obj_not_equal`, `vendor/ruby/v3.3.11/object.c:248`). The four ordering
 * operators answer for the receivers that define them in Ruby: between two
 * numbers they are `Integer`'s and `Float`'s own (`rb_int_gt`,
 * `vendor/ruby/v3.3.11/numeric.c:4743`, and `rb_float_gt`, `:1753`), false for
 * a NaN operand and never raising;
 * a receiver defining the operator itself (`greaterThan` and its siblings, the
 * spelling `Date` and `TimeWithZone` give them) answers it; a number against
 * anything else, and any other `Comparable` receiver (a String, a Time or
 * Date, or an object defining `<=>`), go through `cmpint`
 * (`vendor/ruby/v3.3.11/compar.c:105-147`) and raise `ArgumentError` for a pair
 * `<=>` cannot place. Any other receiver, `nil` included, has no such method
 * and raises `NoMethodError`. `include?` is dispatched for the core receivers
 * {@link basicObjRespondTo} binds it for, when no entry of their own answers
 * (`vendor/ruby/v3.3.11/string.c:12215`, `array.c:8679`, `hash.c:7255`,
 * `lib/set.rb:393`). A Set or Hash looks a member up by `eql?`, so an object a
 * JS `has` misses by identity is compared with `rb_eql` against each key.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#send` (`vendor/ruby/v3.3.11/vm_eval.c:1330`).
 */
export function rbFSend(recv: unknown, mid: unknown, ...args: unknown[]): unknown {
  return sendInternal(args.length, [mid, ...args], recv);
}

/**
 * `conversion_mismatch` (`vendor/ruby/v3.3.11/object.c:3132`): the `TypeError`
 * a conversion method raises for answering the wrong type.
 *
 * @noRailsEquivalent PERMANENT
 */
export function conversionMismatch(
  val: unknown,
  tname: string,
  method: string,
  result: unknown,
): never {
  const cname = rbObjClassname(val);
  throw new TypeError(
    `can't convert ${cname} to ${tname} (${cname}#${method} gives ${rbObjClassname(result)})`,
  );
}

const RELOPS = new Map<string, [string, (c: number) => boolean]>([
  [">", ["greaterThan", (c) => c > 0]],
  [">=", ["greaterThanOrEqual", (c) => c >= 0]],
  ["<", ["lessThan", (c) => c < 0]],
  ["<=", ["lessThanOrEqual", (c) => c <= 0]],
]);

function isNumeric(value: unknown): value is number | bigint {
  return typeof value === "number" || typeof value === "bigint";
}

function isComparable(recv: unknown): boolean {
  if (typeof recv === "string") return true;
  if (typeof recv !== "object" || recv === null) return false;
  if (recv instanceof Date || recv instanceof Number || temporalTag(recv) !== null) return true;
  const { compareTo, cmp } = recv as { compareTo?: unknown; cmp?: unknown };
  return typeof compareTo === "function" || typeof cmp === "function";
}

/**
 * The method tables `Module#undef_method` writes its entries into: a data
 * property holding `undefined` on one of them is `VM_METHOD_TYPE_UNDEF`
 * (`vendor/ruby/v3.3.11/vm_method.c:1973` `rb_mod_undef_method`), where the
 * lookup stops and `send` goes to `method_missing`.
 *
 * @noRailsEquivalent PERMANENT
 */
export const UNDEF_METHOD_TABLES = new WeakSet<object>();

function sendInternal(argc: number, argv: [unknown, ...unknown[]], recv: unknown): unknown {
  const [vid, ...args] = argv;
  const name = rbCheckStringType(vid);
  if (name === null) throw new TypeError(`${rbInspect(vid)} is not a symbol nor a string`);
  const mid = isSymbol(name) ? symbolToS(name) : name;
  const predicate = mid.endsWith("?") ? camelized(`is_${mid.slice(0, -1)}`) : mid;
  if (argc === 1) {
    const other = args[0];
    if (mid === "==") return rbEqual(recv, other);
    if (mid === "!=") return !rbEqual(recv, other);
    const [spelling, relop] = RELOPS.get(mid) ?? [];
    if (relop !== undefined && isNumeric(recv) && isNumeric(other)) {
      return relop(recv < other ? -1 : recv > other ? 1 : recv == other ? 0 : NaN);
    }
    if (spelling !== undefined && rbObjRespondTo(recv, spelling)) {
      return sendInternal(argc, [spelling, other], recv);
    }
    if (relop !== undefined && (isNumeric(recv) || isComparable(recv))) {
      return relop(rbCmpint(cmp(recv, other), recv, other));
    }
  }
  if ((typeof recv === "number" || typeof recv === "bigint") && mid === "isInfinite") {
    return recv === Infinity ? 1 : recv === -Infinity ? -1 : null;
  }
  if ((typeof recv === "number" || typeof recv === "bigint") && mid === "isFinite") {
    return typeof recv === "bigint" || Number.isFinite(recv);
  }
  if (
    (typeof recv === "bigint" || Number.isInteger(recv)) &&
    (predicate === "isOdd" || predicate === "isEven")
  ) {
    return (BigInt(recv as number | bigint) % 2n !== 0n) === (predicate === "isOdd");
  }
  const bound = temporalMethod(recv, mid);
  if (bound !== undefined) return bound(recv, ...args);
  const obj = Object(recv) as Record<string, unknown>;
  const attr = mid.endsWith("=") ? mid.slice(0, -1) : undefined;
  const writer = writerSpelling(attr);
  for (let o: object | null = obj; o; o = Object.getPrototypeOf(o) as object | null) {
    const desc = Object.getOwnPropertyDescriptor(o, mid);
    if (typeof desc?.value === "function") return (desc.value as AnyFunction).apply(recv, args);
    if (UNDEF_METHOD_TABLES.has(o) && desc && "value" in desc && desc.value === undefined) break;
    if (desc && argc === 0) return desc.get ? desc.get.call(recv) : desc.value;
    const setter = attr === undefined ? undefined : Object.getOwnPropertyDescriptor(o, attr)?.set;
    if (setter) return setter.call(recv, args[0]);
    const set = writer === undefined ? undefined : Object.getOwnPropertyDescriptor(o, writer);
    if (typeof set?.value === "function") return (set.value as AnyFunction).apply(recv, args);
  }
  if (typeof recv === "string" && Object.hasOwn(STRING_METHOD_TABLE, mid)) {
    return rbStrSend(recv, mid, ...args)[0];
  }
  if (mid === "isInclude") {
    if (typeof recv === "string") return recv.includes(stringValue(args[0]));
    if (Array.isArray(recv)) return aryIncludes(recv, args[0]);
    if (recv instanceof Set || recv instanceof Map) {
      if (recv.has(args[0]) || args[0] === null || typeof args[0] !== "object") {
        return recv.has(args[0]);
      }
      return [...recv.keys()].some((key) => rbEql(key, args[0]));
    }
    if (isPlainHash(recv)) return hasKey(recv, args[0] as PropertyKey);
    if (recv == null) throw new NoMethodError("undefined method 'include?' for nil", "include?");
  }
  if (Object.hasOwn(OBJECT_METHOD_TABLE, predicate)) {
    return (OBJECT_METHOD_TABLE[predicate] as AnyFunction)(recv, ...args);
  }
  if (typeof obj.methodMissing === "function") {
    return (obj.methodMissing as AnyFunction).call(recv, mid, ...args);
  }
  throw new NoMethodError(
    `undefined method '${mid}' for an instance of ${rbObjClassname(recv)}`,
    mid,
    {
      receiver: recv,
    },
  );
}

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * `rb_obj_respond_to` (`vendor/ruby/v3.3.11/vm_method.c:2934`) — the SEND of
 * `respond_to?`, which `vm_respond_to` (`vm_method.c:2882`) routes through an
 * overridden `respond_to?` when the receiver's class defines one (as
 * `ActiveModel::AttributeMethods` does) — passing the private-methods argument
 * only where `priv` asks for it (`vm_method.c:2896-2905`) — and otherwise
 * falls back to {@link basicObjRespondTo} (`vm_method.c:2945`). Like
 * `method_entry_get` there, `respond_to?` is found by descriptor lookup, never
 * by a property read a `method_missing` Proxy's `get` trap would answer. An
 * overridden `respond_to?` is spelled `isRespondTo`, never `respondTo`, which
 * is a Rails method of its own (`MimeResponds#respond_to`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_obj_respond_to`
 * (`vendor/ruby/v3.3.11/vm_method.c:2934`).
 */
export function rbObjRespondTo(obj: unknown, mid: string, priv: boolean = false): boolean {
  let me: PropertyDescriptor | undefined;
  for (
    let o: object | null = Object(obj);
    o && !me;
    o = Object.getPrototypeOf(o) as object | null
  ) {
    me = Object.getOwnPropertyDescriptor(o, "isRespondTo");
  }
  const isRespondTo = me?.value;
  if (typeof isRespondTo === "function") {
    const result = priv
      ? (isRespondTo as (mid: string, priv: boolean) => unknown).call(obj, mid, true)
      : (isRespondTo as (mid: string) => unknown).call(obj, mid);
    return result != null && result !== false;
  }
  return basicObjRespondTo(obj, mid, !priv);
}

/**
 * `rb_builtin_class_name` (`vendor/ruby/v3.3.11/error.c:1216`), which the conversion
 * errors name their operand by: `builtin_class_name` (`error.c:1189`) answers
 * the LOWERCASE `"nil"` / `"true"` / `"false"` for those three immediates —
 * `Float(nil)` is `can't convert nil into Float`, not `NilClass` — and
 * everything else falls through to {@link rbObjClassname}.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_builtin_class_name` (`vendor/ruby/v3.3.11/error.c:1216`).
 */
export function rbBuiltinClassName(x: unknown): string {
  if (x === null || x === undefined) return "nil";
  if (x === true) return "true";
  if (x === false) return "false";
  return rbObjClassname(x);
}

/**
 * `rb_inspect` (`vendor/ruby/v3.3.11/object.c:704`) over the core classes a JS value
 * can be: `nil`, `true` / `false`, Integer and Float, Symbol, String, Array and
 * Hash. Anything else falls through to the receiver's own `inspect`.
 *
 * The default arm is `to_s`, not Ruby's `#<Foo:0x… @a=1>` (`rb_obj_inspect`,
 * `vendor/ruby/v3.3.11/object.c:764`): reproducing that needs an object id JS does not
 * expose. Callers hand this plain data structures only, so the arm is unreached
 * today — a caller that does pass a class instance gets its `to_s`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_inspect` (`vendor/ruby/v3.3.11/object.c:704`).
 */
export function rbInspect(value: unknown): string {
  return inspectValue(value, new Set());
}

/**
 * `rb_obj_inspect` (`vendor/ruby/v3.3.11/object.c:783-795`), Ruby's `Kernel#inspect`:
 * `#<Class:0x… @ivar=value, …>`, or `rb_any_to_s` when there are no ivars.
 * A trails field `fooBar` / `_fooBar` is Ruby's `@foo_bar`. JS exposes no
 * object address, so each object is assigned a stable one on first inspection.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjInspect(obj: object): string {
  const ivars = Object.keys(obj);
  if (ivars.length === 0) return rbAnyToS(obj);
  const str = rbAnyToS(obj).slice(0, -1);
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

/**
 * `rb_any_to_s` (`vendor/ruby/v3.3.11/object.c:693-701`), `Kernel#to_s`:
 * `#<Class:0x…>`. JS exposes no object address, so each object is assigned a
 * stable one on first use. A JS function is Ruby's `Proc`, whose `to_s`
 * (`proc_to_s`, `vendor/ruby/v3.3.11/proc.c:1595`) opens the same way.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbAnyToS(obj: object): string {
  const cname = typeof obj === "function" ? "Proc" : obj.constructor.name;
  return `#<${cname}:${objAddress(obj)}>`;
}

function objAddress(obj: object): string {
  let address = objAddresses.get(obj);
  if (address === undefined) {
    address = nextObjAddress += 8;
    objAddresses.set(obj, address);
  }
  return `0x${address.toString(16).padStart(16, "0")}`;
}

/**
 * `rb_obj_id` (`vendor/ruby/v3.3.11/gc.c:4975`), `Kernel#object_id`. A heap
 * object answers a stable integer handed out on first use, starting at
 * `OBJ_ID_INITIAL` and `OBJ_ID_INCREMENT` apart (`gc.c:3826-3827`, a 40-byte
 * `RVALUE` on 64-bit). A special constant answers its own `VALUE`
 * (`rb_find_object_id`, `gc.c:4883-4898`): `nil` is 4, `true` 20, `false` 0
 * (`vendor/ruby/v3.3.11/include/ruby/internal/special_consts.h:98-100`), a
 * Fixnum `n` is `2n + 1`, and a flonum is the rotated bits
 * `rb_float_new_inline` packs it into
 * (`vendor/ruby/v3.3.11/internal/numeric.h:243-262`).
 *
 * @boundary: a JS `number` is the seat for both `Integer` and `Float`, read
 *  off the value as {@link rbObjClassname} reads it, so `1.0`, `0.0` and `-0`
 *  answer the Fixnum id where MRI answers a flonum's. A JS string has no
 *  identity, so each send hands out a fresh id, as a fresh `String` would get;
 *  a Symbol's static id is not modelled. A Bignum and a Float outside the
 *  flonum range are heap objects in MRI and get a fresh id the same way. An id
 *  past `Number.MAX_SAFE_INTEGER` is a bigint.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjId(obj: object): number;
/** @noRailsEquivalent PERMANENT — Ruby core `rb_obj_id` (`vendor/ruby/v3.3.11/gc.c:4975`). */
export function rbObjId(obj: unknown): number | bigint;
/** @noRailsEquivalent PERMANENT — Ruby core `rb_obj_id` (`vendor/ruby/v3.3.11/gc.c:4975`). */
export function rbObjId(obj: unknown): number | bigint {
  if (typeof obj === "number" && !Number.isInteger(obj)) {
    flonumBits.setFloat64(0, obj);
    const v = flonumBits.getBigUint64(0);
    const bits = Number((v >> 60n) & 0x7n);
    if (v !== 0x3000000000000000n && ((bits - 3) & ~0x01) === 0) {
      const rotated = BigInt.asUintN(64, (v << 3n) | (v >> 61n));
      return fixId(BigInt.asIntN(64, (rotated & ~0x01n) | 0x02n));
    }
  } else if (typeof obj === "number" || typeof obj === "bigint") {
    const n = BigInt(obj);
    if (n >= FIXNUM_MIN && n <= FIXNUM_MAX) return fixId(2n * n + 1n);
  } else if (obj === null || obj === undefined) {
    return 4;
  } else if (obj === true) {
    return 20;
  } else if (obj === false) {
    return 0;
  } else if (typeof obj === "object" || typeof obj === "function") {
    let id = objIds.get(obj);
    if (id === undefined) {
      id = nextObjectId;
      nextObjectId += OBJ_ID_INCREMENT;
      objIds.set(obj, id);
    }
    return id;
  }
  const id = nextObjectId;
  nextObjectId += OBJ_ID_INCREMENT;
  return id;
}

function fixId(id: bigint): number | bigint {
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : id;
}

const FIXNUM_MAX = (1n << 62n) - 1n;
const FIXNUM_MIN = -(1n << 62n);
const flonumBits = new DataView(new ArrayBuffer(8));
const OBJ_ID_INCREMENT = 20;
const OBJ_ID_INITIAL = OBJ_ID_INCREMENT * 2;
const objIds = new WeakMap<object, number>();
let nextObjectId = OBJ_ID_INITIAL;
const objInspectRecursing = new Set<object>();
const objAddresses = new WeakMap<object, number>();
let nextObjAddress = 0x7f0000000000;

/**
 * The dispatch under the `rb_exec_recursive` stack its collection arms are
 * wrapped in (`vendor/ruby/v3.3.11/hash.c:3487`, `vendor/ruby/v3.3.11/array.c:2918`).
 * `recursing` is that stack, which `rb_exec_recursive` keeps per-thread.
 */
function inspectValue(value: unknown, recursing: Set<object>): string {
  if (value == null) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || value instanceof Number) return floToS(value);
  if (typeof value === "bigint") return String(value);
  if (isSymbol(value)) return symInspect(value);
  if (typeof value === "string") return stringInspect(value);
  if (Array.isArray(value)) return inspectAry(value, recursing);
  if (isPlainHash(value) || value instanceof Map) return inspectHash(value, recursing);
  if (value instanceof RegExp) return regDesc(value);
  const own = (value as { inspect?: unknown }).inspect;
  if (typeof own === "function") return String((own as () => unknown).call(value));
  if (value instanceof Error) return excInspect(value);
  if (
    typeof value === "function" &&
    Object.getOwnPropertyDescriptor(value, "prototype")?.writable === false
  ) {
    return rbModToS(value as abstract new (...args: never) => unknown);
  }
  if (typeof value === "function") return rbAnyToS(value);
  if (typeof value === "object" && !(value instanceof Uint8Array)) {
    const str: unknown = rbObjAsString(value);
    return typeof str === "string" ? str : rbObjInspect(value);
  }
  return String(value);
}

/** `exc_inspect` (`vendor/ruby/v3.3.11/error.c:1677-1703`), `Exception#inspect`. */
function excInspect(exc: Error): string {
  const klass = rbObjClassname(exc);
  const str = exc.message;
  if (str.length === 0) return klass;
  if (str.includes("\n")) return `#<${klass}:${stringInspect(str)}>`;
  return `#<${klass}: ${str}>`;
}

function symInspect(sym: string): string {
  const name = sym.slice(1);
  return strSymnameP(name) ? sym : `:${stringInspect(name)}`;
}

const SYM_OPERATOR = /^(?:\[\]=?|<=>|<<|<=|<|>>|>=|>|=~|===?|\*\*?|[+-]@?|[|^&/%~`]|!=|!~|!)$/;
const SYM_SPECIAL_GLOBAL = /^\$(?:[~*$?!@/\\;,.=:<>"&`'+0]|\d+|-[\p{L}\p{N}_])$/u;
const SYM_PREFIXED_IDENT = /^(?:@@?|\$)[\p{L}_\P{ASCII}][\p{L}\p{N}_\P{ASCII}]*$/u;
const SYM_IDENT = /^[\p{L}_\P{ASCII}][\p{L}\p{N}_\P{ASCII}]*[?!=]?$/u;
const SYM_UNPRINTABLE = /[\p{Cc}\p{Cn}\p{Cs}\p{Zl}\p{Zp}]/u;

function strSymnameP(name: string): boolean {
  if (SYM_UNPRINTABLE.test(name)) return false;
  return (
    SYM_OPERATOR.test(name) ||
    SYM_SPECIAL_GLOBAL.test(name) ||
    SYM_PREFIXED_IDENT.test(name) ||
    SYM_IDENT.test(name)
  );
}

/**
 * `rb_reg_desc` (`vendor/ruby/v3.3.11/re.c:456-481`): the source between
 * slashes, then `option_to_str` (`re.c:322-330`) in its `m`, `i`, `x` order.
 * Ruby's multiline option is JS's `dotAll` flag, and JS has no extended flag.
 */
function regDesc(re: RegExp): string {
  let opts = "";
  if (re.dotAll) opts += "m";
  if (re.ignoreCase) opts += "i";
  return `/${re.source}/${opts}`;
}

/**
 * `inspect_hash` (`vendor/ruby/v3.3.11/hash.c:3459`) under the `rb_exec_recursive`
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
 * `inspect_ary` (`vendor/ruby/v3.3.11/array.c:2888`) under the `rb_exec_recursive`
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
  for (
    let proto: object | null = Object.getPrototypeOf(value);
    proto !== null;
    proto = Object.getPrototypeOf(proto)
  ) {
    if (proto === Object.prototype) return true;
    const klass: unknown = Object.getOwnPropertyDescriptor(proto, "constructor")?.value;
    if (typeof klass === "function" && klass.prototype === proto) return false;
  }
  return true;
}

/**
 * `RTEST` (`vendor/ruby/v3.3.11/include/ruby/internal/special_consts.h:138` `RB_TEST`):
 * false only for `nil` and `false`, where a JS truthiness test is also false
 * for `0`, `""` and `NaN`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rtest(obj: unknown): boolean {
  return obj !== null && obj !== undefined && obj !== false;
}

/**
 * Ruby's `obj.nil?` send: `NilClass#nil?` is `rb_true`
 * (`vendor/ruby/v3.3.11/object.c:4425`) and `Kernel#nil?` is `rb_false`
 * (`object.c:4371`), which a class may override
 * (`ActiveRecord::Relation::QueryAttribute#nil?`). JS has no method on `null`
 * or `undefined`, the two spellings of Ruby's `nil`, so the send is a
 * function; an override is spelled `isNil`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isNil(obj: unknown): boolean {
  if (obj === null || obj === undefined) return true;
  if (rbObjRespondTo(obj, "isNil")) return (obj as { isNil(): boolean }).isNil();
  return false;
}

/**
 * `rb_obj_as_string` (`vendor/ruby/v3.3.11/string.c:1653`) — the `to_s` of any value.
 * `Array#to_s` and `Hash#to_s` are aliases of `inspect`
 * (`vendor/ruby/v3.3.11/array.c:8616`, `vendor/ruby/v3.3.11/hash.c:7197`), so those two classes
 * render through {@link rbInspect}; every other value — a String above all,
 * which `rb_obj_as_string` returns unquoted — is its own `to_s`. A
 * `Uint8Array` is the binary String seat (see {@link rbEqual}), so it is
 * returned as it is (`string.c:1658`), and so is one a receiver's `to_s`
 * answers (`rb_obj_as_string_result`, `string.c:1666`). Otherwise
 * it is a send (`rb_funcall(obj, idTo_s, 0)`, `string.c:1661`): a ported class
 * defining `toS` answers it, and an answer that is not a String falls back to
 * {@link rbAnyToS}. A ported `String` subclass that is not a JS string
 * (`ActiveSupport::SafeBuffer`) marks itself one by `toStr`, so that is the
 * `T_STRING` test on a `toS` answer.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_obj_as_string`
 * (`vendor/ruby/v3.3.11/string.c:1653`); JS `String(x)` is not the same function, since
 * it gives the comma-joined form for a nested Array and `[object Object]` for a
 * Hash.
 */
export function rbObjAsString(value: Uint8Array | { toString(): Uint8Array }): Uint8Array;
/** @noRailsEquivalent PERMANENT — Ruby core `rb_obj_as_string` (`vendor/ruby/v3.3.11/string.c:1653`). */
export function rbObjAsString(value: unknown): string;
/** @noRailsEquivalent PERMANENT — Ruby core `rb_obj_as_string` (`vendor/ruby/v3.3.11/string.c:1653`). */
export function rbObjAsString(value: unknown): string | Uint8Array {
  if (value == null) return "";
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return rbInspect(value);
  if (isPlainHash(value) || value instanceof Map) return rbInspect(value);
  if (typeof value === "number" || value instanceof Number) return floToS(value);
  if (rbObjRespondTo(value, "toS")) {
    const str = (value as { toS(): unknown }).toS();
    if (str instanceof Uint8Array) return str;
    return rbCheckStringType(str) ?? rbAnyToS(value as object);
  }
  if (typeof value === "object") {
    const str: unknown = value.toString();
    if (typeof str === "string" || str instanceof Uint8Array) return str;
    return rbAnyToS(value);
  }
  return String(value);
}

/**
 * `flo_to_s` (`vendor/ruby/v3.3.11/numeric.c:1059`), `Float#to_s`: always a decimal
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

const ivarFields = new WeakMap<object, Map<string, string>>();

/**
 * The ivar-table entry `rb_ivar_set` (`vendor/ruby/v3.3.11/variable.c:1923`) writes
 * for `iv`, located on `klass`'s instances: the JS field holding it, where that
 * is not the field-name rule's spelling. An ivar behind a same-named reader
 * lives in the `_`-prefixed field. {@link rbObjIvarGet}, {@link rbObjIvarSet}
 * and {@link rbObjInstanceVariables} read the declaration, which subclasses
 * inherit.
 *
 * @noRailsEquivalent PERMANENT — Ruby core ivar table (`vendor/ruby/v3.3.11/variable.c:1923`).
 */
export function rbDeclareIvar(klass: { prototype: object }, iv: string, field: string): void {
  let table = ivarFields.get(klass.prototype);
  if (!table) ivarFields.set(klass.prototype, (table = new Map()));
  table.set(iv, field);
}

function ivarField(obj: object, id: string): string {
  for (let o: object | null = obj; o; o = Object.getPrototypeOf(o) as object | null) {
    const field = ivarFields.get(o)?.get(id);
    if (field !== undefined) return field;
  }
  return id.slice(1).replace(/(?<=[A-Za-z\d])_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function fieldIvar(obj: object, field: string): string {
  for (let o: object | null = obj; o; o = Object.getPrototypeOf(o) as object | null) {
    for (const [iv, f] of ivarFields.get(o) ?? []) if (f === field) return iv;
  }
  const iv = `@${field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`;
  return ivarField(obj, iv) === field ? iv : `@${field}`;
}

function idForVar(obj: object, iv: string): string {
  if (!/^@[A-Za-z_\u0080-\u{10FFFF}][A-Za-z0-9_\u0080-\u{10FFFF}]*$/u.test(iv)) {
    throw new NameError(`\`${iv}' is not allowed as an instance variable name`, iv, {
      receiver: obj,
    });
  }
  return iv;
}

/**
 * `Kernel#instance_variables` (`rb_obj_instance_variables`,
 * `vendor/ruby/v3.3.11/variable.c:2259`): the ivar names of `obj`'s own
 * enumerable fields, each spelled by its {@link rbDeclareIvar} declaration or
 * the field-name rule (`fooBar` is `@foo_bar`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#instance_variables`
 * (`vendor/ruby/v3.3.11/variable.c:2259`).
 */
export function rbObjInstanceVariables(obj: object): string[] {
  return Object.keys(obj).map((field) => fieldIvar(obj, field));
}

/**
 * `Kernel#instance_variable_get` (`rb_obj_ivar_get`, `vendor/ruby/v3.3.11/object.c:2880`):
 * the value of ivar `iv`, or `nil` when `obj` has no own field for it
 * (`rb_ivar_get`, `vendor/ruby/v3.3.11/variable.c:1405`), never an inherited
 * method or accessor. A name that is not an ivar name (`rb_is_instance_name`,
 * where a non-ASCII character is an identifier character) raises `NameError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#instance_variable_get`
 * (`vendor/ruby/v3.3.11/object.c:2880`).
 */
export function rbObjIvarGet(obj: object, iv: string): unknown {
  const id = idForVar(obj, iv);
  const field = ivarField(obj, id);
  return Object.hasOwn(obj, field) ? (obj as Record<string, unknown>)[field] : null;
}

/**
 * `Kernel#instance_variable_set` (`rb_obj_ivar_set_m`, `vendor/ruby/v3.3.11/object.c:2914`):
 * sets ivar `iv` as an own field of `obj`, never through a setter, as
 * `rb_ivar_set` (`vendor/ruby/v3.3.11/variable.c:1923`) writes the ivar table
 * directly after `rb_check_frozen`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#instance_variable_set`
 * (`vendor/ruby/v3.3.11/object.c:2914`).
 */
export function rbObjIvarSet(obj: object, iv: string, val: unknown): unknown {
  const id = idForVar(obj, iv);
  if (Object.isFrozen(obj)) {
    throw new FrozenError(`can't modify frozen ${rbObjClassname(obj)}: ${rbInspect(obj)}`, {
      receiver: obj,
    });
  }
  Object.defineProperty(obj, ivarField(obj, id), {
    value: val,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return val;
}
