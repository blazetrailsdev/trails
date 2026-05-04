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

/** Rails-style range object accepted by the `:in` / `:within` option. */
export interface LengthRange {
  begin: number;
  end: number;
  excludeEnd?: boolean;
}

/**
 * Keys stripped from options before forwarding to `errors.add` so they
 * don't leak as i18n interpolation variables.
 *
 * Mirrors: LengthValidator::RESERVED_OPTIONS
 * @internal
 */
export const RESERVED_OPTIONS = [
  "minimum",
  "maximum",
  "within",
  "is",
  "tooShort",
  "tooLong",
] as const;

export class LengthValidator extends EachValidator {
  // Declarations only — actual functions attached to the prototype below.
  // Prototype attachment (not class fields) so the helpers are present
  // during EachValidator's constructor-time checkValidity() call. JS class
  // fields don't initialize until AFTER super() returns. (Same bootstrapping
  // lesson as PR #994 / #1002.)
  declare resolveValue: typeof resolveValue;
  /** @internal Rails-private helper. */
  declare skipNilCheck: typeof skipNilCheck;

  constructor(options: Record<string, unknown>) {
    // Normalize :in / :within to :minimum / :maximum before super() calls
    // checkValidity(). We mutate `options` in place, mirroring length.rb:16-20.
    const range = options["in"] ?? options["within"];
    if (range !== undefined) {
      delete options["in"];
      delete options["within"];
      if (Array.isArray(range) && range.length === 2) {
        options["minimum"] = range[0];
        options["maximum"] = range[1];
      } else if (
        range !== null &&
        typeof range === "object" &&
        "begin" in range &&
        "end" in range
      ) {
        const r = range as LengthRange;
        if (r.begin !== undefined) options["minimum"] = r.begin;
        if (r.end !== undefined) {
          options["maximum"] = r.excludeEnd ? r.end - 1 : r.end;
        }
      } else {
        throw new Error(":in and :within must be a Range or [min, max] tuple");
      }
    }

    // allowBlank: false with no minimum/is → minimum defaults to 1 (length.rb:22-24).
    if (
      options["allowBlank"] === false &&
      options["minimum"] === undefined &&
      options["is"] === undefined
    ) {
      options["minimum"] = 1;
    }

    super(options);
  }

  override checkValidity(): void {
    const hasCheck =
      this.options.minimum !== undefined ||
      this.options.maximum !== undefined ||
      this.options.is !== undefined;

    if (!hasCheck) {
      throw new Error(
        "Range unspecified. Specify the :in, :within, :maximum, :minimum, or :is option.",
      );
    }

    for (const key of ["minimum", "maximum", "is"] as const) {
      const value = this.options[key];
      if (value === undefined) continue;
      if (
        (Number.isInteger(value as number) && (value as number) >= 0) ||
        value === Infinity ||
        typeof value === "function" ||
        typeof value === "string"
      ) {
        continue;
      }
      throw new Error(`:${key} must be a non-negative Integer, Infinity, Symbol, or Proc`);
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

    // Rails length.rb:49 — `errors_options = options.except(*RESERVED_OPTIONS)`
    const baseOptions = this.filteredErrorOptions([...RESERVED_OPTIONS]);

    // Rails length.rb:51-65 — iterate CHECKS, skip absent constraints.
    const valueIsNil = value === null || value === undefined;

    const rawMin = this.options.minimum as unknown;
    const rawMax = this.options.maximum as unknown;
    const rawIs = this.options.is as unknown;

    // Rails length.rb:55 — `check_value = resolve_value(record, check_value)`
    const min = resolveLengthOpt.call(this, record, rawMin);
    const max = resolveLengthOpt.call(this, record, rawMax);
    const is = resolveLengthOpt.call(this, record, rawIs);

    if (min !== undefined && length < min) {
      if (!valueIsNil || this.skipNilCheck("minimum")) {
        const opts = { ...baseOptions, count: min } as Record<string, unknown>;
        const defaultMsg = this.options.tooShort ?? this.options.message;
        if (defaultMsg != null && !opts["message"]) opts["message"] = defaultMsg;
        record.errors.add(attribute, "too_short", opts);
      }
    }
    if (max !== undefined && length > max) {
      if (!valueIsNil || this.skipNilCheck("maximum")) {
        const opts = { ...baseOptions, count: max } as Record<string, unknown>;
        const defaultMsg = this.options.tooLong ?? this.options.message;
        if (defaultMsg != null && !opts["message"]) opts["message"] = defaultMsg;
        record.errors.add(attribute, "too_long", opts);
      }
    }
    if (is !== undefined && length !== is) {
      if (!valueIsNil || this.skipNilCheck("is")) {
        const opts = { ...baseOptions, count: is } as Record<string, unknown>;
        const defaultMsg = this.options.wrongLength ?? this.options.message;
        if (defaultMsg != null && !opts["message"]) opts["message"] = defaultMsg;
        record.errors.add(attribute, "wrong_length", opts);
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
