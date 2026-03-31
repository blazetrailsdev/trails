import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import type { NumberToPercentageOptions } from "../number-helper.js";

export class NumberToPercentageConverter extends NumberConverter<NumberToPercentageOptions> {
  protected convert(): string {
    const { format = "%n%", ...roundedOptions } = this.opts;
    const rounded = NumberToRoundedConverter.convert(this.number, roundedOptions);
    return format.replaceAll("%n", rounded);
  }
}
