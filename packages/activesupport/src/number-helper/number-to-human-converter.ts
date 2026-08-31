import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import { RoundingHelper } from "./rounding-helper.js";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";
import { kernelFloat } from "@blazetrails/ruby-compat";
import { I18n } from "../i18n.js";
import type { NumberToHumanOptions } from "../number-helper.js";

const DECIMAL_UNITS: Record<number, string> = {
  0: "unit",
  1: "ten",
  2: "hundred",
  3: "thousand",
  6: "million",
  9: "billion",
  12: "trillion",
  15: "quadrillion",
  "-1": "deci",
  "-2": "centi",
  "-3": "mili",
  "-6": "micro",
  "-9": "nano",
  "-12": "pico",
  "-15": "femto",
};

const INVERTED_DECIMAL_UNITS: Record<string, number> = {};
for (const [exp, name] of Object.entries(DECIMAL_UNITS)) {
  INVERTED_DECIMAL_UNITS[name] = Number(exp);
}

export class NumberToHumanConverter extends NumberConverter<NumberToHumanOptions> {
  static override namespace = "human";

  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    // Rails keeps the rounded BigDecimal through `number / (10**exponent)`
    // (number_to_human_converter.rb:12-14); BigDecimal division is unported,
    // so the value drops to a float for the exponent scaling.
    this.number = new RoundingHelper(this.options).round(this.number) as BigDecimal;
    this.number = kernelFloat(this.number);

    // For backwards compatibility with those that didn't add stripInsignificantZeros to their locale files.
    const options = this.options;
    if (!("stripInsignificantZeros" in options)) {
      options.stripInsignificantZeros = true;
    }

    const units = this.opts.units;
    const exponent = this.calculateExponent(units);
    this.number = (this.number as number) / Math.pow(10, exponent);

    const roundedNumber = NumberToRoundedConverter.convert(this.number, options);
    const unit = this.determineUnit(units, exponent);
    return this.format().replaceAll("%n", roundedNumber).replaceAll("%u", String(unit)).trim();
  }

  private format(): string {
    return (
      (this.options.format as string) ||
      (this.translateInLocale("human.decimal_units.format") as string)
    );
  }

  private determineUnit(
    units: Record<string, string> | string | undefined,
    exponent: number,
  ): string {
    const exp = DECIMAL_UNITS[exponent];
    if (typeof units === "object" && units !== null) {
      return units[exp] ?? "";
    }
    if (typeof units === "string") {
      return I18n.translate(`${units}.${exp}`, {
        locale: this.options.locale as string | undefined,
        count: Math.trunc(this.number as number),
      }) as string;
    }
    return this.translateInLocale(`human.decimal_units.units.${exp}`, {
      count: Math.trunc(this.number as number),
    }) as string;
  }

  private calculateExponent(units: Record<string, string> | string | undefined): number {
    const exponent =
      this.number !== 0 ? Math.floor(Math.log10(Math.abs(this.number as number))) : 0;
    return this.unitExponents(units).find((e) => exponent >= e) ?? 0;
  }

  private unitExponents(units: Record<string, string> | string | undefined): number[] {
    let unitKeys: string[];
    if (typeof units === "object" && units !== null) {
      unitKeys = Object.keys(units);
    } else if (typeof units === "string") {
      const translated = I18n.translate(units, {
        locale: this.options.locale as string | undefined,
        raise: true,
      });
      unitKeys =
        typeof translated === "object" && translated !== null
          ? Object.keys(translated as Record<string, unknown>)
          : [];
    } else {
      const translated = this.translateInLocale("human.decimal_units.units", { raise: true });
      unitKeys =
        typeof translated === "object" && translated !== null
          ? Object.keys(translated as Record<string, unknown>)
          : [];
    }
    return unitKeys
      .map((name) => INVERTED_DECIMAL_UNITS[name])
      .filter((e) => e !== undefined)
      .sort((a, b) => b - a);
  }
}
