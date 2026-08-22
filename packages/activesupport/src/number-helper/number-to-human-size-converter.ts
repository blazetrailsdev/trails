import { kernelFloat } from "../core-ext/big-decimal/conversions.js";
import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import type { NumberToHumanSizeOptions } from "../number-helper.js";

const STORAGE_UNITS = ["byte", "kb", "mb", "gb", "tb", "pb", "eb", "zb"];

export class NumberToHumanSizeConverter extends NumberConverter<NumberToHumanSizeOptions> {
  static override namespace = "human";

  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    this.number = kernelFloat(this.number)!;

    // For backwards compatibility with those that didn't add stripInsignificantZeros to their locale files.
    const options = this.options;
    if (!("stripInsignificantZeros" in options)) {
      options.stripInsignificantZeros = true;
    }

    let numberToFormat: string;
    if (this.smallerThanBase()) {
      numberToFormat = String(Math.trunc(this.number as number));
    } else {
      const humanSize = (this.number as number) / Math.pow(this.base(), this.exponent());
      numberToFormat = NumberToRoundedConverter.convert(humanSize, options);
    }
    return this.conversionFormat()
      .replaceAll("%n", numberToFormat)
      .replaceAll("%u", String(this.unit()));
  }

  private conversionFormat(): string {
    return this.translateNumberValueWithDefault("human.storage_units.format", {
      locale: this.options.locale as string | undefined,
      raise: true,
    }) as string;
  }

  private unit(): unknown {
    return this.translateNumberValueWithDefault(this.storageUnitKey(), {
      locale: this.options.locale as string | undefined,
      count: Math.trunc(this.number as number),
      raise: true,
    });
  }

  private storageUnitKey(): string {
    const keyEnd = this.smallerThanBase() ? "byte" : STORAGE_UNITS[this.exponent()];
    return `human.storage_units.units.${keyEnd}`;
  }

  private exponent(): number {
    const max = STORAGE_UNITS.length - 1;
    let exp = Math.trunc(Math.log(Math.abs(this.number as number)) / Math.log(this.base()));
    if (exp > max) exp = max; // avoid overflow for the highest unit
    return exp;
  }

  private smallerThanBase(): boolean {
    return Math.abs(Math.trunc(this.number as number)) < this.base();
  }

  private base(): number {
    return 1024;
  }
}
