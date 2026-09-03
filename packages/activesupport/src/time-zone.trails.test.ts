import { describe, expect, it } from "vitest";

import { TimeZone, AmbiguousTime, PeriodNotFound } from "./values/time-zone.js";
import { ArgumentError } from "./hash-utils.js";
import { Time } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";

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

  it("country zones for a link-backed country answer the canonical zone's Rails name", () => {
    expect(TimeZone.countryZones("va")).toEqual([TimeZone.find("Rome")]);
  });

  it("country zones for a link-backed country whose canonical zone has no mapping answer the canonical name", () => {
    expect(TimeZone.countryZones("ua").map((z) => z.name)).toContain("Europe/Kyiv");
    expect(TimeZone.countryZones("ua").map((z) => z.name)).not.toContain("Europe/Kiev");
  });
});

describe("TimeZone country zone membership", () => {
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

  it("country zones for a known zoneless country answer an empty list", () => {
    expect(TimeZone.countryZones("bv")).toEqual([]);
    expect(TimeZone.countryZones("hm")).toEqual([]);
  });

  it("country zones for an unknown country code raise", () => {
    expect(() => TimeZone.countryZones("zz")).toThrow(/Invalid country code/);
  });
});

describe("TimeZoneLocalPeriodsTest", () => {
  const zone = () => TimeZone.find("Eastern Time (US & Canada)")!;

  it("periods_for_local returns one period for an unambiguous local time", () => {
    const periods = zone().periodsForLocal(Time.utc(2024, 1, 15, 12));
    expect(periods.length).toBe(1);
    expect(periods[0].observedUtcOffset).toBe(-5 * 3600);
    expect(periods[0].isDst()).toBe(false);
  });

  it("periods_for_local returns both periods for an ambiguous local time", () => {
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
