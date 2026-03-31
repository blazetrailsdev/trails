/**
 * Mixin for timezone-aware AR types. Provides timezone resolution
 * with a per-instance override and a global default.
 *
 * Mirrors: ActiveRecord::Type::Internal::Timezone
 */
export interface TimezoneOptions {
  timezone?: "utc" | "local";
}

let defaultTimezone: "utc" | "local" = "utc";

export function getDefaultTimezone(): "utc" | "local" {
  return defaultTimezone;
}

export function setDefaultTimezone(tz: "utc" | "local"): void {
  defaultTimezone = tz;
}

export function isUtc(timezone?: "utc" | "local"): boolean {
  return (timezone ?? defaultTimezone) === "utc";
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
    return this._timezone ?? getDefaultTimezone();
  }
}
