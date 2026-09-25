import { NameError } from "./name-error.js";

/**
 * The miss arm of `rb_const_get_0` (`vendor/ruby/variable.c:3120`), which hands
 * an unresolved constant to `rb_const_missing` (`vendor/ruby/variable.c:2346`)
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
 * `rb_mod_const_missing` (`vendor/ruby/variable.c:2391`), the default
 * `Module#const_missing`, which raises through `uninitialized_constant`
 * (`vendor/ruby/variable.c:2335`).
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
 * `rb_const_get` (`vendor/ruby/variable.c:3210`), the lookup behind
 * `Module#const_get(name)` (`vendor/ruby/object.c:2423` `rb_mod_const_get`):
 * `rb_const_search` walks `klass` and then its ancestors, which in JS is the
 * prototype chain `in` reads, and a miss goes to `rb_const_missing`
 * (`vendor/ruby/variable.c:2346`), which sends `const_missing` to `klass`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbConstGet(klass: object, id: string): unknown {
  if (id in klass) return (klass as Record<string, unknown>)[id];
  const { constMissing } = klass as { constMissing?: (name: string) => unknown };
  if (constMissing !== undefined) return constMissing.call(klass, id);
  return rbModConstMissing(klass, id);
}
