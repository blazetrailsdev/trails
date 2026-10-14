import { Time as RubyTime } from "@blazetrails/date";
import { TEMPORAL_METHOD_TABLE, rbEnsure } from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { inTimeZone } from "./core-ext/date-and-time/zones.js";
import type { TimeWithZone } from "./time-with-zone.js";
import { TimeZone } from "./values/time-zone.js";
import { Duration } from "./duration.js";
import { ArgumentError } from "./hash-utils.js";

declare module "@blazetrails/date" {
  interface Time {
    inTimeZone(zone?: unknown): TimeWithZone | Time;
  }
}

RubyTime.prototype.inTimeZone = function (this: RubyTime, zone?: unknown) {
  return inTimeZone(this, zone);
};
(TEMPORAL_METHOD_TABLE["Temporal.Instant"] ??= {}).inTimeZone = inTimeZone;

let _zoneDefault: TimeZone | null = null;

export function zone(): TimeZone | null {
  const timeZone = IsolatedExecutionState.get<TimeZone | null | false>(":time_zone");
  if (timeZone != null && timeZone !== false) return timeZone;
  return _zoneDefault;
}

export function setZone(timeZone: TimeZone | string | number | Duration | null | false): void {
  IsolatedExecutionState.set(":time_zone", findZoneBang(timeZone));
}

export function zoneDefault(): TimeZone | null {
  return _zoneDefault;
}

export function setZoneDefault(zone: TimeZone | null): void {
  _zoneDefault = zone;
}

export function useZone<T>(timeZone: string | TimeZone, fn: () => T): T {
  const newZone = findZoneBang(timeZone);
  let oldZone: TimeZone | null;
  return rbEnsure(
    () => {
      oldZone = zone();
      setZone(newZone);
      return fn();
    },
    () => {
      setZone(oldZone);
    },
  );
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
