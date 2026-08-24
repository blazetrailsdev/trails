import { extractOptionsBang } from "@blazetrails/activesupport";

import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { ArgumentError, NameError } from "../attribute-assignment.js";

export class WithValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, _value: unknown): void {
    const methodName = this.options.with as string;
    const method = (record as unknown as Record<string, unknown>)[methodName];
    if (typeof method !== "function") {
      // Mirrors Rails with.rb:9 `record.method(method_name)`, which raises
      // NameError (not its NoMethodError subclass) when the record has no
      // such method.
      throw new NameError(`undefined method '${methodName}' for ${String(record)}`);
    }
    // Mirrors with.rb:8-12: arity == 0 → call without arg, else with attr.
    // JS divergence: rest-param ((...args) => {}) and default-param ((x = "") => {})
    // functions both have Function.length 0 and are treated as zero-arity; Ruby
    // gives them negative arity and Rails passes the attr. Documented in tests.
    if (method.length === 0) {
      method.call(record);
    } else {
      method.call(record, attribute);
    }
  }

  override checkValidityBang(): void {
    super.checkValidityBang();
    const methodName = this.options.with;
    if (typeof methodName !== "string" || methodName.trim().length === 0) {
      throw new ArgumentError("WithValidator requires the :with option to be a non-blank string");
    }
  }
}

/**
 * Anything `validates_with` accepts: a full `Validator`/`EachValidator`
 * subclass, or any class that just implements `validate(record)`.
 */
type ValidatorLike = { validate(record: ValidatableRecord): unknown };

type ValidatorClass = new (options: Record<string, unknown>) => ValidatorLike;

/** The class-level surface `ClassMethods#validates_with` self-sends. */
export interface ValidatesWithClassHost {
  _validators: Map<string | null, ValidatorLike[]>;
  _ensureOwnValidators(): void;
  validate(fn: (record: ValidatableRecord) => unknown, options?: Record<string, unknown>): void;
}

/**
 * Passes the record off to the class or classes specified and allows them
 * to add errors based on more complex conditions, so a `validate :foo` body
 * can run a validator on the spot.
 *
 * Mirrors: ActiveModel::Validations#validates_with (with.rb:144-151). Rails'
 * loop is synchronous; a trails validator may return a promise (RFC 0063 made
 * validation async), so each run is awaited in turn, which preserves Rails'
 * one-validator-at-a-time order.
 */
export async function validatesWith(this: ValidatableRecord, ...args: unknown[]): Promise<void> {
  const [klasses, options] = extractOptionsBang(args);
  options.class = this.constructor;

  for (const klass of klasses as ValidatorClass[]) {
    const validator = new klass({ ...options });
    await validator.validate(this);
  }
}

export const ClassMethods = {
  /**
   * Passes the record off to the class or classes specified and allows them
   * to add errors based on more complex conditions.
   *
   * Mirrors: ActiveModel::Validations::ClassMethods#validates_with
   * (activemodel/lib/active_model/validations/with.rb:88-105).
   */
  validatesWith(this: ValidatesWithClassHost, ...args: unknown[]): void {
    const [klasses, options] = extractOptionsBang(args);
    options.class = this;

    for (const klass of klasses as ValidatorClass[]) {
      // Ruby `klass.new(options.dup, &block)` (with.rb:92) hands the FULL
      // options hash — condition keys, `strict`, custom keys — plus `:class`
      // to the validator; only `Validator#initialize` strips `:class`
      // (validator.rb:107-110), leaving every standard key visible in
      // `validator.options`.
      const validator = new klass({ ...options });

      this._ensureOwnValidators();
      const attributes = (validator as { attributes?: readonly string[] }).attributes;
      if (Array.isArray(attributes) && attributes.length > 0) {
        for (const attribute of attributes) {
          _pushValidator(this._validators, String(attribute), validator);
        }
      } else {
        _pushValidator(this._validators, null, validator);
      }

      // Ruby passes the validator object itself as the callback filter
      // (with.rb:103); a trails callback filter is a function, so the send is
      // spelled out.
      this.validate((record) => validator.validate(record), options);
    }
  },
};

/**
 * Ruby's `_validators` is a `Hash.new { |h, k| h[k] = [] }`
 * (validations.rb:50), so `_validators[key] << validator` vivifies the bucket.
 * A JS `Map` has no default proc; this is that one expression.
 *
 * @noRailsEquivalent PERMANENT — Ruby's default-proc vivification, which a JS
 * `Map` cannot express in the subscript itself.
 */
function _pushValidator(
  validators: Map<string | null, ValidatorLike[]>,
  key: string | null,
  validator: ValidatorLike,
): void {
  let bucket = validators.get(key);
  if (!bucket) {
    bucket = [];
    validators.set(key, bucket);
  }
  bucket.push(validator);
}
