import { Rational } from "@blazetrails/date";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";
import { BIGDECIMAL_STRING } from "./number-converter.js";

class ArgumentError extends Error {
  override name = "ArgumentError";
}

class NoMethodError extends Error {
  override name = "NoMethodError";
}

/** Ruby's `Kernel#BigDecimal(value)` over a String, which `convert_to_decimal`
 *  reaches from two of its three arms (`rounding_helper.rb:28` and `:32`). */
function bigDecimal(value: string): BigDecimal {
  if (!BIGDECIMAL_STRING.test(value)) {
    throw new ArgumentError(`invalid value for BigDecimal(): "${value}"`);
  }
  return new BigDecimal(value.trim());
}

/**
 * Mirrors: ActiveSupport::NumberHelper::RoundingHelper
 * (activesupport/lib/active_support/number_helper/rounding_helper.rb).
 */
export class RoundingHelper {
  readonly options: Record<string, unknown>;

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  /**
   * @missingRailsCall fetch — PERMANENT: Ruby Hash#fetch with a default:
   *   `options.fetch(:round_mode, :default)`
   *   (number_helper/rounding_helper.rb:16) ports to the `"roundMode" in
   *   this.options` check, which keeps fetch's stored-value-wins semantics that
   *   `??` would not.
   */
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
   */
  private convertToDecimal(number: unknown): BigDecimal {
    if (typeof number === "number" || typeof number === "string") {
      return bigDecimal(String(number));
    }
    if (number instanceof Rational) {
      return new BigDecimal(
        number,
        this.digitCount(number.toI()) + (this.options.precision as number),
      );
    }
    if (number instanceof BigDecimal) return number;
    return bigDecimal(String(number));
  }

  private absolutePrecision(number: unknown): number | undefined {
    const { precision, significant } = this.options as {
      precision?: number;
      significant?: unknown;
    };
    if (significant != null && significant !== false) {
      // Ruby evaluates `options[:precision] > 0` here, which raises on a nil
      // precision rather than falling through to the else arm.
      if (precision == null) throw new NoMethodError("undefined method '>' for nil");
      if (precision > 0) {
        return precision - this.digitCount(this.convertToDecimal(number));
      }
      return precision;
    } else {
      return precision ?? undefined;
    }
  }
}
