import { Temporal } from "@blazetrails/activesupport/temporal";
import { looseDateParse } from "./helpers/loose-date-parse.js";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { ValueType } from "./value.js";

export { DateInfinity, DateNegativeInfinity };
export type { DateInfinityType, DateNegativeInfinityType };

export type DateCastResult = Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType;

export class DateType extends ValueType<DateCastResult> {
  readonly name: string = "date";

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    const cast = this.cast(value);
    if (cast === null || cast === DateInfinity || cast === DateNegativeInfinity) return "null";
    return JSON.stringify(cast.toString());
  }

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): DateCastResult | null {
    if (value === DateInfinity) return DateInfinity;
    if (value === DateNegativeInfinity) return DateNegativeInfinity;
    if (value instanceof Temporal.PlainDate) return value;
    // Accept PlainDateTime from multiparameter assignment — extract the date part.
    if (value instanceof Temporal.PlainDateTime) return value.toPlainDate();
    // boundary: cast accepts Date input from legacy callers / custom types
    // and bridges into Temporal.PlainDate via the UTC calendar components.
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return Temporal.PlainDate.from({
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
      });
    }
    const str = String(value).trim();
    if (str === "") return null;
    return this.fastStringToDate(str) ?? this.fallbackStringToDate(str);
  }

  /**
   * Mirrors: ActiveModel::Type::Date#fast_string_to_date (date.rb:55-58).
   *
   *   ISO_DATE = /\A(\d{4})-(\d\d)-(\d\d)\z/
   *   def fast_string_to_date(string)
   *     if string =~ ISO_DATE
   *       new_date $1.to_i, $2.to_i, $3.to_i
   *     end
   *   end
   *
   * @internal Rails-private helper.
   */
  protected fastStringToDate(s: string): Temporal.PlainDate | null {
    if (s.includes("\n")) return null;
    const m = ISO_DATE.exec(s);
    if (!m) return null;
    return this.newDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  }

  /**
   * Mirrors: ActiveModel::Type::Date#fallback_string_to_date
   * (date.rb:60-67).
   *
   *   def fallback_string_to_date(string)
   *     parts = begin
   *       ::Date._parse(string, false)
   *     rescue ArgumentError
   *     end
   *     new_date(*parts.values_at(:year, :mon, :mday)) if parts
   *   end
   *
   * Trails mirrors `Date._parse` breadth via `looseDateParse`: layered
   * Temporal ISO parsing followed by regex coverage for US-slash, year-first
   * slash, month-name, and space-separated Postgres wire formats. Falls
   * through to `null` on parse failure, matching Rails' rescued path.
   *
   * @internal Rails-private helper.
   */
  protected fallbackStringToDate(s: string): Temporal.PlainDate | null {
    const parts = looseDateParse(s);
    if (!parts) return null;
    return this.newDate(parts.year, parts.month, parts.day);
  }

  /**
   * Mirrors: ActiveModel::Type::Date#new_date (date.rb:69-73).
   *
   *   def new_date(year, mon, mday)
   *     unless year.nil? || (year == 0 && mon == 0 && mday == 0)
   *       ::Date.new(year, mon, mday) rescue nil
   *     end
   *   end
   *
   * `0000-00-00` short-circuits to null per Rails. Out-of-range
   * components are caught and become null (matches `rescue nil`).
   *
   * @internal Rails-private helper.
   */
  protected newDate(
    year: number | null | undefined,
    mon: number | null | undefined,
    mday: number | null | undefined,
  ): Temporal.PlainDate | null {
    if (year == null || (year === 0 && mon === 0 && mday === 0)) return null;
    // Rails' ::Date.new(year, nil, nil) raises → rescue nil. Treat missing
    // month/day the same way rather than silently coercing to Jan 1.
    if (mon == null || mday == null) return null;
    try {
      return Temporal.PlainDate.from({ year, month: mon, day: mday }, { overflow: "reject" });
    } catch {
      return null;
    }
  }

  /**
   * Mirrors: ActiveModel::Type::Date#value_from_multiparameter_assignment
   * (date.rb:75-78).
   *
   *   def value_from_multiparameter_assignment(*)
   *     time = super
   *     time && new_date(time.year, time.mon, time.mday)
   *   end
   *
   * The Rails version delegates to `Helpers::AcceptsMultiparameterTime`
   * for the `Time` reconstruction, then narrows the result to a `::Date`.
   * Trails routes multiparameter casts through
   * `AcceptsMultiparameterTime`'s wrapper
   * (`helpers/accepts-multiparameter-time.ts`); this helper mirrors the
   * narrowing step so subclasses / consumers can call the Rails-named
   * hook directly with the `{ 1: year, 2: mon, 3: mday, ... }` form
   * pulled out of the multiparameter hash.
   *
   * @internal Rails-private helper.
   */
  protected valueFromMultiparameterAssignment(
    values: Record<number, number | null | undefined>,
  ): Temporal.PlainDate | null {
    return this.newDate(values[1], values[2], values[3]);
  }

  serialize(value: unknown): string | null {
    const cast = this.cast(value);
    // Sentinels are Postgres-specific; base type returns null. The Postgres
    // OID::Date subclass overrides serialize() to emit 'infinity'/'-infinity'.
    if (cast === null || cast === DateInfinity || cast === DateNegativeInfinity) return null;
    return cast.toString();
  }

  serializeCastValue(value: DateCastResult | null): string | null {
    return this.serialize(value);
  }
}

/** Mirrors: ActiveModel::Type::Date::ISO_DATE (date.rb:54). */
const ISO_DATE = /^(\d{4})-(\d\d)-(\d\d)$/;
