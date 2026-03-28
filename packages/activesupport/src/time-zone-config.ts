/**
 * Time.zone infrastructure — mirrors Rails' Time.zone, Time.use_zone,
 * Time.find_zone, Time.find_zone!, and Time.current.
 *
 * In Rails these are thread-local. In our single-threaded JS environment
 * we use a simple stack for use_zone and a module-level variable for zone.
 */

import { TimeZone } from "./values/time-zone.js";
import { TimeWithZone } from "./time-with-zone.js";
import { currentTime } from "./time-travel.js";

// NOTE: Zone state is stored in module-level variables, mirroring Rails'
// thread-local Time.zone. This is process-wide and NOT safe for concurrent
// async request handling. For server contexts with overlapping requests,
// consider using AsyncLocalStorage or passing the zone explicitly.
let _zoneDefault: TimeZone | null = null;
let _zone: TimeZone | null | undefined = undefined; // undefined = not set (falls through to default)

/**
 * Get the current Time.zone. Returns zone_default if not explicitly set.
 */
export function getZone(): TimeZone | null {
  if (_zone !== undefined) return _zone;
  return _zoneDefault;
}

/**
 * Set Time.zone. Accepts a TimeZone, a string name, or null.
 * Passing null resets to zone_default.
 */
export function setZone(zone: TimeZone | string | null): void {
  if (zone === null) {
    _zone = undefined; // Reset to zone_default
    return;
  }
  if (zone instanceof TimeZone) {
    _zone = zone;
    return;
  }
  if (typeof zone === "string") {
    _zone = TimeZone.find(zone);
    return;
  }
  throw new ArgumentError(`Invalid time zone: ${zone}`);
}

/**
 * Reset Time.zone to its unset state (falls through to zone_default).
 * Useful in test teardown to restore exact prior state.
 */
export function resetZone(): void {
  _zone = undefined;
}

/**
 * Get/set the zone_default (used when Time.zone is not explicitly set).
 */
export function getZoneDefault(): TimeZone | null {
  return _zoneDefault;
}

export function setZoneDefault(zone: TimeZone | null): void {
  _zoneDefault = zone;
}

/**
 * Execute a synchronous block with a temporary Time.zone, restoring afterwards.
 * Matches Rails' Time.use_zone. Only supports synchronous callbacks — async
 * callbacks would observe the wrong zone after the first await.
 */
export function useZone<T>(zone: string | TimeZone, fn: () => T): T {
  if (typeof zone === "string") {
    zone = TimeZone.find(zone);
  }
  const prev = _zone;
  _zone = zone;
  try {
    const result = fn();
    if (result != null && typeof (result as any).then === "function") {
      throw new Error(
        "useZone does not support async callbacks; the zone would be restored before awaited work runs",
      );
    }
    return result;
  } finally {
    _zone = prev;
  }
}

/**
 * Find a timezone, returning null if not found (no exception).
 * Matches Rails' Time.find_zone (without bang).
 */
export function findZone(zone: unknown): TimeZone | null {
  if (zone === null || zone === undefined) return null;
  if (zone instanceof TimeZone) return zone;
  if (typeof zone === "string") {
    try {
      return TimeZone.find(zone);
    } catch {
      return null;
    }
  }
  if (typeof zone === "number") {
    try {
      return TimeZone.find(zone.toString());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Find a timezone, raising if not found.
 * Matches Rails' Time.find_zone!
 */
export function findZoneBang(zone: unknown): TimeZone | null | false {
  if (zone === null || zone === undefined) return null;
  if (zone === false) return false;
  if (zone instanceof TimeZone) return zone;
  if (typeof zone === "string") {
    try {
      return TimeZone.find(zone);
    } catch {
      throw new ArgumentError(`Invalid time zone: ${zone}`);
    }
  }
  if (typeof zone === "number") {
    try {
      return TimeZone.find(zone.toString());
    } catch {
      throw new ArgumentError(`Invalid time zone: ${zone}`);
    }
  }
  throw new ArgumentError(`Invalid time zone: invalid argument to TimeZone[]`);
}

/**
 * Returns Time.current — if zone is set, returns a TimeWithZone in that zone.
 * Otherwise returns a plain Date.
 */
export function current(): TimeWithZone | Date {
  const zone = getZone();
  if (zone) {
    return new TimeWithZone(currentTime(), zone);
  }
  return currentTime();
}

/**
 * Convert a Date (interpreted as a local date, i.e., year/month/day only)
 * into a TimeWithZone at midnight in the given zone.
 * Matches Rails' Date#in_time_zone.
 */
export function dateInTimeZone(date: Date, zone: string | TimeZone): TimeWithZone {
  const tz = typeof zone === "string" ? TimeZone.find(zone) : zone;
  return tz.local(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}
