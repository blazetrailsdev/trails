import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Temporal,
  Time as RubyTime,
  type DateParts,
} from "@blazetrails/date";
import { include } from "@blazetrails/activesupport";
import {
  AcceptsMultiparameterTime,
  type InstanceMethods,
} from "./helpers/accepts-multiparameter-time.js";
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

/** Mirrors: `include Helpers::AcceptsMultiparameterTime.new` (date.rb:28). */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include` (date.rb:28); the class/interface merge is how `include()` surfaces on the type side.
export interface DateType extends Omit<
  InstanceMethods<DateCastResult>,
  "valueFromMultiparameterAssignment"
> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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

  /**
   * Mirrors: ActiveModel::Type::Date#cast_value (date.rb:39-48).
   *
   *   def cast_value(value)
   *     if value.is_a?(::String)
   *       return if value.empty?
   *       fast_string_to_date(value) || fallback_string_to_date(value)
   *     elsif value.respond_to?(:to_date)
   *       value.to_date
   *     else
   *       value
   *     end
   *   end
   *
   * The `to_date` arm is spelled out per receiver, since TS has no
   * `respond_to?`: `Temporal.PlainDate` is already a `::Date` (`to_date` is
   * identity), while `Temporal.PlainDateTime` and a JS `Date` are the
   * platform's `::Time`, whose `to_date` drops the time of day. An invalid JS
   * `Date` has no calendar components to hand `::Date.new`, so it lands where
   * `new_date`'s `rescue nil` puts it (date.rb:68).
   *
   * `DateInfinity` / `DateNegativeInfinity` are `Float::INFINITY`, which
   * answers no `to_date` and so falls through the `else` arm untouched, as in
   * Rails.
   *
   * @internal Rails-private helper.
   */
  protected castValue(value: unknown): DateCastResult | null {
    if (typeof value === "string") {
      if (value === "") return null;
      return this.fastStringToDate(value) ?? this.fallbackStringToDate(value);
    } else if (value instanceof Temporal.PlainDate) {
      return value;
    } else if (value instanceof Temporal.PlainDateTime) {
      return value.toPlainDate();
      // boundary: a JS Date assigned to a date attribute is Ruby's ::Time.
    } else if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return Temporal.PlainDate.from({
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
      });
    } else {
      return value as DateCastResult;
    }
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
   * `::Date._parse` is the gem's own entry point, ported at
   * `packages/date/src/date.ts` from `date_parse.c` `date__parse`. `comp` is
   * `false`, so a two-digit year stays literal.
   *
   * @internal Rails-private helper.
   */
  protected fallbackStringToDate(s: string): Temporal.PlainDate | null {
    let parts: DateParts | undefined;
    try {
      parts = RubyDate._parse(s, false);
    } catch (error) {
      if (!(error instanceof RubyArgumentError)) throw error;
    }
    return parts ? this.newDate(parts.year, parts.mon, parts.mday) : null;
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
   * components are caught and become null (matches `rescue nil`) — including a
   * Bignum `:year`, which `Number` makes the `Infinity` Temporal rejects, as in
   * `newTime` (helpers/time-value.ts).
   *
   * @internal Rails-private helper.
   */
  protected newDate(
    year: number | bigint | null | undefined,
    mon: number | null | undefined,
    mday: number | null | undefined,
  ): Temporal.PlainDate | null {
    if (year == null || (year === 0 && mon === 0 && mday === 0)) return null;
    // Rails' ::Date.new(year, nil, nil) raises → rescue nil. Treat missing
    // month/day the same way rather than silently coercing to Jan 1.
    if (mon == null || mday == null) return null;
    try {
      return Temporal.PlainDate.from(
        { year: Number(year), month: mon, day: mday },
        { overflow: "reject" },
      );
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
   * `super` is `Helpers::AcceptsMultiparameterTime`'s `::Time` assembly, which
   * this class mixes in below itself (see the `include` at the bottom of this
   * file).
   *
   * @internal Rails-private helper.
   */
  protected valueFromMultiparameterAssignment(
    values: Record<number, unknown>,
  ): Temporal.PlainDate | null {
    // `super` — the mixin's own `value_from_multiparameter_assignment`, which
    // Ruby reaches by ancestry and TS types only for a declared base class, so
    // it is taken off the module as Ruby's own
    // `instance_method(...).bind_call(self, ...)` does.
    const time = (
      acceptsMultiparameterTime.instanceMethod("valueFromMultiparameterAssignment")!.value as (
        this: unknown,
        valuesHash: Record<string, unknown>,
      ) => RubyTime | null
    ).call(this, values as Record<string, unknown>);
    return time && this.newDate(time.year, time.mon, time.mday);
  }

  /**
   * Mirrors: ActiveModel::Type::Value#serialize (near-identity). `value_for_database`
   * returns the cast Temporal.PlainDate — NOT a SQL string; the adapter quotes it later.
   */
  // Return type is `unknown` (matching ActiveModel::Type::Value#serialize) so
  // adapter subclasses can widen it — e.g. PostgreSQL's OID::Date emits the
  // "infinity" wire string for the infinity sentinels.
  serialize(value: unknown): unknown {
    return this.cast(value);
  }

  serializeCastValue(value: DateCastResult | null): DateCastResult | null {
    return value;
  }
}

/** Mirrors: ActiveModel::Type::Date::ISO_DATE (date.rb:54). */
const ISO_DATE = /^(\d{4})-(\d\d)-(\d\d)$/;

/** Mirrors: `include Helpers::AcceptsMultiparameterTime.new` (date.rb:28). */
const acceptsMultiparameterTime = new AcceptsMultiparameterTime();
include(DateType, acceptsMultiparameterTime);
