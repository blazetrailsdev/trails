/**
 * Timezone helper — timezone awareness for type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::Timezone
 *
 * Provides helpers to check if the default timezone is UTC and
 * to retrieve the current default timezone setting.
 */
import { getZoneDefault } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

export interface Timezone {
  isUtc(): boolean;
  defaultTimezone(): "utc" | "local";
}

export function isUtc(): boolean {
  const zoneDefault = getZoneDefault();
  if (zoneDefault) return zoneDefault.name === "UTC";
  return true;
}

export function defaultTimezone(): "utc" | "local" {
  return isUtc() ? "utc" : "local";
}

/** Resolves to "UTC" when the default timezone is UTC, else the host system zone. */
export function configuredTimezone(): string {
  return isUtc() ? "UTC" : Temporal.Now.timeZoneId();
}
