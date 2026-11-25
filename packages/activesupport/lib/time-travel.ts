import { Time } from "@blazetrails/date";

export function currentTimeInstant(): Temporal.Instant {
  return Time.now().toZonedDateTime().toInstant();
}

export function currentTime(): Date {
  // boundary: Date-typed consumers (time-ext, duration)
  return new Date(currentTimeInstant().epochMilliseconds);
}
