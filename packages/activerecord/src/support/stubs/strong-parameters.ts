/**
 * Test stub mirroring Action Controller's strong-parameters object, used by
 * the forbidden-attributes tests to exercise mass-assignment protection.
 *
 * Mirrors: vendor/rails/activerecord/test/support/stubs/strong_parameters.rb
 * (`ProtectedParams`). Parameters are stored as own enumerable properties so
 * the object iterates like a hash (`Object.entries`, `Object.keys`) and
 * supports `params[key]` access, while `permitted()` / `permit()` / `toH()`
 * live on the prototype and stay out of the attribute set.
 */
export class ProtectedParams {
  [key: string]: unknown;

  #permitted = false;

  constructor(parameters: Record<string, unknown> = {}) {
    Object.assign(this, parameters);
  }

  /** Mirrors ProtectedParams#permitted? */
  permitted(): boolean {
    return this.#permitted;
  }

  /** Mirrors ProtectedParams#permit! — marks permitted and returns self. */
  permit(): this {
    this.#permitted = true;
    return this;
  }

  /** Mirrors ProtectedParams#to_h — the unwrapped plain-object parameters. */
  toH(): Record<string, unknown> {
    return { ...this };
  }
}
