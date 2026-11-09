import { TimezoneOffset } from "./timezone-offset.js";
import type { TimezoneTransition } from "./timezone-transition.js";

/** @noRailsEquivalent PERMANENT */
export class TimezonePeriod {
  readonly abbreviation: string;
  readonly observedUtcOffset: number;
  readonly baseUtcOffset: number;
  private readonly _dst: boolean;

  constructor(
    abbreviation: string,
    observedUtcOffset: number,
    dst: boolean,
    baseUtcOffset = observedUtcOffset,
    transitions: () => (TimezoneTransition | null)[] = () => [null, null],
  ) {
    this.abbreviation = abbreviation;
    this.observedUtcOffset = observedUtcOffset;
    this.baseUtcOffset = baseUtcOffset;
    this._dst = dst;
    this.#transitions = transitions;
  }

  #transitions: (() => (TimezoneTransition | null)[]) | (TimezoneTransition | null)[];

  #boundaries(): (TimezoneTransition | null)[] {
    if (typeof this.#transitions === "function") this.#transitions = this.#transitions();
    return this.#transitions;
  }

  get startTransition(): TimezoneTransition | null {
    return this.#boundaries()[0];
  }

  get endTransition(): TimezoneTransition | null {
    return this.#boundaries()[1];
  }

  get offset(): TimezoneOffset {
    return new TimezoneOffset(this.baseUtcOffset, this.stdOffset, this.abbreviation);
  }

  get abbr(): string {
    return this.abbreviation;
  }

  get utcOffset(): number {
    return this.baseUtcOffset;
  }

  get stdOffset(): number {
    return this.observedUtcOffset - this.baseUtcOffset;
  }

  get utcTotalOffset(): number {
    return this.observedUtcOffset;
  }

  isDst(): boolean {
    return this._dst;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof TimezonePeriod)) return false;
    if (this.startTransition === null && this.endTransition === null) {
      return (
        other.startTransition === null &&
        other.endTransition === null &&
        other.offset.equals(this.offset)
      );
    }
    return (
      (other.startTransition?.equals(this.startTransition) ?? this.startTransition === null) &&
      (other.endTransition?.equals(this.endTransition) ?? this.endTransition === null)
    );
  }
}
