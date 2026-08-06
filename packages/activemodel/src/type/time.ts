import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Rational,
  Temporal,
  type DateParts,
} from "@blazetrails/date";
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

  /** Mixed in from Helpers::Timezone — `is_utc?` (timezone.rb:9-11). */
  get isUtc(): boolean {
    return isUtc();
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
   * (time_value.rb:44-46); the zone `Time.zone` names is the `zone` parameter
   * here, since trails has no thread-local `Time.zone` to read at this depth.
   */
  userInputInTimeZone(value: unknown, zone: string = "UTC"): Temporal.ZonedDateTime | null {
    if (value === null || value === undefined) return null;

    if (typeof value === "string") {
      if (value.trim() === "") return null;
      const str = `2000-01-01 ${value}`;
      let timeHash: DateParts | undefined;
      try {
        timeHash = RubyDate._parse(str);
      } catch (error) {
        if (!(error instanceof RubyArgumentError)) throw error;
      }
      if (timeHash == null || timeHash.hour == null) return null;
      value = str;
    } else if (value instanceof Temporal.Instant) {
      value = value.toZonedDateTimeISO("UTC").with({ year: 2000, day: 1, month: 1 }).toInstant();
    }

    if (value instanceof Temporal.ZonedDateTime) return value;
    if (value instanceof Temporal.Instant) return value.toZonedDateTimeISO(zone);

    try {
      return Temporal.PlainDateTime.from(String(value).replace(" ", "T")).toZonedDateTime(zone);
    } catch {
      return null;
    }
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
    if (isHash(value)) return this.valueFromMultiparameterAssignment(value);
    if (typeof value !== "string") {
      // Rails' `apply_seconds_precision` answers anything without an `nsec` —
      // including `Type::Time::Value`, which `ActiveRecord::Type::Time#cast_value`
      // unwraps after calling `super` — unchanged, so this stays a pass-through.
      // boundary: a bare `Temporal.PlainTime` has no Ruby analogue — Rails'
      // `Type::Time` only ever sees a `::Time` — but it is the shape a TS
      // caller reaches for and the one the adapters' wire parsers hand back.
      // Read it on the same 2000-01-01 dummy date the String arm builds, so
      // every cast result is one kind of value.
      if (value instanceof Temporal.PlainTime) {
        value = new Temporal.PlainDate(2000, 1, 1).toPlainDateTime(value);
      }
      if (value instanceof Temporal.PlainDateTime) value = this.#instantFor(value);
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

    const { offset } = timeHash;
    return this.newTime(
      timeHash.year,
      timeHash.mon,
      timeHash.mday,
      timeHash.hour,
      timeHash.min,
      timeHash.sec,
      timeHash.secFraction,
      offset instanceof Rational ? offset.numerator / offset.denominator : offset,
    );
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
   * The multiparameter helper reassembles the parts into a
   * `Temporal.PlainDateTime` and hands it back to `cast`; Rails' assembles a
   * `::Time` through `Time.public_send(default_timezone, *values)`
   * (accepts_multiparameter_time.rb:23), so the zone the parts are read in is
   * `is_utc?`'s, the same branch `new_time` takes.
   */
  #instantFor(value: Temporal.PlainDateTime): Temporal.Instant {
    return value.toZonedDateTime(this.isUtc ? "UTC" : Temporal.Now.timeZoneId()).toInstant();
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
