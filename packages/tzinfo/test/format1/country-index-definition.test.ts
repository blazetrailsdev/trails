import { describe, expect, it } from "vitest";
import { include, rational, type Extended } from "@blazetrails/ruby-compat";
import { CountryTimezone, TZInfo } from "../../lib/index.js";
import { CountryInfo } from "../../lib/data-sources/country-info.js";
import { CountryDefiner } from "../../lib/format1/country-definer.js";
import { CountryIndexDefinition } from "../../lib/format1/country-index-definition.js";
import { StringDeduper } from "../../lib/string-deduper.js";

type Host = Extended<(typeof CountryIndexDefinition)["ClassMethods"]>;

function newModule(): Host {
  const m = {};
  include(m, CountryIndexDefinition);
  return m as unknown as Host;
}

describe("TCCountryIndexDefinition", () => {
  it("none", () => {
    const m = newModule();

    const countries = m.countries;
    expect(countries).toEqual({});
    expect(Object.isFrozen(countries)).toBeTruthy();
  });

  it("multiple", () => {
    const m = newModule();

    m.country("ZZ", "Country One", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/1", 3, 2, 41, 20);
    });

    m.country("AA", "Aland", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/3", 71, 30, 358, 15, "Zone 3");
      c.timezone("Test/Zone/2", 41, 20, 211, 30);
    });

    m.country("TE", "Three");

    m.country("FR", "Four", () => {});

    const countries = m.countries;
    expect(Object.keys(countries)).toEqual(["ZZ", "AA", "TE", "FR"]);
    expect(Object.isFrozen(countries)).toBeTruthy();

    let country = countries["ZZ"];
    expect(country).toBeInstanceOf(CountryInfo);
    expect(country.code).toBe("ZZ");
    expect(country.name).toBe("Country One");
    expect(country.zones).toEqual([
      new CountryTimezone("Test/Zone/1", rational(3, 2), rational(41, 20)),
    ]);

    country = countries["AA"];
    expect(country).toBeInstanceOf(CountryInfo);
    expect(country.code).toBe("AA");
    expect(country.name).toBe("Aland");
    expect(country.zones).toEqual([
      new CountryTimezone("Test/Zone/3", rational(71, 30), rational(358, 15), "Zone 3"),
      new CountryTimezone("Test/Zone/2", rational(41, 20), rational(211, 30)),
    ]);

    country = countries["TE"];
    expect(country).toBeInstanceOf(CountryInfo);
    expect(country.code).toBe("TE");
    expect(country.name).toBe("Three");
    expect(country.zones).toEqual([]);

    country = countries["FR"];
    expect(country).toBeInstanceOf(CountryInfo);
    expect(country.code).toBe("FR");
    expect(country.name).toBe("Four");
    expect(country.zones).toEqual([]);
  });

  it("redefined", () => {
    const m = newModule();

    m.country("TT", "Test1", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/1", 1, 2, 3, 4, "Zone 1");
    });

    m.country("TT", "Test2", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/2", 5, 6, 7, 8, "Zone 2");
    });

    const countries = m.countries;
    expect(Object.keys(countries)).toEqual(["TT"]);
    expect(Object.isFrozen(countries)).toBeTruthy();

    const country = countries["TT"];
    expect(country).toBeInstanceOf(CountryInfo);
    expect(country.code).toBe("TT");
    expect(country.name).toBe("Test2");
    expect(country.zones).toEqual([
      new CountryTimezone("Test/Zone/2", rational(5, 6), rational(7, 8), "Zone 2"),
    ]);
  });

  it("strings frozen", () => {
    const m = newModule();

    m.country("TT", "Test", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/1", 1, 2, 3, 4, "Zone One");
    });

    const countries = m.countries;
    expect(Object.keys(countries).every((k) => Object.isFrozen(k))).toBeTruthy();
    const country = countries["TT"];
    expect(Object.isFrozen(country.code)).toBeTruthy();
    expect(Object.isFrozen(country.name)).toBeTruthy();
    const zone = country.zones[0];
    expect(Object.isFrozen(zone.identifier)).toBeTruthy();
    expect(Object.isFrozen(zone.description)).toBeTruthy();
  });

  it("strings deduped", () => {
    const m = newModule();

    m.country("TT", "Test", (c) => {
      c.timezone("Test/Zone/Shared1", 1, 2, 3, 4, "Shared 1");
      c.timezone("Test/Zone/Shared2", 5, 6, 7, 8, "Shared 2");
    });

    m.country("TU", "Test 2", (c) => {
      c.timezone("Test/Zone/Shared1", 9, 10, 11, 12, "Shared 1");
      c.timezone("Test/Zone/Shared2", 1, 2, 3, 4, "Shared 2");
    });

    const countries = m.countries;

    const countryTt = countries["TT"];
    const countryTu = countries["TU"];

    expect(countryTu.zones[0].identifier).toBe(countryTt.zones[0].identifier);
    expect(countryTu.zones[0].description).toBe(countryTt.zones[0].description);

    expect(countryTu.zones[1].identifier).toBe(countryTt.zones[1].identifier);
    expect(countryTu.zones[1].description).toBe(countryTt.zones[1].description);

    const sd = StringDeduper.global;
    expect(countryTt.zones[0].identifier).toBe(sd.dedupe("Test/Zone/Shared1"));
    expect(countryTt.zones[1].identifier).toBe(sd.dedupe("Test/Zone/Shared2"));
  });

  it("global and local string dedupers used for country definer", () => {
    let blockCalled = 0;
    let descriptionDeduper: unknown = null;

    const m = newModule();

    m.country("TT", "Test", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      const ivars = c as unknown as { identifierDeduper: unknown; descriptionDeduper: unknown };
      expect(ivars.identifierDeduper).toBe(StringDeduper.global);
      descriptionDeduper = ivars.descriptionDeduper;
      expect((descriptionDeduper as object).constructor).toBe(StringDeduper);
      blockCalled += 1;
    });

    expect(blockCalled).toBe(1);

    m.country("TU", "Test 2", (c) => {
      expect((c as unknown as { descriptionDeduper: unknown }).descriptionDeduper).toBe(
        descriptionDeduper,
      );
      blockCalled += 1;
    });

    expect(blockCalled).toBe(2);
  });

  it("tzinfo module alias", () => {
    expect(TZInfo.CountryIndexDefinition).toBe(CountryIndexDefinition);
  });
});
