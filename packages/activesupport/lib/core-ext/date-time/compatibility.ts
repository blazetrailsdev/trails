import { TEMPORAL_METHOD_TABLE } from "@blazetrails/ruby-compat";
import { DateTime, type Temporal, type Time } from "@blazetrails/date";
import { preserveTimezone } from "../date-and-time/compatibility.js";
import { getlocal, utcOffset } from "./calculations.js";

export function toTime(datetime: DateTime): Time {
  return preserveTimezone() ? getlocal(datetime, utcOffset(datetime)) : getlocal(datetime);
}

for (const seat of ["Temporal.PlainDateTime", "Temporal.ZonedDateTime"]) {
  Object.assign(TEMPORAL_METHOD_TABLE[seat], {
    toTime: (self: Temporal.PlainDateTime | Temporal.ZonedDateTime) => toTime(new DateTime(self)),
  });
}
