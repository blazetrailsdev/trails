import { ArgumentError, NotImplementedError } from "@blazetrails/ruby-compat";
import type { Timestamp } from "./timestamp.js";
import type { TimezoneOffset } from "./timezone-offset.js";
import type { TimezoneTransition } from "./timezone-transition.js";

export class TimezonePeriod {
  readonly offset: TimezoneOffset;

  constructor(offset: TimezoneOffset | null) {
    if (!offset) throw new ArgumentError("offset must be specified");
    this.offset = offset;
  }

  /** @missingRailsCall raise_not_implemented — CONVERGEABLE tzinfo-offset-transition-and-periods */
  get startTransition(): TimezoneTransition | null {
    return this.raiseNotImplemented("start_transition");
  }

  /** @missingRailsCall raise_not_implemented — CONVERGEABLE tzinfo-offset-transition-and-periods */
  get endTransition(): TimezoneTransition | null {
    return this.raiseNotImplemented("end_transition");
  }

  get baseUtcOffset(): number {
    return this.offset.baseUtcOffset;
  }

  get utcOffset(): number {
    return this.baseUtcOffset;
  }

  get stdOffset(): number {
    return this.offset.stdOffset;
  }

  get abbreviation(): string {
    return this.offset.abbreviation;
  }

  get abbr(): string {
    return this.abbreviation;
  }

  get zoneIdentifier(): string {
    return this.abbreviation;
  }

  get observedUtcOffset(): number {
    return this.offset.observedUtcOffset;
  }

  get utcTotalOffset(): number {
    return this.observedUtcOffset;
  }

  isDst(): boolean {
    return this.offset.isDst();
  }

  startsAt(): Timestamp | null {
    return this.timestamp(this.startTransition);
  }

  endsAt(): Timestamp | null {
    return this.timestamp(this.endTransition);
  }

  /** @internal */
  private raiseNotImplemented(methodName: string): never {
    throw new NotImplementedError(`Subclasses must override ${methodName}`);
  }

  /** @internal */
  private timestamp(transition: TimezoneTransition | null): Timestamp | null {
    return transition ? transition.at() : null;
  }
}
