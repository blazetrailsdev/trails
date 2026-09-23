import { fetch } from "@blazetrails/ruby-compat";
import { NumberConverter } from "./number-converter.js";
import type { NumberToPhoneOptions } from "../number-helper.js";
import { isBlank, isPresent } from "../core-ext/object/blank.js";

export class NumberToPhoneConverter extends NumberConverter<NumberToPhoneOptions> {
  /** @missingRailsName strip — PERMANENT */
  protected convert(): string {
    let str = this.countryCode(this.opts.countryCode);
    str += this.convertToPhoneNumber(String(this.number).trim());
    str += this.phoneExt(this.opts.extension);
    return str;
  }

  private convertToPhoneNumber(number: string): string {
    if (this.opts.areaCode) {
      return this.convertWithAreaCode(number);
    } else {
      return this.convertWithoutAreaCode(number);
    }
  }

  private convertWithAreaCode(number: string): string {
    const defaultPattern = /(\d{1,3})(\d{3})(\d{4}$)/;
    number = number.replace(
      new RegExp(this.regexpPattern(defaultPattern), "g"),
      `($1) $2${this.delimiter.replace(/\$/g, "$$$$")}$3`,
    );
    return number;
  }

  private convertWithoutAreaCode(number: string): string {
    const defaultPattern = /(\d{0,3})(\d{3})(\d{4})$/;
    number = number.replace(
      new RegExp(this.regexpPattern(defaultPattern), "g"),
      `$1${this.delimiter.replace(/\$/g, "$$$$")}$2${this.delimiter.replace(/\$/g, "$$$$")}$3`,
    );
    if (this.isStartWithDelimiter(number)) number = number.slice(1);
    return number;
  }

  private isStartWithDelimiter(number: string): boolean {
    return isPresent(this.delimiter) && number.startsWith(this.delimiter);
  }

  private get delimiter(): string {
    return this.opts.delimiter ?? "-";
  }

  private countryCode(code: string | number | undefined): string {
    return isBlank(code) ? "" : `+${code}${this.delimiter}`;
  }

  private phoneExt(ext: string | number | undefined): string {
    return isBlank(ext) ? "" : ` x ${ext}`;
  }

  private regexpPattern(defaultPattern: RegExp): RegExp {
    return fetch<RegExp>(this.opts as Record<string, unknown>, "pattern", defaultPattern);
  }
}
