import { describe, expect, it } from "vitest";
import { include, rational } from "@blazetrails/ruby-compat";
import { CountryTimezone } from "../../lib/index.js";
import { CountryInfo } from "../../lib/data-sources/country-info.js";
import { CountryIndexDefiner } from "../../lib/format2/country-index-definer.js";
import {
  ClassMethods,
  CountryIndexDefinition,
  type CountryIndexDefinitionHost,
} from "../../lib/format2/country-index-definition.js";
import { StringDeduper } from "../../lib/string-deduper.js";

type Host = typeof ClassMethods & CountryIndexDefinitionHost;

function newModule(): Host {
  const m = {};
  include(m, CountryIndexDefinition);
  return m as unknown as Host;
}

describe("TCCountryIndexDefinition", () => {
  it("not defined", () => {
    const m = newModule();

    const countries = m.countries;
    expect(countries).toEqual({});
    expect(Object.isFrozen(countries)).toBeTruthy();
  });

  it("none", () => {
    const m = newModule();

    m.countryIndex((i) => {
      expect(i).toBeInstanceOf(CountryIndexDefiner);
    });

    const countries = m.countries;
    expect(countries).toEqual({});
    expect(Object.isFrozen(countries)).toBeTruthy();
  });

  it("multiple", () => {
    const m = newModule();

    m.countryIndex((i) => {
      expect(i).toBeInstanceOf(CountryIndexDefiner);
      i.timezone("t1", "Test/Zone/Shared1", -1, -2, -3, -4);
      i.timezone("t2", "Test/Zone/Shared2", 1, 2, 3, 4, "Shared 2");

      i.country("ZZ", "Country One", (c) => {
        c.timezone("t1");
        c.timezone("Test/Zone/1", 3, 2, 41, 20);
      });

      i.country("AA", "Aland", (c) => {
        c.timezone("Test/Zone/3", 71, 30, 358, 15, "Zone 3");
        c.timezone("Test/Zone/2", 41, 20, 211, 30);
        c.timezone("t1");
        c.timezone("t2");
      });

      i.country("TE", "Three");

      i.country("FR", "Four", () => {});
    });

    const countries = m.countries;
    expect(Object.keys(countries)).toEqual(["ZZ", "AA", "TE", "FR"]);
    expect(Object.isFrozen(countries)).toBeTruthy();

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

  it("global and local string dedupers used for country index definer", () => {
    let blockCalled = 0;

    const m = newModule();

    m.countryIndex((i) => {
      expect(i).toBeInstanceOf(CountryIndexDefiner);
      const ivars = i as unknown as { identifierDeduper: unknown; descriptionDeduper: object };
      expect(ivars.identifierDeduper).toBe(StringDeduper.global);
      expect(ivars.descriptionDeduper.constructor).toBe(StringDeduper);
      blockCalled += 1;
    });

    expect(blockCalled).toBe(1);
  });
});
