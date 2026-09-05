import { DateTime } from "./date-time.js";

export class Timestamp extends DateTime {
  override type(): string {
    return this.realTypeUnlessAliased("timestamp");
  }
}
