export interface TimezoneOptions {
  timezone?: "utc" | "local";
  precision?: number;
  scale?: number;
  limit?: number;
}

import { initialize } from "@blazetrails/activesupport";
import { defaultTimezone } from "../../active-record.js";

export class Timezone {
  declare _timezone?: "utc" | "local";

  static [initialize](this: Timezone, { timezone }: TimezoneOptions = {}): void {
    this._timezone = timezone;
  }

  get isUtc(): boolean {
    return this.defaultTimezone === "utc";
  }

  get defaultTimezone(): "utc" | "local" {
    return this._timezone ?? defaultTimezone();
  }
}
