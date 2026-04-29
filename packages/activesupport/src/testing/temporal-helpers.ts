/**
 * Temporal test helpers for fixtures in tests.
 *
 * Prefer these helpers over direct `Temporal.*.from(...)` calls. `Date`
 * fixtures are allowed only when immediately converted to a
 * `Temporal.Instant` via `instantFromDate(...)`, never used directly.
 */
import { Temporal, instantFrom } from "../temporal.js";

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

/** Test bridge: build an Instant from a Date. Re-export of the production helper. */
export const instantFromDate = instantFrom;
