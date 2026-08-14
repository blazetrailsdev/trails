import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import type { NumberToCurrencyOptions } from "../number-helper.js";

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
    const unit = (options.unit ?? "$") as string;

    const num = Number(this.number);
    if (!Number.isFinite(num)) return String(this.number);

    const isNegative = num < 0;
    const numberD = Math.abs(num);

    const numberStr = NumberToRoundedConverter.convert(numberD, options);

    let format: string;
    if (isNegative) {
      format = (options.negativeFormat ?? `-%u%n`) as string;
    } else {
      format = (options.format ?? "%u%n") as string;
    }

    return format.replaceAll("%u", unit).replaceAll("%n", numberStr);
  }
}
