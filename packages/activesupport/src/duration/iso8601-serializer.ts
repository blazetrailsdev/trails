import type { Duration, DurationParts } from "../duration.js";
import { SECONDS_PER_DAY, SECONDS_PER_WEEK } from "../duration.js";
import { isEmpty } from "@blazetrails/ruby-compat";

const DATE_COMPONENTS: (keyof DurationParts)[] = ["years", "months", "days"];

export class ISO8601Serializer {
  private duration: Duration;
  private precision: number | null;

  constructor(duration: Duration, { precision = null }: { precision?: number | null } = {}) {
    this.duration = duration;
    this.precision = precision;
  }

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

  /** @missingRailsCall new — PERMANENT */
  private normalize(): Partial<DurationParts> {
    const parts: Partial<DurationParts> = {};
    for (const [k, v] of Object.entries(this.duration._parts()) as [
      keyof DurationParts,
      number,
    ][]) {
      if (v !== 0) parts[k] = (parts[k] ?? 0) + v;
    }

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
