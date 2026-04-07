/**
 * PostgreSQL interval type — represents a time duration.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Interval
 */

import { Duration } from "@blazetrails/activesupport";

export interface IntervalValue {
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export class Interval {
  get type(): string {
    return "interval";
  }

  cast(value: unknown): IntervalValue | null {
    if (value == null) return null;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as IntervalValue;
    }
    if (typeof value === "string") {
      if (value === "") return null;
      return this.parseInterval(value);
    }
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Duration) {
      return value.iso8601();
    }
    if (typeof value === "number") {
      return Duration.build(value).iso8601();
    }
    if (typeof value === "string") return value;
    if (typeof value === "object" && value !== null) {
      const v = value as IntervalValue;
      const parts: string[] = [];
      if (v.years) parts.push(`${v.years} years`);
      if (v.months) parts.push(`${v.months} months`);
      if (v.days) parts.push(`${v.days} days`);
      if (v.hours || v.minutes || v.seconds) {
        const h = String(v.hours ?? 0).padStart(2, "0");
        const m = String(v.minutes ?? 0).padStart(2, "0");
        const s = String(v.seconds ?? 0).padStart(2, "0");
        parts.push(`${h}:${m}:${s}`);
      }
      return parts.join(" ") || "00:00:00";
    }
    return null;
  }

  deserialize(value: unknown): IntervalValue | null {
    return this.cast(value);
  }

  private parseInterval(str: string): IntervalValue {
    const result: IntervalValue = {};

    const yearMatch = str.match(/(-?\d+)\s*years?/i);
    if (yearMatch) result.years = parseInt(yearMatch[1]);

    const monthMatch = str.match(/(-?\d+)\s*mons?(?:ths?)?/i);
    if (monthMatch) result.months = parseInt(monthMatch[1]);

    const dayMatch = str.match(/(-?\d+)\s*days?/i);
    if (dayMatch) result.days = parseInt(dayMatch[1]);

    const timeMatch = str.match(/(-?\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (timeMatch) {
      result.hours = parseInt(timeMatch[1]);
      result.minutes = parseInt(timeMatch[2]);
      result.seconds = parseFloat(timeMatch[3]);
    }

    return result;
  }
}
