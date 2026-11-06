import { TEMPORAL_METHOD_TABLE } from "@blazetrails/ruby-compat";
import { inTimeZone, type DateOrTime } from "../date-and-time/zones.js";

for (const seat of ["Temporal.PlainDate", "Temporal.PlainDateTime", "Temporal.ZonedDateTime"]) {
  Object.assign(TEMPORAL_METHOD_TABLE[seat], {
    inTimeZone: (self: unknown, zone?: unknown) => inTimeZone.call(self as DateOrTime, zone),
  });
}
