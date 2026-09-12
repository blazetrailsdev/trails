import { Base } from "./base.js";
import { zone, setZone } from "@blazetrails/activesupport";

interface TimezoneConfig {
  default?: "utc" | "local";
  awareAttributes?: boolean;
  awareTypes?: string[];
  zone?: string;
}

export async function withTimezoneConfig(
  cfg: TimezoneConfig,
  fn: () => Promise<void> | void,
): Promise<void> {
  const oldDefault = Base.defaultTimezone;
  const base = Base as any;

  const hadAwareAttributes = "timeZoneAwareAttributes" in base;
  const oldAwareAttributes = base.timeZoneAwareAttributes;
  const hadAwareTypes = "timeZoneAwareTypes" in base;
  const oldAwareTypes = base.timeZoneAwareTypes;
  const oldZone = zone();

  try {
    if (cfg.default !== undefined) Base.defaultTimezone = cfg.default;
    if (cfg.awareAttributes !== undefined) base.timeZoneAwareAttributes = cfg.awareAttributes;
    if (cfg.awareTypes !== undefined) base.timeZoneAwareTypes = cfg.awareTypes;
    if (cfg.zone !== undefined) setZone(cfg.zone);
    await fn();
  } finally {
    Base.defaultTimezone = oldDefault;
    if (hadAwareAttributes) {
      base.timeZoneAwareAttributes = oldAwareAttributes;
    } else {
      delete base.timeZoneAwareAttributes;
    }
    if (hadAwareTypes) {
      base.timeZoneAwareTypes = oldAwareTypes;
    } else {
      delete base.timeZoneAwareTypes;
    }
    setZone(oldZone);
  }
}
