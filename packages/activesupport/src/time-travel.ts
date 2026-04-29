/**
 * Core time travel state used by both production code (TimeWithZone) and
 * testing helpers (travelTo, travelBack, etc.).
 *
 * Separated from testing-helpers so production code doesn't need to import
 * test assertion utilities.
 *
 * @boundary-file: `currentTime()` returns a JS `Date` because most consumers
 *   (legacy Rails-port code in `time-ext`, `duration`, etc.) are Date-typed.
 *   Callers that want Temporal use `Temporal.Now.instant()` directly or bridge
 *   via `instantFrom(currentTime())`.
 */

let _frozenTime: Date | null = null;
let _timeOffset: number = 0;

export function setFrozenTime(time: Date | null): void {
  _frozenTime = time;
}

export function setTimeOffset(offset: number): void {
  _timeOffset = offset;
}

/**
 * Returns the current time, respecting any active time travel.
 */
export function currentTime(): Date {
  if (_frozenTime) return new Date(_frozenTime);
  return new Date(Date.now() + _timeOffset);
}
