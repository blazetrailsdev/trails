import { Temporal } from "@js-temporal/polyfill";

/** @noRailsEquivalent PERMANENT */
export function actsLikeDate(self: unknown): boolean {
  return (
    self instanceof Temporal.PlainDate ||
    self instanceof Temporal.PlainDateTime ||
    self instanceof Temporal.ZonedDateTime
  );
}

/** @noRailsEquivalent PERMANENT */
export function actsLikeTime(self: unknown): boolean {
  return (
    // boundary: a JS `Date` is one of the Ruby-`Time`-shaped values this answers for.
    self instanceof globalThis.Date ||
    self instanceof Temporal.Instant ||
    self instanceof Temporal.PlainDateTime ||
    self instanceof Temporal.ZonedDateTime
  );
}
