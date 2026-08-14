import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Temporal,
  type DateParts,
} from "@blazetrails/date";
import { zone, isBlank } from "@blazetrails/activesupport";
import { AcceptsMultiparameterTime, isHash } from "./helpers/accepts-multiparameter-time.js";
import { isUtc } from "./helpers/timezone.js";
import { applySecondsPrecision, fastStringToTime, newTime } from "./helpers/time-value.js";
import { ValueType } from "./value.js";

/**
 * Mirrors: ActiveModel::Type::Time (time.rb).
 *
 * A time of day, which Rails answers as a `::Time` normalized to 2000-01-01 in
 * the UTC zone — `event.start = "00:01:02+03:00"` is `1999-12-31 21:01:02 UTC`
 * (time.rb:16-27), the date having rolled because the offset shifted the
 * instant. `Temporal.Instant` is the port's `::Time` (see `newTime`), so the
 * cast result carries that instant rather than a bare time of day.
 */
export class TimeType extends ValueType<Temporal.Instant> {
  readonly name = "time";

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
   * Mirrors: ActiveModel::Type::Time#user_input_in_time_zone (time.rb:47-63).
   *
   *   def user_input_in_time_zone(value)
   *     return unless value.present?
   *
   *     case value
   *     when ::String
   *       value = "2000-01-01 #{value}"
   *       time_hash = begin
   *         ::Date._parse(value)
   *       rescue ArgumentError
   *       end
   *
   *       return if time_hash.nil? || time_hash[:hour].nil?
   *     when ::Time
   *       value = value.change(year: 2000, day: 1, month: 1)
   *     end
   *
   *     super(value)
   *   end
   *
   * `super` is `Helpers::TimeValue#user_input_in_time_zone`, `value.in_time_zone`
   * (time_value.rb:44-46). The zone is the thread-local `Time.zone`, read here
   * through ActiveSupport's `zone()` the way `isUtc()` reads
   * `zoneDefault()`; with no zone set at all Ruby answers a bare `to_time`
   * (`date_and_time/zones.rb:20-27`), which is the zoneless
   * `Temporal.PlainDateTime` this returns in that arm, as the helper does.
   * `in_time_zone` is the tail below: the components
   * `cast_value` built are read back out of the `::Time` and re-anchored in
   * that zone, which is what `Time.zone.parse` of the dummy-dated string
   * answers.
   *
   * The `present?` guard is spelled out rather than routed through
   * `isBlank`: Ruby's `blank?` is `respond_to?(:empty?) ? !!empty? : !self`, so
   * a `::Time` is present, while `isBlank` reads any object with no own
   * enumerable keys as blank — which every Temporal value is.
   */
  userInputInTimeZone(value: unknown): Temporal.ZonedDateTime | Temporal.PlainDateTime | null {
    if (value == null || value === false) return null;
    if (typeof value === "string" && isBlank(value)) return null;

    if (typeof value === "string") {
      value = `2000-01-01 ${value}`;
      let timeHash: DateParts | undefined;
      try {
        timeHash = RubyDate._parse(value as string);
      } catch (error) {
        if (!(error instanceof RubyArgumentError)) throw error;
      }
      if (timeHash == null || timeHash.hour == null) return null;
    } else if (value instanceof Temporal.ZonedDateTime) {
      return value;
    } else if (value instanceof Temporal.Instant) {
      value = value
        .toZonedDateTimeISO(this.#zoneId())
        .with({ year: 2000, day: 1, month: 1 })
        .toInstant();
    }

    const cast = this.cast(value);
    if (cast === null) return null;
    const timeZone = zone();
    const time = cast.toZonedDateTimeISO(this.#zoneId()).toPlainDateTime();
    if (timeZone) return time.toZonedDateTime(timeZone.tzinfo);
    return time;
  }

  /**
   * Mirrors: ActiveModel::Type::Time#cast_value (time.rb:68-83).
   *
   *   def cast_value(value)
   *     return apply_seconds_precision(value) unless value.is_a?(::String)
   *     return if value.blank?
   *
   *     dummy_time_value = value.sub(/\A\d{4}-\d\d-\d\d(?:T|\s)|/, "2000-01-01 ")
   *
   *     fast_string_to_time(dummy_time_value) || begin
   *       time_hash = begin
   *         ::Date._parse(dummy_time_value)
   *       rescue ArgumentError
   *       end
   *
   *       return if time_hash.nil? || time_hash[:hour].nil?
   *       new_time(*time_hash.values_at(:year, :mon, :mday, :hour, :min, :sec, :sec_fraction, :offset))
   *     end
   *   end
   *
   * The `dummy_time_value` substitution's empty alternation makes the pattern
   * match at position 0 whatever the string, so a leading `YYYY-MM-DD`
   * separator is replaced and a time-only string is prefixed. `::Date._parse`
   * is the gem's own entry point, ported at `packages/date/src/date.ts`.
   *
   * Unlike `Type::DateTime#fallback_string_to_time` (date_time.rb:73), this
   * hands `new_time` the raw `:sec_fraction` — a Rational of a *second* — as
   * `Time.utc`'s *microsecond* argument, so a string's sub-second digits land
   * three orders of magnitude down: on ruby 3.3.11
   * `Type::Time.new.cast("14:23:55.123456").nsec` is `123`. `newTime` reads its
   * `microsec` the same way `Time.utc` does, so passing the fraction through
   * unchanged is what reproduces it.
   *
   * @internal Rails-private helper.
   */
  protected castValue(value: unknown): Temporal.Instant | null {
    if (typeof value !== "string") {
      if (value instanceof Temporal.PlainDateTime) {
        value = value.toZonedDateTime(this.#zoneId()).toInstant();
      }
      return this.applySecondsPrecision(value) as Temporal.Instant | null;
    }
    if (value.trim() === "") return null;

    const dummyTimeValue = value.replace(/^\d{4}-\d\d-\d\d(?:T|\s)|/, "2000-01-01 ");

    const fast = this.fastStringToTime(dummyTimeValue);
    if (fast) return fast;

    let timeHash: DateParts | undefined;
    try {
      timeHash = RubyDate._parse(dummyTimeValue);
    } catch (error) {
      if (!(error instanceof RubyArgumentError)) throw error;
    }
    if (timeHash == null || timeHash.hour == null) return null;

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

  /** Mixed in from Helpers::Timezone — `is_utc?` (timezone.rb:9-11). */
  get isUtc(): boolean {
    return isUtc();
  }

  /**
   * @internal The zone `is_utc?` picks between, which Rails spells inline at
   * each site as the choice of receiver — `Time.utc` vs `Time.local`
   * (time_value.rb:56-63), `Time.public_send(default_timezone, *values)`
   * (accepts_multiparameter_time.rb:23). Temporal names a zone by argument
   * rather than by constructor, so the branch needs a value;
   * `Temporal.Now.timeZoneId()` is the host zone `::Time.local` builds in.
   */
  #zoneId(): string {
    return this.isUtc ? "UTC" : Temporal.Now.timeZoneId();
  }

  /**
   * Mirrors: ActiveModel::Type::Value#serialize (near-identity). `value_for_database`
   * returns the cast Temporal.Instant — NOT a SQL string; the adapter quotes it later.
   */
  serialize(value: unknown): unknown {
    return this.serializeCastValue(this.cast(value));
  }

  // Mirrors ActiveModel::Type::Helpers::TimeValue#serialize_cast_value (apply_seconds_precision).
  serializeCastValue(value: Temporal.Instant | null): unknown {
    return value === null ? null : this.applySecondsPrecision(value);
  }

  /**
   * Mirrors: ActiveModel::Type::Time includes AcceptsMultiparameterTime.new(defaults: { 1 => 2000, 2 => 1, 3 => 1, 4 => 0, 5 => 0 }).
   * Rails' base date 2000-01-01 lets hour-only form inputs (e.g. { "4": 15 }) produce a valid Time.
   *
   * @internal Rails-private helper.
   */
  protected valueFromMultiparameterAssignment(
    values: Record<string, unknown>,
  ): Temporal.Instant | null {
    return (
      (new AcceptsMultiparameterTime(this, {
        "1": 2000,
        "2": 1,
        "3": 1,
        "4": 0,
        "5": 0,
      }).cast(values) as Temporal.Instant | null) ?? null
    );
  }

  /**
   * Mirrors: AcceptsMultiparameterTime::InstanceMethods#cast
   * (accepts_multiparameter_time.rb:16-22). The nil guard stays in
   * `Value#cast` (value.rb:53-55), which is `super`.
   */
  override cast(value: unknown): Temporal.Instant | null {
    if (isHash(value)) {
      return this.valueFromMultiparameterAssignment(value);
    } else {
      return super.cast(value);
    }
  }

  /**
   * Mirrors: AcceptsMultiparameterTime::InstanceMethods#assert_valid_value —
   * a Hash value is validated by assembling it (raising on invalid input).
   */
  override assertValidValue(value: unknown): void {
    if (isHash(value)) this.valueFromMultiparameterAssignment(value);
  }

  /** Mirrors: AcceptsMultiparameterTime::InstanceMethods#value_constructed_by_mass_assignment? */
  override isValueConstructedByMassAssignment(value: unknown): boolean {
    return isHash(value);
  }
}
