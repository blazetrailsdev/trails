import { NumberHelper } from "../../number-helper.js";

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
   */
  export function toFs(
    self: number,
    format: number | string | null = null,
    options: Record<string, unknown> | null = null,
  ): string {
    if (format === null) return String(self);

    // `when Integer, String` — a base for `Integer#to_s`. A Ruby Symbol is a
    // colon-prefixed string in trails, which is what separates this arm from
    // the format arms below (a String format never carries the colon).
    if (typeof format === "number" || !format.startsWith(":")) {
      return self.toString(format as number);
    }

    switch (format) {
      case ":phone":
        return NumberHelper.numberToPhone(self, options ?? {});
      case ":currency":
        return NumberHelper.numberToCurrency(self, options ?? {});
      case ":percentage":
        return NumberHelper.numberToPercentage(self, options ?? {});
      case ":delimited":
        return NumberHelper.numberToDelimited(self, options ?? {});
      case ":rounded":
        return NumberHelper.numberToRounded(self, options ?? {});
      case ":human":
        return NumberHelper.numberToHuman(self, options ?? {});
      case ":human_size":
        return NumberHelper.numberToHumanSize(self, options ?? {});
      default:
        // `when Symbol` — an unrecognized format Symbol falls back to `to_s`.
        // Ruby's trailing `else to_s(format)` arm takes a non-Symbol,
        // non-Integer, non-String format, which this parameter type excludes.
        return String(self);
    }
  }

  // `alias_method :to_formatted_s, :to_fs` — conversions.rb:145.
  export const toFormattedS = toFs;
}
