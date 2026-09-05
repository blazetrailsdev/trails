import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";
import { merge, mergeBang } from "../hash-utils.js";
import type { NumberToCurrencyOptions } from "../number-helper.js";

const HALF = new BigDecimal("0.5");

function powerOfTen(precision: number): BigDecimal {
  return new BigDecimal(`1${"0".repeat(Math.max(precision, 0))}`);
}

export class NumberToCurrencyConverter extends NumberConverter<NumberToCurrencyOptions> {
  static override namespace = "currency";

  protected convert(): string {
    const options = this.options;
    let format = options.format as string;

    let numberS: string;
    let numberD = this.validBigdecimal();
    if (numberD !== null) {
      if (numberD.isNegative()) {
        numberD = numberD.abs();
        if (numberD.mult(powerOfTen(options.precision as number)).compare(HALF)! >= 0) {
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

  protected override get options(): Record<string, unknown> {
    if (!this._options) {
      const defaults = merge(this.defaultFormatOptions(), this.i18nOpts());
      if (this.opts.format) defaults.negativeFormat = `-${this.opts.format}`;
      this._options = mergeBang(defaults, this.opts as Record<string, unknown>);
    }
    return this._options;
  }

  protected i18nOpts(): Record<string, unknown> {
    const i18n = this.i18nFormatOptions();
    if (i18n.format) i18n.negativeFormat ??= `-${i18n.format}`;
    return i18n;
  }
}
