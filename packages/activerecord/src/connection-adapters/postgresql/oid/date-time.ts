/**
 * PostgreSQL datetime OID type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::DateTime.
 * Rails: `class DateTime < Type::DateTime`. Overrides cast_value to
 * handle PG's "infinity" / "-infinity" / " BC" strings, and
 * type_cast_for_schema so infinity sentinels render as
 * `::Float::INFINITY` in schema dumps. Exposes a protected
 * `real_type_unless_aliased(real_type)` hook that Timestamp /
 * TimestampWithTimeZone use to report :datetime when the adapter's
 * datetime_type is aliased.
 */

import { DateTimeType } from "@blazetrails/activemodel";

export class DateTime extends DateTimeType {
  override readonly name: string = "datetime";

  /**
   * See OID::Date for the Float::INFINITY return-type tradeoff — same
   * escape hatch applies here.
   */
  override cast(value: unknown): globalThis.Date | null {
    return this.castValue(value);
  }

  /**
   * Rails' `cast_value` — public here so subclasses can call directly
   * and api:compare matches the Rails method name.
   */
  castValue(value: unknown): globalThis.Date | null {
    if (typeof value === "string") {
      if (value === "infinity") return Infinity as unknown as globalThis.Date;
      if (value === "-infinity") return -Infinity as unknown as globalThis.Date;
      if (/ BC$/.test(value)) {
        // Accept: "YYYY-MM-DD BC" or "YYYY-MM-DD HH:MM:SS[.f] BC".
        // Reject anything with a timezone suffix (e.g. "+02", "-05:30")
        // on a BC timestamp — that's rare in PG output and supporting
        // it correctly requires offset arithmetic we haven't needed yet.
        const match =
          /^(\d+)-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}):(\d{1,2}(?:\.\d+)?))?(?:\s+BC)$/.exec(
            value,
          );
        if (!match) return null;
        const year = -Number.parseInt(match[1], 10) + 1;
        const month = Number.parseInt(match[2], 10) - 1;
        const day = Number.parseInt(match[3], 10);
        const hour = match[4] ? Number.parseInt(match[4], 10) : 0;
        const minute = match[5] ? Number.parseInt(match[5], 10) : 0;
        const second = match[6] ? Number.parseFloat(match[6]) : 0;
        // Reject out-of-range components — setUTC* silently normalises
        // (month 13, day 32, second 60) and would produce valid Dates
        // for malformed input.
        if (
          month < 0 ||
          month > 11 ||
          day < 1 ||
          day > 31 ||
          hour < 0 ||
          hour > 23 ||
          minute < 0 ||
          minute > 59 ||
          second < 0 ||
          second >= 60
        ) {
          return null;
        }
        let wholeSeconds = Math.floor(second);
        // Math.round avoids off-by-1ms drift from floating-point
        // multiplication (e.g. 0.289 * 1000 = 288.999…). Round can
        // also yield 1000 for inputs like 59.999999 — handle that
        // carry explicitly rather than letting setUTCHours roll the
        // timestamp forward.
        let ms = Math.round((second - wholeSeconds) * 1000);
        if (ms === 1000) {
          ms = 0;
          wholeSeconds += 1;
          if (wholeSeconds >= 60) return null;
        }
        const d = new globalThis.Date(0);
        d.setUTCFullYear(year, month, day);
        d.setUTCHours(hour, minute, wholeSeconds, ms);
        // Guard against roll-over from Feb 31 etc. even after the
        // upper-bound check (valid high day for wrong month).
        if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) {
          return null;
        }
        return d;
      }
    }
    return super.cast(value);
  }

  override typeCastForSchema(value: unknown): string {
    if (value === Infinity) return "::Float::INFINITY";
    if (value === -Infinity) return "-::Float::INFINITY";
    return super.typeCastForSchema(value);
  }

  /**
   * Rails' `real_type_unless_aliased` — Timestamp / TimestampWithTimeZone
   * call this to return `:datetime` when the adapter's datetime_type
   * matches `real_type`, else `real_type` itself. We don't yet have a
   * per-adapter datetime_type setting so always return the real type,
   * matching Rails' default when nothing is aliased.
   */
  protected realTypeUnlessAliased(realType: string): string {
    return realType;
  }
}
