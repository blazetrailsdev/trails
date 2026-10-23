import { ArgumentError } from "./argument-error.js";
import { Exception } from "./exception.js";
import { EncodingError } from "./encoding-error.js";
import { EOFError } from "./eof-error.js";
import { FiberError } from "./fiber-error.js";
import { FloatDomainError } from "./float-domain-error.js";
import { IOError } from "./io-error.js";
import { LocalJumpError } from "./local-jump-error.js";
import { StopIteration } from "./stop-iteration.js";
import { ThreadError } from "./thread-error.js";
import { SystemCallError } from "./errno.js";
import { FrozenError } from "./frozen-error.js";
import { IndexError } from "./index-error.js";
import { KeyError } from "./key-error.js";
import { LoadError } from "./load-error.js";
import { NoMethodError } from "./no-method-error.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { RangeError } from "./range-error.js";
import { RuntimeError } from "./runtime-error.js";
import { Interrupt, SignalException } from "./signal-exception.js";
import { StandardError } from "./standard-error.js";
import { Hash } from "./hash.js";
import { warn } from "./kernel-warn.js";
import { verbose } from "./verbose.js";
import { rbModAncestors } from "./include.js";
import { NameError } from "./name-error.js";
import {
  RCLASS_CONST_TBL,
  classpaths,
  rbCBasicObject,
  rbCSymbol,
  rbModName,
  rbModToS,
} from "./object.js";
import { Range } from "./range.js";
import { Rational, ZeroDivisionError } from "./rational.js";
import { Struct } from "./struct.js";
import { TypeError } from "./type-error.js";

const _globals = new Map<string, unknown>();

/**
 * `rb_gv_get` (`vendor/ruby/v3.3.11/variable.c:984`): a global variable's
 * value, `nil` while it has not been assigned.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbGvGet(name: string): unknown {
  return _globals.has(name) ? _globals.get(name) : null;
}

/**
 * `rb_gv_set` (`vendor/ruby/v3.3.11/variable.c:970`): assigns a global
 * variable and answers the value.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbGvSet<T>(name: string, val: T): T {
  _globals.set(name, val);
  return val;
}

/**
 * `rb_const_set` (`vendor/ruby/v3.3.11/variable.c:3674`) on `rb_cObject`: JS
 * has no table of top-level constants, so a class or module is seated here
 * under its full Ruby path. Like `const_set` (`vendor/ruby/v3.3.11/variable.c:3648-3654`),
 * it names a class or module that has no permanent classpath yet, which
 * `rbModName` reads. A trails module can be a plain object, so an object is
 * named too.
 *
 * @noRailsEquivalent PERMANENT
 */
export function registerConstant(name: string, value: unknown): void {
  RCLASS_CONST_TBL.set(name, value);
  if (
    (typeof value === "object" && value !== null) ||
    (typeof value === "function" &&
      Object.getOwnPropertyDescriptor(value, "prototype")?.writable === false)
  ) {
    if (classpaths.get(value)?.permanent !== true) {
      classpaths.set(value, { path: name, permanent: true });
    }
  }
}

/**
 * `rb_const_remove` (`vendor/ruby/v3.3.11/variable.c:3313`) on `rb_cObject`,
 * for the seat `registerConstant` wrote.
 *
 * @noRailsEquivalent PERMANENT
 */
export function unregisterConstant(name: string, expected: unknown): void {
  if (RCLASS_CONST_TBL.get(name) !== expected) return;
  RCLASS_CONST_TBL.delete(name);
}

/**
 * `rb_mod_remove_const` (`vendor/ruby/v3.3.11/variable.c:3302`),
 * `Module#remove_const`: removes the constant from `mod`'s own table and
 * answers its value. `rb_const_remove` (`vendor/ruby/v3.3.11/variable.c:3313`)
 * raises `NameError` through `undefined_constant` for a name `mod` does not
 * hold. `rb_cObject`'s table is the one `registerConstant` fills.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModRemoveConst(mod: object, name: string): unknown {
  const tbl = mod as Record<string, unknown>;
  if (mod === Object ? !RCLASS_CONST_TBL.has(name) : !Object.hasOwn(mod, name)) {
    throw new NameError(`constant ${rbModName(mod)}::${name} not defined`, name);
  }
  const val = mod === Object ? RCLASS_CONST_TBL.get(name) : tbl[name];
  if (mod === Object) RCLASS_CONST_TBL.delete(name);
  else delete tbl[name];
  return val;
}

/**
 * `rb_const_defined` (`vendor/ruby/v3.3.11/variable.c:3527`) on `rb_cObject`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isRegisteredConstant(name: string): boolean {
  return RCLASS_CONST_TBL.has(name);
}

/**
 * The seat `registerConstant` wrote (`vendor/ruby/v3.3.11/variable.c:3674`
 * `rb_const_set` on `rb_cObject`), or `undefined`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function registeredConstant(name: string): unknown {
  return RCLASS_CONST_TBL.get(name);
}

/**
 * `Kernel#binding` (`vendor/ruby/v3.3.11/proc.c:376` `rb_f_binding`): the scope
 * a template is evaluated in. JS cannot capture a scope, so the binding is
 * `self` with the top-level constants behind it, which is where a constant
 * named in a binding resolves once its cref misses.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbFBinding<T extends object>(self: T): T {
  return new Proxy(self, {
    has: (target, key) => key in target || (typeof key === "string" && RCLASS_CONST_TBL.has(key)),
    get: (target, key, receiver) =>
      key in target || typeof key !== "string"
        ? Reflect.get(target, key, receiver)
        : RCLASS_CONST_TBL.get(key),
  });
}

/**
 * Empties the table `registerConstant` (`vendor/ruby/v3.3.11/variable.c:3674`
 * `rb_const_set` on `rb_cObject`) fills.
 *
 * @noRailsEquivalent PERMANENT
 */
export function resetConstants(): void {
  RCLASS_CONST_TBL.clear();
}

/**
 * `rb_path_to_class` (`vendor/ruby/v3.3.11/variable.c:432-474`), behind
 * `Psych::ClassLoader#path2class` (`vendor/ruby/v3.3.11/ext/psych/psych_to_ruby.c:22`).
 * `rb_const_search` (`vendor/ruby/v3.3.11/variable.c:3190`) reads a segment
 * from the `rb_cObject` table and then from the namespace before it, without
 * its ancestors. The table seats a constant under its full path and not
 * every prefix of it, so a seated path is read whole. A JS global is not a
 * top-level Ruby constant, as for `constantize`, and only a constant-shaped
 * own property is a constant. `rb_namespace_p`
 * (`vendor/ruby/v3.3.11/variable.c:83`) admits a function or an object: a trails
 * module can be a plain object.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbPathToClass(pathname: string): unknown {
  let pbeg = 0;
  let p = 0;
  const pend = pathname.length;
  let c: unknown = Object;

  if (pend === 0 || pathname[0] === "#") {
    throw new ArgumentError(`can't retrieve anonymous class ${pathname}`);
  }
  while (p < pend) {
    if (RCLASS_CONST_TBL.has(pathname)) p = pend;
    while (p < pend && pathname[p] !== ":") p++;
    const id = pathname.slice(pbeg, p);
    const path = pathname.slice(0, p);
    if (p < pend && pathname[p] === ":") {
      if (pend - p < 2 || pathname[p + 1] !== ":") {
        throw new ArgumentError(`undefined class/module ${pathname.slice(0, p)}`);
      }
      p += 2;
      pbeg = p;
    }
    if (id === "") {
      throw new ArgumentError(`undefined class/module ${pathname.slice(0, p)}`);
    }
    c = RCLASS_CONST_TBL.has(path)
      ? RCLASS_CONST_TBL.get(path)
      : c !== Object && /^[A-Z]/.test(id) && Object.hasOwn(c as object, id)
        ? (c as Record<string, unknown>)[id]
        : undefined;
    if (c === undefined) {
      throw new ArgumentError(`undefined class/module ${pathname.slice(0, p)}`);
    }
    if (c === null || (typeof c !== "object" && typeof c !== "function")) {
      throw new TypeError(`${pathname} does not refer to class/module`);
    }
  }

  return c;
}

/**
 * The miss arm of `rb_const_get_0` (`vendor/ruby/v3.3.11/variable.c:3120`), which hands
 * an unresolved constant to `rb_const_missing` (`vendor/ruby/v3.3.11/variable.c:2346`)
 * and so to the module's `const_missing`. JS has no hook for an unresolved
 * property but a `Proxy` trap, so this splices one into `klass`'s lookup chain,
 * directly above `klass` itself: a constant-shaped name that nothing on the
 * chain answers is sent to `klass.constMissing(name)`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbConstMissing(klass: object): void {
  const superclass = Object.getPrototypeOf(klass) as object;
  Object.setPrototypeOf(
    klass,
    new Proxy(superclass, {
      get(target, id, receiver) {
        if (typeof id !== "string" || !/^[A-Z]/.test(id) || id in target) {
          return Reflect.get(target, id, receiver);
        }
        return (receiver as { constMissing(name: string): unknown }).constMissing(id);
      },
    }),
  );
}

/**
 * `rb_mod_const_missing` (`vendor/ruby/v3.3.11/variable.c:2391`), the default
 * `Module#const_missing`, which raises through `uninitialized_constant`
 * (`vendor/ruby/v3.3.11/variable.c:2335`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModConstMissing(klass: { name?: string } | null, name: string): never {
  if (klass != null && klass !== globalThis && klass !== Object) {
    throw new NameError(`uninitialized constant ${klass.name}::${name}`, name);
  } else {
    throw new NameError(`uninitialized constant ${name}`, name);
  }
}

/**
 * `rb_const_get` (`vendor/ruby/v3.3.11/variable.c:3210`), the lookup behind
 * `Module#const_get(name)` (`vendor/ruby/v3.3.11/object.c:2423` `rb_mod_const_get`):
 * `rb_const_search` (`vendor/ruby/v3.3.11/variable.c:3190`) walks `klass` and
 * then its ancestors. The superclasses are the prototype chain `in` reads, the
 * included modules are the {@link rbModAncestors} entries no prototype link
 * carries, and `rb_cObject`, where the walk ends, is the table
 * `registerConstant` fills. A miss goes to `rb_const_missing`
 * (`vendor/ruby/v3.3.11/variable.c:2346`), which sends `const_missing` to `klass`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbConstGet(klass: object, id: string): unknown {
  if (id in klass) {
    let tmp: object | null = klass;
    while (tmp !== null && !Object.hasOwn(tmp, id)) tmp = Object.getPrototypeOf(tmp) as object;
    if (tmp !== null) rbConstWarnIfDeprecated(tmp, id);
    return (klass as Record<string, unknown>)[id];
  }
  if (typeof klass === "function") {
    for (const tmp of rbModAncestors(klass as unknown as { prototype: object })) {
      if (Object.hasOwn(tmp, id)) {
        rbConstWarnIfDeprecated(tmp, id);
        return (tmp as Record<string, unknown>)[id];
      }
    }
  }
  if (RCLASS_CONST_TBL.has(id)) return RCLASS_CONST_TBL.get(id);
  const { constMissing } = klass as { constMissing?: (name: string) => unknown };
  if (constMissing !== undefined) return constMissing.call(klass, id);
  return rbModConstMissing(klass, id);
}

const CONST_DEPRECATED = new WeakMap<object, Set<string>>();

/**
 * `rb_mod_deprecate_constant` (`vendor/ruby/v3.3.11/variable.c:3892-3896`),
 * `Module#deprecate_constant`, through `set_const_visibility`
 * (`variable.c:3786-3825`): each name must be a constant `mod` holds itself,
 * else `undefined_constant` (`variable.c:3235-3239`) raises `NameError`, and
 * is flagged `CONST_DEPRECATED` so a later read warns. Answers `mod`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModDeprecateConstant<T extends object>(obj: T, ...argv: string[]): T {
  if (argv.length === 0) {
    if (verbose() === true) warn("deprecate_constant with no argument is just ignored");
    return obj;
  }
  for (const id of argv) {
    if (Object.hasOwn(obj, id)) {
      let flags = CONST_DEPRECATED.get(obj);
      if (flags === undefined) CONST_DEPRECATED.set(obj, (flags = new Set()));
      flags.add(id);
    } else {
      throw new NameError(`constant ${rbModName(obj)}::${id} not defined`, id);
    }
  }
  return obj;
}

/**
 * `rb_const_warn_if_deprecated` (`vendor/ruby/v3.3.11/variable.c:3104-3117`):
 * a `:deprecated`-category warning for a read of a constant
 * {@link rbModDeprecateConstant} flagged.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbConstWarnIfDeprecated(klass: object, id: string): void {
  if (CONST_DEPRECATED.get(klass)?.has(id)) {
    if (klass === Object) {
      warn(`constant ::${id} is deprecated`, { category: ":deprecated" });
    } else {
      warn(`constant ${rbModToS(klass as never)}::${id} is deprecated`, {
        category: ":deprecated",
      });
    }
  }
}

/**
 * `rb_mod_constants` (`vendor/ruby/v3.3.11/variable.c:3471`),
 * `Module#constants(inherit = true)`: the names of the constants `mod`, its
 * superclasses and the modules they include hold, as `rb_mod_const_of`
 * (`variable.c:3417-3427`) collects them along the ancestry, stopping short of
 * `Object`. With a falsy `inherit` it is `rb_local_constants`
 * (`variable.c:3382-3397`), `mod`'s own table alone. A constant is a property
 * {@link rbModConstSet} or a `static` field seated under a constant name.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModConstants(mod: object, inherit: unknown = true): string[] {
  const tbl = new Set<string>();
  const ancestors =
    inherit !== null && inherit !== false && typeof mod === "function"
      ? rbModAncestors(mod as unknown as { prototype: object })
      : [mod];
  for (const tmp of ancestors) {
    if (tmp === Object && mod !== Object) break;
    for (const id of Object.keys(tmp)) if (/^[\p{Lu}\p{Lt}]/u.test(id)) tbl.add(id);
  }
  return [...tbl];
}

/**
 * `rb_mod_const_get` (`vendor/ruby/v3.3.11/object.c:2423`), `Module#const_get`
 * of a name that may be a `::` path. The first segment is read by
 * {@link rbConstGet}; each later one is read from the namespace before it
 * alone (`rb_const_get_0` with `exclude`), and a miss raises `NameError`
 * naming that segment. The top-level table seats a constant under its full
 * path and not every prefix of it, so a seated path or prefix is read whole,
 * as {@link rbPathToClass} reads it.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModConstGet(mod: object, name: string): unknown {
  if (RCLASS_CONST_TBL.has(name)) return RCLASS_CONST_TBL.get(name);
  let path = "";
  let c: unknown = mod;
  for (const [i, part] of name.split("::").entries()) {
    path = i === 0 ? part : `${path}::${part}`;
    if (i === 0) {
      c = rbConstGet(mod, part);
    } else if (RCLASS_CONST_TBL.has(path)) {
      c = RCLASS_CONST_TBL.get(path);
    } else if (
      c !== null &&
      (typeof c === "object" || typeof c === "function") &&
      Object.hasOwn(c, part)
    ) {
      rbConstWarnIfDeprecated(c, part);
      c = (c as Record<string, unknown>)[part];
    } else {
      return rbModConstMissing(c as { name?: string } | null, part);
    }
  }
  return c;
}

registerConstant("BasicObject", rbCBasicObject);
registerConstant("Object", Object);
registerConstant("Array", Array);
registerConstant("Hash", Hash);
registerConstant("Exception", Exception);
registerConstant("SignalException", SignalException);
registerConstant("Interrupt", Interrupt);
registerConstant("StandardError", StandardError);
registerConstant("TypeError", TypeError);
registerConstant("ArgumentError", ArgumentError);
registerConstant("IndexError", IndexError);
registerConstant("KeyError", KeyError);
registerConstant("RangeError", RangeError);
registerConstant("LoadError", LoadError);
registerConstant("NotImplementedError", NotImplementedError);
registerConstant("NameError", NameError);
registerConstant("NoMethodError", NoMethodError);
registerConstant("RuntimeError", RuntimeError);
registerConstant("FrozenError", FrozenError);
registerConstant("EncodingError", EncodingError);
registerConstant("SystemCallError", SystemCallError);
registerConstant("ZeroDivisionError", ZeroDivisionError);
registerConstant("FloatDomainError", FloatDomainError);
registerConstant("IOError", IOError);
registerConstant("EOFError", EOFError);
registerConstant("StopIteration", StopIteration);
registerConstant("LocalJumpError", LocalJumpError);
registerConstant("ThreadError", ThreadError);
registerConstant("FiberError", FiberError);
registerConstant("Range", Range);
registerConstant("Regexp", RegExp);
registerConstant("Struct", Struct);
registerConstant("Symbol", rbCSymbol);

registerConstant("Rational", Rational);
