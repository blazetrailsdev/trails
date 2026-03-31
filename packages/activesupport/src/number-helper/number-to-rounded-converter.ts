import { NumberConverter } from "./number-converter.js";
import { RoundingHelper } from "./rounding-helper.js";
import { NumberToDelimitedConverter } from "./number-to-delimited-converter.js";
import type { NumberToRoundedOptions } from "../number-helper.js";

export class NumberToRoundedConverter extends NumberConverter<NumberToRoundedOptions> {
  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    const {
      precision = 3,
      separator = ".",
      delimiter = "",
      significant = false,
      stripInsignificantZeros = false,
    } = this.opts;

    const num = this.numberAsFloat();
    const helper = new RoundingHelper({ precision, significant });
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
