import { NumberHelper } from "../../number-helper.js";
import { BigDecimal } from "../big-decimal/conversions.js";

/**
 * Mirrors: `ActiveSupport::NumericWithFormat`
 * (`core_ext/numeric/conversions.rb`) — the module Rails includes into
 * `Integer`, `Float` and `BigDecimal`. Ruby reopens those classes; TypeScript
 * cannot, so the module's members take the receiver as their first parameter,
 * the same idiom `core-ext/object/acts-like.ts` uses for `Object`.
 */
export namespace NumericWithFormat {
  /**
   * Provides options for converting numbers into formatted strings.
   * Options are provided for phone numbers, currency, percentage,
   * precision, positional notation, file size, and pretty printing.
   *
   * This method is aliased to `toFormattedS`.
   *
   * For details on which formats use which options, see
   * {@link NumberHelper}.
   *
   *     toFs(5551234, ":phone")                    // => "555-1234"
   *     toFs(1234567890.5, ":currency")            // => "$1,234,567,890.50"
   *     toFs(12345678, ":delimited")               // => "12,345,678"
   *     toFs(1234, ":human_size")                  // => "1.21 KB"
   *
   * Ruby's `when Integer, String` arm passes the format to `Integer#to_s` as a
   * base; a Ruby Symbol is a colon-prefixed string in trails, which is what
   * separates that arm from the format Symbols below. Ruby's trailing
   * `else to_s(format)` arm takes a format that is none of those three types,
   * which this parameter type excludes, so the `when Symbol` fallback to `to_s`
   * is the last arm here. `to_s(format)` dispatches on the receiver:
   * `BigDecimal#to_s` takes a format string, `Integer#to_s` a base.
   *
   * `self` is always a Numeric, so `NumberConverter#execute`
   * (number_converter.rb:130-137) always takes its `convert` arm and every
   * helper below answers a String.
   */
  export function toFs(
    self: number | BigDecimal,
    format: number | string | null = null,
    options: Record<string, unknown> | null = null,
  ): string {
    if (format === null) return self.toString();

    if (typeof format === "number" || !format.startsWith(":")) {
      return self instanceof BigDecimal
        ? self.toString(String(format))
        : self.toString(format as number);
    }

    switch (format) {
      case ":phone":
        return NumberHelper.numberToPhone(self, options ?? {}) as string;
      case ":currency":
        return NumberHelper.numberToCurrency(self, options ?? {}) as string;
      case ":percentage":
        return NumberHelper.numberToPercentage(self, options ?? {}) as string;
      case ":delimited":
        return NumberHelper.numberToDelimited(self, options ?? {}) as string;
      case ":rounded":
        return NumberHelper.numberToRounded(self, options ?? {}) as string;
      case ":human":
        return NumberHelper.numberToHuman(self, options ?? {}) as string;
      case ":human_size":
        return NumberHelper.numberToHumanSize(self, options ?? {}) as string;
      default:
        return self.toString();
    }
  }

  /** `alias_method :to_formatted_s, :to_fs` — conversions.rb:145. */
  export const toFormattedS = toFs;
}
