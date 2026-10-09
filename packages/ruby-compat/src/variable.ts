import { ArgumentError } from "./argument-error.js";
import { Exception } from "./exception.js";
import { rbModAncestors } from "./include.js";
import { NameError } from "./name-error.js";
import { classpaths, rbCSymbol, rbModName } from "./object.js";
import { Range } from "./range.js";
import { Rational } from "./rational.js";
import { TypeError } from "./type-error.js";

const _constants = new Map<string, unknown>();
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
  _constants.set(name, value);
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
  if (_constants.get(name) !== expected) return;
  _constants.delete(name);
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
  const tbl = mod === Object ? _constants : new Map(Object.entries(mod));
  if (!tbl.has(name)) {
    throw new NameError(`constant ${rbModName(mod)}::${name} not defined`, name);
  }
  const val = tbl.get(name);
  if (mod === Object) _constants.delete(name);
  else delete (mod as Record<string, unknown>)[name];
  return val;
}

/**
 * `rb_const_defined` (`vendor/ruby/v3.3.11/variable.c:3527`) on `rb_cObject`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isRegisteredConstant(name: string): boolean {
  return _constants.has(name);
}

/**
 * The seat `registerConstant` wrote (`vendor/ruby/v3.3.11/variable.c:3674`
 * `rb_const_set` on `rb_cObject`), or `undefined`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function registeredConstant(name: string): unknown {
  return _constants.get(name);
}

/**
 * Empties the table `registerConstant` (`vendor/ruby/v3.3.11/variable.c:3674`
 * `rb_const_set` on `rb_cObject`) fills.
 *
 * @noRailsEquivalent PERMANENT
 */
export function resetConstants(): void {
  _constants.clear();
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
    if (_constants.has(pathname)) p = pend;
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
    c = _constants.has(path)
      ? _constants.get(path)
      : c !== Object && /^[A-Z]/.test(id) && Object.prototype.hasOwnProperty.call(c, id)
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
  if (id in klass) return (klass as Record<string, unknown>)[id];
  if (typeof klass === "function") {
    for (const tmp of rbModAncestors(klass as unknown as { prototype: object })) {
      if (Object.prototype.hasOwnProperty.call(tmp, id)) {
        return (tmp as Record<string, unknown>)[id];
      }
    }
  }
  if (_constants.has(id)) return _constants.get(id);
  const { constMissing } = klass as { constMissing?: (name: string) => unknown };
  if (constMissing !== undefined) return constMissing.call(klass, id);
  return rbModConstMissing(klass, id);
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
  if (_constants.has(name)) return _constants.get(name);
  let path = "";
  let c: unknown = mod;
  for (const [i, part] of name.split("::").entries()) {
    path = i === 0 ? part : `${path}::${part}`;
    if (i === 0) {
      c = rbConstGet(mod, part);
    } else if (_constants.has(path)) {
      c = _constants.get(path);
    } else if (
      c !== null &&
      (typeof c === "object" || typeof c === "function") &&
      Object.prototype.hasOwnProperty.call(c, part)
    ) {
      c = (c as Record<string, unknown>)[part];
    } else {
      return rbModConstMissing(c as { name?: string } | null, part);
    }
  }
  return c;
}

registerConstant("Object", Object);
registerConstant("Exception", Exception);
registerConstant("Range", Range);
registerConstant("Regexp", RegExp);
registerConstant("Symbol", rbCSymbol);

registerConstant("Rational", Rational);
