/**
 * Test stub mirroring Action Controller's strong-parameters object, used by
 * the forbidden-attributes tests to exercise mass-assignment protection.
 *
 * Mirrors: vendor/rails/activerecord/test/support/stubs/strong_parameters.rb
 * (`ProtectedParams`). Parameters are stored as own enumerable properties so
 * the object iterates like a hash (`Object.entries`, `Object.keys`) and
 * supports `params[key]` access, while the methods below live on the prototype
 * and stay out of the attribute set.
 *
 * Rails gets `keys` / `key?` / `has_key?` / `empty?` from
 * `delegate ..., to: :@parameters` over a `HashWithIndifferentAccess`; the own
 * properties here *are* that `@parameters` hash, so the four read straight off
 * `this`. There is no indifferent access to mirror — JS object keys are
 * strings already, so Rails' symbol/string duality has no analogue.
 *
 * `toUnsafeH` is Rails' `alias to_unsafe_h to_h`: same hash, the name only
 * marks that the caller is bypassing the permitted check.
 *
 * The cost of storing parameters on `this` rather than in a `@parameters` ivar
 * is that a parameter named after one of these methods shadows it — Rails has
 * no such hazard. No column in the canonical schema collides, so no test can
 * hit it today; a test that needs one must reach for a nested
 * `ProtectedParams` value instead.
 */
export class ProtectedParams {
  [key: string]: unknown;

  #permitted = false;

  constructor(parameters: Record<string, unknown> = {}) {
    Object.assign(this, parameters);
  }

  keys(): string[] {
    return Object.keys(this);
  }

  isKey(key: string): boolean {
    return Object.hasOwn(this, key);
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
    return this;
  }

  toH(): Record<string, unknown> {
    return { ...this };
  }

  toUnsafeH(): Record<string, unknown> {
    return this.toH();
  }

  // Ruby's `@parameters.each_pair(&block)` returns `@parameters`, not `self`.
  // Here `this` IS the parameters hash, so returning it is that same value —
  // read the `this` as the hash, not as Ruby's `self`.
  eachPair(block: (key: string, value: unknown) => void): this {
    for (const [key, value] of Object.entries(this)) block(key, value);
    return this;
  }
}
