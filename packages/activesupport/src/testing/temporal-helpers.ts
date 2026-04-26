/**
 * Temporal test helpers. Test files use these instead of `new Date(...)`.
 * The no-native-date ESLint rule allowlists this file.
 */
import { Temporal } from "../temporal.js";

export function instant(iso: string): Temporal.Instant {
  return Temporal.Instant.from(iso);
}

export function plainDateTime(iso: string): Temporal.PlainDateTime {
  return Temporal.PlainDateTime.from(iso);
}

export function plainDate(iso: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(iso);
}

export function plainTime(iso: string): Temporal.PlainTime {
  return Temporal.PlainTime.from(iso);
}

export function zonedDateTime(iso: string): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(iso);
}
