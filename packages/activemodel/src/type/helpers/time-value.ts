/**
 * TimeValue helper — shared behavior for time-based type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::TimeValue
 */
import { Temporal } from "@blazetrails/activesupport/temporal";

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
