import { TimeZone } from "./values/time-zone.js";
import { Duration } from "./duration.js";
import { ArgumentError } from "./hash-utils.js";

let _zoneDefault: TimeZone | null = null;
let _zone: TimeZone | null | false | undefined = undefined;

export function zone(): TimeZone | null {
  if (_zone != null && _zone !== false) return _zone;
  return _zoneDefault;
}

export function setZone(timeZone: TimeZone | string | number | Duration | null | false): void {
  _zone = findZoneBang(timeZone);
}

export function zoneDefault(): TimeZone | null {
  return _zoneDefault;
}

export function setZoneDefault(zone: TimeZone | null): void {
  _zoneDefault = zone;
}

export function useZone<T>(timeZone: string | TimeZone, fn: () => T): T {
  const newZone = findZoneBang(timeZone);
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

export function findZone(timeZone: unknown): TimeZone | null | false {
  try {
    return findZoneBang(timeZone);
  } catch (e) {
    if (e instanceof ArgumentError) return null;
    throw e;
  }
}

export function findZoneBang(timeZone: unknown): TimeZone | null | false {
  if (timeZone === null || timeZone === undefined) return null;
  if (timeZone === false) return false;
  const found = TimeZone.find(timeZone);
  if (found == null) throw new ArgumentError(`Invalid Timezone: ${String(timeZone)}`);
  return found;
}

export { ArgumentError };
