import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { resolveValue } from "./resolve-value.js";

/**
 * Mirrors: ActiveModel::Validations::FormatValidator (format.rb)
 *
 *   class FormatValidator < EachValidator
 *     include ResolveValue
 *
 *     def validate_each(record, attribute, value)
 *       if options[:with]
 *         regexp = resolve_value(record, options[:with])
 *         record_error(record, attribute, :with, value) unless regexp.match?(value.to_s)
 *       elsif options[:without]
 *         regexp = resolve_value(record, options[:without])
 *         record_error(record, attribute, :without, value) if regexp.match?(value.to_s)
 *       end
 *     end
 *     ...
 */
export class FormatValidator extends EachValidator {
  // Declarations only — actual functions attached to the prototype below.
  // Prototype attachment (not class fields) so the helpers are present
  // during EachValidator's constructor-time checkValidity() call. JS class
  // fields don't initialize until AFTER super() returns. (Same bootstrapping
  // lesson as PR #994.)
  declare resolveValue: typeof resolveValue;
  /** @internal Rails-private helper. */
  declare recordError: typeof recordError;
  /** @internal Rails-private helper. */
  declare checkOptionsValidity: typeof checkOptionsValidity;
  /** @internal Rails-private helper. */
  declare regexpUsingMultilineAnchors: typeof regexpUsingMultilineAnchors;

  override checkValidity(): void {
    // Rails: `unless options.include?(:with) ^ options.include?(:without)`
    // — Hash#include? checks own keys only; use Object.hasOwn to avoid
    // prototype-chain surprises (the `in` operator would include inherited).
    const hasWith = Object.hasOwn(this.options, "with");
    const hasWithout = Object.hasOwn(this.options, "without");
    if (hasWith === hasWithout) {
      throw new Error("Either :with or :without must be supplied (but not both)");
    }
    this.checkOptionsValidity("with");
    this.checkOptionsValidity("without");
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    // Rails uses Ruby truthiness on options[:with] / options[:without] —
    // nil/false skip the branch entirely. Mirror that so an explicit
    // `null` / `false` option doesn't crash at .test time.
    // value.to_s in Ruby coerces nil → ""; JS String(null) → "null".
    const target = value == null ? "" : String(value);
    if (this.options.with) {
      const regexp = this.resolveValue(record, this.options.with) as RegExp;
      if (!matchStateless(regexp, target)) {
        this.recordError(record, attribute, "with", value);
      }
    } else if (this.options.without) {
      const regexp = this.resolveValue(record, this.options.without) as RegExp;
      if (matchStateless(regexp, target)) {
        this.recordError(record, attribute, "without", value);
      }
    }
  }
}

/**
 * Mirrors: format.rb:30-32
 *   def record_error(record, attribute, name, value)
 *     record.errors.add(attribute, :invalid, **options.except(name).merge!(value: value))
 *   end
 *
 * @internal Rails-private helper.
 */
export function recordError(
  this: { options: Record<string, unknown> },
  record: AnyRecord,
  attribute: string,
  name: "with" | "without",
  value: unknown,
): void {
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(this.options)) {
    if (key !== name) rest[key] = this.options[key];
  }
  rest.value = value;
  record.errors.add(attribute, "invalid", rest);
}

/**
 * Mirrors: format.rb:34-46
 *   def check_options_validity(name)
 *     if option = options[name]
 *       if option.is_a?(Regexp)
 *         if options[:multiline] != true && regexp_using_multiline_anchors?(option)
 *           raise ArgumentError, "...security risk..."
 *         end
 *       elsif !option.respond_to?(:call)
 *         raise ArgumentError, "A regular expression or a proc or lambda must be supplied as :#{name}"
 *       end
 *     end
 *   end
 *
 * @internal Rails-private helper.
 */
export function checkOptionsValidity(
  this: {
    options: Record<string, unknown>;
    regexpUsingMultilineAnchors(regexp: RegExp): boolean;
  },
  name: "with" | "without",
): void {
  const option = this.options[name];
  // Rails `if option = options[name]` skips on Ruby falsiness (nil OR
  // false). validateEach also short-circuits on these via Rails
  // truthiness, so the validity check stays consistent with the
  // dispatch path.
  if (option === undefined || option === null || option === false) return;
  if (option instanceof RegExp) {
    if (this.options.multiline !== true && this.regexpUsingMultilineAnchors(option)) {
      throw new Error(
        "The provided regular expression is using multiline anchors (^ or $), " +
          "which may present a security risk. Did you mean to use \\A and \\z, " +
          "or forgot to add the :multiline => true option?",
      );
    }
  } else if (typeof option !== "function") {
    throw new Error(`A regular expression or a proc or lambda must be supplied as :${name}`);
  }
}

/**
 * Mirrors: format.rb:48-51
 *   def regexp_using_multiline_anchors?(regexp)
 *     source = regexp.source
 *     source.start_with?("^") || (source.end_with?("$") && !source.end_with?("\\$"))
 *   end
 *
 * Inspects the regex source text — NOT the `m` (multiline) flag — for
 * the user-facing `^` / `$` anchors that match per-line in Ruby. Rails
 * forces the user to opt in via `multiline: true` to acknowledge the
 * security implication of accepting input across line boundaries.
 *
 * @internal Rails-private helper.
 */
export function regexpUsingMultilineAnchors(regexp: RegExp): boolean {
  const source = regexp.source;
  return source.startsWith("^") || (source.endsWith("$") && !source.endsWith("\\$"));
}

/**
 * Stateless equivalent of Rails' `regexp.match?(value.to_s)`. JS
 * `RegExp#test` mutates `lastIndex` for regexes carrying the `g` /
 * `y` flag, so a single regex shared across calls would alternate
 * between passing and failing. Snapshot and restore `lastIndex` so the
 * caller's regex is observably unchanged.
 */
function matchStateless(regexp: RegExp, target: string): boolean {
  const before = regexp.lastIndex;
  regexp.lastIndex = 0;
  try {
    return regexp.test(target);
  } finally {
    regexp.lastIndex = before;
  }
}

FormatValidator.prototype.resolveValue = resolveValue;
FormatValidator.prototype.recordError = recordError;
FormatValidator.prototype.checkOptionsValidity = checkOptionsValidity;
FormatValidator.prototype.regexpUsingMultilineAnchors = regexpUsingMultilineAnchors;
