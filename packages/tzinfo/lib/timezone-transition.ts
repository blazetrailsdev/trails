import { TimezoneOffset } from "./timezone-offset.js";

/** @noRailsEquivalent PERMANENT */
export class TimezoneTransition {
  readonly offset: TimezoneOffset;
  readonly previousOffset: TimezoneOffset;
  readonly timestampValue: number;

  constructor(offset: TimezoneOffset, previousOffset: TimezoneOffset, timestampValue: number) {
    this.offset = offset;
    this.previousOffset = previousOffset;
    this.timestampValue = timestampValue;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof TimezoneTransition &&
      other.offset.equals(this.offset) &&
      other.previousOffset.equals(this.previousOffset) &&
      other.timestampValue === this.timestampValue
    );
  }
}
