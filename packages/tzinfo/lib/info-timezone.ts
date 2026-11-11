import type { TimezoneInfo } from "./data-sources/timezone-info.js";
import { Timezone } from "./timezone.js";

export class InfoTimezone extends Timezone {
  constructor(info: TimezoneInfo) {
    super(info.identifier, info);
  }
}
