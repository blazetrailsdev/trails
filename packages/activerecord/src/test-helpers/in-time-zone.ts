/**
 * Mirrors Rails' `ActiveRecord::InTimeZone` test helper from
 * activerecord/test/cases/helper.rb:
 *
 *   module InTimeZone
 *     private
 *       def in_time_zone(zone)
 *         old_zone = Time.zone
 *         old_tz   = ActiveRecord::Base.time_zone_aware_attributes
 *         Time.zone = zone ? ActiveSupport::TimeZone[zone] : nil
 *         ActiveRecord::Base.time_zone_aware_attributes = !zone.nil?
 *         yield
 *       ensure
 *         Time.zone = old_zone
 *         ActiveRecord::Base.time_zone_aware_attributes = old_tz
 *       end
 *   end
 *
 * Runs `fn` with `Time.zone` set to `zone` and `Base.timeZoneAwareAttributes`
 * toggled to `zone != null`, restoring both afterwards. A `null` zone clears
 * the zone and disables time-zone-aware attributes (the Rails `zone.nil?` path).
 */
import { getZone, setZone, resetZone, isZoneExplicit } from "@blazetrails/activesupport";
import { Base } from "../base.js";

export async function inTimeZone(
  zone: string | null,
  fn: () => Promise<void> | void,
): Promise<void> {
  const wasExplicit = isZoneExplicit();
  const oldZone = getZone();
  const oldAware = Base.timeZoneAwareAttributes;

  if (zone != null) setZone(zone);
  else resetZone();
  Base.timeZoneAwareAttributes = zone != null;

  try {
    await fn();
  } finally {
    if (wasExplicit && oldZone) setZone(oldZone);
    else resetZone();
    Base.timeZoneAwareAttributes = oldAware;
  }
}
