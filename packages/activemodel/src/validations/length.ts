import { ArgumentError } from "../attribute-assignment.js";
import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { camelize, except, Range } from "@blazetrails/activesupport";
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

type CheckKey = "is" | "minimum" | "maximum";

/**
 * Mirrors: LengthValidator::MESSAGES (length.rb:10). Ruby Symbol values keep
 * their leading colon.
 * @internal
 */
const MESSAGES: Record<CheckKey, string> = {
  is: ":wrong_length",
  minimum: ":too_short",
  maximum: ":too_long",
};

/**
 * Mirrors: LengthValidator::CHECKS (length.rb:11). Ruby dispatches the
 * comparison by symbol through `public_send`; JS has no operator methods, so
 * each check is the same comparison as a function.
 * @internal
 */
const CHECKS: Record<CheckKey, (valueLength: number, checkValue: number) => boolean> = {
  is: (valueLength, checkValue) => valueLength === checkValue,
  minimum: (valueLength, checkValue) => valueLength >= checkValue,
  maximum: (valueLength, checkValue) => valueLength <= checkValue,
};

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
  /**
   * Declarations only — actual functions attached to the prototype below.
   * Prototype attachment (not class fields) so the helpers are present
   * during EachValidator's constructor-time checkValidityBang() call. JS class
   * fields don't initialize until AFTER super() returns. (Same bootstrapping
   * lesson as PR #994 / #1002.)
   */
  declare resolveValue: typeof resolveValue;
  /** @internal Rails-private helper. */
  declare skipNilCheck: typeof skipNilCheck;

  constructor(options: Record<string, unknown>) {
    // Shallow-clone so we don't mutate the caller's object — mirrors Rails
    // validates_with.rb:93 which passes `options.dup` to each validator.
    options = { ...options };

    // Normalize :in / :within to :minimum / :maximum before super() calls
    // checkValidityBang(), mirroring length.rb:16-20.
    // Rails: `options.delete(:in) || options.delete(:within)` — both keys are
    // removed, and Ruby `||` falls through only on nil/false.
    const inOption = options["in"];
    const withinOption = options["within"];
    delete options["in"];
    delete options["within"];
    const range = inOption != null && inOption !== false ? inOption : withinOption;
    if (range != null && range !== false) {
      if (!(range instanceof Range)) {
        throw new ArgumentError(":in and :within must be a Range");
      }
      const r = range as Range<number>;
      if (r.begin !== null) options["minimum"] = r.min();
      if (r.end !== null) {
        options["maximum"] = r.excludeEnd ? r.end - 1 : r.end;
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

  override checkValidityBang(): void {
    // Mirrors length.rb:30 — `CHECKS.keys & options.keys`, which keeps CHECKS'
    // declaration order (is, minimum, maximum). An explicitly-passed
    // `undefined` is Ruby's absent kwarg, so it does not count as a key.
    const optionKeys = new Set(
      Object.keys(this.options).filter((key) => this.options[key] !== undefined),
    );
    const keys = (Object.keys(CHECKS) as CheckKey[]).filter((key) => optionKeys.has(key));

    if (keys.length === 0) {
      throw new ArgumentError(
        "Range unspecified. Specify the :in, :within, :maximum, :minimum, or :is option.",
      );
    }

    for (const key of keys) {
      const value = this.options[key];
      // Mirrors length.rb:39-42. A Ruby Symbol reaches us as a colon-prefixed
      // string, which is what separates `:five` (a method name) from `"a"`.
      if (
        (Number.isInteger(value as number) && (value as number) >= 0) ||
        value === Infinity ||
        value === -Infinity ||
        (typeof value === "string" && value.startsWith(":")) ||
        typeof value === "function"
      ) {
        continue;
      }
      throw new ArgumentError(`:${key} must be a non-negative Integer, Infinity, Symbol, or Proc`);
    }
  }

  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    // Rails length.rb:50 — `value.respond_to?(:length) ? value.length : value.to_s.length`.
    // For nil → 0 (nil.to_s.length); for non-nil values without a .length
    // (numbers, booleans, plain objects) → String(value).length.
    let valueLength: number;
    if (typeof value === "string" || Array.isArray(value)) {
      valueLength = value.length;
    } else if (
      typeof value === "object" &&
      value !== null &&
      "length" in value &&
      typeof (value as { length: unknown }).length === "number"
    ) {
      valueLength = (value as { length: number }).length;
    } else if (value == null) {
      valueLength = 0;
    } else {
      valueLength = String(value).length;
    }

    // Rails length.rb:49 — `errors_options = options.except(*RESERVED_OPTIONS)`
    const errorsOptions = except(this.options, ...RESERVED_OPTIONS);

    for (const [key, validityCheck] of Object.entries(CHECKS) as Array<
      [CheckKey, (valueLength: number, checkValue: number) => boolean]
    >) {
      let checkValue = this.options[key];
      if (checkValue == null) continue;

      if (value != null || this.skipNilCheck(key)) {
        // Rails length.rb:55 — a Proc / method-name reference is honored
        // per-record before the comparison.
        checkValue = this.resolveValue(record, checkValue);
        if (validityCheck(valueLength, checkValue as number)) continue;
      }

      errorsOptions["count"] = checkValue;

      const defaultMessage = this.options[camelize(MESSAGES[key].slice(1), false)];
      if (defaultMessage != null && errorsOptions["message"] == null) {
        errorsOptions["message"] = defaultMessage;
      }

      record.errors.add(attribute, MESSAGES[key], { ...errorsOptions });
    }
  }
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
