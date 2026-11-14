import { beforeEach, describe, expect, it } from "vitest";
import { rational } from "@blazetrails/ruby-compat";
import { CountryInfo, CountryTimezone } from "../../lib/index.js";
import { CountryDefiner } from "../../lib/format2/country-definer.js";
import { CountryIndexDefiner } from "../../lib/format2/country-index-definer.js";
import { StringDeduper } from "../../lib/string-deduper.js";

describe("TCCountryIndexDefiner", () => {
  let identifierDeduper: StringDeduper;
  let descriptionDeduper: StringDeduper;
  let definer: CountryIndexDefiner;

  beforeEach(() => {
    identifierDeduper = new StringDeduper();
    descriptionDeduper = new StringDeduper();
    definer = new CountryIndexDefiner(identifierDeduper, descriptionDeduper);
  });

  it("none", () => {
    const countries = definer.countries;
    expect(countries).toEqual({});
  });

  it("multiple", () => {
    definer.timezone("t1", "Test/Zone/Shared1", -1, -2, -3, -4);
    definer.timezone("t2", "Test/Zone/Shared2", 1, 2, 3, 4, "Shared 2");

    definer.country("ZZ", "Country One", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("t1");
      c.timezone("Test/Zone/1", 3, 2, 41, 20);
    });

    definer.country("AA", "Aland", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/3", 71, 30, 358, 15, "Zone 3");
      c.timezone("Test/Zone/2", 41, 20, 211, 30);
      c.timezone("t1");
      c.timezone("t2");
    });

    definer.country("TE", "Three");

    definer.country("FR", "Four", () => {});

    const countries = definer.countries;
    expect(Object.keys(countries)).toEqual(["ZZ", "AA", "TE", "FR"]);

    const countryZz = countries["ZZ"];
    expect(countryZz).toBeInstanceOf(CountryInfo);
    expect(countryZz.code).toBe("ZZ");
    expect(countryZz.name).toBe("Country One");
    expect(countryZz.zones).toEqual([
      new CountryTimezone("Test/Zone/Shared1", rational(-1, -2), rational(-3, -4)),
      new CountryTimezone("Test/Zone/1", rational(3, 2), rational(41, 20)),
    ]);

    const countryAa = countries["AA"];
    expect(countryAa).toBeInstanceOf(CountryInfo);
    expect(countryAa.code).toBe("AA");
    expect(countryAa.name).toBe("Aland");
    expect(countryAa.zones).toEqual([
      new CountryTimezone("Test/Zone/3", rational(71, 30), rational(358, 15), "Zone 3"),
      new CountryTimezone("Test/Zone/2", rational(41, 20), rational(211, 30)),
      new CountryTimezone("Test/Zone/Shared1", rational(-1, -2), rational(-3, -4)),
      new CountryTimezone("Test/Zone/Shared2", rational(1, 2), rational(3, 4), "Shared 2"),
    ]);

    expect(countryAa.zones[2]).toBe(countryZz.zones[0]);

    const countryTe = countries["TE"];
    expect(countryTe).toBeInstanceOf(CountryInfo);
    expect(countryTe.code).toBe("TE");
    expect(countryTe.name).toBe("Three");
    expect(countryTe.zones).toEqual([]);

    const countryFr = countries["FR"];
    expect(countryFr).toBeInstanceOf(CountryInfo);
    expect(countryFr.code).toBe("FR");
    expect(countryFr.name).toBe("Four");
    expect(countryFr.zones).toEqual([]);
  });

  it("redefined country", () => {
    definer.country("TT", "Test1", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/1", 1, 2, 3, 4, "Zone 1");
    });

    definer.country("TT", "Test2", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/2", 5, 6, 7, 8, "Zone 2");
    });

    const countries = definer.countries;
    expect(Object.keys(countries)).toEqual(["TT"]);

    const countryTt = countries["TT"];
    expect(countryTt).toBeInstanceOf(CountryInfo);
    expect(countryTt.code).toBe("TT");
    expect(countryTt.name).toBe("Test2");
    expect(countryTt.zones).toEqual([
      new CountryTimezone("Test/Zone/2", rational(5, 6), rational(7, 8), "Zone 2"),
    ]);
  });

  it("redefined shared timezone", () => {
    definer.timezone("t1", "Test/Zone/Shared1", -1, -2, -3, -4);
    definer.timezone("t1", "Test/Zone/Shared2", 1, 2, 3, 4, "Shared 2");

    definer.country("TT", "Test1", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("t1");
    });

    const countries = definer.countries;
    expect(Object.keys(countries)).toEqual(["TT"]);

    const countryTt = countries["TT"];
    expect(countryTt).toBeInstanceOf(CountryInfo);
    expect(countryTt.code).toBe("TT");
    expect(countryTt.name).toBe("Test1");
    expect(countryTt.zones).toEqual([
      new CountryTimezone("Test/Zone/Shared2", rational(1, 2), rational(3, 4), "Shared 2"),
    ]);
  });

  it("strings frozen", () => {
    definer.timezone("t1", "Test/Zone/Shared1", 1, 2, 3, 4, "Shared 1");

    definer.country("TT", "Test", (c) => {
      expect(c).toBeInstanceOf(CountryDefiner);
      c.timezone("Test/Zone/1", 1, 2, 3, 4, "Zone One");
      c.timezone("t1");
    });

    const countries = definer.countries;
    expect(Object.keys(countries).every((k) => Object.isFrozen(k))).toBe(true);

    const countryTt = countries["TT"];
    expect(Object.isFrozen(countryTt.code)).toBe(true);
    expect(Object.isFrozen(countryTt.name)).toBe(true);

    const zone0 = countryTt.zones[0] as CountryTimezone;
    expect(Object.isFrozen(zone0.identifier)).toBe(true);
    expect(Object.isFrozen(zone0.description)).toBe(true);

    const zone1 = countryTt.zones[1] as CountryTimezone;
    expect(Object.isFrozen(zone1.identifier)).toBe(true);
    expect(Object.isFrozen(zone1.description)).toBe(true);
  });

  it("strings deduped", () => {
    definer.timezone("t1", "Test/Zone/Shared1", 1, 2, 3, 4, "Shared 1");
    definer.timezone("t2", "Test/Zone/Shared2", 1, 2, 3, 4, "Shared 2");

    definer.country("TT", "Test", (c) => {
      c.timezone("t1");
      c.timezone("Test/Zone/Shared2", 5, 6, 7, 8, "Shared 2");
    });

    definer.country("TU", "Test 2", (c) => {
      c.timezone("Test/Zone/Shared1", 9, 10, 11, 12, "Shared 1");
      c.timezone("t2");
    });

    const countries = definer.countries;

    const tt = countries["TT"].zones as CountryTimezone[];
    const tu = countries["TU"].zones as CountryTimezone[];

    expect(tu[0].identifier).toBe(tt[0].identifier);
    expect(tu[0].description).toBe(tt[0].description);

    expect(tu[1].identifier).toBe(tt[1].identifier);
    expect(tu[1].description).toBe(tt[1].description);

    expect(tt[0].identifier).toBe(identifierDeduper.dedupe("Test/Zone/Shared1"));
    expect(tt[1].identifier).toBe(identifierDeduper.dedupe("Test/Zone/Shared2"));
    expect(tt[0].description).toBe(descriptionDeduper.dedupe("Shared 1"));
    expect(tt[1].description).toBe(descriptionDeduper.dedupe("Shared 2"));
  });

  it("identifier and description string dedupers used for country definer", () => {
    let blockCalled = 0;

    definer.country("TT", "Test", (c) => {
      blockCalled += 1;
      expect(c).toBeInstanceOf(CountryDefiner);
      expect((c as unknown as { identifierDeduper: unknown }).identifierDeduper).toBe(
        identifierDeduper,
      );
      expect((c as unknown as { descriptionDeduper: unknown }).descriptionDeduper).toBe(
        descriptionDeduper,
      );
      c.timezone("Test/Zone/1", 1, 2, 3, 4, "One");
    });

    expect(blockCalled).toBe(1);
  });
});
