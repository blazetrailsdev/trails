import { NumberConverter } from "./number-converter.js";
import type { NumberWithDelimiterOptions } from "../number-helper.js";

const DEFAULT_DELIMITER_REGEX = /(\d)(?=(\d{3})+(?!\d))/g;

export class NumberToDelimitedConverter extends NumberConverter<NumberWithDelimiterOptions> {
  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    const { delimiter = ",", separator = "." } = this.opts;
    const str = String(this.number);
    const parts = str.split(".");
    const left = parts[0].replace(DEFAULT_DELIMITER_REGEX, `$1${delimiter}`);
    const right = parts[1];
    if (right !== undefined) {
      return `${left}${separator}${right}`;
    }
    return left;
  }
}
