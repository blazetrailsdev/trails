import { NumberConverter } from "./number-converter.js";
import type { NumberToPhoneOptions } from "../number-helper.js";

export class NumberToPhoneConverter extends NumberConverter<NumberToPhoneOptions> {
  protected convert(): string {
    const { areaCode = false, extension, countryCode } = this.opts;
    let str = this.countryCode(countryCode);
    str += this.convertToPhoneNumber(String(this.number).replace(/\D/g, ""));
    str += this.phoneExt(extension);
    return str;
  }

  private get delimiter(): string {
    return this.opts.delimiter ?? "-";
  }

  private convertToPhoneNumber(number: string): string {
    if (this.opts.areaCode) {
      return this.convertWithAreaCode(number);
    }
    return this.convertWithoutAreaCode(number);
  }

  private convertWithAreaCode(number: string): string {
    const match = number.match(/(\d{1,3})(\d{3})(\d{4}$)/);
    if (match) {
      return `(${match[1]}) ${match[2]}${this.delimiter}${match[3]}`;
    }
    return this.convertWithoutAreaCode(number);
  }

  private convertWithoutAreaCode(number: string): string {
    const match = number.match(/(\d{0,3})(\d{3})(\d{4})$/);
    if (match) {
      let result = `${match[1]}${this.delimiter}${match[2]}${this.delimiter}${match[3]}`;
      if (this.delimiter && result.startsWith(this.delimiter)) {
        result = result.slice(this.delimiter.length);
      }
      return result;
    }
    return number;
  }

  private countryCode(code: string | number | undefined): string {
    if (code === undefined || code === null || code === "") return "";
    return `+${code}${this.delimiter}`;
  }

  private phoneExt(ext: string | number | undefined): string {
    if (ext === undefined || ext === null || ext === "") return "";
    return ` x ${ext}`;
  }
}
