/**
 * Mixin for timezone-aware AR types.
 *
 * Mirrors: ActiveRecord::Type::Internal::Timezone
 */
export interface TimezoneOptions {
  timezone?: "utc" | "local";
}

export function getDefaultTimezone(): "utc" | "local" {
  return defaultTimezone;
}

export function setDefaultTimezone(tz: "utc" | "local"): void {
  defaultTimezone = tz;
}

let defaultTimezone: "utc" | "local" = "utc";

export function isUtc(timezone?: "utc" | "local"): boolean {
  return (timezone ?? defaultTimezone) === "utc";
}
