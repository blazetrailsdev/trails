import { ValueType } from "./value.js";

/** `YYYY-MM-DD` — Rails `ISO_DATE` (type/date.rb). */
const ISO_DATE = /^(\d{4})-(\d\d)-(\d\d)$/;

export class DateType extends ValueType<Date> {
  readonly name: string = "date";

  cast(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      if (value === "") return null;
      return this.fastStringToDate(value) ?? this.fallbackStringToDate(value);
    }
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Skip `Date.parse` for the ISO-8601 date fast case, matching Rails'
   * `type/date.rb#fast_string_to_date`.
   */
  protected fastStringToDate(value: string): Date | null {
    const m = ISO_DATE.exec(value);
    if (!m) return null;
    return this.newDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  /**
   * Parse dates that don't match the ISO fast path; mirrors
   * `type/date.rb#fallback_string_to_date` (which delegates to
   * `Date._parse`). We fall back to the JS `Date` constructor since
   * TS doesn't ship a locale-aware date parser.
   */
  protected fallbackStringToDate(value: string): Date | null {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Mirrors `type/date.rb#new_date`: rejects year 0 / missing year
   * rather than returning a bogus Date.
   */
  protected newDate(year: number, month: number, day: number): Date | null {
    if (!year || year === 0) return null;
    // `Date.UTC(y, ...)` interprets 0–99 as 1900–1999; use setUTCFullYear
    // so "0001-01-01" round-trips as literal year 1 instead of 1901.
    const d = new Date(Date.UTC(2000, month - 1, day));
    d.setUTCFullYear(year);
    if (isNaN(d.getTime())) return null;
    // Reject overflow — Date(UTC) silently normalizes month=13 into Jan
    // of the next year; Rails raises and we want `null` instead.
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return null;
    }
    return d;
  }

  serialize(value: unknown): Date | null {
    return this.cast(value);
  }

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    if (value instanceof Date) {
      return `"${value.toISOString().split("T")[0]}"`;
    }
    return JSON.stringify(value) ?? "null";
  }
}
