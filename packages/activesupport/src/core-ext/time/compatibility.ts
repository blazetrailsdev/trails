import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { preserveTimezone as compatibilityPreserveTimezone } from "../date-and-time/compatibility.js";

Object.assign(RubyTime.prototype, {
  toTime(this: RubyTime): RubyTime {
    return preserveTimezone(this) ? this : this.getlocal();
  },
});

export function preserveTimezone(time: RubyTime): boolean | string {
  return isSystemLocalTime(time) || compatibilityPreserveTimezone();
}

export function isSystemLocalTime(time: RubyTime): boolean {
  const zone = time.zone;
  return typeof zone === "string" && (zone !== "UTC" || activeSupportLocalZone() === "UTC");
}

let _activeSupportLocalTz: string | null = null;
let _activeSupportLocalZone: string | null = null;

export function activeSupportLocalZone(): string | null {
  if (_activeSupportLocalTz !== Temporal.Now.timeZoneId()) _activeSupportLocalZone = null;
  if (_activeSupportLocalZone == null) {
    _activeSupportLocalTz = Temporal.Now.timeZoneId();
    _activeSupportLocalZone = RubyTime.now().zone as string | null;
  }
  return _activeSupportLocalZone;
}
