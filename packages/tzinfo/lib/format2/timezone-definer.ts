import { ArgumentError } from "@blazetrails/ruby-compat";
import type { StringDeduper } from "../string-deduper.js";
import { TimezoneOffset } from "../timezone-offset.js";
import { TimezoneTransition } from "../timezone-transition.js";

/** @internal */
export class TimezoneDefiner {
  readonly transitions: TimezoneTransition[];

  /** @internal */
  private readonly stringDeduper: typeof StringDeduper.global;

  /** @internal */
  private readonly offsets: Map<string, TimezoneOffset>;

  /** @internal */
  private previousOffset: TimezoneOffset | null = null;

  constructor(stringDeduper: typeof StringDeduper.global) {
    this.stringDeduper = stringDeduper;
    this.offsets = new Map();
    this.transitions = [];
  }

  firstOffset(): TimezoneOffset | null {
    const first = this.offsets.entries().next().value;
    return first ? first[1] : null;
  }

  offset(id: string, baseUtcOffset: number, stdOffset: number, abbreviation: string): void {
    if (this.offsets.has(id)) {
      throw new ArgumentError("An offset has already been defined with the given id");
    }

    abbreviation = this.stringDeduper.dedupe(abbreviation);

    const offset = new TimezoneOffset(baseUtcOffset, stdOffset, abbreviation);
    this.offsets.set(id, offset);
    this.previousOffset ??= offset;
  }

  transition(offsetId: string, timestampValue: number): void {
    const offset = this.offsets.get(offsetId);
    if (!offset) throw new ArgumentError("offset_id has not been defined");
    if (
      this.transitions.length !== 0 &&
      this.transitions.at(-1)!.timestampValue >= timestampValue
    ) {
      throw new ArgumentError(
        "timestamp is not greater than the timestamp of the previously defined transition",
      );
    }
    this.transitions.push(new TimezoneTransition(offset, this.previousOffset!, timestampValue));
    this.previousOffset = offset;
  }

  subsequentRules(..._args: unknown[]): null {
    return null;
  }
}
