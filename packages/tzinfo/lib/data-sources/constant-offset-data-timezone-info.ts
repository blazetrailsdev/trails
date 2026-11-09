import { Timezone } from "../timezone.js";
import type { TimezoneOffset } from "../timezone-offset.js";

/** @noRailsEquivalent PERMANENT */
export class ConstantOffsetDataTimezoneInfo {
  readonly identifier: string;
  readonly constantOffset: TimezoneOffset;

  constructor(identifier: string, constantOffset: TimezoneOffset) {
    this.identifier = identifier;
    this.constantOffset = constantOffset;
  }

  createTimezone(): Timezone {
    return new Timezone(this.identifier, this);
  }
}
