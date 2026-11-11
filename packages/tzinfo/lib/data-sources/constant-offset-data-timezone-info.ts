import type { TimezoneOffset } from "../timezone-offset.js";
import { DataTimezoneInfo } from "./data-timezone-info.js";

export class ConstantOffsetDataTimezoneInfo extends DataTimezoneInfo {
  readonly constantOffset: TimezoneOffset;

  constructor(identifier: string, constantOffset: TimezoneOffset) {
    super(identifier);
    this.constantOffset = constantOffset;
  }
}
