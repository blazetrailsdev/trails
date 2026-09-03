/**
 * Core time travel state used by both production code (TimeWithZone) and
 * testing helpers (travelTo, travelBack, etc.).
 *
 * Separated from testing-helpers so production code doesn't need to import
 * test assertion utilities.
 *
 * @boundary-file: `currentTime()` returns a JS `Date` because most consumers
 *   (legacy Rails-port code in `time-ext`, `duration`, etc.) are Date-typed.
 *   The clock source is `systemEpochNs()`; the offset is stored in
 *   nanoseconds so sub-millisecond travel is preserved on the
 *   `currentTimeInstant()` path. Callers that want Temporal use
 *   `currentTimeInstant()`.
 */

import { Temporal } from "@blazetrails/date";

let _frozenInstant: Temporal.Instant | null = null;
let _timeOffsetNs: bigint = 0n;

/**
 * The named clock method trails production code reads the current time through.
 * `travel_to` stubs the receivers Rails stubs — `Time.now`, `Date.today` and
 * `DateTime.now` — and this holder's `now` alongside them, because reading
 * `Time.now` here instead would cost ~70x a bare `performance.now()` read on
 * every `TimeWithZone` construction.
 *
 * @noRailsEquivalent CONVERGEABLE — Ruby's only clock is `Time.now`, so this
 * holder exists purely for that cost. Retiring it means making
 * `@blazetrails/date`'s `Time.now` cheap enough to sit on the hot path;
 * `0098-activesupport-ar-closure-port/time-helpers-stub-date-and-datetime-clock`
 * carries that decision.
 */
export const clock = {
  now(): Temporal.Instant {
    if (_frozenInstant) return _frozenInstant;
    if (_timeOffsetNs === 0n) return Temporal.Instant.fromEpochNanoseconds(systemEpochNs());
    return Temporal.Instant.fromEpochNanoseconds(systemEpochNs() + _timeOffsetNs);
  },
};

function systemEpochNs(): bigint {
  return BigInt(Math.round((performance.timeOrigin + performance.now()) * 1_000)) * 1_000n;
}

export function setFrozenTime(time: Date | null): void {
  if (time === null) {
    _frozenInstant = null;
    return;
  }
  const ms = time.getTime();
  if (Number.isNaN(ms)) throw new RangeError("`time` must be a valid Date");
  _frozenInstant = Temporal.Instant.fromEpochMilliseconds(ms);
}

export function setFrozenInstant(instant: Temporal.Instant | null): void {
  _frozenInstant = instant;
}

export function setTimeOffset(offsetMs: number): void {
  if (!Number.isFinite(offsetMs)) throw new TypeError("offsetMs must be a finite number");
  const wholeMs = Math.trunc(offsetMs);
  const fracNs = Math.round((offsetMs - wholeMs) * 1_000_000);
  _timeOffsetNs = BigInt(wholeMs) * 1_000_000n + BigInt(fracNs);
}

export function setTimeOffsetNs(offsetNs: bigint): void {
  _timeOffsetNs = offsetNs;
}

export function currentTimeInstant(): Temporal.Instant {
  return clock.now();
}

export function currentTime(): Date {
  return new Date(currentTimeInstant().epochMilliseconds);
}
