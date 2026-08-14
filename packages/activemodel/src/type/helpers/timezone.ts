import { zoneDefault } from "@blazetrails/activesupport";

export function isUtc(): boolean {
  // Ruby's local is `default` (timezone.rb:10), which TS reserves.
  const defaultZone = zoneDefault();
  if (defaultZone) return defaultZone.name === "UTC";
  return true;
}

export function defaultTimezone(): "utc" | "local" {
  return isUtc() ? "utc" : "local";
}
