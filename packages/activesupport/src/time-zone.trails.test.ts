import { describe, expect, it } from "vitest";

import { TimeZone } from "./values/time-zone.js";

describe("TimeZoneTest", () => {
  it("clear resets the memos", () => {
    const before = TimeZone.all();
    const usBefore = TimeZone.usZones();
    const moscowBefore = TimeZone.find("Moscow");

    TimeZone.clear();

    const after = TimeZone.all();
    expect(after).not.toBe(before);
    expect(after.map((zone) => zone.name)).toEqual(before.map((zone) => zone.name));
    expect(TimeZone.usZones()).not.toBe(usBefore);
    expect(TimeZone.find("Moscow")).not.toBe(moscowBefore);
    expect(TimeZone.find("Moscow")!.name).toBe("Moscow");
  });

  /**
   * Rails' four `test_country_zones*` cases (time_zone_test.rb:850-867) all name
   * ZONE-backed countries, where ECMA-402's country table and
   * `TZInfo::Country#zone_identifiers` already agree. These pin the LINK-backed
   * ones, where `Intl` reports the link name (`Europe/Vatican`) and TZInfo
   * reports its canonical target (`Europe/Rome`) — the target being a MAPPING
   * value is what puts `load_country_zones` (time_zone.rb:276-281) on the
   * Rails-named branch. `ua` is the other arm: MAPPING still spells its key
   * `Europe/Kiev` (time_zone.rb:101), the link name, so the canonical
   * `Europe/Kyiv` misses `MAPPING.value?` and Rails takes `create(tz_id)`.
   */
  it("country zones for a link-backed country answer the canonical zone's Rails name", () => {
    expect(TimeZone.countryZones("va")).toEqual([TimeZone.find("Rome")]);
  });

  it("country zones for a link-backed country whose canonical zone has no mapping answer the canonical name", () => {
    expect(TimeZone.countryZones("ua").map((z) => z.name)).toContain("Europe/Kyiv");
    expect(TimeZone.countryZones("ua").map((z) => z.name)).not.toContain("Europe/Kiev");
  });
});
