export interface TimezoneOptions {
  timezone?: "utc" | "local";
  precision?: number;
  scale?: number;
  limit?: number;
}

import { _Base } from "../../base-slot.js";

export function isUtc(timezone?: "utc" | "local"): boolean {
  return (timezone ?? _Base!.defaultTimezone) === "utc";
}

export class Timezone {
  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    this._timezone = options?.timezone;
  }

  isUtc(): boolean {
    return this.defaultTimezone === "utc";
  }

  get defaultTimezone(): "utc" | "local" {
    return this._timezone ?? _Base!.defaultTimezone;
  }
}
