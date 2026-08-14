import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";
import type { NumberToCurrencyOptions } from "../number-helper.js";

/** Ruby's `0.5` literal in `number_to_currency_converter.rb:16`. */
const HALF = new BigDecimal("0.5");

/** Ruby's exact `10**options[:precision]`, which outruns a JS number by 1e21. */
function powerOfTen(precision: number): BigDecimal {
  return new BigDecimal(`1${"0".repeat(Math.max(precision, 0))}`);
}

export class NumberToCurrencyConverter extends NumberConverter<NumberToCurrencyOptions> {
  static override namespace = "currency";

  protected override formatOptions(): Record<string, unknown> {
    const defaults = this.defaultFormatOptions();
    const i18n = this.i18nFormatOptions();
    if (i18n.format && !i18n.negativeFormat) {
      i18n.negativeFormat = `-${i18n.format}`;
    }
    const merged = { ...defaults, ...i18n };
    if (this.opts.format) {
      merged.negativeFormat = `-${this.opts.format}`;
    }
    return { ...merged, ...this.opts };
  }

  protected convert(): string {
    const options = this.options;
    let format = options.format as string;

    let numberS: string;
    let numberD = this.validBigdecimal();
    if (numberD !== null) {
      if (numberD.isNegative()) {
        numberD = numberD.abs();
        if (numberD.mult(powerOfTen(options.precision as number)).compare(HALF) >= 0) {
          format = options.negativeFormat as string;
        }
      }
      numberS = NumberToRoundedConverter.convert(numberD, options);
    } else {
      numberS = String(this.number).trim();
      const stripped = numberS.replace(/^-/, "");
      if (stripped !== numberS) {
        numberS = stripped;
        format = options.negativeFormat as string;
      }
    }

    return format.replaceAll("%n", numberS).replaceAll("%u", options.unit as string);
  }
}
