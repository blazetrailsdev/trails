import { ArgumentError } from "./argument-error.js";
import { Module } from "./include.js";
import { NameError } from "./name-error.js";
import { TypeError } from "./type-error.js";

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
  if (klass != null && klass !== globalThis) {
    throw new NameError(`uninitialized constant ${klass.name}::${name}`, name);
  } else {
    throw new NameError(`uninitialized constant ${name}`, name);
  }
}

/**
 * `rb_const_get` (`vendor/ruby/v3.3.11/variable.c:3210`), the lookup behind
 * `Module#const_get(name)` (`vendor/ruby/v3.3.11/object.c:2423` `rb_mod_const_get`):
 * `rb_const_search` walks `klass` and then its ancestors, which in JS is the
 * prototype chain `in` reads, and a miss goes to `rb_const_missing`
 * (`vendor/ruby/v3.3.11/variable.c:2346`), which sends `const_missing` to `klass`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbConstGet(klass: object, id: string): unknown {
  if (id in klass) return (klass as Record<string, unknown>)[id];
  const { constMissing } = klass as { constMissing?: (name: string) => unknown };
  if (constMissing !== undefined) return constMissing.call(klass, id);
  return rbModConstMissing(klass, id);
}

/**
 * `rb_cObject`'s constant table (`RCLASS_CONST_TBL`,
 * `vendor/ruby/v3.3.11/internal/class.h:95`), which `rb_const_set`
 * (`vendor/ruby/v3.3.11/variable.c:3674`) writes: each top-level constant, and
 * each constant registered beneath one, by its full path.
 *
 * @noRailsEquivalent PERMANENT
 */
export const rbCObjectConstTbl = new Map<string, unknown>();

/**
 * `rb_namespace_p` (`vendor/ruby/v3.3.11/variable.c:83`): a class is a function
 * whose `prototype` is non-writable, and a module is a `Module` or the
 * plain-object module `include()` takes.
 */
function rbNamespaceP(obj: unknown): boolean {
  if (typeof obj === "function") {
    return Object.getOwnPropertyDescriptor(obj, "prototype")?.writable === false;
  }
  if (typeof obj !== "object" || obj === null) return false;
  const proto: unknown = Object.getPrototypeOf(obj);
  return obj instanceof Module || proto === Object.prototype || proto === null;
}

/**
 * `rb_path_to_class` (`vendor/ruby/v3.3.11/variable.c:432-481`): walks `pathname`'s
 * `::` segments down from `rb_cObject`. `rb_const_search(c, id, TRUE, FALSE,
 * FALSE)` (`variable.c:3190`) reads `c`'s own constants and never its
 * ancestors'; here that is {@link rbCObjectConstTbl} by the path so far, then
 * an own property of `c`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbPathToClass(pathname: string): unknown {
  let pbeg = 0;
  let p = 0;
  const pend = pathname.length;
  let c: unknown = rbCObjectConstTbl;

  if (pend === 0 || pathname[0] === "#") {
    throw new ArgumentError(`can't retrieve anonymous class ${pathname}`);
  }
  while (p < pend) {
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
    if (!id) {
      throw new ArgumentError(`undefined class/module ${pathname.slice(0, p)}`);
    }
    if (rbCObjectConstTbl.has(path)) {
      c = rbCObjectConstTbl.get(path);
    } else if (c !== rbCObjectConstTbl && Object.hasOwn(c as object, id)) {
      c = (c as Record<string, unknown>)[id];
    } else {
      c = undefined;
    }
    if (c === undefined) {
      throw new ArgumentError(`undefined class/module ${pathname.slice(0, p)}`);
    }
    if (!rbNamespaceP(c)) {
      throw new TypeError(`${pathname} does not refer to class/module`);
    }
  }

  return c;
}
