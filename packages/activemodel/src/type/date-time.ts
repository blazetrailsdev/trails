import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Rational,
  Temporal,
  Time as RubyTime,
  type DateParts,
} from "@blazetrails/date";
import {
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { include, toS } from "@blazetrails/activesupport";
import { ArgumentError } from "../attribute-assignment.js";
import {
  AcceptsMultiparameterTime,
  type InstanceMethods,
} from "./helpers/accepts-multiparameter-time.js";
import { isUtc } from "./helpers/timezone.js";
import { applySecondsPrecision, fastStringToTime, newTime } from "./helpers/time-value.js";
import { ValueType } from "./value.js";

export type DateTimeCastResult = Temporal.Instant | DateInfinityType | DateNegativeInfinityType;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include` (date_time.rb:44-46); the class/interface merge is how `include()` surfaces on the type side.
export interface DateTimeType extends Omit<
  InstanceMethods<DateTimeCastResult>,
  "valueFromMultiparameterAssignment"
> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DateTimeType extends ValueType<DateTimeCastResult> {
  readonly name: string = "datetime";

  /** Mixed in from Helpers::TimeValue (time_value.rb:24-34). @internal Rails-private helper. */
  protected applySecondsPrecision = applySecondsPrecision;

  /** Mixed in from Helpers::TimeValue (time_value.rb:79-89). @internal Rails-private helper. */
  protected fastStringToTime = fastStringToTime;

  /** Mixed in from Helpers::TimeValue (time_value.rb:48-65). @internal Rails-private helper. */
  protected newTime = newTime;

  type(): string {
    return this.name;
  }

  /**
   * Mirrors: ActiveModel::Type::DateTime#cast_value (date_time.rb:54-59).
   *
   *   def cast_value(value)
   *     return apply_seconds_precision(value) unless value.is_a?(::String)
   *     return if value.empty?
   *
   *     fast_string_to_time(value) || fallback_string_to_time(value)
   *   end
   *
   * A JS `Date` and a `Temporal.PlainDateTime` are this platform's spellings
   * of Ruby's `::Time`, which Rails hands straight to
   * `apply_seconds_precision` — but that reads `nsec` off the receiver and
   * trails' cast result is the `Temporal.Instant` that carries it, so they are
   * anchored to one first, the zone-less `PlainDateTime` on the `is_utc?`
   * branch `new_time` puts a zone-less value on (time_value.rb:57-62).
   * Everything else — `DateInfinity` / `DateNegativeInfinity` included —
   * reaches `apply_seconds_precision`, which answers a receiver with no `nsec`
   * unchanged (time_value.rb:24-25).
   *
   * @internal Rails-private helper.
   */
  protected castValue(value: unknown): DateTimeCastResult | null {
    // boundary: a JS Date assigned to a datetime attribute is Ruby's ::Time.
    if (value instanceof Date) value = Temporal.Instant.fromEpochMilliseconds(value.getTime());
    if (value instanceof Temporal.PlainDateTime) {
      value = value.toZonedDateTime(this.isUtc ? "UTC" : Temporal.Now.timeZoneId()).toInstant();
    }
    if (typeof value !== "string")
      return this.applySecondsPrecision(value) as DateTimeCastResult | null;
    if (value === "") return null;

    return this.fastStringToTime(value) ?? this.fallbackStringToTime(value);
  }

  /**
   * Mirrors: ActiveModel::Type::DateTime#microseconds (date_time.rb:62-64).
   *
   *   # '0.123456' -> 123456
   *   # '1.123456' -> 123456
   *   def microseconds(time)
   *     time[:sec_fraction] ? (time[:sec_fraction] * 1_000_000).to_i : 0
   *   end
   *
   * Rails parses sub-second precision out of `Date._parse` results as
   * a `Rational` (e.g. `123456/1000000`); multiplying by 1_000_000
   * normalizes it to an integer microsecond count.
   *
   * Ruby's one line dispatches on the numeric tower and the two arms do not
   * agree — `(0.123456 * 1_000_000).to_i` is 123456, while the same Float
   * through `to_r` truncates to 123455. TS has no numeric receiver to
   * dispatch on, so the arms are spelled out: the Rational and Integer ones
   * multiply exactly, the Float one reproduces Ruby's float multiply.
   *
   * @internal Rails-private helper.
   */
  protected microseconds(time: DateParts): number {
    const secFraction = time.secFraction;
    if (secFraction == null) return 0;
    if (secFraction instanceof Rational) return secFraction.mul(1_000_000).toI();
    if (typeof secFraction === "bigint") return Number(secFraction * 1_000_000n);
    return Math.trunc(secFraction * 1_000_000);
  }

  /**
   * Mirrors: ActiveModel::Type::DateTime#fallback_string_to_time
   * (date_time.rb:66-75).
   *
   *   def fallback_string_to_time(string)
   *     time_hash = begin
   *       ::Date._parse(string)
   *     rescue ArgumentError
   *     end
   *     return unless time_hash
   *     time_hash[:sec_fraction] = microseconds(time_hash)
   *     new_time(*time_hash.values_at(:year, :mon, :mday, :hour, :min, :sec, :sec_fraction, :offset))
   *   end
   *
   * `::Date._parse` is the gem's own entry point, ported at
   * `packages/date/src/date.ts` from `date_parse.c` `date__parse`, and it is
   * where `:offset` comes from — `date_zone_to_diff`'s reading of the `:zone`
   * the string named. Ruby's `new_time` does `time -= offset` against the
   * Rational a fractional-hour zone (`+05:45`, `-00:44:30`) answers; the
   * ported `newTime`'s subtrahend is a number, so it is divided out here.
   *
   * @internal Rails-private helper.
   */
  protected fallbackStringToTime(s: string): Temporal.Instant | null {
    let timeHash: DateParts | undefined;
    try {
      timeHash = RubyDate._parse(s);
    } catch (error) {
      if (!(error instanceof RubyArgumentError)) throw error;
    }
    if (!timeHash) return null;

    timeHash.secFraction = this.microseconds(timeHash);

    return this.newTime(
      timeHash.year,
      timeHash.mon,
      timeHash.mday,
      timeHash.hour,
      timeHash.min,
      timeHash.sec,
      timeHash.secFraction,
      timeHash.offset,
    );
  }

  /**
   * Mirrors: ActiveModel::Type::DateTime#value_from_multiparameter_assignment
   * (date_time.rb:77-83).
   *
   *   def value_from_multiparameter_assignment(values_hash)
   *     missing_parameters = [1, 2, 3].delete_if { |key| values_hash.key?(key) }
   *     unless missing_parameters.empty?
   *       raise ArgumentError, "Provided hash #{values_hash} doesn't contain necessary keys: #{missing_parameters}"
   *     end
   *     super
   *   end
   *
   * Both `#{}` interpolations are Ruby `to_s`, which for a Hash and an Array
   * alike is `inspect` — `{:a=>1}` and `[1, 2, 3]`, not JSON. ActiveSupport's
   * `toS` is that function, and it reads a Symbol key off the leading colon
   * trails spells one with (CLAUDE.md), so `{ ":a": 1 }` renders the `{:a=>1}`
   * MRI 3.3 emits.
   *
   * `super` is `Helpers::AcceptsMultiparameterTime`'s `::Time` assembly, which
   * this class mixes in below itself (see the `include` at the bottom of this
   * file). Rails'
   * cast result for a Hash IS that `::Time`; `DateTimeCastResult` is the
   * `Temporal.Instant` this port spells a `::Time` as, so the instant is read
   * back off it.
   *
   * `super` is reached as Ruby's own `instance_method(...).bind_call(self, ...)`
   * does: TS types `super` against a declared base class only, never against a
   * mixed-in module.
   *
   * @internal Rails-private helper.
   */
  protected valueFromMultiparameterAssignment(
    values: Record<string | number, unknown>,
  ): DateTimeCastResult | null {
    const missing = [1, 2, 3].filter((k) => !Object.hasOwn(values, k));
    if (missing.length > 0) {
      throw new ArgumentError(
        `Provided hash ${toS(values)} doesn't contain necessary keys: ${toS(missing)}`,
      );
    }
    const time = (
      acceptsMultiparameterTime.instanceMethod("valueFromMultiparameterAssignment")!.value as (
        this: unknown,
        valuesHash: Record<string, unknown>,
      ) => RubyTime | null
    ).call(this, values as Record<string, unknown>);
    return time && time.toTime().toInstant();
  }

  get isUtc(): boolean {
    return isUtc();
  }

  /**
   * Mirrors: ActiveModel::Type::Value#changed? (value.rb:84-86) — `old_value !=
   * new_value`. Ruby's `!=` on a `::Time` is value equality; `!==` on a
   * `Temporal.Instant` is reference identity, so the receiver's own `equals`
   * stands in for it.
   */
  override isChanged(oldValue: unknown, newValue: unknown, _raw?: unknown): boolean {
    if (oldValue instanceof Temporal.Instant && newValue instanceof Temporal.Instant) {
      return !oldValue.equals(newValue);
    }
    return oldValue !== newValue;
  }

  /**
   * Mirrors: ActiveModel::Type::Helpers::TimeValue#serialize_cast_value
   * (time_value.rb:10-21) — its `apply_seconds_precision` half. The `is_utc?`
   * `getutc`/`getlocal` arm (`:12-19`) is not ported; that gap is tracked by
   * `serialize-cast-value-drops-is-utc-normalization`.
   */
  serializeCastValue(value: DateTimeCastResult | null): DateTimeCastResult | null {
    return this.applySecondsPrecision(value);
  }
}

/**
 * Mirrors: `include Helpers::AcceptsMultiparameterTime.new(defaults: { 4 => 0, 5 => 0 })`
 * (date_time.rb:44-46).
 */
const acceptsMultiparameterTime = new AcceptsMultiparameterTime({ defaults: { "4": 0, "5": 0 } });
include(DateTimeType, acceptsMultiparameterTime);
