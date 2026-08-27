import { zoneDefault } from "@blazetrails/activesupport";

export function isUtc(): boolean {
  const defaultZone = zoneDefault();
  if (defaultZone) return defaultZone.name === "UTC";
  return true;
}

export function defaultTimezone(): "utc" | "local" {
  return isUtc() ? "utc" : "local";
}
