import { DateTime } from "./date-time.js";

export class TimestampWithTimeZone extends DateTime {
  override type(): string {
    return this.realTypeUnlessAliased("timestamptz");
  }
}
