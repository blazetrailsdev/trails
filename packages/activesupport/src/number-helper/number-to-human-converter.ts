import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import { RoundingHelper } from "./rounding-helper.js";
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
    const opts = this.options;
    if (!("stripInsignificantZeros" in opts)) {
      opts.stripInsignificantZeros = true;
    }

    const precision = (opts.precision ?? 3) as number;
    const significant = (opts.significant ?? true) as boolean;

    const roundMode = opts.roundMode as string | undefined;

    let num = this.numberAsFloat();
    num = new RoundingHelper({ precision, significant, roundMode }).round(num);

    const units = this.opts.units;
    const exponent = this.calculateExponent(units, Math.abs(num));
    num = num / Math.pow(10, exponent);

    const roundedNumber = NumberToRoundedConverter.convert(num, opts);
    const unit = this.determineUnit(units, exponent, Math.trunc(num));
    const format = this.getFormat();
    return format.replaceAll("%n", roundedNumber).replaceAll("%u", String(unit)).trim();
  }

  private getFormat(): string {
    return (
      (this.options.format as string) ||
      (this.translateInLocale("human.decimal_units.format") as string)
    );
  }

  private determineUnit(
    units: Record<string, string> | string | undefined,
    exponent: number,
    count: number,
  ): string {
    const expName = DECIMAL_UNITS[exponent];
    if (typeof units === "object" && units !== null) {
      return units[expName] ?? "";
    }
    if (typeof units === "string") {
      return I18n.translate(`${units}.${expName}`, {
        locale: this.options.locale as string | undefined,
        count,
      }) as string;
    }
    return this.translateInLocale(`human.decimal_units.units.${expName}`, { count }) as string;
  }

  private calculateExponent(
    units: Record<string, string> | string | undefined,
    abs: number,
  ): number {
    const exponent = abs !== 0 ? Math.floor(Math.log10(abs)) : 0;
    const exponents = this.unitExponents(units);
    return exponents.find((e) => exponent >= e) ?? 0;
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
