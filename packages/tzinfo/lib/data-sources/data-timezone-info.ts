/* eslint-disable unused-imports/no-unused-vars */
import { NotImplementedError, TopLevel } from "@blazetrails/ruby-compat";
import type { DataTimezone } from "../data-timezone.js";
import type { Timestamp } from "../timestamp.js";
import type { TimezonePeriod } from "../timezone-period.js";
import type { TimezoneTransition } from "../timezone-transition.js";
import { TimezoneInfo } from "./timezone-info.js";

export class DataTimezoneInfo extends TimezoneInfo {
  periodFor(timestamp: Timestamp): TimezonePeriod {
    this.raiseNotImplemented("period_for");
  }

  periodsForLocal(localTimestamp: Timestamp): TimezonePeriod[] {
    this.raiseNotImplemented("periods_for_local");
  }

  transitionsUpTo(
    toTimestamp: Timestamp,
    fromTimestamp: Timestamp | null = null,
  ): TimezoneTransition[] {
    this.raiseNotImplemented("transitions_up_to");
  }

  override createTimezone(): DataTimezone {
    return new TopLevel.TZInfo!.DataTimezone(this);
  }

  /** @internal */
  protected override raiseNotImplemented(methodName: string): never {
    throw new NotImplementedError(`Subclasses must override ${methodName}`);
  }
}
