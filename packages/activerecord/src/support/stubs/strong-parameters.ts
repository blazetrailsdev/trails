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
 * properties: `params[key]`, `{ ...params }` and `Object.keys(params)` all read
 * the parameter store, which is what the AR call sites and ActiveModel's
 * `isMassAssignmentEmpty` key count need. Every caller therefore holds the
 * Proxy, so the methods Ruby returns `self` from return it too (`#self`), and
 * the get trap binds methods to the raw target because private fields are
 * unreachable through a Proxy receiver.
 *
 * A method declared on the class wins over a same-named parameter, so a
 * parameter called `keys` or `permitted` cannot shadow it — the hazard the
 * own-property storage this replaces had, and which Rails never has because
 * the ivar is a separate namespace. The residual deviation is the mirror image
 * and is harmless: such a parameter is not reachable as `params[name]` or
 * through spread, where Ruby's `#[]` would return it; `toH()` reads it back.
 *
 * `toUnsafeH` is Rails' `alias to_unsafe_h to_h`: same hash, the name only
 * marks that the caller is bypassing the permitted check. `eachPair` returns
 * `@parameters` rather than `self` in Ruby — here that store IS the object
 * seen through its Proxy, so the same value comes back either way.
 */
export class ProtectedParams {
  [key: string]: unknown;

  #parameters: Record<string, unknown>;
  #permitted = false;
  #self: this;

  constructor(parameters: Record<string, unknown> = {}) {
    this.#parameters = { ...parameters };
    const params = this.#parameters;
    const target = this;
    const isParameter = (key: string | symbol): key is string =>
      typeof key === "string" &&
      Object.hasOwn(params, key) &&
      !Object.hasOwn(ProtectedParams.prototype, key);

    this.#self = new Proxy(this, {
      get(_t, key) {
        if (isParameter(key)) return params[key];
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(_t, key, value) {
        if (typeof key === "string") params[key] = value;
        return true;
      },
      has(_t, key) {
        return isParameter(key) || Reflect.has(target, key);
      },
      ownKeys() {
        return Object.keys(params);
      },
      getOwnPropertyDescriptor(_t, key) {
        if (!isParameter(key)) return undefined;
        return { value: params[key], writable: true, enumerable: true, configurable: true };
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
    return this.#self;
  }

  toH(): Record<string, unknown> {
    return { ...this.#parameters };
  }

  toUnsafeH(): Record<string, unknown> {
    return this.toH();
  }

  eachPair(block: (key: string, value: unknown) => void): this {
    for (const [key, value] of Object.entries(this.#parameters)) block(key, value);
    return this.#self;
  }

  /**
   * Ruby's `super.dup` shallow-copies the ivars and the override then re-sets
   * `@permitted`. Here the copy has to be a fresh `ProtectedParams` so it gets
   * its own Proxy — a structural clone of the wrapper would share this one.
   * The constructor already copies the parameter store, and `permitBang` is
   * how the permitted flag is reachable on the copy: the private field is
   * unreachable through the copy's Proxy receiver.
   */
  dup(): this {
    const duplicate = new ProtectedParams(this.#parameters);
    if (this.#permitted) duplicate.permitBang();
    return duplicate as this;
  }
}
