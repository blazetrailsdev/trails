import { describe, it } from "vitest";

// TimeWithZoneTest and TimeZoneTest require ActiveSupport::TimeZone infrastructure
// which depends on a full timezone database (TZInfo) not available in plain JS/TS.
// All tests are skipped pending timezone support implementation.
describe("TimeZoneTest", () => {
  it.skip("utc_to_local");
  it.skip("local_to_utc");
  it.skip("period_for_utc");
  it.skip("period_for_local");
  it.skip("local_to_utc_enforces_spring_dst_rules");
  it.skip("local_to_utc_enforces_fall_dst_rules");
  it.skip("name");
  it.skip("formatted_offset_with_utc");
  it.skip("formatted_offset_with_local");
  it.skip("abbreviation");
  it.skip("now");
  it.skip("today");
  it.skip("yesterday");
  it.skip("tomorrow");
  it.skip("parse");
  it.skip("parse without utc offset");
  it.skip("parse with incomplete date");
  it.skip("strptime");
  it.skip("strptime with incomplete date");
  it.skip("local");
  it.skip("at");
  it.skip("at with time with zone");
  it.skip("all");
  it.skip("all utc aliases");
  it.skip("new");
  it.skip("us zones");
  it.skip("country zones");
  it.skip("country zones with mappings");
  it.skip("find by tzinfo with valid key");
  it.skip("find by tzinfo with invalid key");
  it.skip("raise on unknown zone");
  it.skip("find by country code");
  it.skip("zones with dst");
  it.skip("zones without dst");
  it.skip("seconds to utc offset");
  it.skip("formatted offset with given offset in seconds");
  it.skip("formatted offset with given offset in seconds and separator");
});
