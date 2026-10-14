export interface TimezoneOptions {
  timezone?: "utc" | "local";
  precision?: number;
  scale?: number;
  limit?: number;
}

import { defaultTimezone } from "../../active-record.js";

export class Timezone {
  declare _timezone?: "utc" | "local";

  get isUtc(): boolean {
    return this.defaultTimezone === "utc";
  }

  get defaultTimezone(): "utc" | "local" {
    return this._timezone ?? defaultTimezone();
  }
}
