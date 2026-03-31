import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import { RoundingHelper } from "./rounding-helper.js";
import type { NumberToHumanOptions } from "../number-helper.js";

const DECIMAL_UNITS: Array<[number, string]> = [
  [1e15, "Quadrillion"],
  [1e12, "Trillion"],
  [1e9, "Billion"],
  [1e6, "Million"],
  [1e3, "Thousand"],
];

export class NumberToHumanConverter extends NumberConverter<NumberToHumanOptions> {
  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    const {
      precision = 3,
      separator = ".",
      delimiter = "",
      significant = true,
      stripInsignificantZeros = true,
      units,
      format = "%n %u",
    } = this.opts;

    let num = this.numberAsFloat();
    num = new RoundingHelper({ precision, significant }).round(num);
    const abs = Math.abs(num);

    const roundOpts = { precision, separator, delimiter, significant, stripInsignificantZeros };

    if (units) {
      return this.convertWithCustomUnits(num, abs, units, format, roundOpts);
    }

    for (const [threshold, label] of DECIMAL_UNITS) {
      if (abs >= threshold) {
        const value = num / threshold;
        const rounded = NumberToRoundedConverter.convert(value, roundOpts);
        return format.replaceAll("%n", rounded).replaceAll("%u", label);
      }
    }

    const rounded = NumberToRoundedConverter.convert(num, roundOpts);
    return rounded;
  }

  private convertWithCustomUnits(
    num: number,
    abs: number,
    units: Record<string, string>,
    format: string,
    roundOpts: Record<string, unknown>,
  ): string {
    const thresholds: Array<[number, string]> = [
      [1e15, "quadrillion"],
      [1e12, "trillion"],
      [1e9, "billion"],
      [1e6, "million"],
      [1e3, "thousand"],
      [1, "unit"],
    ];

    for (const [threshold, key] of thresholds) {
      if (abs >= threshold && units[key] !== undefined) {
        const value = num / threshold;
        const rounded = NumberToRoundedConverter.convert(value, roundOpts);
        return format.replaceAll("%n", rounded).replaceAll("%u", units[key]);
      }
    }

    if (units["unit"] !== undefined) {
      const rounded = NumberToRoundedConverter.convert(num, roundOpts);
      return format.replaceAll("%n", rounded).replaceAll("%u", units["unit"]).trim();
    }

    return NumberToRoundedConverter.convert(num, roundOpts);
  }
}
