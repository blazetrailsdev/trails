import { ArgumentError } from "@blazetrails/ruby-compat";
import type { StringDeduper } from "../string-deduper.js";
import { TimezoneOffset } from "../timezone-offset.js";
import { TimezoneTransition } from "../timezone-transition.js";

type Deduper = Pick<StringDeduper, "dedupe">;

/** @internal */
export class TimezoneDefiner {
  readonly transitions: TimezoneTransition[];

  /** @internal */
  private readonly stringDeduper: Deduper;

  /** @internal */
  private readonly offsets: Record<string, TimezoneOffset>;

  /** @internal */
  private previousOffset: TimezoneOffset | null = null;

  constructor(stringDeduper: Deduper) {
    this.stringDeduper = stringDeduper;
    this.offsets = {};
    this.transitions = [];
  }

  firstOffset(): TimezoneOffset | null {
    const first = Object.entries(this.offsets)[0];
    return first ? first[1] : null;
  }

  offset(id: string, baseUtcOffset: number, stdOffset: number, abbreviation: string): void {
    if (Object.hasOwn(this.offsets, id)) {
      throw new ArgumentError("An offset has already been defined with the given id");
    }

    abbreviation = this.stringDeduper.dedupe(abbreviation);

    const offset = new TimezoneOffset(baseUtcOffset, stdOffset, abbreviation);
    this.offsets[id] = offset;
    this.previousOffset ??= offset;
  }

  transition(offsetId: string, timestampValue: number): void {
    const offset = Object.hasOwn(this.offsets, offsetId) ? this.offsets[offsetId] : null;
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
