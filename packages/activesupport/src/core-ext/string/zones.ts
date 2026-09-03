import { Temporal } from "@blazetrails/date";
import { findZoneBang, zone as timeZone } from "../../time-zone-config.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";
import { toTime as stringToTime } from "./conversions.js";

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
