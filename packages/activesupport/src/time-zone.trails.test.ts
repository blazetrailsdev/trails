import { describe, expect, it } from "vitest";

import { TimeZone, AmbiguousTime, PeriodNotFound } from "./values/time-zone.js";
import { ArgumentError } from "./hash-utils.js";
import { Rational, Time } from "@blazetrails/date";

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

/**
 * trails-only coverage for the local-side period lookups
 * (`periods_for_local` / `period_for_local`, time_zone.rb:559-565). Rails
 * leans on TZInfo's own suite for the ambiguous and nonexistent local times;
 * trails computes them off `Intl`, so the two edges are covered here.
 */
describe("TimeZoneLocalPeriodsTest", () => {
  const zone = () => TimeZone.find("Eastern Time (US & Canada)")!;

  it("periods_for_local returns one period for an unambiguous local time", () => {
    const periods = zone().periodsForLocal(Time.utc(2024, 1, 15, 12));
    expect(periods.length).toBe(1);
    expect(periods[0].observedUtcOffset).toBe(-5 * 3600);
    expect(periods[0].isDst()).toBe(false);
  });

  it("periods_for_local returns both periods for an ambiguous local time", () => {
    // 2006-10-29 01:30 local occurs twice: once as EDT, once as EST.
    const periods = zone().periodsForLocal(Time.utc(2006, 10, 29, 1, 30));
    expect(periods.length).toBe(2);
    expect(periods.map((period) => period.observedUtcOffset)).toEqual([-4 * 3600, -5 * 3600]);
  });

  it("period_for_local resolves an ambiguous local time with the dst argument", () => {
    const ambiguous = Time.utc(2006, 10, 29, 1, 30);
    expect(zone().periodForLocal(ambiguous).isDst()).toBe(true);
    expect(zone().periodForLocal(ambiguous, false).isDst()).toBe(false);
  });

  it("periods_for_local returns no periods for a nonexistent local time", () => {
    // 2024-03-10 02:30 local never happens: the clocks jump 02:00 to 03:00.
    expect(zone().periodsForLocal(Time.utc(2024, 3, 10, 2, 30))).toEqual([]);
  });

  it("period_for_local raises for a nonexistent local time", () => {
    expect(() => zone().periodForLocal(Time.utc(2024, 3, 10, 2, 30))).toThrow(PeriodNotFound);
  });

  it("local_to_utc raises for an ambiguity dst does not resolve", () => {
    expect(() => zone().localToUtc(Time.utc(2006, 10, 29, 1, 30), null)).toThrow(AmbiguousTime);
    expect(
      zone()
        .localToUtc(Time.utc(2006, 10, 29, 1, 30))
        .toS(),
    ).toBe(Time.utc(2006, 10, 29, 5, 30).toS());
  });

  it("iso8601 and rfc3339 keep sub-millisecond digits", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    expect(eastern.iso8601("1999-12-31T19:00:00.123456789").nsec).toBe(123456789);
    expect(eastern.rfc3339("1999-12-31T19:00:00.123456789-05:00").nsec).toBe(123456789);
  });

  it("iso8601 and rfc3339 raise ArgumentError on an invalid date", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    expect(() => eastern.iso8601(null)).toThrow(ArgumentError);
    expect(() => eastern.iso8601("foobar")).toThrow(ArgumentError);
    expect(() => eastern.rfc3339("1999-12-31")).toThrow(ArgumentError);
  });

  it("strptime %Q keeps digits below the millisecond", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = eastern.strptime("946684800123456", "%Q")!;
    expect(twz.toI()).toBe(946684800123);
    expect(twz.nsec).toBe(456000000);
  });

  it("utc_to_local keeps digits below the microsecond on the legacy arm", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    const utc = Time.utc(2000, 1, 1, 0, 0, 0, 123456.789);
    expect(utc.nsec).toBe(123456789);
    expect((eastern.utcToLocal(utc) as Time).nsec).toBe(123456789);
  });

  it("at keeps digits below the millisecond", () => {
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    expect(eastern.at(946684800, 123456.789).nsec).toBe(123456789);
    expect(eastern.at(new Rational(946684800123456789n, 1_000_000_000n)).nsec).toBe(123456789);
  });
});
