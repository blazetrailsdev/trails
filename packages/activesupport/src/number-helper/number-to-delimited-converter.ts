import { NumberConverter } from "./number-converter.js";
import type { NumberWithDelimiterOptions } from "../number-helper.js";

export class NumberToDelimitedConverter extends NumberConverter<NumberWithDelimiterOptions> {
  static DEFAULT_DELIMITER_REGEX = /(\d)(?=(\d\d\d)+(?!\d))/g;

  protected get validateFloat(): boolean {
    return true;
  }

  protected convert(): string {
    return this.parts().join(this.options.separator as string);
  }

  private parts(): string[] {
    const [left, right] = String(this.number).split(".");
    const delimited = left.replace(
      this.delimiterPattern(),
      (digitToDelimit) => `${digitToDelimit}${this.options.delimiter}`,
    );
    return right === undefined ? [delimited] : [delimited, right];
  }

  /**
   * @missingRailsCall fetch — Hash#fetch; a JS object has no `fetch`, and the
   * `in` test is what distinguishes a stored `undefined` from an absent key.
   */
  private delimiterPattern(): RegExp {
    if (!("delimiterPattern" in this.options)) {
      return NumberToDelimitedConverter.DEFAULT_DELIMITER_REGEX;
    }
    const pattern = this.options.delimiterPattern as RegExp;
    return pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  }
}
