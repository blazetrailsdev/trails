import { fetch } from "@blazetrails/ruby-compat";
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

  private delimiterPattern(): RegExp {
    const pattern = fetch<RegExp>(
      this.options,
      "delimiterPattern",
      NumberToDelimitedConverter.DEFAULT_DELIMITER_REGEX,
    );
    return pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  }
}
