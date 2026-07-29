import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { ArgumentError } from "../attribute-assignment.js";
import {
  AcceptsMultiparameterTime,
  MONTH_ABBREVIATIONS,
  isHash,
} from "./helpers/accepts-multiparameter-time.js";
import { isUtc } from "./helpers/timezone.js";
import { fastStringToTime, newTime } from "./helpers/time-value.js";
import { ValueType } from "./value.js";

export type DateTimeCastResult = Temporal.Instant | DateInfinityType | DateNegativeInfinityType;

/** The subset of `Date._parse`'s result hash that `fallback_string_to_time` reads. */
interface TimeHash {
  year: number;
  mon: number;
  mday: number;
  hour: number;
  min: number;
  sec: number;
  sec_fraction: number;
  offset: number | null;
}

const WEEKDAY_PREFIX = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i;

const RFC_DATETIME =
  /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?(?:\s+(\S+))?$/;

/**
 * Zone abbreviation → offset in seconds, the trails stand-in for the table
 * `Date._parse` consults (Ruby's `Date::Format::ZONES`, generated from
 * `zonetab.list`). Only the abbreviations that table resolves unambiguously
 * are listed; anything else leaves `offset` nil, exactly as `Date._parse`
 * does for an unknown zone.
 */
const ZONE_OFFSETS: Record<string, number> = {
  ut: 0,
  utc: 0,
  gmt: 0,
  z: 0,
  wet: 0,
  west: 3600,
  bst: 3600,
  cet: 3600,
  cest: 7200,
  eet: 7200,
  eest: 10800,
  eat: 10800,
  msk: 10800,
  jst: 32400,
  kst: 32400,
  aest: 36000,
  aedt: 39600,
  nzst: 43200,
  nzdt: 46800,
  hst: -36000,
  akst: -32400,
  akdt: -28800,
  pst: -28800,
  pdt: -25200,
  mst: -25200,
  mdt: -21600,
  cst: -21600,
  cdt: -18000,
  est: -18000,
  edt: -14400,
  ast: -14400,
  adt: -10800,
  nst: -12600,
};

function zoneOffsetSeconds(zone: string): number | null {
  const numeric = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
  if (numeric) {
    const sign = numeric[1] === "-" ? -1 : 1;
    return sign * (Number(numeric[2]) * 3600 + Number(numeric[3] ?? 0) * 60);
  }
  const named = ZONE_OFFSETS[zone.toLowerCase()];
  return named === undefined ? null : named;
}

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
  protected microseconds(time: { sec_fraction?: number | null }): number {
    return time.sec_fraction ? Math.trunc(time.sec_fraction * 1_000_000) : 0;
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
   * Trails has no `Date._parse` equivalent; `parseTimeHash` stands in
   * for it, using Temporal's permissive parser to produce the same
   * component hash. From there the Rails shape is preserved: normalize
   * `sec_fraction` to microseconds, then hand the components to
   * `new_time`. Returns null on parse failure.
   *
   * @internal Rails-private helper.
   */
  protected fallbackStringToTime(s: string): Temporal.Instant | null {
    const timeHash = this.parseTimeHash(s.trim());
    if (timeHash === null) return null;
    const microsec = this.microseconds(timeHash);
    return this.newTime(
      timeHash.year,
      timeHash.mon,
      timeHash.mday,
      timeHash.hour,
      timeHash.min,
      timeHash.sec,
      microsec,
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

  private parseTimeHash(s: string): TimeHash | null {
    const withoutWeekday = s.replace(WEEKDAY_PREFIX, "");
    const rfc = RFC_DATETIME.exec(withoutWeekday);
    if (rfc) {
      const mon = MONTH_ABBREVIATIONS.indexOf(rfc[2].slice(0, 3).toLowerCase()) + 1;
      if (mon === 0) return null;
      return {
        year: Number(rfc[3]),
        mon,
        mday: Number(rfc[1]),
        hour: Number(rfc[4] ?? 0),
        min: Number(rfc[5] ?? 0),
        sec: Number(rfc[6] ?? 0),
        sec_fraction: rfc[7] ? Number(`0${rfc[7]}`) : 0,
        offset: rfc[8] === undefined ? null : zoneOffsetSeconds(rfc[8]),
      };
    }

    const normalized = withoutWeekday
      .replace(" ", "T")
      .replace(
        /(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*([-+]\d{2}):?(\d{2})?$/,
        (_m, time: string, hours: string, minutes: string | undefined) =>
          `${time}${hours}:${minutes ?? "00"}`,
      );
    const zoneMatch = /(Z|[+-]\d{2}:\d{2})$/.exec(normalized);
    let offset: number | null = null;
    let body = normalized;
    if (zoneMatch) {
      const zone = zoneMatch[1];
      body = normalized.slice(0, normalized.length - zone.length);
      offset = zoneOffsetSeconds(zone);
    }
    const datetimeString = /^\d{4}-?\d{2}-?\d{2}$/.test(body) ? `${body}T00:00:00` : body;
    let plain: Temporal.PlainDateTime;
    try {
      plain = Temporal.PlainDateTime.from(datetimeString, { overflow: "reject" });
    } catch {
      return null;
    }
    return {
      year: plain.year,
      mon: plain.month,
      mday: plain.day,
      hour: plain.hour,
      min: plain.minute,
      sec: plain.second,
      sec_fraction: (plain.millisecond * 1000 + plain.microsecond) / 1_000_000,
      offset,
    };
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
