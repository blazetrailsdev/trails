/**
 * Core time travel state used by both production code (TimeWithZone) and
 * testing helpers (travelTo, travelBack, etc.).
 *
 * Separated from testing-helpers so production code doesn't need to import
 * test assertion utilities.
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
