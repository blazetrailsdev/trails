/**
 * TimeValue helper — shared behavior for time-based type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::TimeValue
 */
import { Temporal } from "@blazetrails/activesupport/temporal";

export interface TimeValue {
  serializeCastValue(value: unknown): string | null;
  typeCastForSchema(value: unknown): string;
  userInputInTimeZone(value: unknown, zone?: string): Temporal.ZonedDateTime | null;
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
