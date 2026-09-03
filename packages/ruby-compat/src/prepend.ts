/**
 * Ruby-style `prepend` — wraps methods on a target so the module's
 * version is called first and receives the original as `super_`.
 *
 * Ruby's `Module#prepend` inserts the module at the front of the
 * ancestor chain so `super` inside the module resolves to the original
 * method. TypeScript has no prototype-chain prepend; `prepend()` wraps
 * each target method in place. A call like `target.foo(...args)`
 * invokes `module.foo.call(this, originalFoo, ...args)`, letting the
 * module short-circuit or delegate via `originalFoo(...)` — the link arrives
 * bound to the receiver, as Ruby's `super` is.
 *
 * Mirrors: Ruby's `Module#prepend` — vendor/ruby/eval.c:1196
 * `rb_mod_prepend`, backed by vendor/ruby/class.c:1430 `rb_prepend_module` —
 * with the caveat that `super`
 * becomes an explicit first argument because TypeScript has no
 * language-level `super` equivalent for runtime-wrapped methods.
 *
 * As in Ruby, the target need not already define the method: prepending a
 * module that is the only definition is legal, and `super_` is then a no-op
 * root — which is how a `super`-opening chain (ActiveModel's
 * `init_internals`, validations.rb:467-471 / dirty.rb:371-376) is built in
 * include order without a root definition.
 *
 * Idempotency is the caller's responsibility — calling `prepend()` on
 * the same target+module twice will wrap twice, producing a chain.
 * For install-once semantics, guard with a flag as Rails does via
 * a railtie or `installed?` check.
 *
 * Usage:
 *   import { prepend } from "@blazetrails/ruby-compat";
 *
 *   prepend(Relation.prototype, {
 *     where(super_: (...args: unknown[]) => unknown, ...args: unknown[]) {
 *       return super_(...processed(args));
 *     },
 *   });
 */
export type PrependMethod = (
  this: never,
  super_: (...args: unknown[]) => unknown,
  ...args: never[]
) => unknown;

export interface PrependModule {
  readonly [methodName: string]: PrependMethod;
}

const NO_METHOD_ROOT = function (): void {};

/**
 * Mirrors: Ruby's Module#prepend — vendor/ruby/eval.c:1196 `rb_mod_prepend`,
 * backed by vendor/ruby/class.c:1430 `rb_prepend_module`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 */
export function prepend<T extends object>(target: T, mod: PrependModule): void {
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    throw new TypeError("prepend: target must be an object or function");
  }

  if (!Object.isExtensible(target)) {
    throw new TypeError("prepend: target is not extensible (frozen/sealed)");
  }
  const names = Object.keys(mod);
  for (const name of names) {
    if (typeof mod[name] !== "function") {
      throw new TypeError(
        `prepend: module entry ${name} must be a function, got ${typeof mod[name]}`,
      );
    }
    const own = Object.getOwnPropertyDescriptor(target, name);
    if (own && own.configurable === false) {
      if (own.get || own.set) {
        throw new TypeError(
          `prepend: cannot wrap ${name} — target's own property is a non-configurable accessor`,
        );
      }
      if (own.writable !== true) {
        throw new TypeError(
          `prepend: cannot wrap ${name} — target's own property is non-configurable and non-writable`,
        );
      }
    }
  }

  for (const name of names) {
    const descriptor = findPropertyDescriptor(target, name);
    const existing = (target as Record<string, unknown>)[name];
    const original =
      typeof existing === "function"
        ? (existing as (...args: unknown[]) => unknown)
        : NO_METHOD_ROOT;
    const wrapper = mod[name] as (
      this: unknown,
      super_: (...args: unknown[]) => unknown,
      ...args: unknown[]
    ) => unknown;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      return wrapper.call(this, original.bind(this), ...args);
    };
    Object.defineProperty(target, name, {
      value: wrapped,
      writable: descriptor?.writable ?? true,
      enumerable: descriptor?.enumerable ?? false,
      configurable: descriptor?.configurable ?? true,
    });
  }
}

function findPropertyDescriptor(target: object, name: string): PropertyDescriptor | undefined {
  let obj: object | null = target;
  while (obj) {
    const d = Object.getOwnPropertyDescriptor(obj, name);
    if (d) return d;
    obj = Object.getPrototypeOf(obj);
  }
  return undefined;
}
