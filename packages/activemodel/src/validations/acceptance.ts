import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";

/**
 * Manages lazily-defined virtual attributes for acceptance validation.
 * These attributes exist only for validation and aren't persisted.
 *
 * Mirrors: ActiveModel::Validations::AcceptanceValidator::LazilyDefineAttributes
 */
export class LazilyDefineAttributes {
  readonly attributes: readonly string[];

  constructor(attributes: string[]) {
    this.attributes = Object.freeze([...attributes]);
  }

  include(attribute: string): boolean {
    return this.attributes.includes(attribute);
  }

  matches(method: string): string | null {
    return this.include(method) ? method : null;
  }

  define(attribute: string): LazilyDefineAttributes {
    if (this.include(attribute)) return this;
    return new LazilyDefineAttributes([...this.attributes, attribute]);
  }
}

/**
 * Ruby `Array()` coerces any object with `to_a`/`to_ary` (Set, Enumerator,
 * Hash, etc.) into an array, but leaves strings wrapped as `[str]`. Match
 * that: if the value is iterable but not a string, spread it.
 */
function isNonStringIterable(value: unknown): value is Iterable<unknown> {
  if (typeof value !== "object" || value === null) return false;
  // Boxed strings (`new String("yes")`) are iterable by char; Ruby's
  // `Array("yes")` still wraps as `["yes"]`, so treat them as scalars.
  if (value instanceof String) return false;
  return typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function";
}

export class AcceptanceValidator extends EachValidator {
  static readonly lazilyDefineAttributes = new LazilyDefineAttributes([]);

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    const allowNil = this.options.allowNil ?? true;
    if (allowNil && (value === null || value === undefined)) return;
    // Rails activemodel/lib/active_model/validations/acceptance.rb
    // `acceptable_option?` calls `Array(options[:accept]).include?(value)`,
    // so a scalar `accept:` still works. Normalize here with the same shape.
    // Rails checks key presence via `options.key?(:accept)`, so an explicit
    // `accept: nil` is treated as `Array(nil) #=> []` (rejects everything)
    // rather than falling back to the default. Mirror that with a hasOwn
    // check on this.options.
    const hasAccept = Object.prototype.hasOwnProperty.call(this.options, "accept");
    let accepted: unknown[];
    if (!hasAccept) accepted = ["1", true];
    else {
      const rawAccept = this.options.accept;
      if (rawAccept === null || rawAccept === undefined) accepted = [];
      else if (Array.isArray(rawAccept)) accepted = rawAccept;
      else if (isNonStringIterable(rawAccept)) accepted = Array.from(rawAccept);
      else accepted = [rawAccept];
    }
    if (!accepted.includes(value)) {
      record.errors.add(attribute, "accepted", { message: this.options.message });
    }
  }

  static setup(attributes: string[]): LazilyDefineAttributes {
    return new LazilyDefineAttributes(attributes);
  }
}
