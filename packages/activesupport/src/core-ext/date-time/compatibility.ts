import { TEMPORAL_METHOD_TABLE } from "@blazetrails/ruby-compat";
import type { Temporal, Time } from "@blazetrails/date";
import { preserveTimezone } from "../date-and-time/compatibility.js";
import { getlocal, utcOffset } from "./calculations.js";

export function toTime(datetime: Temporal.PlainDateTime | Temporal.ZonedDateTime): Time {
  return preserveTimezone() ? getlocal(datetime, utcOffset(datetime)) : getlocal(datetime);
}

for (const seat of ["Temporal.PlainDateTime", "Temporal.ZonedDateTime"]) {
  Object.assign(TEMPORAL_METHOD_TABLE[seat], { toTime });
}
