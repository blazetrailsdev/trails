/**
 * Ruby-style `include` for mixing module methods into a class.
 *
 * In Ruby, `include SomeModule` copies the module's instance methods
 * onto the including class's method lookup chain. This function does
 * the TypeScript equivalent: assigns each method from the module object
 * onto `klass.prototype`.
 *
 * Mirrors: Ruby's Module#include (core language feature)
 *
 * Usage:
 *   // Define a module as a plain object of this-typed functions
 *   const QueryMethods = {
 *     whereBang(this: Relation, opts: any) { ... },
 *     orderBang(this: Relation, ...args: any[]) { ... },
 *   };
 *
 *   // Include it into a class
 *   include(Relation, QueryMethods);
 */

type AnyClass = new (...args: any[]) => any;
type Module = Record<string, any>;

/**
 * Symbol keys for Ruby's Module#included and Module#extended callbacks.
 * Using symbols avoids collisions with real method names.
 */
export const included = Symbol.for("@blazetrails/activesupport:included");
export const extended = Symbol.for("@blazetrails/activesupport:extended");

/**
 * Per-prototype registry of method keys installed by a previous `include()`.
 *
 * Ruby's `include A; include B` places B higher in the ancestry than A, so a
 * method B defines wins over the same method in A — but neither wins over a
 * method defined directly in the class body. A raw `hasOwnProperty` check on
 * the prototype can't tell those two cases apart (both are own properties), so
 * we track which own keys arrived via `include()`. A collision on a tracked key
 * is an earlier mixin and gets replaced (last-included wins); a collision on an
 * untracked key is a class-body method and is preserved.
 */
const includedKeys = Symbol.for("@blazetrails/activesupport:includedKeys");

function trackedKeys(proto: object): Set<string> {
  let set = (proto as any)[includedKeys] as Set<string> | undefined;
  if (!Object.prototype.hasOwnProperty.call(proto, includedKeys)) {
    // Own the set per prototype so subclasses don't share a parent's registry.
    set = new Set<string>();
    Object.defineProperty(proto, includedKeys, {
      value: set,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return set!;
}

/**
 * Shared between `Included<>` and `Extended<>`: filter `M` down to its
 * callable string-keyed properties and strip the `this` parameter from
 * each signature.
 *
 * Implementation note: `M` is constrained to `object` rather than the
 * runtime `Module = Record<string, any>`. The runtime shape forces
 * a string index signature into every result, which propagates into
 * any merging class — and every subclass — and demands every property
 * be assignable to `(...args: unknown[]) => unknown`. That breaks
 * classes mixing this type and also having non-method fields (e.g.
 * arel's `Attribute` with `relation`, `name`, `caster`). `object` is
 * wide enough to accept any module literal but carries no index
 * signature. Filtering callable keys via
 * `M[K] extends (this: any, ...args: any[]) => any` keeps the result
 * tight to the literal method keys of the passed module.
 */
type CallableMethods<M extends object> = {
  [K in keyof M as K extends string
    ? M[K] extends (this: any, ...args: any[]) => any
      ? K
      : never
    : never]: M[K] extends (this: any, ...args: infer A) => infer R ? (...args: A) => R : never;
};

/**
 * Derive instance method types from an included module object.
 * Strips the `this` parameter from each function signature.
 *
 * Usage:
 *   export interface Relation<T> extends Included<typeof QueryMethodBangs> {}
 */
export type Included<M extends object> = CallableMethods<M>;

export function include(klass: AnyClass, mod: Module | AnyClass): void {
  const descriptors: PropertyDescriptorMap = {};
  const installed = trackedKeys(klass.prototype);

  // When `mod` is a class (has a prototype with own descriptors), read
  // descriptors directly — this preserves accessor properties (Ruby's
  // `def key=` / `def key` translate to getters/setters in TS) alongside
  // plain methods. Plain-object modules still work via Object.keys.
  const isClassModule = typeof mod === "function" && (mod as AnyClass).prototype;
  if (isClassModule) {
    const proto = (mod as AnyClass).prototype;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor") continue;
      const modDesc = Object.getOwnPropertyDescriptor(proto, key);
      if (!modDesc) continue;
      const existing = Object.getOwnPropertyDescriptor(klass.prototype, key);
      if (!existing) {
        descriptors[key] = modDesc;
        installed.add(key);
        continue;
      }
      const existingIsMixin = installed.has(key);
      // Accessor pairs: in TS `get`/`set` share one property name, but Ruby
      // treats a getter (`key`) and setter (`key=`) as two independent methods,
      // each resolved by ancestry on its own. So merge the pair, letting the
      // half from whichever descriptor is higher in the ancestry win and the
      // other fill in a half it doesn't define. An earlier-included mixin
      // (tracked) sits below the later `mod`; the class body (untracked) sits
      // above every mixin.
      const isAccessorPair =
        ("get" in modDesc || "set" in modDesc) && ("get" in existing || "set" in existing);
      if (isAccessorPair) {
        const higher = existingIsMixin ? modDesc : existing;
        const lower = existingIsMixin ? existing : modDesc;
        descriptors[key] = {
          get: higher.get ?? lower.get,
          set: higher.set ?? lower.set,
          configurable: true,
          enumerable: higher.enumerable ?? lower.enumerable ?? false,
        };
        // A half still owned by the class body keeps class-body precedence, so
        // only track the key when both halves are mixin-supplied.
        if (existingIsMixin) installed.add(key);
      } else if (existingIsMixin) {
        // Value (method) collision with an earlier-included mixin: Ruby puts the
        // later module higher in the ancestry, so the later include wins.
        descriptors[key] = modDesc;
      }
      // Otherwise the existing key is a class-body method — Ruby's include never
      // replaces it, so leave it untouched.
    }
  } else {
    for (const key of Object.keys(mod as Module)) {
      const value = (mod as Module)[key];
      // Ruby's include copies only instance methods — skip non-function values
      // and Ruby-style constants (uppercase first char mirrors Ruby constant naming).
      if (typeof value !== "function" || /^[A-Z]/.test(key)) continue;
      // A collision with a class-body method is never replaced (Ruby keeps the
      // class body); a collision with an earlier-included mixin is replaced
      // (Ruby's later include wins). Untracked own key === class body.
      if (Object.prototype.hasOwnProperty.call(klass.prototype, key) && !installed.has(key)) {
        continue;
      }
      installed.add(key);
      descriptors[key] = {
        value,
        writable: true,
        configurable: true,
        enumerable: false,
      };
    }
  }
  Object.defineProperties(klass.prototype, descriptors);

  // Ruby's Module#included(base) — fires after methods are copied
  if (typeof (mod as any)[included] === "function") {
    (mod as any)[included](klass);
  }
}

/**
 * Derive static method types from an extended module object.
 * Strips the `this` parameter from each function signature.
 *
 * Usage:
 *   interface BaseStatic extends Extended<typeof ConnectionHandlingMethods> {
 *     new (...args: any[]): Base;
 *   }
 *   extend(Base, ConnectionHandlingMethods);
 *   const TypedBase = Base as unknown as BaseStatic;
 */
export type Extended<M extends object> = CallableMethods<M>;

/**
 * Ruby-style `extend` for mixing module methods onto a class as static methods.
 *
 * In Ruby, `extend SomeModule` copies the module's methods onto the
 * object itself (not its prototype). When used on a class, this makes
 * the methods available as class-level (static) methods.
 *
 * Mirrors: Ruby's Object#extend (core language feature)
 *
 * Usage:
 *   extend(Base, ConnectionHandlingMethods);
 *   // Now Base.connectedTo(...) works
 */
export function extend(klass: AnyClass | object, mod: Module): void {
  for (const key of Object.keys(mod)) {
    const value = mod[key];
    // Ruby's extend copies only methods — skip non-functions and constants.
    if (typeof value !== "function" || /^[A-Z]/.test(key)) continue;
    Object.defineProperty(klass, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  // Ruby's Module#extended(base) — fires after methods are copied
  if (typeof (mod as any)[extended] === "function") {
    (mod as any)[extended](klass);
  }
}
