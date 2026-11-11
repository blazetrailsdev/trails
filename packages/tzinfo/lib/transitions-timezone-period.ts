import { ArgumentError, rbEqual, rbHash, rbInspect, rbModName } from "@blazetrails/ruby-compat";
import { TimezonePeriod } from "./timezone-period.js";
import type { TimezoneTransition } from "./timezone-transition.js";

export class TransitionsTimezonePeriod extends TimezonePeriod {
  readonly #startTransition: TimezoneTransition | null;

  override get startTransition(): TimezoneTransition | null {
    return this.#startTransition;
  }

  readonly #endTransition: TimezoneTransition | null;

  override get endTransition(): TimezoneTransition | null {
    return this.#endTransition;
  }

  constructor(
    startTransition: TimezoneTransition | null,
    endTransition: TimezoneTransition | null,
  ) {
    if (startTransition) {
      super(startTransition.offset);
    } else if (endTransition) {
      super(endTransition.previousOffset);
    } else {
      throw new ArgumentError(
        "At least one of start_transition and end_transition must be specified",
      );
    }

    this.#startTransition = startTransition;
    this.#endTransition = endTransition;
  }

  equals(p: unknown): boolean {
    return (
      p instanceof TransitionsTimezonePeriod &&
      rbEqual(this.startTransition, p.startTransition) &&
      rbEqual(this.endTransition, p.endTransition)
    );
  }

  eql(other: unknown): boolean {
    return this.equals(other);
  }

  hash(): number {
    return rbHash([this.#startTransition, this.#endTransition]);
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)}: @start_transition=${rbInspect(this.#startTransition)}, @end_transition=${rbInspect(this.#endTransition)}>`;
  }
}
