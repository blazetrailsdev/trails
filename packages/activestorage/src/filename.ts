import { from } from "@blazetrails/activesupport";
import {
  equals as cmpEquals,
  File,
  rbObjAsString,
  scrub,
  strip,
  type Comparable,
} from "@blazetrails/ruby-compat";

export class Filename implements Comparable {
  private filename: string;

  static wrap(filename: Filename | string): Filename {
    return filename instanceof this ? filename : new this(filename);
  }

  constructor(filename: string) {
    this.filename = filename;
  }

  base(): string {
    return File.basename(this.filename, this.extensionWithDelimiter());
  }

  extensionWithDelimiter(): string {
    return File.extname(this.filename);
  }

  extensionWithoutDelimiter(): string {
    return from(this.extensionWithDelimiter(), 1).toString();
  }

  extension(): string {
    return this.extensionWithoutDelimiter();
  }

  sanitized(): string {
    return strip(scrub(this.filename, "\uFFFD")).replace(/[\u202E%$|:;/<>?*"\t\r\n\\]/g, "-");
  }

  toString(): string {
    return this.sanitized().toString();
  }

  asJson(): string {
    return this.toString();
  }

  toJSON(): string {
    return this.asJson();
  }

  /** @noRailsEquivalent PERMANENT */
  compareTo(other: unknown): number | null {
    const a = this.toString().toLowerCase();
    const b = rbObjAsString(other).toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  }

  equals(other: unknown): boolean {
    return cmpEquals.call(this, other);
  }
}
