import type { StringDeduper } from "../string-deduper.js";

/** @internal */
export class TimezoneIndexDefiner {
  readonly dataTimezones: string[];

  readonly linkedTimezones: string[];

  /** @internal */
  private readonly stringDeduper: typeof StringDeduper.global;

  constructor(stringDeduper: typeof StringDeduper.global) {
    this.stringDeduper = stringDeduper;
    this.dataTimezones = [];
    this.linkedTimezones = [];
  }

  dataTimezone(identifier: string): void {
    this.dataTimezones.push(this.stringDeduper.dedupe(identifier));
  }

  linkedTimezone(identifier: string): void {
    this.linkedTimezones.push(this.stringDeduper.dedupe(identifier));
  }
}
