import { NumberConverter } from "./number-converter.js";
import { RoundingHelper } from "./rounding-helper.js";
import { NumberToDelimitedConverter } from "./number-to-delimited-converter.js";
import type { NumberToRoundedOptions } from "../number-helper.js";

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
    if (significant && precision > 0) {
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
