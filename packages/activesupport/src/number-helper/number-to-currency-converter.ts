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
    const opts = this.options;
    const unit = (opts.unit ?? "$") as string;

    const num = Number(this.number);
    if (!Number.isFinite(num)) return String(this.number);

    const isNegative = num < 0;
    const abs = Math.abs(num);

    const numberStr = NumberToRoundedConverter.convert(abs, opts);

    let format: string;
    if (isNegative) {
      format = (opts.negativeFormat ?? `-%u%n`) as string;
    } else {
      format = (opts.format ?? "%u%n") as string;
    }

    return format.replaceAll("%u", unit).replaceAll("%n", numberStr);
  }
}
