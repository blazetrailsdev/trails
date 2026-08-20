/**
 * TimeValue helper — shared behavior for time-based type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::TimeValue
 */
import { Rational, Temporal } from "@blazetrails/date";
import { toFs, zone } from "@blazetrails/activesupport";

import { isUtc } from "./timezone.js";

export interface TimezoneAware {
  readonly isUtc: boolean;
}

/** The receiver `Helpers::TimeValue`'s bodies resolve their members against. */
interface TimeValueHost {
  precision?: number;
  applySecondsPrecision<T>(value: T): T;
}

/**
 * Mirrors: ActiveModel::Type::Helpers::TimeValue#serialize_cast_value
 * (time_value.rb:10-21)
 *
 *   def serialize_cast_value(value)
 *     value = apply_seconds_precision(value)
 *
 *     if value.acts_like?(:time)
 *       if is_utc?
 *         value = value.getutc if !value.utc?
 *       else
 *         value = value.getlocal
 *       end
 *     end
 *
 *     value
 *   end
 *
 * The `is_utc?` `getutc`/`getlocal` arm (`:12-19`) is not ported; that gap is
 * tracked by `serialize-cast-value-drops-is-utc-normalization`.
 */
export function serializeCastValue<T>(this: TimeValueHost, value: T): T {
  return this.applySecondsPrecision(value);
}

/**
 * Ruby's `apply_seconds_precision` reads `value.nsec` and `value.change(nsec:)`
 * off the receiver, which is a `::Time`. The port's time receivers are the
 * Temporal types that carry sub-second fields, so `nsec` and `changeNsec` are
 * module-private dispatchers over exactly those — everything else is the
 * `respond_to?(:nsec)` else arm and passes through.
 */
type NsecBearing =
  | Temporal.Instant
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime
  | Temporal.PlainTime;

const NANOS_PER_SECOND = 1_000_000_000n;

/**
 * Mirrors: ActiveModel::Type::Helpers::TimeValue#apply_seconds_precision
 * (time_value.rb:24-34)
 *
 *   def apply_seconds_precision(value)
 *     return value unless precision && value.respond_to?(:nsec)
 *     number_of_insignificant_digits = 9 - precision
 *     round_power = 10**number_of_insignificant_digits
 *     rounded_off_nsec = value.nsec % round_power
 *     if rounded_off_nsec > 0
 *       value.change(nsec: value.nsec - rounded_off_nsec)
 *     else
 *       value
 *     end
 *   end
 *
 * Ruby needs no guard past `precision` itself: for precision > 9,
 * `10 ** (9 - precision)` is a Rational, `nsec % (1/10)` is `(0/1)`, and the
 * `> 0` arm is false, so the value comes back unchanged (verified against
 * MRI). BigInt exponentiation throws on a negative exponent instead, so the
 * same answer is reached by an explicit early return.
 */
export function applySecondsPrecision<T>(this: { precision?: number }, value: T): T {
  const precision = this.precision;
  if (precision == null || !respondToNsec(value)) return value;
  if (!Number.isInteger(precision) || precision < 0 || precision > 9) return value;
  const numberOfInsignificantDigits = 9 - precision;
  const roundPower = 10n ** BigInt(numberOfInsignificantDigits);
  const roundedOffNsec = nsec(value) % roundPower;
  if (roundedOffNsec > 0n) {
    return changeNsec(value, nsec(value) - roundedOffNsec) as T;
  } else {
    return value;
  }
}

/**
 * Mirrors: ActiveModel::Type::Helpers::TimeValue#type_cast_for_schema
 * (time_value.rb:36-38)
 *
 *   def type_cast_for_schema(value)
 *     value.to_fs(:db).inspect
 *   end
 *
 * Ruby dispatches `to_fs` on the receiver. The cast value of a datetime/time
 * attribute is a `Temporal.Instant` here — the seat `Time#to_fs`
 * (`core_ext/time/conversions.rb:55-61`) reads — and `String#inspect` of the
 * `:db` form is its quoted spelling, the same one `Type::Value` and
 * `Type::Date` reach through `JSON.stringify` (value.rb:71-73, date.rb:34-36).
 */
export function typeCastForSchema(value: unknown): string {
  return JSON.stringify(toFs(value as Temporal.Instant, "db"));
}

/**
 * Mirrors: ActiveModel::Type::Helpers::TimeValue#user_input_in_time_zone
 * (time_value.rb:42-44) — `value.in_time_zone`, whose zone is the thread-local
 * `Time.zone`.
 *
 * With no zone set at all Ruby takes `in_time_zone`'s else arm and answers a
 * bare `to_time` (`date_and_time/zones.rb:20-27`) — a value with no zone
 * attached. `Temporal.PlainDateTime` is that zoneless value, so the else arm
 * is answered as one rather than anchored to a zone Ruby never picked.
 */
export function userInputInTimeZone(
  value: unknown,
): Temporal.ZonedDateTime | Temporal.PlainDateTime | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Temporal.ZonedDateTime) return value;
  const str = String(value).trim();
  if (str === "") return null;
  if (str.includes("[")) {
    try {
      return Temporal.ZonedDateTime.from(str);
    } catch {
      return null;
    }
  }
  try {
    const timeZone = zone();
    const time = Temporal.PlainDateTime.from(str.replace(" ", "T"));
    if (timeZone) return time.toZonedDateTime(timeZone.tzinfo.identifier);
    return time;
  } catch {
    return null;
  }
}

/**
 * Mirrors: ActiveModel::Type::Helpers::TimeValue#new_time
 * (time_value.rb:48-65)
 *
 *   def new_time(year, mon, mday, hour, min, sec, microsec, offset = nil)
 *     return if year.nil? || (year == 0 && mon == 0 && mday == 0)
 *     if offset
 *       time = ::Time.utc(year, mon, mday, hour, min, sec, microsec) rescue nil
 *       return unless time
 *       time -= offset unless offset == 0
 *       is_utc? ? time : time.getlocal
 *     elsif is_utc?
 *       ::Time.utc(year, mon, mday, hour, min, sec, microsec) rescue nil
 *     else
 *       ::Time.local(year, mon, mday, hour, min, sec, microsec) rescue nil
 *     end
 *   end
 *
 * Trails returns Temporal.Instant — the closest analogue to Ruby's
 * `::Time` for the no-zone-info, fixed-instant role this helper plays.
 * `0000-00-00 00:00:00` short-circuits to null per Rails. With an
 * offset, build at UTC and subtract the offset (in seconds) to land
 * the instant; without, interpret the components in the configured
 * default zone (`isUtc()` → "UTC", else host-local), matching Rails'
 * `is_utc?` branching.
 *
 * `year` is read the way `Time.utc`'s year argument is, and so takes the
 * Bignum `::Date._parse` answers for a year past a JS number (ruby/date,
 * `date_parse.c`'s `str2num`): `Number` makes it the `Infinity` Temporal
 * rejects, which lands on the same `rescue nil` MRI's `RangeError` does.
 *
 * `microsec` is read the way `Time.utc`'s microsecond argument is: a Rational
 * one carries sub-microsecond resolution down into `nsec`, which is what
 * `Type::Time` relies on when it hands a raw `:sec_fraction` straight through
 * (time.rb:82). Temporal splits the same resolution across millisecond /
 * microsecond / nanosecond.
 *
 * @internal Rails-private helper.
 */
export function newTime(
  this: TimezoneAware | void,
  year: number | bigint | null | undefined,
  mon: number | null | undefined,
  mday: number | null | undefined,
  hour: number | null | undefined,
  min: number | null | undefined,
  sec: number | null | undefined,
  microsec: number | bigint | Rational | null | undefined,
  offset?: number | Rational | null,
): Temporal.Instant | null {
  if (year == null || (year === 0 && mon === 0 && mday === 0)) return null;
  // Rails' ::Time.utc(year, nil, nil, ...) raises TypeError → rescue nil.
  // Treat missing month/day the same way rather than silently coercing to Jan 1.
  if (mon == null || mday == null) return null;
  const totalNano =
    microsec instanceof Rational
      ? microsec.mul(1000).toI()
      : typeof microsec === "bigint"
        ? Number(microsec * 1000n)
        : Math.trunc((microsec ?? 0) * 1000);
  const components = {
    year: Number(year),
    month: mon,
    day: mday,
    hour: hour ?? 0,
    minute: min ?? 0,
    second: sec ?? 0,
    millisecond: Math.trunc(totalNano / 1_000_000),
    microsecond: Math.trunc(totalNano / 1000) % 1000,
    nanosecond: totalNano % 1000,
  };
  try {
    if (offset != null) {
      const instant = Temporal.PlainDateTime.from(components, { overflow: "reject" })
        .toZonedDateTime("UTC")
        .toInstant();
      if (offset instanceof Rational) {
        return offset.isZero()
          ? instant
          : instant.subtract({ nanoseconds: offset.mul(1_000_000_000).toI() });
      }
      return offset === 0 ? instant : instant.subtract({ seconds: offset });
    }
    return (
      Temporal.PlainDateTime.from(components, { overflow: "reject" })
        // Rails branches on `is_utc?` between `::Time.utc` and `::Time.local`;
        // Temporal has no `Time.local`, so the local arm names the host zone.
        .toZonedDateTime((this?.isUtc ?? isUtc()) ? "UTC" : Temporal.Now.timeZoneId())
        .toInstant()
    );
  } catch {
    return null;
  }
}

/**
 * Mirrors: ActiveModel::Type::Helpers::TimeValue#fast_string_to_time
 * (time_value.rb:79-89, dual definition).
 *
 *   def fast_string_to_time(string)
 *     return unless string.include?("-") #  Time.new("1234") # => 1234-01-01 00:00:00
 *     if is_utc?
 *       ::Time.new(string, in: "UTC")
 *     else
 *       ::Time.new(string)
 *     end
 *   rescue ArgumentError
 *     nil
 *   end
 *
 * Returns null for strings that don't look like dates (Rails skips
 * `"1234"` because Ruby's `Time.new("1234")` would interpret it as
 * year-only). Trails uses Temporal — strings with an offset go
 * through `Instant.from`; bare strings fall back to PlainDateTime
 * in the configured zone (matches Rails' `is_utc?` branching).
 *
 * @internal Rails-private helper.
 */
export function fastStringToTime(this: TimezoneAware | void, s: string): Temporal.Instant | null {
  if (!s.includes("-")) return null;
  const normalized = s
    .replace(" ", "T")
    .replace(/(T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([-+]\d{2})$/, "$1$2:00");
  const datetimeString = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? `${normalized}T00:00:00`
    : normalized;
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(datetimeString);
  try {
    if (hasOffset) return Temporal.Instant.from(datetimeString);
    return (
      Temporal.PlainDateTime.from(datetimeString, { overflow: "reject" })
        // Rails branches on `is_utc?` between `::Time.utc` and `::Time.local`;
        // Temporal has no `Time.local`, so the local arm names the host zone.
        .toZonedDateTime((this?.isUtc ?? isUtc()) ? "UTC" : Temporal.Now.timeZoneId())
        .toInstant()
    );
  } catch {
    return null;
  }
}

/**
 * Mirrors: `module ActiveModel::Type::Helpers::TimeValue` (time_value.rb:9-95)
 * — the module itself, which `Type::DateTime` and `Type::Time` `include`
 * (date_time.rb:47, time.rb:43).
 */
export const TimeValue = {
  serializeCastValue,
  applySecondsPrecision,
  typeCastForSchema,
  userInputInTimeZone,
  newTime,
  fastStringToTime,
};

function respondToNsec(value: unknown): value is NsecBearing {
  return (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Temporal.PlainTime
  );
}

/** `Time#nsec` — the fraction of the second, always in `0...1_000_000_000`. */
function nsec(value: NsecBearing): bigint {
  if (value instanceof Temporal.Instant) {
    return ((value.epochNanoseconds % NANOS_PER_SECOND) + NANOS_PER_SECOND) % NANOS_PER_SECOND;
  }
  return (
    BigInt(value.millisecond) * 1_000_000n +
    BigInt(value.microsecond) * 1_000n +
    BigInt(value.nanosecond)
  );
}

/** `Time#change(nsec:)` — replaces the sub-second fraction, leaving the second. */
function changeNsec<T extends NsecBearing>(value: T, newNsec: bigint): T {
  if (value instanceof Temporal.Instant) {
    return Temporal.Instant.fromEpochNanoseconds(
      value.epochNanoseconds - nsec(value) + newNsec,
    ) as T;
  }
  return value.with({
    millisecond: Number(newNsec / 1_000_000n),
    microsecond: Number((newNsec / 1_000n) % 1_000n),
    nanosecond: Number(newNsec % 1_000n),
  }) as T;
}

export function serializeTimeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return value.toJSON();
  }
  return String(value);
}
