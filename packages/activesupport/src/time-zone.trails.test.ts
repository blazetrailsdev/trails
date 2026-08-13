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

describe("TimeZone country zone membership", () => {
  /**
   * `TZInfo::Country#zone_identifiers` reads tzdata's `zone1970.tab`, which
   * files a zone under every country that observes it; ECMA-402's CLDR table
   * names one country per zone. Pinned by FULL membership rather than
   * `toContain`, because the gap this covers is a MISSING member —
   * `Asia/Tokyo` under `au`, `Europe/Simferopol` under `ru` — which every
   * `assert_includes`-style assertion in `time_zone.test.ts` is blind to.
   * Both lists are `TZInfo::Country.get(code).zone_identifiers` run through
   * Rails' MAPPING, in Rails' `<=>` order.
   */
  it("country zones agree with TZInfo zone_identifiers for au", () => {
    expect(TimeZone.countryZones("au").map((z) => z.name)).toEqual([
      "Perth",
      "Australia/Eucla",
      "Osaka",
      "Sapporo",
      "Tokyo",
      "Adelaide",
      "Australia/Broken_Hill",
      "Darwin",
      "Antarctica/Macquarie",
      "Australia/Lindeman",
      "Brisbane",
      "Hobart",
      "Melbourne",
      "Sydney",
      "Australia/Lord_Howe",
    ]);
  });

  it("country zones agree with TZInfo zone_identifiers for ru", () => {
    expect(TimeZone.countryZones("ru").map((z) => z.name)).toEqual([
      "Kaliningrad",
      "Europe/Kirov",
      "Europe/Simferopol",
      "Moscow",
      "St. Petersburg",
      "Volgograd",
      "Europe/Astrakhan",
      "Europe/Saratov",
      "Europe/Ulyanovsk",
      "Samara",
      "Ekaterinburg",
      "Asia/Omsk",
      "Asia/Barnaul",
      "Asia/Novokuznetsk",
      "Asia/Tomsk",
      "Krasnoyarsk",
      "Novosibirsk",
      "Irkutsk",
      "Asia/Chita",
      "Asia/Khandyga",
      "Yakutsk",
      "Asia/Ust-Nera",
      "Vladivostok",
      "Asia/Sakhalin",
      "Magadan",
      "Srednekolymsk",
      "Asia/Anadyr",
      "Kamchatka",
    ]);
  });

  /**
   * `zone1970.tab` knows `bv`/`hm` and files no zone under either, so
   * `TZInfo::Country.get("bv").zone_identifiers` is `[]` and Rails answers an
   * empty list rather than raising `InvalidCountryCode`.
   */
  it("country zones for a known zoneless country answer an empty list", () => {
    expect(TimeZone.countryZones("bv")).toEqual([]);
    expect(TimeZone.countryZones("hm")).toEqual([]);
  });

  it("country zones for an unknown country code raise", () => {
    expect(() => TimeZone.countryZones("zz")).toThrow(/Invalid country code/);
  });
});
