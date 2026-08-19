/**
 * Mirrors: `class Time` (`core_ext/time/compatibility.rb`) — the
 * `to_time_preserves_timezone` switch and the private readers it consults.
 */

import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { preserveTimezone as compatibilityPreserveTimezone } from "../date-and-time/compatibility.js";

/**
 * Either return `self` or the time in the local system timezone depending on
 * the setting of `ActiveSupport.to_time_preserves_timezone`.
 *
 * Mirrors: `Time#to_time` (`core_ext/time/compatibility.rb:13-15`) —
 * `preserve_timezone ? self : getlocal` — over a ruby/date `Time`, and
 * `DateTime#to_time` (`core_ext/date_time/compatibility.rb:15-17`) —
 * `preserve_timezone ? getlocal(utc_offset) : getlocal` — over the
 * `PlainDateTime | ZonedDateTime` `@blazetrails/date`'s `DateTime` answers.
 * Both receivers carry an offset, which is what the switch chooses between;
 * `getlocal` re-reads the same instant in the system zone, and
 * `getlocal(utc_offset)` in the receiver's own offset.
 */
export function toTime(
  time: RubyTime | Temporal.PlainDateTime | Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
  if (time instanceof RubyTime) {
    const self = time.toTime();
    return preserveTimezone(time) ? self : self.withTimeZone(Temporal.Now.timeZoneId());
  }

  // A Ruby `DateTime` without an explicit offset is `+00:00` (date.rb's
  // `civil`), which is the offset a `PlainDateTime` stands in for here.
  const zoned = time instanceof Temporal.PlainDateTime ? time.toZonedDateTime("UTC") : time;
  return compatibilityPreserveTimezone()
    ? zoned.withTimeZone(zoned.offset)
    : zoned.withTimeZone(Temporal.Now.timeZoneId());
}

/**
 * Either return `self` or the time in the local system timezone depending on
 * the setting of `ActiveSupport.to_time_preserves_timezone`.
 *
 * Mirrors: `Time#preserve_timezone` (`core_ext/time/compatibility.rb:17-19`) —
 * `system_local_time? || super`, where `super` is the module-level switch
 * `DateAndTime::Compatibility` mixes in.
 */
export function preserveTimezone(time: RubyTime): boolean | string {
  return isSystemLocalTime(time) || compatibilityPreserveTimezone();
}

/**
 * Mirrors: `Time#system_local_time?` (`core_ext/time/compatibility.rb:22-27`).
 * Ruby's `::Time.equal?(self.class)` guard is what keeps `DateTime` and
 * `TimeWithZone` — which reach the method through the same include — out; the
 * `RubyTime` parameter is that guard, since neither is one.
 */
export function isSystemLocalTime(time: RubyTime): boolean {
  const zone = time.zone;
  return typeof zone === "string" && (zone !== "UTC" || activeSupportLocalZone() === "UTC");
}

let _activeSupportLocalTz: string | null = null;
let _activeSupportLocalZone: string | null = null;

/**
 * Mirrors: `Time#active_support_local_zone` (`core_ext/time/compatibility.rb:31-38`)
 * — `Time.new.zone`, memoized and dropped again when the zone the process runs
 * in changes. Ruby keys that memo on `ENV["TZ"]`; the environment is not
 * readable here, and `Temporal.Now.timeZoneId()` is the zone `TZ` selects, so
 * it is both the key and where the zone is read from.
 */
export function activeSupportLocalZone(): string | null {
  if (_activeSupportLocalTz !== Temporal.Now.timeZoneId()) _activeSupportLocalZone = null;
  if (_activeSupportLocalZone == null) {
    _activeSupportLocalTz = Temporal.Now.timeZoneId();
    _activeSupportLocalZone = RubyTime.now().zone;
  }
  return _activeSupportLocalZone;
}
