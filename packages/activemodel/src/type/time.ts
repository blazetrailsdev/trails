// `RubyDate` is the ruby/date gem's `::Date`; the bare name is the JS global.
import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Temporal,
  type DateParts,
} from "@blazetrails/date";
import { AcceptsMultiparameterTime, isHash } from "./helpers/accepts-multiparameter-time.js";
import { ValueType } from "./value.js";

export class TimeType extends ValueType<Temporal.PlainTime> {
  readonly name = "time";

  type(): string {
    return this.name;
  }

  userInputInTimeZone(value: unknown, zone: string = "UTC"): Temporal.ZonedDateTime | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Temporal.ZonedDateTime) return value;
    // Full ZonedDateTime string (has timezone bracket)
    const str = String(value).trim();
    if (str === "") return null;
    if (str.includes("[")) {
      try {
        return Temporal.ZonedDateTime.from(str);
      } catch {
        return null;
      }
    }
    // Otherwise cast to PlainTime and attach the given zone
    const plain = this.cast(value);
    if (!plain) return null;
    // Use a fixed reference date (Rails convention: 2000-01-01) so the result
    // is stable across DST transitions and independent of the current date.
    try {
      return Temporal.PlainDate.from("2000-01-01").toPlainDateTime(plain).toZonedDateTime(zone);
    } catch {
      return null;
    }
  }

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): Temporal.PlainTime | null {
    if (value instanceof Temporal.PlainTime) return this.applySecondsPrecision(value);
    // Accept PlainDateTime from multiparameter assignment — extract the time part.
    if (value instanceof Temporal.PlainDateTime)
      return this.applySecondsPrecision(value.toPlainTime());
    if (isHash(value)) return this.valueFromMultiparameterAssignment(value);
    const str = String(value).trim();
    if (str === "") return null;
    // Rails' `dummy_time_value` — the empty alternation makes the pattern match
    // at position 0 whatever the string, so a leading `YYYY-MM-DD` separator is
    // replaced and a time-only string is prefixed (time.rb:70).
    const dummyTimeValue = str.replace(/^\d{4}-\d\d-\d\d(?:T|\s)|/, "2000-01-01 ");
    let timeHash: DateParts | undefined;
    try {
      timeHash = RubyDate._parse(dummyTimeValue);
    } catch (error) {
      if (!(error instanceof RubyArgumentError)) throw error;
    }
    if (timeHash == null || timeHash.hour == null) return null;
    // Rails hands the components to `new_time`, which answers a `::Time` on the
    // 2000-01-01 dummy date. Trails' `Time` type is a `Temporal.PlainTime`, so
    // the date half of the hash is dropped here instead.
    const microsec = timeHash.secFraction ? Math.trunc(timeHash.secFraction * 1_000_000) : 0;
    try {
      return Temporal.PlainTime.from(
        {
          hour: timeHash.hour,
          minute: timeHash.min ?? 0,
          second: timeHash.sec ?? 0,
          millisecond: Math.trunc(microsec / 1000),
          microsecond: microsec % 1000,
        },
        { overflow: "reject" },
      );
    } catch {
      return null;
    }
  }

  private applySecondsPrecision(value: Temporal.PlainTime): Temporal.PlainTime {
    if (
      this.precision == null ||
      !Number.isInteger(this.precision) ||
      this.precision < 0 ||
      this.precision > 9
    )
      return value;
    const nsec = value.millisecond * 1_000_000 + value.microsecond * 1_000 + value.nanosecond;
    const mod = 10 ** (9 - this.precision);
    const roundedOff = nsec % mod;
    if (roundedOff === 0) return value;
    // Rebuild from truncated sub-second components to avoid PlainTime.subtract()
    // wrapping across the midnight boundary (00:00:00.000000001 - 1ns = 23:59:59...).
    const truncated = nsec - roundedOff;
    return value.with({
      millisecond: Math.floor(truncated / 1_000_000),
      microsecond: Math.floor((truncated % 1_000_000) / 1_000),
      nanosecond: truncated % 1_000,
    });
  }

  /**
   * Mirrors: ActiveModel::Type::Value#serialize (near-identity). `value_for_database`
   * returns the cast Temporal.PlainTime — NOT a SQL string; the adapter quotes it later.
   */
  serialize(value: unknown): Temporal.PlainTime | null {
    return this.serializeCastValue(this.cast(value));
  }

  // Mirrors ActiveModel::Type::Helpers::TimeValue#serialize_cast_value (apply_seconds_precision).
  serializeCastValue(value: Temporal.PlainTime | null): Temporal.PlainTime | null {
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
  ): Temporal.PlainTime | null {
    return new AcceptsMultiparameterTime(this, {
      "1": 2000,
      "2": 1,
      "3": 1,
      "4": 0,
      "5": 0,
    }).cast(values) as Temporal.PlainTime | null;
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
