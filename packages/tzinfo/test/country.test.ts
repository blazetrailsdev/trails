import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Marshal, rational, rbHash } from "@blazetrails/ruby-compat";
import {
  Country,
  CountryInfo,
  CountryTimezone,
  DataSource,
  InvalidCountryCode,
  InvalidDataSource,
  Timezone,
} from "../lib/index.js";
import { assertRaises } from "./test-utils.js";

class CountriesTestDataSource extends DataSource {
  /** @internal */
  private readonly infos: Record<string, CountryInfo> = {
    FR: new CountryInfo("FR", "France", [
      new CountryTimezone("Europe/Paris", rational(146, 3), rational(7, 3)),
    ]),
    GB: new CountryInfo("GB", "Britain (UK)", [
      new CountryTimezone("Europe/London", rational(6181, 120), rational(-1, 40)),
    ]),
    US: new CountryInfo("US", "United States", [
      new CountryTimezone(
        "America/New_York",
        rational(48857, 1200),
        rational(-266423, 3600),
        "Eastern (most areas)",
      ),
      new CountryTimezone(
        "America/Chicago",
        rational(10477, 250),
        rational(-1052327, 12000),
        "Central (most areas)",
      ),
    ]),
  };

  override countryCodes(): readonly string[] {
    return Object.keys(this.infos);
  }

  protected override loadCountryInfo(code: string): CountryInfo {
    if (!Object.hasOwn(this.infos, code)) {
      throw new InvalidCountryCode(`Invalid country code: ${code == null ? "nil" : code}`);
    }
    return this.infos[code];
  }
}

describe("TCCountry", () => {
  let origDataSource: DataSource;

  beforeEach(() => {
    origDataSource = DataSource.set(new CountriesTestDataSource());
  });

  afterEach(() => {
    DataSource.set(origDataSource);
  });

  for (const encoding of ["iso_8859_1", "utf_8", "utf_16"]) {
    it(`get valid with ${encoding} encoded code`, () => {
      const c = Country.get("GB");

      expect(c).not.toBeNull();
      expect(c.code).toBe("GB");
    });

    it(`get not exist with ${encoding} encoded code`, () => {
      const error = assertRaises(InvalidCountryCode, () => Country.get("ZZ"));
      expect(error.message).toMatch(/\bZZ\b/);
    });

    it(`get invalid with ${encoding} encoded code`, () => {
      const error = assertRaises(InvalidCountryCode, () => Country.get("../Countries/GB"));
      expect(error.message).toMatch(/\W\.\.\/Countries\/GB\b/);
    });

    it(`get case with ${encoding} encoded code`, () => {
      const error = assertRaises(InvalidCountryCode, () => Country.get("gb"));
      expect(error.message).toMatch(/\bgb\b/);
    });
  }

  it("get nil", () => {
    const error = assertRaises(InvalidCountryCode, () => Country.get(null as unknown as string));
    expect(error.message).toMatch(/\bnil\b/);
  });

  it.skip("get tainted loaded", () => {});

  it.skip("get tainted and frozen loaded", () => {});

  it.skip("get tainted not previously loaded", () => {});

  it.skip("get tainted and frozen not previously loaded", () => {});

  it("all codes", () => {
    expect(Country.allCodes()).toEqual(DataSource.get().countryCodes());
  });

  it("all", () => {
    expect(Country.all().map((c) => c.code)).toEqual(Country.allCodes());
  });

  it("initialize", () => {
    const info = new CountryInfo("TT", "Test", []);
    const c = new Country(info);
    expect(c.code).toBe("TT");
    expect(c.name).toBe("Test");
    expect(c.zones()).toEqual([]);
  });

  it("code", () => {
    expect(Country.get("US").code).toBe("US");
  });

  it("name", () => {
    expect(Country.get("US").name).toBe("United States");
  });

  it("to s", () => {
    expect(Country.get("US").toString()).toBe(Country.get("US").name);
    expect(Country.get("GB").toString()).toBe(Country.get("GB").name);
  });

  it("inspect", () => {
    expect(Country.get("GB").inspect()).toBe("#<TZInfo::Country: GB>");
  });

  it("zone identifiers", () => {
    const zoneIdentifiers = Country.get("US").zoneIdentifiers();
    expect(zoneIdentifiers).toEqual(
      DataSource.get()
        .getCountryInfo("US")
        .zones.map((z) => z.identifier),
    );
  });

  it("zone names", () => {
    expect(Country.get("US").zoneNames()).toEqual(Country.get("US").zoneIdentifiers());
  });

  it("zones", () => {
    const zones = Country.get("US").zones();
    expect(zones).toBeInstanceOf(Array);
    expect(zones.map((z) => z.identifier)).toEqual(Country.get("US").zoneIdentifiers());

    zones.forEach((z) => expect(z).toBeInstanceOf(Timezone));
  });

  it("zone info", () => {
    const zoneInfo = Country.get("US").zoneInfo();
    expect(zoneInfo).toEqual(DataSource.get().getCountryInfo("US").zones);
    expect(Object.isFrozen(zoneInfo)).toBe(true);
  });

  it("compare", () => {
    expect(Country.get("GB").compareTo(Country.get("GB"))).toBe(0);
    expect(Country.get("GB").compareTo(Country.get("US"))).toBe(-1);
    expect(Country.get("US").compareTo(Country.get("GB"))).toBe(1);
    expect(Country.get("FR").compareTo(Country.get("US"))).toBe(-1);
    expect(Country.get("US").compareTo(Country.get("FR"))).toBe(1);
  });

  it("compare non comparable", () => {
    expect(Country.get("GB").compareTo({})).toBeNull();
  });

  it("equality", () => {
    expect(Country.get("GB").equals(Country.get("GB"))).toBe(true);
    expect(Country.get("GB").equals(Country.get("US"))).toBe(false);
    expect(!Country.get("GB").equals({})).toBeTruthy();
  });

  it("eql", () => {
    expect(Country.get("GB").eql(Country.get("GB"))).toBe(true);
    expect(Country.get("GB").eql(Country.get("US"))).toBe(false);
    expect(!Country.get("GB").eql({})).toBeTruthy();
  });

  it("hash", () => {
    expect(Country.get("GB").hash()).toBe(rbHash("GB"));
    expect(Country.get("US").hash()).toBe(rbHash("US"));
  });

  it("=~ operator matches against code", () => {
    const c = Country.get("GB");
    expect(c.matchOperator(/^GB$/)).toBe(0);
    expect(c.matchOperator(/B/)).toBe(1);
  });

  it("=~ operator returns nil when regexp does not match", () => {
    const c = Country.get("GB");
    expect(c.matchOperator(/US/)).toBeNull();
  });

  it("marshal", () => {
    const c = Country.get("US");
    const marshalledC = Marshal.load(Marshal.dump(c)) as Country;
    expect(marshalledC).toBeInstanceOf(Country);
    expect(marshalledC.code).toBe("US");
  });

  it("get missing data source", () => {
    DataSource.set(new DataSource());

    const error = assertRaises(InvalidDataSource, () => Country.get("GB"));
    expect(error.message).toBe("load_country_info not defined");
  });

  it("all codes missing data source", () => {
    DataSource.set(new DataSource());

    const error = assertRaises(InvalidDataSource, () => Country.allCodes());
    expect(error.message).toBe("country_codes not defined");
  });

  it("all missing data source", () => {
    DataSource.set(new DataSource());

    const error = assertRaises(InvalidDataSource, () => Country.all());
    expect(error.message).toBe("country_codes not defined");
  });
});
