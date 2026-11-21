import { ArgumentError } from "@blazetrails/ruby-compat";
import type { Time } from "@blazetrails/date";
import type { DataTimezoneInfo } from "./data-sources/data-timezone-info.js";
import { InfoTimezone } from "./info-timezone.js";
import { Timestamp } from "./timestamp.js";
import type { TimezonePeriod } from "./timezone-period.js";
import type { TimezoneTransition } from "./timezone-transition.js";

export class DataTimezone extends InfoTimezone {
  override periodFor(time: Time): TimezonePeriod {
    if (time == null) throw new ArgumentError("time must be specified");
    const timestamp = Timestamp.for(time) as Timestamp;
    if (timestamp.utcOffset == null) {
      throw new ArgumentError("time must have a specified utc_offset");
    }
    return (this.info as DataTimezoneInfo).periodFor(timestamp);
  }

  override periodsForLocal(localTime: Time): TimezonePeriod[] {
    if (localTime == null) throw new ArgumentError("local_time must be specified");
    return (this.info as DataTimezoneInfo).periodsForLocal(
      Timestamp.for(localTime, "ignore") as Timestamp,
    );
  }

  override transitionsUpTo(to: Time, from: Time | null = null): TimezoneTransition[] {
    if (to == null) throw new ArgumentError("to must be specified");
    const toTimestamp = Timestamp.for(to) as Timestamp;
    const fromTimestamp = from != null ? (Timestamp.for(from) as Timestamp) : null;

    try {
      return (this.info as DataTimezoneInfo).transitionsUpTo(toTimestamp, fromTimestamp);
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      throw new ArgumentError(e.message.replaceAll("_timestamp", ""));
    }
  }

  override canonicalZone(): DataTimezone {
    return this;
  }
}
