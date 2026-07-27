import { getZoneDefault } from "@blazetrails/activesupport";

export function isUtc(): boolean {
  const zoneDefault = getZoneDefault();
  if (zoneDefault) return zoneDefault.name === "UTC";
  return true;
}

export function defaultTimezone(): "utc" | "local" {
  return isUtc() ? "utc" : "local";
}
