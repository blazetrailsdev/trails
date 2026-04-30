import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { isBlank, RoundingHelper } from "@blazetrails/activesupport";
import { errorOptions } from "./comparability.js";
import { resolveValue } from "./resolve-value.js";

type NumericValue = number | ((record: AnyRecord) => number) | string;

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
  // checkValidity() call (same bootstrapping pattern as PRs #994 / #1002 /
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

  private resolveNumeric(
    val: NumericValue | undefined,
    record: AnyRecord,
    precision: number,
    scale?: number,
  ): number | undefined {
    if (val === undefined) return undefined;
    return this.optionAsNumber(record, val, precision, scale);
  }

  override checkValidity(): void {
    const compareKeys = [
      "greaterThan",
      "greaterThanOrEqualTo",
      "lessThan",
      "lessThanOrEqualTo",
      "equalTo",
      "otherThan",
    ] as const;
    for (const key of compareKeys) {
      const val = this.options[key];
      if (
        val !== undefined &&
        typeof val !== "number" &&
        typeof val !== "function" &&
        typeof val !== "string"
      ) {
        throw new Error(`:${key} must be a number, a symbol or a proc`);
      }
    }
    if (this.options.in !== undefined && !Array.isArray(this.options.in)) {
      throw new Error(":in must be a range");
    }
  }

  // Rails: validate_each(record, attr_name, value, precision: Float::DIG, scale: nil)
  /**
   * Override EachValidator.validate so prepareValueForValidation runs
   * BEFORE the allow_nil short-circuit. Rails' EachValidator
   * normally would skip nil values when allow_nil: true, but
   * Numericality wants to validate what the user actually typed —
   * an integer column casting "abc" to null mustn't bypass the check
   * (numericality.rb's validate_each operates on raw input).
   */
  override validate(record: AnyRecord): void {
    for (const attribute of this.attributes) {
      // Reuses EachValidator.readAttributeForValidation so the lookup
      // chain stays in one place. The flow then runs through
      // prepareValueForValidation BEFORE the allowNil/allowBlank
      // short-circuits so raw user input ('abc' → cast null) still
      // gets validated.
      const cast = this.readAttributeForValidation(record, attribute);
      const value = this.prepareValueForValidation(cast, record, attribute);
      if (value == null && this.options.allowNil === true) continue;
      if (isBlank(value) && this.options.allowBlank === true) continue;
      this.validateEach(record, attribute, value);
    }
  }

  validateEach(
    record: AnyRecord,
    attribute: string,
    value: unknown,
    precision = 15,
    scale?: number,
  ): void {
    if (value === null || value === undefined) {
      if (this.options.allowNil !== false) return;
      record.errors.add(attribute, "not_a_number", this.filteredOptions(value));
      return;
    }
    if (this.options.allowBlank && isBlank(value)) return;

    if (!this.isNumber(value, precision, scale)) {
      record.errors.add(attribute, "not_a_number", this.filteredOptions(value));
      return;
    }

    const num = parseAsNumber(Number(value), precision, scale) as number;

    // Rails dispatches through allow_only_integer?(record), not the
    // raw options[:only_integer] read, so a Proc / method-name option
    // is honored per-record.
    if (this.isAllowOnlyInteger(record) && !this.isInteger(value)) {
      record.errors.add(attribute, "not_an_integer", this.filteredOptions(value));
      return;
    }

    // Rails uses filtered_options(value).merge!(count: option_value)
    // for compare/range branches and filtered_options(value) (no count)
    // for odd/even. Build a fresh filtered base each branch so non-
    // reserved validator options (message, if, unless, …) reach i18n.
    const withCount = (count: unknown): Record<string, unknown> => ({
      ...this.filteredOptions(value),
      count,
    });

    const gt = this.resolveNumeric(
      this.options.greaterThan as NumericValue | undefined,
      record,
      precision,
      scale,
    );
    if (gt !== undefined && !(num > gt)) {
      record.errors.add(attribute, "greater_than", withCount(gt));
    }
    const gte = this.resolveNumeric(
      this.options.greaterThanOrEqualTo as NumericValue | undefined,
      record,
      precision,
      scale,
    );
    if (gte !== undefined && !(num >= gte)) {
      record.errors.add(attribute, "greater_than_or_equal_to", withCount(gte));
    }
    const lt = this.resolveNumeric(
      this.options.lessThan as NumericValue | undefined,
      record,
      precision,
      scale,
    );
    if (lt !== undefined && !(num < lt)) {
      record.errors.add(attribute, "less_than", withCount(lt));
    }
    const lte = this.resolveNumeric(
      this.options.lessThanOrEqualTo as NumericValue | undefined,
      record,
      precision,
      scale,
    );
    if (lte !== undefined && !(num <= lte)) {
      record.errors.add(attribute, "less_than_or_equal_to", withCount(lte));
    }
    const eq = this.resolveNumeric(
      this.options.equalTo as NumericValue | undefined,
      record,
      precision,
      scale,
    );
    if (eq !== undefined && num !== eq) {
      record.errors.add(attribute, "equal_to", withCount(eq));
    }
    const ot = this.resolveNumeric(
      this.options.otherThan as NumericValue | undefined,
      record,
      precision,
      scale,
    );
    if (ot !== undefined && num === ot) {
      record.errors.add(attribute, "other_than", withCount(ot));
    }
    if (this.options.in !== undefined) {
      const [min, max] = this.options.in as [number, number];
      if (num < min || num > max) {
        record.errors.add(attribute, "in", withCount(`${min}..${max}`));
      }
    }
    if (this.options.odd && num % 2 === 0) {
      record.errors.add(attribute, "odd", this.filteredOptions(value));
    }
    if (this.options.even && num % 2 !== 0) {
      record.errors.add(attribute, "even", this.filteredOptions(value));
    }
  }
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
const RESERVED_OPTIONS = [
  // COMPARE_CHECKS keys
  "greaterThan",
  "greaterThanOrEqualTo",
  "equalTo",
  "lessThan",
  "lessThanOrEqualTo",
  "otherThan",
  // NUMBER_CHECKS keys
  "odd",
  "even",
  // RANGE_CHECKS keys
  "in",
  // Misc
  "onlyInteger",
  "onlyNumeric",
] as const;

/**
 * Rails: parse_as_number → branches by Ruby type (Float / BigDecimal /
 * Numeric / integer-string / non-hex string). In TS we just narrow to
 * number and route through round + parseFloat per Rails:
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
 * implicit-nil from the `elsif` chain falling through).
 *
 * @internal Rails-private helper.
 */
export function parseAsNumber(num: number, precision: number, scale?: number): number | undefined {
  if (!Number.isFinite(num)) return undefined;
  return parseFloatRails(num, precision, scale);
}

/**
 * Mirrors: numericality.rb:86-88
 *   def parse_float(raw_value, precision, scale)
 *     round(raw_value, scale).to_d(precision)
 *   end
 *
 * Rounds to `scale` decimal places, then rounds to `precision`
 * significant digits — matches Ruby's `BigDecimal(float.round(scale), precision)`.
 * (Number.prototype.toPrecision performs rounding, not truncation.)
 *
 * @internal Rails-private helper.
 */
export function parseFloatRails(num: number, precision: number, scale?: number): number {
  return +round(num, scale).toPrecision(precision);
}

/**
 * Mirrors: numericality.rb:90-92
 *   def round(raw_value, scale)
 *     scale ? raw_value.round(scale) : raw_value
 *   end
 *
 * Ruby Float#round defaults to half-away-from-zero (NOT banker's
 * rounding): 2.5.round == 3, (-2.5).round == -3. Matches the existing
 * repo helper at activesupport/src/number-helper/rounding-helper.ts
 * (rubyRound).
 *
 * @internal Rails-private helper.
 */
export function round(num: number, scale?: number): number {
  if (scale === undefined || scale === null) return num;
  // Reuse the shared half-away-from-zero rounder so numericality
  // coercion stays consistent with the rest of the codebase.
  return new RoundingHelper({ precision: scale }).round(num);
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
  this: { options: Record<string, unknown>; isHexadecimalLiteral(v: unknown): boolean },
  rawValue: unknown,
  precision: number,
  scale?: number,
): boolean {
  if (this.options.onlyNumeric && typeof rawValue !== "number") return false;
  if (rawValue === null || rawValue === undefined) return false;
  if (typeof rawValue === "number") return Number.isFinite(rawValue);
  // Rails Kernel.Float raises TypeError for non-String/non-Numeric input
  // (Date, true/false, arbitrary objects), so is_number? returns false.
  // Restrict the coercion path to strings; JS Number(true) === 1 etc.
  // would otherwise silently pass.
  if (typeof rawValue !== "string") return false;
  // Rails `Kernel.Float` raises on blank strings — JS Number("") would
  // coerce to 0 and falsely report true.
  if (rawValue.trim() === "") return false;
  // Rails `is_hexadecimal_literal?` is anchored at \A (no whitespace),
  // but Kernel.Float strips leading whitespace before parsing, so a
  // string like "  0x1" is still a hex literal that Rails rejects.
  // Trails extends this to 0b… / 0o… because JS Number() coerces those
  // too (Rails Kernel.Float would raise).
  const trimmed = rawValue.trimStart();
  if (this.isHexadecimalLiteral(trimmed)) return false;
  if (NON_DECIMAL_LITERAL_REGEX.test(trimmed)) return false;
  // Rails: rescue ArgumentError, TypeError; false; end (numericality.rb:99).
  // The non-string/non-number paths return early above, and Number(string)
  // doesn't throw in JS — so the rescue is structurally absent here.
  // Kept the docstring reference to Rails' rescue for the call-shape
  // mapping; no try/catch needed.
  const coerced = Number(rawValue);
  if (Number.isNaN(coerced)) return false;
  return parseAsNumber(coerced, precision, scale) !== undefined;
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
  record: AnyRecord,
  optionValue: unknown,
  precision: number,
  scale?: number,
): number | undefined {
  const resolved = this.resolveValue(record, optionValue);
  if (resolved === undefined || resolved === null) return undefined;
  // Rails option_as_number → parse_as_number → Kernel.Float would raise
  // TypeError on non-Numeric/non-String input (Date, boolean, object).
  // Throw the consistent validator error rather than silently accepting
  // values that JS Number() happens to coerce (true → 1, Date → epoch).
  if (typeof resolved !== "number" && typeof resolved !== "string") {
    throw new Error(`Resolved numericality option must be numeric: ${String(resolved)}`);
  }
  if (typeof resolved === "string") {
    if (resolved.trim() === "") {
      // Rails Kernel.Float raises ArgumentError on blank strings, so
      // option_as_number propagates the error.
      throw new Error(`Resolved numericality option must be numeric: ${String(resolved)}`);
    }
    // Rails parse_as_number's elsif chain only falls through for hex
    // literals when the ANCHORED regex matches (HEXADECIMAL_REGEX uses
    // \A so leading whitespace doesn't qualify). "  0x10" doesn't
    // match, falls through to Kernel.Float, and raises — so we should
    // raise too rather than silently skipping.
    if (HEXADECIMAL_REGEX.test(resolved)) return undefined;
    const trimmed = resolved.trimStart();
    // Anything non-decimal that survives — leading-whitespace hex,
    // 0b… / 0o… — is rejected by Rails Kernel.Float. JS Number() would
    // silently coerce 0b/0o, so the explicit guard is load-bearing
    // on the trails side.
    if (HEXADECIMAL_REGEX.test(trimmed) || NON_DECIMAL_LITERAL_REGEX.test(trimmed)) {
      throw new Error(`Resolved numericality option must be numeric: ${String(resolved)}`);
    }
  }
  const numeric = typeof resolved === "number" ? resolved : Number(resolved);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Resolved numericality option must be numeric: ${String(resolved)}`);
  }
  return parseAsNumber(numeric, precision, scale);
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
    if (!(RESERVED_OPTIONS as readonly string[]).includes(key)) {
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
  record: AnyRecord,
): boolean {
  // Ruby truthiness: only nil/false count as false. Boolean(0) and
  // Boolean('') would diverge (Ruby treats both as truthy), so use the
  // explicit nil-or-false check pattern used elsewhere in trails (see
  // clusivity.ts:delimiter, comparison.ts).
  const resolved = this.resolveValue(record, this.options.onlyInteger);
  return resolved !== undefined && resolved !== null && resolved !== false;
}

interface RecordWithRawAttribute {
  attributeChangedInPlace?: (name: string) => boolean;
  readAttribute?: (name: string) => unknown;
  readAttributeBeforeTypeCast?: (name: string) => unknown;
  [key: string]: unknown;
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
  record: AnyRecord,
  attrName: string,
): unknown {
  // Rails has an early `return value if record_attribute_changed_in_place?`
  // short-circuit (numericality.rb:121) — in-place mutation means the
  // cast value IS what the user just changed; raw before_type_cast is
  // stale. Trails skips this optimization today because
  // `Model.attributeChangedInPlace` returns true for ANY change (not
  // just in-place mutation), so honoring the short-circuit would let
  // normal `10 → "abc"` updates bypass numericality. The
  // `isRecordAttributeChangedInPlace` helper is still exported (Rails
  // parity surface), it just isn't a gate here yet. Revisit once
  // trails grows true in-place-mutation tracking.
  //
  // Trails exposes raw values through the generic
  // `readAttributeBeforeTypeCast(name)` API on Model rather than the
  // Rails per-attribute generated `${attr}_before_type_cast` methods.
  // Duck-type the lookup so other hosts implementing the same shape
  // (or AR Base subclasses) work too.
  const r = record as RecordWithRawAttribute;
  const rawValue =
    typeof r.readAttributeBeforeTypeCast === "function"
      ? r.readAttributeBeforeTypeCast(attrName)
      : undefined;
  // Rails: raw_value || value — Ruby `||` falls back on nil/false. Use
  // the same semantic so `false`/`null` raw values fall through to
  // the cast value rather than being treated as "I read the raw".
  return rawValue !== undefined && rawValue !== null && rawValue !== false ? rawValue : value;
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
export function isRecordAttributeChangedInPlace(record: AnyRecord, attrName: string): boolean {
  const r = record as RecordWithRawAttribute;
  return typeof r.attributeChangedInPlace === "function" && r.attributeChangedInPlace(attrName);
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
