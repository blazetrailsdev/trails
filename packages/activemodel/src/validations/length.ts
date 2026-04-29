import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { resolveValue } from "./resolve-value.js";

/**
 * Mirrors: ActiveModel::Validations::LengthValidator (length.rb)
 *
 *   class LengthValidator < EachValidator
 *     include ResolveValue
 *
 *     CHECKS = { is: :==, minimum: :>=, maximum: :<= }.freeze
 *     ...
 */
export class LengthValidator extends EachValidator {
  // Declarations only — actual functions attached to the prototype below.
  // Prototype attachment (not class fields) so the helpers are present
  // during EachValidator's constructor-time checkValidity() call. JS class
  // fields don't initialize until AFTER super() returns. (Same bootstrapping
  // lesson as PR #994 / #1002.)
  declare resolveValue: typeof resolveValue;
  /** @internal Rails-private helper. */
  declare skipNilCheck: typeof skipNilCheck;

  override checkValidity(): void {
    if (
      this.options.minimum === undefined &&
      this.options.maximum === undefined &&
      this.options.is === undefined &&
      this.options.in === undefined
    ) {
      throw new Error(
        "Range unspecified. Specify the :in, :within, :maximum, :minimum, or :is option.",
      );
    }
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    // Rails length.rb:50 — `value.respond_to?(:length) ? value.length : value.to_s.length`.
    // For nil → 0 (nil.to_s.length); for non-nil values without a .length
    // (numbers, booleans, plain objects) → String(value).length.
    let length: number;
    if (typeof value === "string" || Array.isArray(value)) {
      length = value.length;
    } else if (
      typeof value === "object" &&
      value !== null &&
      "length" in value &&
      typeof (value as { length: unknown }).length === "number"
    ) {
      length = (value as { length: number }).length;
    } else if (value == null) {
      length = 0;
    } else {
      length = String(value).length;
    }

    const inOpt = this.options.in as [number, number] | undefined;
    const rawMin = inOpt ? inOpt[0] : (this.options.minimum as unknown);
    const rawMax = inOpt ? inOpt[1] : (this.options.maximum as unknown);
    const rawIs = this.options.is as unknown;

    // Rails length.rb:55 — `check_value = resolve_value(record, check_value)`
    // — so a Proc / method-name option is resolved per-record.
    const min = resolveLengthOpt.call(this, record, rawMin);
    const max = resolveLengthOpt.call(this, record, rawMax);
    const is = resolveLengthOpt.call(this, record, rawIs);

    let effectiveMin = min;
    if (
      effectiveMin === undefined &&
      max === undefined &&
      this.options.allowBlank === false &&
      is === undefined &&
      inOpt === undefined
    ) {
      effectiveMin = 1;
    }

    // Rails length.rb:54 — `!value.nil? || skip_nil_check?(key)`.
    // Each branch fires the constraint check unless the value is nil AND
    // skip_nil_check?(key) returns false (meaning Rails would skip nil
    // for that key). EachValidator's dispatch only short-circuits on
    // allowNil === true / allowBlank === true; the explicit-false case
    // and the default case both reach here, so the per-key guard below
    // is the load-bearing path.
    const valueIsNil = value === null || value === undefined;

    if (effectiveMin !== undefined && length < effectiveMin) {
      if (!valueIsNil || this.skipNilCheck("minimum")) {
        record.errors.add(attribute, "too_short", {
          message: (this.options.tooShort ?? this.options.message) as string | undefined,
          count: effectiveMin,
          value,
        });
      }
    }
    if (max !== undefined && length > max) {
      if (!valueIsNil || this.skipNilCheck("maximum")) {
        record.errors.add(attribute, "too_long", {
          message: (this.options.tooLong ?? this.options.message) as string | undefined,
          count: max,
          value,
        });
      }
    }
    if (is !== undefined && length !== is) {
      if (!valueIsNil || this.skipNilCheck("is")) {
        record.errors.add(attribute, "wrong_length", {
          message: (this.options.wrongLength ?? this.options.message) as string | undefined,
          count: is,
          value,
        });
      }
    }
  }
}

/**
 * @internal Resolves a length option through this.resolveValue (so a
 * Proc / method-name reference is honored per Rails length.rb:55) and
 * narrows the result to a number.
 */
function resolveLengthOpt(
  this: { resolveValue(record: unknown, value: unknown): unknown },
  record: AnyRecord,
  raw: unknown,
): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const resolved = this.resolveValue(record, raw);
  return typeof resolved === "number" ? resolved : undefined;
}

/**
 * Mirrors: length.rb:69
 *   def skip_nil_check?(key)
 *     key == :maximum && options[:allow_nil].nil? && options[:allow_blank].nil?
 *   end
 *
 * Returns true when nil should still produce a "too_long" error for a
 * `:maximum` constraint (Rails treats nil.to_s.length == 0 here, which
 * is always ≤ max, so the check is effectively a no-op — but the
 * predicate keeps the dispatch shape Rails-faithful).
 *
 * @internal Rails-private helper.
 */
export function skipNilCheck(
  this: { options: Record<string, unknown> },
  key: "minimum" | "maximum" | "is",
): boolean {
  return (
    key === "maximum" &&
    this.options.allowNil === undefined &&
    this.options.allowBlank === undefined
  );
}

LengthValidator.prototype.resolveValue = resolveValue;
LengthValidator.prototype.skipNilCheck = skipNilCheck;
