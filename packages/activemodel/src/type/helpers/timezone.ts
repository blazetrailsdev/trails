/**
 * Timezone helper — timezone awareness for type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::Timezone
 *
 * Provides helpers to check if the default timezone is UTC and
 * to retrieve the current default timezone setting.
 */
export interface Timezone {
  isUtc(): boolean;
  defaultTimezone(): string;
}

let _defaultTimezone: "utc" | "local" = "utc";

export function isUtc(): boolean {
  return _defaultTimezone === "utc";
}

export function defaultTimezone(): string {
  return _defaultTimezone;
}

export function setDefaultTimezone(tz: "utc" | "local"): void {
  _defaultTimezone = tz;
}
