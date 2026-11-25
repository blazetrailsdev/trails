/**
 * @boundary-file: `currentTime()` returns a JS `Date` for the Date-typed
 *   consumers (`time-ext`, `duration`); `currentTimeInstant()` is the
 *   Temporal form. Both read `Time.now`, which `travel_to` stubs.
 */

import { Time } from "@blazetrails/date";

export function currentTimeInstant(): Temporal.Instant {
  return Time.now().toZonedDateTime().toInstant();
}

export function currentTime(): Date {
  return new Date(currentTimeInstant().epochMilliseconds);
}
