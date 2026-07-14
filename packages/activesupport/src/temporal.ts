import { Temporal } from "@js-temporal/polyfill";

export { Temporal };

/** Bridge a JS Date to a Temporal.Instant. */
export function instantFrom(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

/**
 * The five Temporal wall-clock/instant types trails casts date/time values to.
 * A single predicate keeps the discriminator from drifting between call sites
 * (scalar quoting vs. array-element quoting) when a Temporal type is added.
 */
export function isTemporal(
  value: unknown,
): value is
  | Temporal.Instant
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime
  | Temporal.ZonedDateTime {
  return (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime ||
    value instanceof Temporal.ZonedDateTime
  );
}
