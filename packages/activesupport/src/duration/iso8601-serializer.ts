import type { Duration, DurationParts } from "../duration.js";
import { SECONDS_PER_DAY, SECONDS_PER_WEEK } from "../duration.js";
import { isEmpty } from "../ruby-empty.js";

const DATE_COMPONENTS: (keyof DurationParts)[] = ["years", "months", "days"];

/**
 * Serializes duration to string according to ISO 8601 Duration format.
 *
 * Mirrors: ActiveSupport::Duration::ISO8601Serializer
 * (duration/iso8601_serializer.rb:6-63).
 */
export class ISO8601Serializer {
  private duration: Duration;
  private precision: number | null;

  /** Mirrors: `initialize(duration, precision: nil)` (:9-12). */
  constructor(duration: Duration, { precision = null }: { precision?: number | null } = {}) {
    this.duration = duration;
    this.precision = precision;
  }

  /** Builds and returns output string (:15-32). */
  serialize(): string {
    const parts = this.normalize();
    if (isEmpty(parts)) return "PT0S";

    let output = "P";
    if ("years" in parts) output += `${parts.years}Y`;
    if ("months" in parts) output += `${parts.months}M`;
    if ("days" in parts) output += `${parts.days}D`;
    if ("weeks" in parts) output += `${parts.weeks}W`;
    let time = "";
    if ("hours" in parts) time += `${parts.hours}H`;
    if ("minutes" in parts) time += `${parts.minutes}M`;
    if ("seconds" in parts) {
      time += `${this.formatSeconds(parts.seconds as number)}S`;
    }
    if (time !== "") output += `T${time}`;
    return output;
  }

  /**
   * Return pair of duration's parts and whole duration sign (:35-47).
   * Parts are summarized (as they can become repetitive due to addition, etc).
   * Zero parts are removed as not significant.
   *
   * Rails reads `@duration.parts`, the dup of the sparse `@parts` hash;
   * trails' `parts` field is a total record, so the sparse dup is `_parts()`
   * (duration.ts:450).
   *
   * @missingRailsCall new — PERMANENT: Rails accumulates into a `Hash.new(0)`
   * (iso8601_serializer.rb:38) so a missing key reads as 0; a JS object has no
   * default-value constructor, so the default is applied at the accumulating
   * read instead.
   */
  private normalize(): Partial<DurationParts> {
    const parts: Partial<DurationParts> = {};
    for (const [k, v] of Object.entries(this.duration._parts()) as [
      keyof DurationParts,
      number,
    ][]) {
      if (v !== 0) parts[k] = (parts[k] ?? 0) + v;
    }

    // Convert weeks to days and remove weeks if mixed with date parts
    if (this.isWeekMixedWithDate(parts)) {
      const weeks = parts.weeks as number;
      delete parts.weeks;
      parts.days = (parts.days ?? 0) + (weeks * SECONDS_PER_WEEK) / SECONDS_PER_DAY;
    }

    return parts;
  }

  private isWeekMixedWithDate(parts: Partial<DurationParts>): boolean {
    return "weeks" in parts && DATE_COMPONENTS.some((component) => component in parts);
  }

  private formatSeconds(seconds: number): string {
    if (this.precision != null) {
      return seconds.toFixed(this.precision);
    } else {
      return String(seconds);
    }
  }
}
