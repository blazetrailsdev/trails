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
 * Derive instance method types from an included module object.
 * Strips the `this` parameter from each function signature.
 *
 * Usage:
 *   export interface Relation<T> extends Included<typeof QueryMethodBangs> {}
 */
export type Included<M extends Module> = {
  [K in keyof M]: M[K] extends (this: any, ...args: infer A) => infer R ? (...args: A) => R : never;
};

export function include(klass: AnyClass, mod: Module): void {
  const descriptors: PropertyDescriptorMap = {};
  for (const key of Object.keys(mod)) {
    // Ruby's include doesn't replace methods already defined on the class
    if (Object.prototype.hasOwnProperty.call(klass.prototype, key)) continue;
    descriptors[key] = {
      value: mod[key],
      writable: true,
      configurable: true,
      enumerable: false,
    };
  }
  Object.defineProperties(klass.prototype, descriptors);
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
  [K in keyof M]: M[K] extends (this: any, ...args: infer A) => infer R ? (...args: A) => R : never;
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
}
