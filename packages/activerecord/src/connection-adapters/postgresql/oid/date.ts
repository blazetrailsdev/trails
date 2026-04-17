/**
 * PostgreSQL date OID type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Date.
 * Rails: `class Date < Type::Date`. Overrides cast_value to handle
 * PG-specific string forms ("infinity" / "-infinity" / "… BC" for BCE
 * dates) and type_cast_for_schema so those sentinels render as
 * `::Float::INFINITY` / `-::Float::INFINITY` in schema dumps.
 */

import { DateType } from "@blazetrails/activemodel";

export class Date extends DateType {
  override readonly name: string = "date";

  /**
   * Rails' cast_value handles:
   *   "infinity"         → Float::INFINITY
   *   "-infinity"        → -Float::INFINITY
   *   "0001-01-01 BC"    → date with a biased (Rails-style) year
   *   everything else    → super (standard date parse)
   *
   * Rails returns Float::INFINITY from a Date type, which is dynamic
   * Ruby. The TS signature is `Date | null`; the infinity sentinels
   * are cast through `as unknown as Date` so callers that accept
   * Rails' range-bound semantics still receive them. Check with
   * `Number.isFinite` or `typeof === 'number'` before treating as a
   * real Date.
   */
  override cast(value: unknown): globalThis.Date | null {
    return this.castValue(value);
  }

  /**
   * Rails' `cast_value` — the protected hook cast delegates to. Kept
   * public here so subclasses (and tests) can call it directly, and so
   * api:compare finds the method name that matches Rails.
   */
  castValue(value: unknown): globalThis.Date | null {
    if (typeof value === "string") {
      if (value === "infinity") return Infinity as unknown as globalThis.Date;
      if (value === "-infinity") return -Infinity as unknown as globalThis.Date;
      if (/ BC$/.test(value)) {
        // Rails' cast_value rewrites "0044-03-15 BC" → "-0043-03-15"
        // (year mapped as -year+1). JS's Date parser doesn't accept
        // 4-digit negative years, so construct the Date manually.
        const match = /^(\d+)-(\d{1,2})-(\d{1,2})/.exec(value);
        if (!match) return null;
        const year = -Number.parseInt(match[1], 10) + 1;
        const month = Number.parseInt(match[2], 10) - 1;
        const day = Number.parseInt(match[3], 10);
        // Reject out-of-range components — setUTCFullYear silently
        // normalises (month 13 → January of next year, day 32 → next
        // month) which would turn malformed input into a valid Date.
        if (month < 0 || month > 11 || day < 1 || day > 31) return null;
        const d = new globalThis.Date(0);
        d.setUTCFullYear(year, month, day);
        d.setUTCHours(0, 0, 0, 0);
        // Verify the constructed date matches the requested components;
        // setUTCFullYear would have rolled over for e.g. Feb 31.
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
}
