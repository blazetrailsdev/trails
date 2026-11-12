import { rbHash, rbModName } from "@blazetrails/ruby-compat";

export class TimezoneOffset {
  readonly baseUtcOffset: number;

  get utcOffset(): number {
    return this.baseUtcOffset;
  }

  readonly stdOffset: number;

  readonly observedUtcOffset: number;

  get utcTotalOffset(): number {
    return this.observedUtcOffset;
  }

  readonly abbreviation: string;

  get abbr(): string {
    return this.abbreviation;
  }

  constructor(baseUtcOffset: number, stdOffset: number, abbreviation: string) {
    this.baseUtcOffset = baseUtcOffset;
    this.stdOffset = stdOffset;
    this.abbreviation = abbreviation;

    this.observedUtcOffset = this.baseUtcOffset + this.stdOffset;
  }

  isDst(): boolean {
    return this.stdOffset !== 0;
  }

  equals(toi: unknown): boolean {
    return (
      toi instanceof TimezoneOffset &&
      this.baseUtcOffset === toi.baseUtcOffset &&
      this.stdOffset === toi.stdOffset &&
      this.abbreviation === toi.abbreviation
    );
  }

  eql(toi: unknown): boolean {
    return this.equals(toi);
  }

  hash(): number {
    return rbHash([this.baseUtcOffset, this.stdOffset, this.abbreviation]);
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)}: @base_utc_offset=${this.baseUtcOffset}, @std_offset=${this.stdOffset}, @abbreviation=${this.abbreviation}>`;
  }
}
