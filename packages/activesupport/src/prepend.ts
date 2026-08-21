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
 * Mirrors: Ruby's `Module#prepend` — with the caveat that `super`
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
 *   import { prepend } from "@blazetrails/activesupport";
 *
 *   prepend(Relation.prototype, {
 *     where(super_: (...args: unknown[]) => unknown, ...args: unknown[]) {
 *       return super_(...processed(args));
 *     },
 *   });
 */
export type PrependMethod = (
  this: any,
  super_: (...args: unknown[]) => unknown,
  ...args: any[]
) => unknown;

export interface PrependModule {
  readonly [methodName: string]: PrependMethod;
}

const NO_METHOD_ROOT = function (): void {};

export function prepend<T extends object>(target: T, mod: PrependModule): void {
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    throw new TypeError("prepend: target must be an object or function");
  }

  // All-or-nothing pre-validation. A non-function wrapper, a frozen/sealed
  // target, or a non-configurable own property would otherwise throw mid-loop
  // and leave the target in a partial-patch state. We check all three up front
  // and throw before mutating.
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
    // If an own property exists and is non-configurable, `defineProperty`
    // below can still throw — three sub-cases:
    //   - non-writable data descriptor: can't change `value`.
    //   - accessor descriptor (get/set): can't convert to a data descriptor.
    //   - writable data descriptor: can change `value` but not `enumerable`
    //     — our wrap copies enumerable from the existing shape, so this
    //     one works.
    // Reject the first two up front to preserve the all-or-nothing
    // contract; the third is safe.
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
    // Ruby's `prepend` does not require the target to define the method: the
    // module can be the only definition, and a `super` inside it then finds
    // nothing below (ActiveModel's `init_internals`/`initialize_dup` chains,
    // whose only Ruby root is `ActiveRecord::Core#init_internals`,
    // core.rb:834 — absent when the chain is prepended onto a plain model).
    // That bottom link is a no-op root rather than an error so the chain can be
    // built in include order without manufacturing a root Rails does not have.
    const existing = (target as Record<string, unknown>)[name];
    const original =
      typeof existing === "function"
        ? (existing as (...args: unknown[]) => unknown)
        : NO_METHOD_ROOT;
    const wrapper = mod[name];
    const wrapped = function (this: unknown, ...args: unknown[]) {
      // Ruby's `super` is bound to the receiver, so the link is handed over
      // bound too and the module body spells it `super_(...)`. A caller that
      // spells it `super_.call(this, ...)` is unaffected — a bound function
      // ignores the `thisArg`.
      return wrapper.call(this, original.bind(this), ...args);
    };
    // Preserve the original property descriptor (class methods are
    // non-enumerable by default; direct assignment would make them
    // enumerable and leak into `Object.keys` / `for..in`). Fall back to
    // a non-enumerable writable data property when no descriptor is
    // found — the case where the module is the method's only definition.
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
