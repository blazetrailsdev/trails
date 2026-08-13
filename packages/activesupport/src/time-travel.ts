/**
 * Core time travel state used by both production code (TimeWithZone) and
 * testing helpers (travelTo, travelBack, etc.).
 *
 * Separated from testing-helpers so production code doesn't need to import
 * test assertion utilities.
 *
 * @boundary-file: `currentTime()` returns a JS `Date` because most consumers
 *   (legacy Rails-port code in `time-ext`, `duration`, etc.) are Date-typed.
 *   The clock source is `Temporal.Now.instant()`; the offset is stored in
 *   nanoseconds so sub-millisecond travel is preserved on the
 *   `currentTimeInstant()` path. Callers that want Temporal use
 *   `currentTimeInstant()` (or `Temporal.Now.instant()` directly).
 */

import { Temporal } from "@blazetrails/date";

let _frozenInstant: Temporal.Instant | null = null;
let _timeOffsetNs: bigint = 0n;

/**
 * The named clock method `travel_to` stubs. Rails redefines the `Time.now`,
 * `Time.new`, `Date.today` and `DateTime.now` singleton methods, so production
 * code reading any of them sees the traveled time; trails production code reads
 * the clock through `currentTimeInstant()`, so this holder's `now` is the
 * method that plays that role and `SimpleStubs` (testing/time-helpers.ts)
 * replaces it exactly the way Rails replaces `Time.now`.
 *
 * @noRailsEquivalent Ruby's stub target is the `Time.now` singleton method
 * itself; TypeScript's clock seam is this module, so the method that plays that
 * role has to live here.
 */
export const clock = {
  now(): Temporal.Instant {
    if (_frozenInstant) return _frozenInstant;
    if (_timeOffsetNs === 0n) return Temporal.Now.instant();
    return Temporal.Instant.fromEpochNanoseconds(
      Temporal.Now.instant().epochNanoseconds + _timeOffsetNs,
    );
  },
};

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

/**
 * Returns the current time as a `Temporal.Instant`, respecting any active
 * time travel. Preserves nanosecond precision for both the frozen-time and
 * offset paths.
 */
export function currentTimeInstant(): Temporal.Instant {
  return clock.now();
}

/**
 * Returns the current time, respecting any active time travel.
 */
export function currentTime(): Date {
  return new Date(currentTimeInstant().epochMilliseconds);
}
