/**
 * Mirrors: `class String` (`core_ext/string/zones.rb`).
 */

import { Temporal } from "@blazetrails/date";
import { findZoneBang, zone as timeZone } from "../../time-zone-config.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";
import { toTime as stringToTime } from "./conversions.js";

/**
 * inTimeZone — Rails `String#in_time_zone`. Converts a String to a
 * TimeWithZone in the current zone if `Time.zone` or `Time.zone_default` is
 * set, otherwise converts the String to a Time.
 *
 * Mirrors: String#in_time_zone (`core_ext/string/zones.rb:8-14`).
 */
export function inTimeZone(
  str: string,
  zone: unknown = timeZone(),
): TimeWithZone | Temporal.ZonedDateTime | undefined {
  if (zone != null && zone !== false) {
    return (findZoneBang(zone) as TimeZone).parse(str);
  } else {
    return stringToTime(str);
  }
}
