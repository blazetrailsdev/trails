/**
 * TimeValue helper — shared behavior for time-based type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::TimeValue
 */
import { Temporal } from "@blazetrails/activesupport/temporal";
import { isUtc } from "./timezone.js";

function configuredTimezone(): string {
  return isUtc() ? "UTC" : Temporal.Now.timeZoneId();
}

export interface TimeValue {
  precision?: number;
  serializeCastValue(value: unknown): string | null;
  typeCastForSchema(value: unknown): string;
  userInputInTimeZone(value: unknown, zone?: string): Temporal.ZonedDateTime | null;
  applySecondsPrecision<T>(this: TimeValue, value: T): T;
}

type Roundable<T> = {
  round: (options: {
    smallestUnit: "second" | "millisecond" | "microsecond" | "nanosecond";
    roundingIncrement?: number;
    roundingMode: "trunc";
  }) => T;
};

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
 * Truncates sub-second precision on Temporal types that expose a
 * `round({ smallestUnit, roundingIncrement, roundingMode })` method —
 * Instant, PlainDateTime, PlainTime, and ZonedDateTime. Values without
 * sub-second resolution (PlainDate, primitives) lack `.round` and pass
 * through unchanged.
 */
export function applySecondsPrecision<T>(this: { precision?: number }, value: T): T {
  const precision = this.precision;
  if (precision === undefined || precision === null) return value;
  // Rails' guard only covers nil/falsey precision (and values that do
  // not respond to `nsec`). This additional pass-through for invalid
  // numeric precision is trails-specific and preserves the current
  // behavior instead of coercing to a default — Temporal#round would
  // otherwise reject a non-integer or out-of-range roundingIncrement.
  if (!Number.isInteger(precision) || precision < 0 || precision > 9) return value;
  if (value === null || value === undefined) return value;
  // Temporal types (Instant, PlainDateTime, PlainTime, ZonedDateTime)
  // expose a `round` method that accepts `roundingIncrement` and
  // `roundingMode: "trunc"`, which together match Rails' "drop the
  // insignificant trailing nanos" semantics. Values without `.round`
  // (PlainDate, primitives) lack sub-second resolution and pass
  // through unchanged.
  const roundable = value as unknown as Partial<Roundable<T>>;
  if (typeof roundable.round !== "function") return value;
  if (precision >= 9) return value;
  const opts =
    precision <= 0
      ? { smallestUnit: "second" as const, roundingMode: "trunc" as const }
      : precision <= 3
        ? {
            smallestUnit: "millisecond" as const,
            roundingIncrement: 10 ** (3 - precision),
            roundingMode: "trunc" as const,
          }
        : precision <= 6
          ? {
              smallestUnit: "microsecond" as const,
              roundingIncrement: 10 ** (6 - precision),
              roundingMode: "trunc" as const,
            }
          : {
              smallestUnit: "nanosecond" as const,
              roundingIncrement: 10 ** (9 - precision),
              roundingMode: "trunc" as const,
            };
  return (roundable as Roundable<T>).round(opts);
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

export function userInputInTimeZone(
  value: unknown,
  zone: string = "UTC",
): Temporal.ZonedDateTime | null {
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
    return Temporal.PlainDateTime.from(str.replace(" ", "T")).toZonedDateTime(zone);
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
 * @internal Rails-private helper.
 */
export function newTime(
  year: number | null | undefined,
  mon: number | null | undefined,
  mday: number | null | undefined,
  hour: number | null | undefined,
  min: number | null | undefined,
  sec: number | null | undefined,
  microsec: number | null | undefined,
  offset?: number | null,
): Temporal.Instant | null {
  if (year == null || (year === 0 && mon === 0 && mday === 0)) return null;
  const components = {
    year,
    month: mon ?? 1,
    day: mday ?? 1,
    hour: hour ?? 0,
    minute: min ?? 0,
    second: sec ?? 0,
    microsecond: microsec ?? 0,
  };
  try {
    if (offset != null) {
      const instant = Temporal.PlainDateTime.from(components, { overflow: "reject" })
        .toZonedDateTime("UTC")
        .toInstant();
      return offset === 0 ? instant : instant.subtract({ seconds: offset });
    }
    return Temporal.PlainDateTime.from(components, { overflow: "reject" })
      .toZonedDateTime(configuredTimezone())
      .toInstant();
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
export function fastStringToTime(s: string): Temporal.Instant | null {
  if (!s.includes("-")) return null;
  const normalized = s
    .replace(" ", "T")
    .replace(/(T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([-+]\d{2})$/, "$1$2:00");
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(normalized);
  try {
    if (hasOffset) return Temporal.Instant.from(normalized);
    return Temporal.PlainDateTime.from(normalized, { overflow: "reject" })
      .toZonedDateTime(configuredTimezone())
      .toInstant();
  } catch {
    return null;
  }
}
