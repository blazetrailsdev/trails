/**
 * Test helpers that mirror Rails' ActiveRecord::TestCase helpers.
 *
 * Mirrors: activerecord/test/cases/test_case.rb
 */
import { getDefaultTimezone, setDefaultTimezone } from "./type/internal/timezone.js";
import { Base } from "./base.js";

interface TimezoneConfig {
  /** Mirrors Rails' `default_timezone` — "utc" or "local". */
  default?: "utc" | "local";
  /** Mirrors Rails' `time_zone_aware_attributes`. */
  awareAttributes?: boolean;
  /** Mirrors Rails' `time_zone_aware_types`. */
  awareTypes?: string[];
}

/**
 * Temporarily applies timezone-related configuration, yields, then restores.
 *
 * Mirrors: ActiveRecord::TestCase#with_timezone_config
 */
export async function withTimezoneConfig(
  cfg: TimezoneConfig,
  fn: () => Promise<void> | void,
): Promise<void> {
  const oldDefault = getDefaultTimezone();
  const base = Base as any;

  // Snapshot existence + value so restore is symmetric: if the property wasn't
  // present before we set it, we delete it on restore rather than leaving it.
  const hadAwareAttributes = "timeZoneAwareAttributes" in base;
  const oldAwareAttributes = base.timeZoneAwareAttributes;
  const hadAwareTypes = "timeZoneAwareTypes" in base;
  const oldAwareTypes = base.timeZoneAwareTypes;

  try {
    if (cfg.default !== undefined) setDefaultTimezone(cfg.default);
    // Apply unconditionally — mirrors Rails' Base.time_zone_aware_attributes = cfg[:aware_attributes].
    // If Base doesn't define the property yet the assignment still takes effect (JS class property),
    // making the helper forward-compatible when the wiring lands.
    if (cfg.awareAttributes !== undefined) base.timeZoneAwareAttributes = cfg.awareAttributes;
    if (cfg.awareTypes !== undefined) base.timeZoneAwareTypes = cfg.awareTypes;
    await fn();
  } finally {
    setDefaultTimezone(oldDefault);
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
  }
}
