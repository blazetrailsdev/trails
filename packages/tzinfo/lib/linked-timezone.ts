import type { DateTime, Time } from "@blazetrails/date";
import type { LinkedTimezoneInfo } from "./data-sources/linked-timezone-info.js";
import { InfoTimezone } from "./info-timezone.js";
import { Timezone } from "./timezone.js";
import type { TimezonePeriod } from "./timezone-period.js";
import type { TimezoneTransition } from "./timezone-transition.js";

export class LinkedTimezone extends InfoTimezone {
  /** @internal */
  private readonly linkedTimezone: Timezone;

  constructor(info: LinkedTimezoneInfo) {
    super(info);
    this.linkedTimezone = Timezone.get(info.linkToIdentifier);
  }

  override periodFor(time: Time): TimezonePeriod {
    return this.linkedTimezone.periodFor(time);
  }

  override periodsForLocal(localTime: Time | DateTime): TimezonePeriod[] {
    return this.linkedTimezone.periodsForLocal(localTime);
  }

  override transitionsUpTo(to: Time, from: Time | null = null): TimezoneTransition[] {
    return this.linkedTimezone.transitionsUpTo(to, from);
  }

  override canonicalZone(): Timezone {
    return this.linkedTimezone.canonicalZone();
  }
}
