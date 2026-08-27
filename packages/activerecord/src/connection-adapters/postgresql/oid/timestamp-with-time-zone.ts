import { DateTime } from "./date-time.js";

export class TimestampWithTimeZone extends DateTime {
  override readonly name: string = "timestamptz";

  override type(): string {
    return this.realTypeUnlessAliased("timestamptz");
  }
}
