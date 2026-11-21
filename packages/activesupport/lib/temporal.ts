/** @noRailsEquivalent PERMANENT */
export function instantFrom(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}
