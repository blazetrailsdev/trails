import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import type { NumberToPercentageOptions } from "../number-helper.js";

export class NumberToPercentageConverter extends NumberConverter<NumberToPercentageOptions> {
  static override namespace = "percentage";

  protected convert(): string {
    const options = this.options;
    const roundedNumber = NumberToRoundedConverter.convert(this.number, options);
    return (options.format as string).replaceAll("%n", roundedNumber);
  }
}
