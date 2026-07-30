/**
 * Test stub mirroring Action Controller's strong-parameters object, used by
 * the forbidden-attributes tests to exercise mass-assignment protection.
 *
 * Mirrors: vendor/rails/activerecord/test/support/stubs/strong_parameters.rb
 * (`ProtectedParams`). Parameters live in a private `#parameters` field — the
 * `@parameters` ivar Rails delegates `keys` / `key?` / `has_key?` / `empty?`
 * to over a `HashWithIndifferentAccess`. There is no indifferent access to
 * mirror — JS object keys are strings already, so Rails' symbol/string duality
 * has no analogue.
 *
 * Ruby gets `params[key]` from `#[]` and hash iteration from the ivar. JS has
 * neither operator overloading nor a hash protocol, so the constructor returns
 * a Proxy that projects the parameters as the object's own enumerable
 * properties: `params[key]`, `{ ...params }` and `Object.keys(params)` all
 * read the parameter store. Methods declared on the class always win over a
 * same-named parameter, so a parameter called `keys` or `permitted` cannot
 * shadow the method — the hazard the own-property storage this replaces had,
 * and which Rails never has because the ivar is a separate namespace. The
 * residual deviation is the mirror image and is harmless: a parameter named
 * after a method is not reachable as `params[name]` or through spread (Ruby's
 * `#[]` would return it) — `toH()` reads it back.
 *
 * `toUnsafeH` is Rails' `alias to_unsafe_h to_h`: same hash, the name only
 * marks that the caller is bypassing the permitted check.
 */
export class ProtectedParams {
  [key: string]: unknown;

  #parameters: Record<string, unknown>;
  #permitted = false;
  // The Proxy wrapper returned from the constructor. Methods that return Ruby's
  // `self` must hand back the wrapper, not the raw target: every caller holds
  // the wrapper, and `permitBang()` chains into it.
  #self: ProtectedParams;

  constructor(parameters: Record<string, unknown> = {}) {
    this.#parameters = { ...parameters };
    const params = this.#parameters;
    const target = this;

    const isMethod = (key: string | symbol): boolean =>
      Object.hasOwn(ProtectedParams.prototype, key);

    this.#self = new Proxy(this, {
      get(_t, key) {
        if (typeof key === "string" && !isMethod(key) && Object.hasOwn(params, key)) {
          return params[key];
        }
        const value = Reflect.get(target, key);
        // Private fields are unreachable through a Proxy receiver, so every
        // method has to run against the raw target.
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(_t, key, value) {
        if (typeof key === "symbol") return Reflect.set(target, key, value);
        params[key] = value;
        return true;
      },
      has(_t, key) {
        return (typeof key === "string" && Object.hasOwn(params, key)) || Reflect.has(target, key);
      },
      ownKeys() {
        return Object.keys(params);
      },
      getOwnPropertyDescriptor(_t, key) {
        if (typeof key === "string" && Object.hasOwn(params, key)) {
          return { value: params[key], writable: true, enumerable: true, configurable: true };
        }
        return undefined;
      },
      deleteProperty(_t, key) {
        if (typeof key === "string") delete params[key];
        return true;
      },
    });

    return this.#self;
  }

  keys(): string[] {
    return Object.keys(this.#parameters);
  }

  isKey(key: string): boolean {
    return Object.hasOwn(this.#parameters, key);
  }

  hasKey(key: string): boolean {
    return this.isKey(key);
  }

  isEmpty(): boolean {
    return this.keys().length === 0;
  }

  permitted(): boolean {
    return this.#permitted;
  }

  permitBang(): this {
    this.#permitted = true;
    return this.#self as this;
  }

  toH(): Record<string, unknown> {
    return { ...this.#parameters };
  }

  toUnsafeH(): Record<string, unknown> {
    return this.toH();
  }

  // Ruby's `@parameters.each_pair(&block)` returns `@parameters`, not `self`;
  // the wrapper returned here is that same store seen through its Proxy.
  eachPair(block: (key: string, value: unknown) => void): this {
    for (const [key, value] of Object.entries(this.#parameters)) block(key, value);
    return this.#self as this;
  }
}
