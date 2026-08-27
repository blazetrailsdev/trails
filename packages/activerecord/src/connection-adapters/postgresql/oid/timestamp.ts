import { DateTime } from "./date-time.js";

export class Timestamp extends DateTime {
  override readonly name: string = "timestamp";

  override type(): string {
    return this.realTypeUnlessAliased("timestamp");
  }
}
