// `RubyDate` / `RubyArgumentError` are the ruby/date gem's `::Date` and Ruby's
// `ArgumentError`; both names are already taken in this file's scope.
import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Rational,
  Temporal,
  type DateParts,
} from "@blazetrails/date";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { ArgumentError } from "../attribute-assignment.js";
import { AcceptsMultiparameterTime, isHash } from "./helpers/accepts-multiparameter-time.js";
import { isUtc } from "./helpers/timezone.js";
import { fastStringToTime, newTime } from "./helpers/time-value.js";
import { ValueType } from "./value.js";

export type DateTimeCastResult = Temporal.Instant | DateInfinityType | DateNegativeInfinityType;

export class DateTimeType extends ValueType<DateTimeCastResult> {
  readonly name: string = "datetime";

  /** Mixed in from Helpers::TimeValue (time_value.rb:79-89). @internal Rails-private helper. */
  protected fastStringToTime = fastStringToTime;

  /** Mixed in from Helpers::TimeValue (time_value.rb:48-65). @internal Rails-private helper. */
  protected newTime = newTime;

  type(): string {
    return this.name;
  }

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): DateTimeCastResult | null {
    if (value === DateInfinity) return DateInfinity;
    if (value === DateNegativeInfinity) return DateNegativeInfinity;
    if (value instanceof Temporal.Instant) return this.applySecondsPrecision(value);
    // boundary: JS Date assigned to a datetime attribute (e.g. aircraft.manufactured_at = new Date())
    if (value instanceof Date) {
      return this.applySecondsPrecision(Temporal.Instant.fromEpochMilliseconds(value.getTime()));
    }
    if (isHash(value)) return this.valueFromMultiparameterAssignment(value);
    const str = String(value).trim();
    if (str === "") return null;
    return this.fastStringToTime(str) ?? this.fallbackStringToTime(str);
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
   * @internal Rails-private helper.
   */
  protected microseconds(time: DateParts): number {
    return time.secFraction ? Math.trunc(time.secFraction * 1_000_000) : 0;
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
   * the string named.
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

    const { offset } = timeHash;
    return this.newTime(
      timeHash.year,
      timeHash.mon,
      timeHash.mday,
      timeHash.hour,
      timeHash.min,
      timeHash.sec,
      timeHash.secFraction,
      // Ruby's `time -= offset` takes the Rational a fractional-hour zone
      // (`+05:45`, `-00:44:30`) answers; `new_time`'s subtrahend is a number.
      offset instanceof Rational ? offset.numerator / offset.denominator : offset,
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
   * Validates that year/mon/mday (multiparameter keys 1, 2, 3) are
   * present, then defers to the multiparameter wrapper. Trails routes
   * the actual reconstruction through `AcceptsMultiparameterTime`
   * (`helpers/accepts-multiparameter-time.ts`); this helper exists for
   * Rails parity and as the entry point for callers that want the
   * key-presence check.
   *
   * @internal Rails-private helper.
   */
  protected valueFromMultiparameterAssignment(
    values: Record<string | number, unknown>,
  ): DateTimeCastResult | null {
    const missing = [1, 2, 3].filter((k) => !Object.hasOwn(values, k));
    if (missing.length > 0) {
      throw new ArgumentError(
        `Provided hash ${JSON.stringify(values)} doesn't contain necessary keys: ${JSON.stringify(missing)}`,
      );
    }
    return new AcceptsMultiparameterTime(this, { "4": 0, "5": 0 }).cast(
      values,
    ) as DateTimeCastResult | null;
  }

  get isUtc(): boolean {
    return isUtc();
  }

  /**
   * Mirrors: AcceptsMultiparameterTime::InstanceMethods#assert_valid_value.
   * Runs eagerly at write_from_user time — this is how Rails surfaces
   * MultiparameterAssignmentErrors at assignment (missing keys 1..3 raise).
   */
  override assertValidValue(value: unknown): void {
    if (isHash(value)) this.valueFromMultiparameterAssignment(value);
  }

  /** Mirrors: AcceptsMultiparameterTime::InstanceMethods#value_constructed_by_mass_assignment? */
  override isValueConstructedByMassAssignment(value: unknown): boolean {
    return isHash(value);
  }

  private applySecondsPrecision(value: Temporal.Instant): Temporal.Instant {
    if (
      this.precision == null ||
      !Number.isInteger(this.precision) ||
      this.precision < 0 ||
      this.precision > 9
    )
      return value;
    const mod = 10n ** BigInt(9 - this.precision);
    let subsec = value.epochNanoseconds % 1_000_000_000n;
    if (subsec < 0n) subsec += 1_000_000_000n;
    const roundedOff = subsec % mod;
    if (roundedOff === 0n) return value;
    return Temporal.Instant.fromEpochNanoseconds(value.epochNanoseconds - roundedOff);
  }

  override isChanged(oldValue: unknown, newValue: unknown, _raw?: unknown): boolean {
    if (oldValue instanceof Temporal.Instant && newValue instanceof Temporal.Instant) {
      return (
        this._nsAtPrecision(oldValue.epochNanoseconds) !==
        this._nsAtPrecision(newValue.epochNanoseconds)
      );
    }
    return oldValue !== newValue;
  }

  // Truncate epoch nanoseconds to column precision, matching applySecondsPrecision /
  // Temporal.toString() floor-style sub-second truncation. Used by isChanged so that
  // sub-precision nanosecond noise from Temporal.Now (when precision=null) doesn't
  // produce spurious dirty marks after serialize → cast round-trips.
  private _nsAtPrecision(ns: bigint): bigint {
    const raw = this.precision ?? 6;
    const p = Number.isInteger(raw) && raw >= 0 && raw <= 9 ? raw : 6;
    const mod = 10n ** BigInt(9 - p);
    let subsec = ns % 1_000_000_000n;
    if (subsec < 0n) subsec += 1_000_000_000n;
    const roundedOff = subsec % mod;
    return ns - roundedOff;
  }

  /**
   * Mirrors: ActiveModel::Type::Value#serialize (near-identity). `value_for_database`
   * returns the cast Temporal value — NOT a SQL string. The connection adapter's
   * quoting/bind layer converts it to a SQL literal at quote/type_cast time, matching
   * Rails where `value_for_database` for a datetime yields the cast Time and the
   * adapter does the quoting. Sub-second precision is already applied in `castValue`.
   */
  // Return type is `unknown` (matching ActiveModel::Type::Value#serialize) so
  // adapter subclasses can widen it — e.g. PostgreSQL's OID::DateTime emits the
  // "infinity" wire string for the infinity sentinels.
  serialize(value: unknown): unknown {
    return this.serializeCastValue(this.cast(value));
  }

  // Mirrors ActiveModel::Type::Helpers::TimeValue#serialize_cast_value (apply_seconds_precision).
  serializeCastValue(value: DateTimeCastResult | null): DateTimeCastResult | null {
    if (value === null || value === DateInfinity || value === DateNegativeInfinity) return value;
    return this.applySecondsPrecision(value as Temporal.Instant);
  }
}
