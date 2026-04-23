/**
 * Ruby-style `prepend` — wraps methods on a target so the module's
 * version is called first and receives the original as `super_`.
 *
 * Ruby's `Module#prepend` inserts the module at the front of the
 * ancestor chain so `super` inside the module resolves to the original
 * method. TypeScript has no prototype-chain prepend; `prepend()` wraps
 * each target method in place. A call like `target.foo(...args)`
 * invokes `module.foo.call(this, originalFoo, ...args)`, letting the
 * module short-circuit or delegate via `originalFoo.call(this, ...)`.
 *
 * Mirrors: Ruby's `Module#prepend` — with the caveat that `super`
 * becomes an explicit first argument because TypeScript has no
 * language-level `super` equivalent for runtime-wrapped methods.
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
 *     where(super_: Function, ...args: unknown[]) {
 *       return super_.call(this, ...processed(args));
 *     },
 *   });
 */
export type PrependMethod = (this: any, super_: Function, ...args: any[]) => unknown;

export interface PrependModule {
  readonly [methodName: string]: PrependMethod;
}

export function prepend<T extends object>(target: T, mod: PrependModule): void {
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    throw new TypeError("prepend: target must be an object or function");
  }

  // All-or-nothing pre-validation. A missing method, a non-function
  // wrapper, a frozen/sealed target, or a non-configurable own property
  // would otherwise throw mid-loop and leave the target in a partial-
  // patch state. We check all four up front and throw before mutating.
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
    const original = (target as Record<string, unknown>)[name];
    if (typeof original !== "function") {
      throw new Error(`prepend: cannot wrap ${name} — target has no method with that name`);
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
    const original = (target as Record<string, unknown>)[name] as Function;
    const wrapper = mod[name] as PrependMethod;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      return wrapper.call(this, original, ...args);
    };
    // Preserve the original property descriptor (class methods are
    // non-enumerable by default; direct assignment would make them
    // enumerable and leak into `Object.keys` / `for..in`). Fall back to
    // a non-enumerable writable data property when no descriptor is
    // found (shouldn't happen — the pre-validation above ensures the
    // method exists somewhere on the prototype chain).
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
