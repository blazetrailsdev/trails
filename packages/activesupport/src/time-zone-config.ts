/**
 * Time.zone infrastructure — mirrors Rails' Time.zone, Time.use_zone,
 * Time.find_zone, Time.find_zone!, and Time.current.
 *
 * In Rails these are thread-local. In our single-threaded JS environment
 * we use a simple stack for use_zone and a module-level variable for zone.
 */

import { TimeZone } from "./values/time-zone.js";
import { Duration } from "./duration.js";
import { ArgumentError } from "./hash-utils.js";

// NOTE: Zone state is stored in module-level variables, mirroring Rails'
// thread-local Time.zone. This is process-wide and NOT safe for concurrent
// async request handling. For server contexts with overlapping requests,
// consider using AsyncLocalStorage or passing the zone explicitly.
let _zoneDefault: TimeZone | null = null;
// undefined = IsolatedExecutionState has no :time_zone key.
let _zone: TimeZone | null | false | undefined = undefined;

/**
 * Get the current Time.zone. Returns zone_default if not explicitly set.
 * Mirrors `IsolatedExecutionState[:time_zone] || zone_default` (zones.rb:19-21),
 * so a stored `nil`/`false` falls through to zone_default just as it does in Rails.
 */
export function zone(): TimeZone | null {
  if (_zone != null && _zone !== false) return _zone;
  return _zoneDefault;
}

/**
 * Set Time.zone. Accepts a TimeZone, a string name, null, or false.
 * Mirrors `IsolatedExecutionState[:time_zone] = find_zone!(time_zone)`
 * (zones.rb:41-43).
 */
export function setZone(zone: TimeZone | string | number | Duration | null | false): void {
  _zone = findZoneBang(zone);
}

/**
 * Get/set the zone_default (used when Time.zone is not explicitly set).
 */
export function zoneDefault(): TimeZone | null {
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
  const newZone = findZoneBang(zone);
  const prev = _zone;
  _zone = newZone;
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
 * Matches Rails' `Time.find_zone`: `find_zone!(time_zone) rescue nil` — one
 * implementation, the bang form, with the ArgumentError swallowed
 * (core_ext/time/zones.rb:97-99).
 */
export function findZone(zone: unknown): TimeZone | null | false {
  try {
    return findZoneBang(zone);
  } catch (e) {
    if (e instanceof ArgumentError) return null;
    throw e;
  }
}

/**
 * `Time.find_zone!` (core_ext/time/zones.rb:80-90): `return time_zone unless
 * time_zone`, then `ActiveSupport::TimeZone[time_zone] || raise(ArgumentError,
 * "Invalid Timezone: #{time_zone}")`. The whole argument dispatch — the name
 * lookup, the Numeric/Duration offset scan, and the wrong-class raise
 * (time_zone.rb:249) — lives in `TimeZone.find`, the port of `[]`.
 */
export function findZoneBang(zone: unknown): TimeZone | null | false {
  if (zone === null || zone === undefined) return null;
  if (zone === false) return false;
  const found = TimeZone.find(zone);
  if (found == null) throw new ArgumentError(`Invalid Timezone: ${String(zone)}`);
  return found;
}

/**
 * Ruby's `ArgumentError`. One class across `TimeZone` / `time-zone-config`, so `findZone`'s
 * `instanceof` narrows the raise `TimeZone[]` makes (time_zone.rb:249) as well
 * as the one `find_zone!` makes itself.
 */
export { ArgumentError };
