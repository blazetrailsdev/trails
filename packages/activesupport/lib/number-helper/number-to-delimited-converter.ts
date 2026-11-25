import { fetch } from "@blazetrails/ruby-compat/hash";
import { NumberConverter } from "./number-converter.js";
import type { NumberWithDelimiterOptions } from "../number-helper.js";

export class NumberToDelimitedConverter extends NumberConverter<NumberWithDelimiterOptions> {
  static DEFAULT_DELIMITER_REGEX = /(\d)(?=(\d\d\d)+(?!\d))/g;

  static {
    this.validateFloat = true;
  }

  protected convert(): string {
    return this.parts().join(this.options.separator as string);
  }

  /** @missingRailsCall times — PERMANENT */
  private parts(): string[] {
    const parts = String(this.number).split(".");
    let left = parts[0];
    const right = parts[1];
    if (this.delimiterPattern() != null) {
      left = left.replace(
        this.delimiterPattern()!,
        (digitToDelimit) => `${digitToDelimit}${this.options.delimiter}`,
      );
    } else {
      const leftParts: string[] = [];
      const offset = left.length % 3;
      if (offset > 0) {
        leftParts.push(left.slice(0, offset));
      }

      for (let i = 0; i < Math.floor(left.length / 3); i++) {
        leftParts.push(left.slice(offset + i * 3, offset + i * 3 + 3));
      }

      left = leftParts.join(this.options.delimiter as string);
    }

    return [left, right].filter((x) => x != null);
  }

  private delimiterPattern(): RegExp | null {
    const pattern = fetch<RegExp | null>(
      this.options,
      "delimiterPattern",
      NumberToDelimitedConverter.DEFAULT_DELIMITER_REGEX,
    );
    if (pattern == null) return pattern;
    return pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  }
}
