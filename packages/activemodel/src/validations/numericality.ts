import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { underscore, RoundingHelper, BigDecimal, Range } from "@blazetrails/activesupport";
import { COMPARE_CHECKS, compareOperator, errorOptions } from "./comparability.js";
import type { CompareKey } from "./comparability.js";
import { resolveValue } from "./resolve-value.js";
import { ArgumentError } from "../attribute-assignment.js";
import { roundFloatToSignificantDigits } from "../type/decimal.js";

type NumericValue = number | ((record: ValidatableRecord) => number) | string;

/**
 * Mirrors: ActiveModel::Validations::NumericalityValidator (numericality.rb)
 *
 *   class NumericalityValidator < EachValidator
 *     include Comparability
 *     include ResolveValue
 *
 *     INTEGER_REGEX     = /\A[+-]?\d+\z/
 *     HEXADECIMAL_REGEX = /\A[+-]?0[xX]/
 *     ...
 */
export class NumericalityValidator extends EachValidator {
  resolveValue = resolveValue;
  errorOptions = errorOptions;

  // Coercion-pipeline privates declared here, attached to the prototype
  // below so they're available during EachValidator's super-time
  // checkValidityBang() call (same bootstrapping pattern as PRs #994 / #1002 /
  // #1009). Class fields don't initialize until after super() returns.
  /** @internal Rails-private helper. */
  declare optionAsNumber: typeof optionAsNumber;
  /** @internal Rails-private helper. */
  declare parseFloat: typeof parseFloatRails;
  /** @internal Rails-private helper. */
  declare round: typeof round;
  /** @internal Rails-private helper. */
  declare isNumber: typeof isNumber;
  /** @internal Rails-private helper. */
  declare isInteger: typeof isInteger;
  /** @internal Rails-private helper. */
  declare isHexadecimalLiteral: typeof isHexadecimalLiteral;
  /** @internal Rails-private helper. */
  declare filteredOptions: typeof filteredOptions;
  /** @internal Rails-private helper. */
  declare isAllowOnlyInteger: typeof isAllowOnlyInteger;
  /** @internal Rails-private helper. */
  declare prepareValueForValidation: typeof prepareValueForValidation;
  /** @internal Rails-private helper. */
  declare isRecordAttributeChangedInPlace: typeof isRecordAttributeChangedInPlace;

  override checkValidityBang(): void {
    for (const option of Object.keys(COMPARE_CHECKS) as CompareKey[]) {
      const value = this.options[option];
      if (value === undefined) continue;
      // Rails: unless value.is_a?(Numeric) || value.is_a?(Proc) || value.is_a?(Symbol).
      // A trails Symbol is a colon-prefixed string, which is what separates
      // `":maxApproved"` (send it) from `"foo"` (a String — Rails rejects it).
      if (!isNumeric(value) && typeof value !== "function" && !isSymbol(value)) {
        throw new ArgumentError(`:${underscore(option)} must be a number, a symbol or a proc`);
      }
    }

    for (const option of Object.keys(RANGE_CHECKS)) {
      const value = this.options[option];
      if (value === undefined) continue;
      if (!(value instanceof Range)) {
        throw new ArgumentError(`:${option} must be a range`);
      }
    }
  }

  validateEach(
    record: ValidatableRecord,
    attribute: string,
    value: unknown,
    precision = 15,
    scale?: number,
  ): void {
    if (!this.isNumber(value, precision, scale)) {
      record.errors.add(attribute, ":not_a_number", this.filteredOptions(value));
      return;
    }

    // Rails dispatches through allow_only_integer?(record), not the
    // raw options[:only_integer] read, so a Proc / method-name option
    // is honored per-record.
    if (this.isAllowOnlyInteger(record) && !this.isInteger(value)) {
      record.errors.add(attribute, ":not_an_integer", this.filteredOptions(value));
      return;
    }

    // Rails reassigns `value` (numericality.rb:47), so every filtered_options
    // below interpolates the PARSED value, not the raw input.
    const num = parseAsNumber(value, precision, scale) as number;
    value = num;

    // Rails uses filtered_options(value).merge!(count: option_value)
    // for compare/range branches and filtered_options(value) (no count)
    // for odd/even. Build a fresh filtered base each branch so non-
    // reserved validator options (message, if, unless, …) reach i18n.
    const withCount = (count: unknown): Record<string, unknown> => ({
      ...this.filteredOptions(value),
      count,
    });

    // Ruby `Hash#slice(*keys)` yields the entries in the ARGUMENT order, not the
    // receiver's, so `options.slice(*RESERVED_OPTIONS)` walks the options in
    // RESERVED_OPTIONS order — COMPARE, then NUMBER, then RANGE (numericality.rb:16).
    // Iterating the constant reproduces that, which is what fixes the order errors
    // land in when one attribute fails several checks at once.
    for (const option of RESERVED_OPTIONS) {
      let optionValue = this.options[option] as NumericValue | undefined;
      if (optionValue === undefined) continue;
      if (option in NUMBER_CHECKS) {
        // Rails: value.to_i.public_send(NUMBER_CHECKS[option]) — TS has no
        // public_send, so the check Symbol selects the parity test.
        const odd = Math.trunc(num) % 2 !== 0;
        if (NUMBER_CHECKS[option as keyof typeof NUMBER_CHECKS] === ":odd?" ? !odd : odd) {
          record.errors.add(attribute, `:${option}`, this.filteredOptions(value));
        }
      } else if (option in RANGE_CHECKS) {
        // Rails: value.public_send(:in?, range) — Object#in? delegates to
        // Range#include?, and :count interpolates the range's own to_s.
        const range = optionValue as unknown as Range<number>;
        if (!range.isInclude(num)) {
          record.errors.add(attribute, `:${option}`, withCount(range.toS()));
        }
      } else if (option in COMPARE_CHECKS) {
        optionValue = this.optionAsNumber(record, optionValue, precision, scale);
        if (optionValue === undefined) continue;
        if (!compareOperator(COMPARE_CHECKS[option as CompareKey], num, optionValue)) {
          record.errors.add(attribute, `:${underscore(option)}`, withCount(optionValue));
        }
      }
    }
  }

  // Rails: validate_each(record, attr_name, value, precision: Float::DIG, scale: nil)
  // No `validate` override: like Rails' NumericalityValidator, the
  // allowNil/allowBlank short-circuit lives in EachValidator#validate and runs
  // against the CAST value (`read_attribute_for_validation`) before
  // `prepare_value_for_validation` swaps in the raw `*_before_type_cast` input.
  // That's what `test_allow_nil_works_for_casted_value` relies on — assigning
  // `""` to a decimal column casts to nil, so `allow_nil: true` skips it; an
  // integer `"abc"` without `allow_nil` still reaches validateEach and flags
  // not_a_number via the prepared raw value.
}

// Rails: /\A[+-]?\d+\z/ — use a true end-of-string check rather than
// JS `$`, which can match BEFORE a final trailing newline ("1\n" would
// match `/^[+-]?\d+$/` but is rejected by Ruby's \z).
const INTEGER_REGEX = /^[+-]?\d+(?![\s\S])/;
// Rails: /\A[+-]?0[xX]/ — no leading whitespace permitted.
const HEXADECIMAL_REGEX = /^[+-]?0[xX]/;

// Trails-only guard: JS Number() also coerces 0b… (binary) and 0o…
// (octal) literal strings, which Rails Kernel.Float rejects. Reuse the
// hex check for the elsif-chain semantic Rails would apply, then layer
// this on for the JS-specific surface.
const NON_DECIMAL_LITERAL_REGEX = /^[+-]?0[xXbBoO]/;

// Mirrors Rails numericality.rb:16:
//   RESERVED_OPTIONS = COMPARE_CHECKS.keys + NUMBER_CHECKS.keys + RANGE_CHECKS.keys + [:only_integer, :only_numeric]
// camelCased for trails option-key conventions.
const RANGE_CHECKS = { in: ":in?" } as const;
const NUMBER_CHECKS = { odd: ":odd?", even: ":even?" } as const;

const RESERVED_OPTIONS = [
  ...Object.keys(COMPARE_CHECKS),
  ...Object.keys(NUMBER_CHECKS),
  ...Object.keys(RANGE_CHECKS),
  "onlyInteger",
  "onlyNumeric",
];

/**
 * Mirrors: numericality.rb:67-69
 *   def option_as_number(record, option_value, precision, scale)
 *     parse_as_number(resolve_value(record, option_value), precision, scale)
 *   end
 *
 * The single Rails call site that consumes `resolve_value` for compare
 * options (numericality.rb:60). With this private in place, validateEach
 * routes every numeric option through `this.optionAsNumber(...)` rather
 * than the previous inline resolve+coerce.
 *
 * @internal Rails-private helper.
 */
export function optionAsNumber(
  this: {
    resolveValue(record: unknown, value: unknown): unknown;
  },
  record: ValidatableRecord,
  optionValue: unknown,
  precision: number,
  scale?: number,
): number | undefined {
  return parseAsNumber(this.resolveValue(record, optionValue), precision, scale);
}

/**
 * Mirrors: numericality.rb:72-84
 *
 *   def parse_as_number(raw_value, precision, scale)
 *     if raw_value.is_a?(Float)
 *       parse_float(raw_value, precision, scale)
 *     elsif raw_value.is_a?(Numeric)
 *       raw_value
 *     elsif is_integer?(raw_value)
 *       raw_value.to_i
 *     elsif !is_hexadecimal_literal?(raw_value)
 *       parse_float(Kernel.Float(raw_value), precision, scale)
 *     end
 *   end
 *
 * Returns undefined when raw_value isn't parseable (matching Rails'
 * implicit-nil from the `elsif` chain falling through, and the
 * `rescue ArgumentError, TypeError` around `Kernel.Float` in `is_number?`).
 *
 * Ruby's Float-vs-Integer split has no JS counterpart — both are `number` —
 * so integrality stands in for it: a non-integral number takes the `Float`
 * branch, an integral one the `Numeric` (pass-through) branch. That is what
 * keeps a 17-digit integer out of the 15-significant-digit `parse_float`.
 *
 * @internal Rails-private helper.
 */
export function parseAsNumber(
  rawValue: unknown,
  precision: number,
  scale?: number,
): number | undefined {
  if (typeof rawValue === "number") {
    // Ruby `Float::NAN.to_d` raises, so the chain yields no number.
    if (Number.isNaN(rawValue)) return undefined;
    // `% 1 === 0` stands in for Ruby's Float-vs-Integer type test (see above);
    // an integral value takes the `Numeric` pass-through branch.
    return rawValue % 1 === 0 ? rawValue : parseFloatRails(rawValue, precision, scale);
  }
  if (rawValue instanceof BigDecimal) return round(Number(rawValue.toString("F")), scale);
  if (isInteger(rawValue)) return Number.parseInt(String(rawValue), 10);
  if (!isHexadecimalLiteral(rawValue)) {
    const float = kernelFloat(rawValue);
    if (float === undefined) return undefined;
    return parseFloatRails(float, precision, scale);
  }
  return undefined;
}

/**
 * Ruby's `Kernel.Float`, as `parse_as_number` (numericality.rb:82) calls it:
 * a strict decimal parse that honors `to_f` on a non-Numeric object and raises
 * `ArgumentError`/`TypeError` otherwise. `is_number?` rescues both, so the
 * unparseable cases return undefined here rather than throwing.
 *
 * `Number()` is laxer than `Kernel.Float` in two directions trails has to close
 * by hand: it reads `0b…`/`0o…`/`0x…` literals, and it coerces `""` and
 * whitespace to `0`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel.Float`, not a Rails method,
 * so `parity:api` has no Ruby name to credit it against.
 */
function kernelFloat(rawValue: unknown): number | undefined {
  if (rawValue !== null && typeof rawValue === "object") {
    const toF = (rawValue as { toF?: unknown }).toF;
    return typeof toF === "function" ? (toF as () => number).call(rawValue) : undefined;
  }
  if (typeof rawValue !== "string") return undefined;
  if (rawValue.trim() === "") return undefined;
  // `is_hexadecimal_literal?` is anchored at \A, but Kernel.Float strips
  // leading whitespace before parsing, so "  0x1" is still rejected there.
  const trimmed = rawValue.trimStart();
  if (isHexadecimalLiteral(trimmed) || NON_DECIMAL_LITERAL_REGEX.test(trimmed)) return undefined;
  const coerced = Number(rawValue);
  return Number.isNaN(coerced) ? undefined : coerced;
}

/** Ruby's `value.is_a?(Numeric)` over the two numeric types trails carries. */
function isNumeric(value: unknown): boolean {
  return typeof value === "number" || value instanceof BigDecimal;
}

/** Ruby's `value.is_a?(Symbol)` — a colon-prefixed string in trails. */
function isSymbol(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(":");
}

/**
 * Mirrors: numericality.rb:90-92
 *   def round(raw_value, scale)
 *     scale ? raw_value.round(scale) : raw_value
 *   end
 *
 * Ruby Float#round defaults to half-away-from-zero (NOT banker's
 * rounding): 2.5.round == 3, (-2.5).round == -3.
 *
 * DEVIATION: Rails calls `Float#round`/`BigDecimal#round` on the value
 * itself; this routes through `RoundingHelper`, which shares the half-up
 * default but is a different object. Tracked by story
 * 0023-surfaced-deviations/numericality-round-calls-rounding-helper.
 *
 * @internal Rails-private helper.
 */
export function round(num: number, scale?: number): number {
  if (scale === undefined || scale === null) return num;
  return Number((new RoundingHelper({ precision: scale }).round(num) as BigDecimal).toString("F"));
}

/**
 * Mirrors: numericality.rb:94-100
 *   def is_number?(raw_value, precision, scale)
 *     if options[:only_numeric] && !raw_value.is_a?(Numeric)
 *       return false
 *     end
 *     !parse_as_number(raw_value, precision, scale).nil?
 *   rescue ArgumentError, TypeError
 *     false
 *   end
 *
 * Treats a hex literal as not-a-number (Rails' `parse_as_number`
 * explicitly skips the `Kernel.Float` branch when `is_hexadecimal_literal?`
 * is true, so the chain returns nil).
 *
 * @internal Rails-private helper.
 */
export function isNumber(
  this: { options: Record<string, unknown> },
  rawValue: unknown,
  precision: number,
  scale?: number,
): boolean {
  if (this.options.onlyNumeric && !isNumeric(rawValue)) return false;

  // Rails' `rescue ArgumentError, TypeError; false` is folded into
  // `kernelFloat`, which returns undefined where Kernel.Float would raise.
  return parseAsNumber(rawValue, precision, scale) !== undefined;
}

/**
 * Mirrors: numericality.rb:102-104
 *   def is_integer?(raw_value)
 *     INTEGER_REGEX.match?(raw_value.to_s)
 *   end
 *
 * @internal Rails-private helper.
 */
export function isInteger(rawValue: unknown): boolean {
  return INTEGER_REGEX.test(String(rawValue));
}

/**
 * Mirrors: numericality.rb:106-108
 *   def is_hexadecimal_literal?(raw_value)
 *     HEXADECIMAL_REGEX.match?(raw_value.to_s)
 *   end
 *
 * @internal Rails-private helper.
 */
export function isHexadecimalLiteral(rawValue: unknown): boolean {
  return HEXADECIMAL_REGEX.test(String(rawValue));
}

/**
 * Mirrors: numericality.rb:110-114
 *   def filtered_options(value)
 *     filtered = options.except(*RESERVED_OPTIONS)
 *     filtered[:value] = value
 *     filtered
 *   end
 *
 * Builds the i18n interpolation hash for an error: strips the
 * comparison/range/number-check option keys and merges in :value.
 *
 * @internal Rails-private helper.
 */
export function filteredOptions(
  this: { options: Record<string, unknown> },
  value: unknown,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(this.options)) {
    if (!RESERVED_OPTIONS.includes(key)) {
      filtered[key] = this.options[key];
    }
  }
  filtered.value = value;
  return filtered;
}

/**
 * Mirrors: numericality.rb:116-118
 *   def allow_only_integer?(record)
 *     resolve_value(record, options[:only_integer])
 *   end
 *
 * Resolves the :only_integer option per-record, supporting Proc /
 * symbol-method-name forms via resolveValue. Coerced to boolean to
 * match Ruby's truthiness expectation at the call site.
 *
 * @internal Rails-private helper.
 */
export function isAllowOnlyInteger(
  this: {
    options: Record<string, unknown>;
    resolveValue(record: unknown, value: unknown): unknown;
  },
  record: ValidatableRecord,
): boolean {
  // Ruby truthiness: only nil/false count as false. Boolean(0) and
  // Boolean('') would diverge (Ruby treats both as truthy), so use the
  // explicit nil-or-false check pattern used elsewhere in trails (see
  // clusivity.ts:delimiter, comparison.ts).
  const resolved = this.resolveValue(record, this.options.onlyInteger);
  return resolved !== undefined && resolved !== null && resolved !== false;
}

/**
 * Mirrors: numericality.rb:120-138
 *
 *   def prepare_value_for_validation(value, record, attr_name)
 *     return value if record_attribute_changed_in_place?(record, attr_name)
 *     came_from_user = :"#{attr_name}_came_from_user?"
 *     if record.respond_to?(came_from_user)
 *       if record.public_send(came_from_user)
 *         raw_value = record.public_send(:"#{attr_name}_before_type_cast")
 *       elsif record.respond_to?(:read_attribute)
 *         raw_value = record.read_attribute(attr_name)
 *       end
 *     else
 *       before_type_cast = :"#{attr_name}_before_type_cast"
 *       if record.respond_to?(before_type_cast)
 *         raw_value = record.public_send(before_type_cast)
 *       end
 *     end
 *     raw_value || value
 *   end
 *
 * Lets numericality validate against the raw input the user typed
 * (before type-cast). In trails, IntegerType.cast returns null for
 * non-numeric strings — so "abc" on an integer column would otherwise
 * read as null and slip past via the allowNil short-circuit; this
 * surfaces the original "abc" so it's caught as not_a_number.
 *
 * @internal Rails-private helper.
 */
export function prepareValueForValidation(
  this: unknown,
  value: unknown,
  record: ValidatableRecord,
  attrName: string,
): unknown {
  // Rails has an early `return value if record_attribute_changed_in_place?`
  // short-circuit (numericality.rb:121) — in-place mutation means the
  // cast value IS what the user just changed; raw before_type_cast is
  // stale. Trails does not yet gate on this: `isRecordAttributeChangedInPlace`
  // is exported (Rails parity surface) but unused here. `attributeChangedInPlace`
  // now infers genuine in-place mutation (value diverged from tracked change),
  // so wiring the short-circuit is plausible — but left for a focused change
  // with its own coverage rather than as a side effect of this path.
  //
  // Trails exposes raw values through the generic
  // `readAttributeBeforeTypeCast(name)` API on Model rather than the
  // Rails per-attribute generated `${attr}_before_type_cast` methods.
  // Duck-type the lookup so other hosts implementing the same shape
  // (or AR Base subclasses) work too.
  const r = record as unknown as RecordWithRawAttribute;
  let rawValue: unknown;
  if (typeof r.cameFromUser === "function") {
    if (r.cameFromUser(attrName)) {
      rawValue =
        typeof r.readAttributeBeforeTypeCast === "function"
          ? r.readAttributeBeforeTypeCast(attrName)
          : undefined;
    } else if (typeof r.readAttribute === "function") {
      rawValue = r.readAttribute(attrName);
    }
  } else {
    rawValue =
      typeof r.readAttributeBeforeTypeCast === "function"
        ? r.readAttributeBeforeTypeCast(attrName)
        : undefined;
  }
  // Rails: raw_value || value — Ruby `||` falls back on nil/false. Use
  // the same semantic so `false`/`null` raw values fall through to
  // the cast value rather than being treated as "I read the raw".
  return rawValue !== undefined && rawValue !== null && rawValue !== false ? rawValue : value;
}

interface RecordWithRawAttribute {
  attributeChangedInPlace?: (name: string) => boolean;
  cameFromUser?: (name: string) => boolean;
  readAttribute?: (name: string) => unknown;
  readAttributeBeforeTypeCast?: (name: string) => unknown;
  [key: string]: unknown;
}

/**
 * Mirrors: numericality.rb:140-143
 *   def record_attribute_changed_in_place?(record, attr_name)
 *     record.respond_to?(:attribute_changed_in_place?) &&
 *       record.attribute_changed_in_place?(attr_name.to_s)
 *   end
 *
 * @internal Rails-private helper.
 */
export function isRecordAttributeChangedInPlace(
  record: ValidatableRecord,
  attrName: string,
): boolean {
  const r = record as unknown as RecordWithRawAttribute;
  return typeof r.attributeChangedInPlace === "function" && r.attributeChangedInPlace(attrName);
}

/**
 * Mirrors: numericality.rb:86-88
 *   def parse_float(raw_value, precision, scale)
 *     round(raw_value, scale).to_d(precision)
 *   end
 *
 * Rounds to `scale` decimal places, then rounds to `precision`
 * significant digits — matches Ruby's `BigDecimal(float.round(scale), precision)`.
 *
 * `to_d(precision)` (BigDecimal 3.1.4+) rounds the float's shortest decimal
 * string, not its binary form, so we route through
 * {@link roundFloatToSignificantDigits} rather than `Number#toPrecision`
 * (which rounds the binary value and diverges on exact half-way decimals like
 * `123.455`). See ruby/bigdecimal#70.
 *
 * @internal Rails-private helper.
 */
export function parseFloatRails(num: number, precision: number, scale?: number): number {
  // Ruby `(1.0/0.0).to_d(15)` is BigDecimal Infinity, not an error, so an
  // infinite Float survives the pipeline and reaches the comparisons.
  if (!Number.isFinite(num)) return num;
  return Number(roundFloatToSignificantDigits(round(num, scale), precision));
}

NumericalityValidator.prototype.optionAsNumber = optionAsNumber;
NumericalityValidator.prototype.parseFloat = parseFloatRails;
NumericalityValidator.prototype.round = round;
NumericalityValidator.prototype.isNumber = isNumber;
NumericalityValidator.prototype.isInteger = isInteger;
NumericalityValidator.prototype.isHexadecimalLiteral = isHexadecimalLiteral;
NumericalityValidator.prototype.filteredOptions = filteredOptions;
NumericalityValidator.prototype.isAllowOnlyInteger = isAllowOnlyInteger;
NumericalityValidator.prototype.prepareValueForValidation = prepareValueForValidation;
NumericalityValidator.prototype.isRecordAttributeChangedInPlace = isRecordAttributeChangedInPlace;
