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
type Module = Record<string, Function>;

/**
 * Symbol keys for Ruby's Module#included and Module#extended callbacks.
 * Using symbols avoids collisions with real method names.
 */
export const included = Symbol.for("@blazetrails/activesupport:included");
export const extended = Symbol.for("@blazetrails/activesupport:extended");

/**
 * Derive instance method types from an included module object.
 * Strips the `this` parameter from each function signature.
 *
 * Usage:
 *   export interface Relation<T> extends Included<typeof QueryMethodBangs> {}
 */
export type Included<M extends Module> = {
  [K in keyof M as K extends string ? K : never]: M[K] extends (
    this: any,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never;
};

export function include(klass: AnyClass, mod: Module | AnyClass): void {
  const descriptors: PropertyDescriptorMap = {};

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
        continue;
      }
      // Accessor pairs: preserve the existing half, fill in whichever the
      // including class didn't define. Ruby's include supplies only the
      // missing methods, but in TS `get`/`set` share a single property
      // name — re-apply the whole pair so both halves end up live.
      const isAccessorPair =
        ("get" in modDesc || "set" in modDesc) && ("get" in existing || "set" in existing);
      if (isAccessorPair) {
        descriptors[key] = {
          get: existing.get ?? modDesc.get,
          set: existing.set ?? modDesc.set,
          configurable: true,
          enumerable: existing.enumerable ?? modDesc.enumerable ?? false,
        };
      }
      // Value (method) collision: Ruby's include doesn't replace — leave it.
    }
  } else {
    for (const key of Object.keys(mod as Module)) {
      // Ruby's include doesn't replace methods already defined on the class
      if (Object.prototype.hasOwnProperty.call(klass.prototype, key)) continue;
      descriptors[key] = {
        value: (mod as Module)[key],
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
export type Extended<M extends Module> = {
  [K in keyof M as K extends string ? K : never]: M[K] extends (
    this: any,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never;
};

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
    Object.defineProperty(klass, key, {
      value: mod[key],
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
