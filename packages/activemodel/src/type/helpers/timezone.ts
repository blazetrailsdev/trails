import { getZoneDefault } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

export function isUtc(): boolean {
  const zoneDefault = getZoneDefault();
  if (zoneDefault) return zoneDefault.name === "UTC";
  return true;
}

export function defaultTimezone(): "utc" | "local" {
  return isUtc() ? "utc" : "local";
}

export function configuredTimezone(): string {
  return isUtc() ? "UTC" : Temporal.Now.timeZoneId();
}
