/**
 * Test stub mirroring Action Controller's strong-parameters object, used by
 * the forbidden-attributes tests to exercise mass-assignment protection.
 *
 * Mirrors: vendor/rails/activerecord/test/support/stubs/strong_parameters.rb
 * (`ProtectedParams`). Parameters are stored as own enumerable properties so
 * the object iterates like a hash (`Object.entries`, `Object.keys`) and
 * supports `params[key]` access, while `permitted()` / `permitBang()` /
 * `toH()` live on the prototype and stay out of the attribute set.
 *
 * Rails gets `keys` / `key?` / `has_key?` / `empty?` from
 * `delegate ..., to: :@parameters` over a `HashWithIndifferentAccess`; the own
 * properties here *are* that `@parameters` hash, so the four read straight off
 * `this`. There is no indifferent access to mirror — JS object keys are
 * strings already, so Rails' symbol/string duality has no analogue.
 */
export class ProtectedParams {
  [key: string]: unknown;

  #permitted = false;

  constructor(parameters: Record<string, unknown> = {}) {
    Object.assign(this, parameters);
  }

  /** Mirrors ProtectedParams#keys (delegated to @parameters). */
  keys(): string[] {
    return Object.keys(this);
  }

  /** Mirrors ProtectedParams#key? (delegated to @parameters). */
  isKey(key: string): boolean {
    return Object.hasOwn(this, key);
  }

  /** Mirrors ProtectedParams#has_key? (delegated to @parameters). */
  hasKey(key: string): boolean {
    return this.isKey(key);
  }

  /** Mirrors ProtectedParams#empty? (delegated to @parameters). */
  isEmpty(): boolean {
    return this.keys().length === 0;
  }

  /** Mirrors ProtectedParams#permitted? */
  permitted(): boolean {
    return this.#permitted;
  }

  /** Mirrors ProtectedParams#permit! — marks permitted and returns self. */
  permitBang(): this {
    this.#permitted = true;
    return this;
  }

  /** Mirrors ProtectedParams#to_h — the unwrapped plain-object parameters. */
  toH(): Record<string, unknown> {
    return { ...this };
  }

  /** Mirrors ProtectedParams#to_unsafe_h (`alias to_unsafe_h to_h`). */
  toUnsafeH(): Record<string, unknown> {
    return this.toH();
  }

  /** Mirrors ProtectedParams#each_pair (delegated to @parameters). */
  eachPair(block: (key: string, value: unknown) => void): this {
    for (const [key, value] of Object.entries(this)) block(key, value);
    return this;
  }
}
