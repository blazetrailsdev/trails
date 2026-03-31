import { NumberConverter } from "./number-converter.js";
import { NumberToRoundedConverter } from "./number-to-rounded-converter.js";
import type { NumberToHumanSizeOptions } from "../number-helper.js";

const STORAGE_UNITS = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB"];
const BASE = 1024;

export class NumberToHumanSizeConverter extends NumberConverter<NumberToHumanSizeOptions> {
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
    } = this.opts;

    const num = this.numberAsFloat();
    const abs = Math.abs(num);

    if (abs === 0) return "0 Bytes";
    if (abs === 1) return num < 0 ? "-1 Byte" : "1 Byte";

    const exponent = this.exponent(abs);
    const unit = STORAGE_UNITS[exponent];

    if (exponent === 0) {
      const numberStr = NumberToRoundedConverter.convert(num, {
        precision: 0,
        separator,
        delimiter,
        stripInsignificantZeros: true,
      });
      return `${numberStr} ${unit}`;
    }

    const humanSize = num / Math.pow(BASE, exponent);
    const numberStr = NumberToRoundedConverter.convert(humanSize, {
      precision,
      separator,
      delimiter,
      significant,
      stripInsignificantZeros,
    });

    return `${numberStr} ${unit}`;
  }

  private exponent(abs: number): number {
    const max = STORAGE_UNITS.length - 1;
    const exp = Math.floor(Math.log(abs) / Math.log(BASE));
    return Math.max(0, Math.min(exp, max));
  }
}
