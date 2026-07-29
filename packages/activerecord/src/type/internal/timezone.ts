/**
 * Mixin for timezone-aware AR types. Provides timezone resolution
 * with a per-instance override and a global default.
 *
 * Mirrors: ActiveRecord::Type::Internal::Timezone
 */
export interface TimezoneOptions {
  timezone?: "utc" | "local";
  precision?: number;
  scale?: number;
  limit?: number;
}

import { ActiveRecord } from "../../ar-config.js";

export function isUtc(timezone?: "utc" | "local"): boolean {
  return (timezone ?? ActiveRecord.defaultTimezone) === "utc";
}

/**
 * Class form of the timezone mixin. Types that need timezone awareness
 * can extend this or use the standalone functions above.
 *
 * Mirrors: ActiveRecord::Type::Internal::Timezone
 */
export class Timezone {
  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    this._timezone = options?.timezone;
  }

  isUtc(): boolean {
    return this.defaultTimezone === "utc";
  }

  get defaultTimezone(): "utc" | "local" {
    return this._timezone ?? ActiveRecord.defaultTimezone;
  }
}
