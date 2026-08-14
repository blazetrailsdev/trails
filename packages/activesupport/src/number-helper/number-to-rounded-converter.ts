import { NumberConverter } from "./number-converter.js";
import { RoundingHelper } from "./rounding-helper.js";
import { NumberToDelimitedConverter } from "./number-to-delimited-converter.js";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";
import type { NumberToRoundedOptions } from "../number-helper.js";

/** Whether `roundMode` is the ties-away-from-zero mode `BigDecimal#round` applies. */
function isHalfUp(roundMode: string | undefined): boolean {
  return roundMode === undefined || roundMode === "default" || roundMode === "half_up";
}

/** `BigDecimal#round` rendered with exactly `precision` fractional digits. */
function toFixedString(value: BigDecimal, precision: number): string {
  const [intPart, fracPart = ""] = value.round(precision).toString("F").split(".");
  if (precision <= 0) return intPart;
  return `${intPart}.${fracPart.padEnd(precision, "0").slice(0, precision)}`;
}

export class NumberToRoundedConverter extends NumberConverter<NumberToRoundedOptions> {
  static override namespace = "precision";

  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    const opts = this.options;
    const precision = (opts.precision ?? 3) as number;
    const separator = (opts.separator ?? ".") as string;
    const delimiter = (opts.delimiter ?? "") as string;
    const significant = (opts.significant ?? false) as boolean;
    const stripInsignificantZeros = (opts.stripInsignificantZeros ?? false) as boolean;
    const roundMode = opts.roundMode as string | undefined;

    const num = this.numberAsFloat();
    const helper = new RoundingHelper({ precision, significant, roundMode });
    const rounded = helper.round(num);

    let str: string;
    if (this.number instanceof BigDecimal && !significant && isHalfUp(roundMode)) {
      // Rails rounds the BigDecimal `valid_bigdecimal` produced, so a value
      // wider than a JS float's 53-bit mantissa survives to the delimiter.
      str = toFixedString(this.number, precision);
    } else if (significant && precision > 0) {
      if (num === 0) {
        str = (0).toFixed(precision - 1);
      } else {
        const magnitude = Math.floor(Math.log10(Math.abs(rounded)));
        const decimalPlaces = precision - 1 - magnitude;
        if (decimalPlaces >= 0) {
          str = rounded.toFixed(decimalPlaces);
        } else {
          str = rounded.toFixed(0);
        }
      }
    } else {
      str = rounded.toFixed(precision);
    }

    if (stripInsignificantZeros && str.includes(".")) {
      str = str.replace(/\.?0+$/, "");
      if (str === "" || str === "-") str = "0";
    }

    const delimited = NumberToDelimitedConverter.convert(str, { delimiter, separator });
    return delimited;
  }
}
