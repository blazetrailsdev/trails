/**
 * Timezone helper — timezone awareness for type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::Timezone
 *
 * Provides helpers to check if the default timezone is UTC and
 * to retrieve the current default timezone setting.
 */
import { Temporal } from "@blazetrails/activesupport/temporal";

export interface Timezone {
  isUtc(): boolean;
  defaultTimezone(): "utc" | "local";
}

let _defaultTimezone: "utc" | "local" = "utc";

export function isUtc(): boolean {
  return _defaultTimezone === "utc";
}

export function defaultTimezone(): "utc" | "local" {
  return _defaultTimezone;
}

/**
 * Trails-only seam with no Rails counterpart. Rails' helper derives the zone
 * from `Time.zone_default` (timezone.rb:11) and exposes no setter at all;
 * trails has no `Time.zone_default` yet, so the value is held here and pushed
 * in by `activerecord`'s `setDefaultTimezone`. Converging this onto a real
 * `Time.zone_default` is tracked by RFC 0081's
 * `converge-activemodel-timezone-onto-time-zone-default` story.
 *
 * @internal
 */
export function setDefaultTimezone(tz: "utc" | "local"): void {
  _defaultTimezone = tz;
}

/** Resolves to "UTC" when the default timezone is UTC, else the host system zone. */
export function configuredTimezone(): string {
  return isUtc() ? "UTC" : Temporal.Now.timeZoneId();
}
