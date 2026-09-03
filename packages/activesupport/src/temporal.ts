import { Temporal } from "@blazetrails/date";

export { Temporal };

/** @noRailsEquivalent PERMANENT */
export function instantFrom(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}
