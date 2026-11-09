export class TimezoneOffset {
  readonly baseUtcOffset: number;
  readonly stdOffset: number;
  readonly abbreviation: string;

  constructor(baseUtcOffset: number, stdOffset: number, abbreviation: string) {
    this.baseUtcOffset = baseUtcOffset;
    this.stdOffset = stdOffset;
    this.abbreviation = abbreviation;
  }

  get observedUtcOffset(): number {
    return this.baseUtcOffset + this.stdOffset;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof TimezoneOffset &&
      other.baseUtcOffset === this.baseUtcOffset &&
      other.stdOffset === this.stdOffset &&
      other.abbreviation === this.abbreviation
    );
  }
}
