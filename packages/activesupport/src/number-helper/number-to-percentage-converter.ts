import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import type { NumberToPercentageOptions } from "../number-helper.js";

export class NumberToPercentageConverter extends NumberConverter<NumberToPercentageOptions> {
  static override namespace = "percentage";

  protected convert(): string {
    const opts = this.options;
    const format = (opts.format ?? "%n%") as string;
    const { format: _f, locale: _l, negativeFormat: _nf, ...roundedOptions } = opts;
    const rounded = NumberToRoundedConverter.convert(this.number, roundedOptions);
    return format.replaceAll("%n", rounded);
  }
}
