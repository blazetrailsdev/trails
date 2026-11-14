import type { StringDeduper } from "../string-deduper.js";

type Deduper = Pick<StringDeduper, "dedupe">;

/** @internal */
export class TimezoneIndexDefiner {
  readonly dataTimezones: string[];

  readonly linkedTimezones: string[];

  /** @internal */
  private readonly stringDeduper: Deduper;

  constructor(stringDeduper: Deduper) {
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
