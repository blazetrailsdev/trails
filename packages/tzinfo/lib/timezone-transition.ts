import { rbHash } from "@blazetrails/ruby-compat";
import { Timestamp } from "./timestamp.js";
import type { TimezoneOffset } from "./timezone-offset.js";

export class TimezoneTransition {
  readonly offset: TimezoneOffset;

  readonly previousOffset: TimezoneOffset;

  readonly timestampValue: number;

  constructor(offset: TimezoneOffset, previousOffset: TimezoneOffset, timestampValue: number) {
    this.offset = offset;
    this.previousOffset = previousOffset;
    this.timestampValue = timestampValue;
  }

  at(): Timestamp {
    return Timestamp.utc(this.timestampValue);
  }

  equals(tti: unknown): boolean {
    return (
      tti instanceof TimezoneTransition &&
      this.offset.equals(tti.offset) &&
      this.previousOffset.equals(tti.previousOffset) &&
      this.timestampValue === tti.timestampValue
    );
  }

  eql(other: unknown): boolean {
    return this.equals(other);
  }

  hash(): number {
    return rbHash([this.offset, this.previousOffset, this.timestampValue]);
  }
}
