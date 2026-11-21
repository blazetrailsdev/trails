import type { TimezoneInfo } from "./data-sources/timezone-info.js";
import { Timezone } from "./timezone.js";

export class InfoTimezone extends Timezone {
  /** @internal */
  protected readonly info: TimezoneInfo;

  constructor(info: TimezoneInfo) {
    super();
    this.info = info;
  }

  override get identifier(): string {
    return this.info.identifier;
  }
}
