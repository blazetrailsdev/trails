import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import type { NumberToHumanSizeOptions } from "../number-helper.js";

const STORAGE_UNITS = ["byte", "kb", "mb", "gb", "tb", "pb", "eb", "zb"];
const BASE = 1024;

export class NumberToHumanSizeConverter extends NumberConverter<NumberToHumanSizeOptions> {
  static override namespace = "human";

  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    const opts = this.options;
    if (!("stripInsignificantZeros" in opts)) {
      opts.stripInsignificantZeros = true;
    }

    const num = this.numberAsFloat();

    if (this.smallerThanBase(num)) {
      const numberToFormat = String(Math.trunc(num));
      const unit = this.unit(num, "byte");
      return this.conversionFormat()
        .replaceAll("%n", numberToFormat)
        .replaceAll("%u", String(unit));
    }

    const exp = this.exponent(Math.abs(num));
    const humanSize = num / Math.pow(BASE, exp);
    const numberToFormat = NumberToRoundedConverter.convert(humanSize, opts);
    const unit = this.unit(num, STORAGE_UNITS[exp]);
    return this.conversionFormat().replaceAll("%n", numberToFormat).replaceAll("%u", String(unit));
  }

  private conversionFormat(): string {
    return this.translateInLocale("human.storage_units.format", { raise: true }) as string;
  }

  private unit(number: number, unitKey: string): unknown {
    return this.translateNumberValueWithDefault(`human.storage_units.units.${unitKey}`, {
      locale: this.options.locale as string | undefined,
      count: Math.trunc(number),
      raise: true,
    });
  }

  private exponent(abs: number): number {
    const max = STORAGE_UNITS.length - 1;
    const exp = Math.floor(Math.log(abs) / Math.log(BASE));
    return Math.max(0, Math.min(exp, max));
  }

  private smallerThanBase(num: number): boolean {
    return Math.abs(Math.trunc(num)) < BASE;
  }
}
