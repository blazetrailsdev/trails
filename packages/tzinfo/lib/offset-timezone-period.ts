import { TimezonePeriod } from "./timezone-period.js";
import type { TimezoneOffset } from "./timezone-offset.js";
import type { TimezoneTransition } from "./timezone-transition.js";

export class OffsetTimezonePeriod extends TimezonePeriod {
  constructor(offset: TimezoneOffset | null) {
    super(offset);
  }

  override get startTransition(): TimezoneTransition | null {
    return null;
  }

  override get endTransition(): TimezoneTransition | null {
    return null;
  }

  equals(p: unknown): boolean {
    return p instanceof OffsetTimezonePeriod && this.offset.equals(p.offset);
  }

  eql(other: unknown): boolean {
    return this.equals(other);
  }

  hash(): number {
    return this.offset.hash();
  }
}
