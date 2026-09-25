import type { Time } from "@blazetrails/date";
import { ActsLikeObject, TimeWithZone, isBlank } from "@blazetrails/activesupport";
import { DateTime } from "./date-time.js";

export class TimestampWithTimeZone extends DateTime {
  override type(): string {
    return this.realTypeUnlessAliased("timestamptz");
  }

  override castValue(value: unknown): ReturnType<DateTime["castValue"]> {
    if (isBlank(value)) return null;

    const time = super.castValue(value);
    if (time instanceof TimeWithZone || !ActsLikeObject.actsLike(time, "time")) return time;

    if (this.isUtc) {
      return (time as Time).getutc();
    } else {
      return (time as Time).getlocal();
    }
  }
}
