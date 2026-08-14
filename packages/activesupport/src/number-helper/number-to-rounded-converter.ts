import { NumberConverter } from "./number-converter.js";
import { RoundingHelper } from "./rounding-helper.js";
import { NumberToDelimitedConverter } from "./number-to-delimited-converter.js";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";
import type { NumberToRoundedOptions } from "../number-helper.js";

export class NumberToRoundedConverter extends NumberConverter<NumberToRoundedOptions> {
  static override namespace = "precision";

  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    const options = this.options;
    const helper = new RoundingHelper(options);
    const roundedNumber = helper.round(this.number);

    let formattedString: string;
    let precision = options.precision as number | null | undefined;
    if (precision != null) {
      if (options.significant === true && precision > 0) {
        const digits = helper.digitCount(roundedNumber);
        precision -= digits;
        if (precision < 0) precision = 0; // don't let it be negative
      }

      const s = (roundedNumber as BigDecimal).toString("F");
      const dot = s.indexOf(".");
      let a = s.slice(0, dot);
      let b = s.slice(dot + 1);
      if (precision !== 0) {
        b += "0".repeat(precision);
        a += ".";
        a += b.slice(0, precision);
      }
      formattedString = a;
    } else {
      formattedString = String(roundedNumber);
    }

    const delimitedNumber = NumberToDelimitedConverter.convert(formattedString, options);
    return this.formatNumber(delimitedNumber);
  }

  private get stripInsignificantZeros(): boolean {
    return this.options.stripInsignificantZeros === true;
  }

  private formatNumber(number: string): string {
    if (this.stripInsignificantZeros) {
      const escapedSeparator = escapeRegExp(this.options.separator as string);
      return number
        .replace(new RegExp(`(${escapedSeparator})(\\d*[1-9])?0+$`), "$1$2")
        .replace(new RegExp(`${escapedSeparator}$`), "");
    } else {
      return number;
    }
  }
}

/** Ruby `Regexp.escape` (number_to_rounded_converter.rb:44). */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
