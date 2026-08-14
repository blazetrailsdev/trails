import { BigDecimal } from "../core-ext/big-decimal/conversions.js";
import { BIGDECIMAL_STRING } from "./number-converter.js";

class ArgumentError extends Error {
  override name = "ArgumentError";
}

/**
 * Mirrors: ActiveSupport::NumberHelper::RoundingHelper
 * (activesupport/lib/active_support/number_helper/rounding_helper.rb).
 */
export class RoundingHelper {
  readonly options: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    this.options = options;
  }

  round(number: unknown): unknown {
    const precision = this.absolutePrecision(number);
    if (precision == null) return number;

    const roundedNumber = this.convertToDecimal(number).round(
      precision,
      ("roundMode" in this.options ? this.options.roundMode : ":default") as string,
    );
    return roundedNumber.isZero() ? roundedNumber.abs() : roundedNumber; // prevent showing negative zeros
  }

  digitCount(number: unknown): number {
    const value = number instanceof BigDecimal ? Number(number.toString("F")) : Number(number);
    if (value === 0) return 1;
    return Math.floor(Math.log10(Math.abs(value)) + 1);
  }

  /**
   * The literal-shape guard is what `BigDecimal(number.to_s)` does by raising:
   * a string that is not a decimal literal is an `ArgumentError`, not a
   * silently coerced zero.
   *
   * @missingRailsCall digit_count — only the `Rational` arm calls it, to size
   * the `BigDecimal(number, ndigits)` precision; there is no trails Rational.
   */
  private convertToDecimal(number: unknown): BigDecimal {
    if (number instanceof BigDecimal) return number;
    const value = String(number);
    if (!BIGDECIMAL_STRING.test(value)) {
      throw new ArgumentError(`invalid value for BigDecimal(): "${value}"`);
    }
    return new BigDecimal(value.trim());
  }

  private absolutePrecision(number: unknown): number | undefined {
    const precision = this.options.precision as number | undefined;
    if (this.options.significant === true && (precision as number) > 0) {
      return (precision as number) - this.digitCount(this.convertToDecimal(number));
    } else {
      return precision ?? undefined;
    }
  }
}
