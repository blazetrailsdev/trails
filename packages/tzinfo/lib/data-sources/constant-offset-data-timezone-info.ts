/* eslint-disable unused-imports/no-unused-vars */
import { ArgumentError } from "@blazetrails/ruby-compat";
import { OffsetTimezonePeriod } from "../offset-timezone-period.js";
import type { Timestamp } from "../timestamp.js";
import type { TimezoneOffset } from "../timezone-offset.js";
import type { TimezoneTransition } from "../timezone-transition.js";
import { DataTimezoneInfo } from "./data-timezone-info.js";

export class ConstantOffsetDataTimezoneInfo extends DataTimezoneInfo {
  readonly constantOffset: TimezoneOffset;

  constructor(identifier: string, constantOffset: TimezoneOffset) {
    super(identifier);
    if (constantOffset == null) throw new ArgumentError("constant_offset must be specified");
    this.constantOffset = constantOffset;
  }

  override periodFor(timestamp: Timestamp): OffsetTimezonePeriod {
    return this.constantPeriod();
  }

  override periodsForLocal(localTimestamp: Timestamp): OffsetTimezonePeriod[] {
    return [this.constantPeriod()];
  }

  override transitionsUpTo(
    toTimestamp: Timestamp,
    fromTimestamp: Timestamp | null = null,
  ): TimezoneTransition[] {
    return [];
  }

  /** @internal */
  private constantPeriod(): OffsetTimezonePeriod {
    return new OffsetTimezonePeriod(this.constantOffset);
  }
}
