import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadError, NameError } from "@blazetrails/ruby-compat";
import {
  CountryInfo,
  DataTimezoneInfo,
  InvalidCountryCode,
  InvalidTimezoneIdentifier,
  LinkedTimezoneInfo,
  TZInfo,
  TimezoneInfo,
} from "../../lib/index.js";
import { assertRaises } from "../test-utils.js";
import { loadPath } from "../tzinfo-data2/load-path.js";

const { RubyDataSource } = TZInfo.DataSources;

interface RubyDataSourceProtected {
  loadTimezoneInfo(identifier: unknown): TimezoneInfo;
  loadCountryInfo(code: unknown): CountryInfo;
  validateTimezoneIdentifier(identifier: unknown): string;
}

describe("TCRubyDataSource", () => {
  let dataSource: InstanceType<typeof RubyDataSource>;
  let ds: RubyDataSourceProtected;

  beforeAll(async () => {
    Object.assign(TZInfo.loadPath, loadPath);
    await RubyDataSource.load();
  });

  beforeEach(() => {
    dataSource = new RubyDataSource();
    ds = dataSource as unknown as RubyDataSourceProtected;
  });

  it("initialize not found", async () => {
    vi.resetModules();
    const fresh = await import("../../lib/index.js");
    let error: unknown;
    try {
      await fresh.TZInfo.DataSources.RubyDataSource.load();
      const ds = new fresh.TZInfo.DataSources.RubyDataSource();
      error = `No exception raised, returned ${ds} instead`;
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(fresh.TZInfo.DataSources.TZInfoDataNotFound);
    expect((error as Error).message).toBe(
      "The tzinfo-data gem could not be found (require 'tzinfo/data' failed).",
    );
  });

  it("load timezone info data", () => {
    const info = ds.loadTimezoneInfo("Europe/London");
    expect(info).toBeInstanceOf(DataTimezoneInfo);
    expect(info.identifier).toBe("Europe/London");
  });

  it("load timezone info linked", () => {
    const info = ds.loadTimezoneInfo("UTC");
    expect(info).toBeInstanceOf(LinkedTimezoneInfo);
    expect(info.identifier).toBe("UTC");
    expect((info as LinkedTimezoneInfo).linkToIdentifier).toBe("Etc/UTC");
  });

  it("load timezone info does not exist", () => {
    const error = assertRaises(InvalidTimezoneIdentifier, () =>
      ds.loadTimezoneInfo("Nowhere/Special"),
    );
    expect(error.message).toMatch(/\bNowhere\/Special\b/);
  });

  for (const encoding of ["utf_8", "utf_16"]) {
    it(`load timezone info in index but file does not exist with ${encoding} encoded identifier`, () => {
      const error = assertRaises(InvalidTimezoneIdentifier, () =>
        ds.loadTimezoneInfo("Europe/Berlin"),
      );

      expect(error.message).toMatch(/\bEurope\/Berlin\b/);
      expect(error.cause).toBeInstanceOf(LoadError);
    });

    it(`load timezone info module names do not match zone with ${encoding} encoded identifier`, () => {
      ds.validateTimezoneIdentifier = (identifier: unknown) => {
        if (identifier !== "Invalid/Incorrect_Module") {
          throw new Error(
            `Unexpected identifier passed to validate_timezone_identifier: ${identifier}`,
          );
        }
        return "Invalid/Incorrect_Module";
      };

      const error = assertRaises(InvalidTimezoneIdentifier, () =>
        ds.loadTimezoneInfo("Invalid/Incorrect_Module"),
      );

      expect(error.message).toMatch(/\bInvalid\/Incorrect_Module\b/);
      expect(error.cause).toBeInstanceOf(NameError);
    });
  }

  it("load timezone info invalid", () => {
    const error = assertRaises(InvalidTimezoneIdentifier, () =>
      ds.loadTimezoneInfo("../definitions/UTC"),
    );
    expect(error.message).toMatch(/\W\.\.\/definitions\/UTC\b/);
  });

  it("load timezone info nil", () => {
    const error = assertRaises(InvalidTimezoneIdentifier, () => ds.loadTimezoneInfo(null));
    expect(error.message).toMatch(/\bnil\b/);
  });

  it("load timezone info false", () => {
    const error = assertRaises(InvalidTimezoneIdentifier, () => ds.loadTimezoneInfo(false));
    expect(error.message).toMatch(/\bfalse\b/);
  });

  it("load timezone info case", () => {
    const error = assertRaises(InvalidTimezoneIdentifier, () =>
      ds.loadTimezoneInfo("europe/london"),
    );
    expect(error.message).toMatch(/\beurope\/london\b/);
  });

  it("load timezone info plus", () => {
    const info = ds.loadTimezoneInfo("Etc/GMT+1");
    expect(info.identifier).toBe("Etc/GMT+1");
  });

  it("load timezone info minus", () => {
    const info = ds.loadTimezoneInfo("Etc/GMT-1");
    expect(info.identifier).toBe("Etc/GMT-1");
  });

  it.skip("load timezone info tainted", () => {});

  it.skip("load timezone info tainted and frozen", () => {});

  it("load timezone info returned identifier frozen", () => {
    const info = ds.loadTimezoneInfo("Europe/London");
    expect(Object.isFrozen(info.identifier)).toBe(true);
  });

  // PERMANENT-SKIP: CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)"
  it.skip("load timezone info parameter remains unfrozen", () => {
    const identifier = "Europe/London";
    const info = ds.loadTimezoneInfo(identifier);
    expect(info.identifier).toBe("Europe/London");
    expect(info.identifier).not.toBe(identifier);
    expect(Object.isFrozen(identifier)).toBe(false);
  });

  it("get timezone info", () => {
    const info = dataSource.getTimezoneInfo("Europe/London");
    expect(info.identifier).toBe("Europe/London");
  });

  it("timezone identifiers", () => {
    const { Timezones } = (
      TZInfo as unknown as {
        Data: {
          Indexes: {
            Timezones: { dataTimezones: readonly string[]; linkedTimezones: readonly string[] };
          };
        };
      }
    ).Data.Indexes;
    const all = dataSource.timezoneIdentifiers();
    expect(all).toEqual([...Timezones.dataTimezones, ...Timezones.linkedTimezones].sort());
    expect(Object.isFrozen(all)).toBe(true);
    expect(all.every((i) => Object.isFrozen(i))).toBe(true);
  });

  it("data timezone identifiers", () => {
    const allData = dataSource.dataTimezoneIdentifiers();
    expect(allData).toBe(
      (TZInfo as unknown as { Data: { Indexes: { Timezones: { dataTimezones: unknown } } } }).Data
        .Indexes.Timezones.dataTimezones,
    );
    expect(Object.isFrozen(allData)).toBe(true);
    expect(allData.every((i) => Object.isFrozen(i))).toBe(true);
  });

  it("linked timezone identifiers", () => {
    const allLinked = dataSource.linkedTimezoneIdentifiers();
    expect(allLinked).toBe(
      (TZInfo as unknown as { Data: { Indexes: { Timezones: { linkedTimezones: unknown } } } }).Data
        .Indexes.Timezones.linkedTimezones,
    );
    expect(Object.isFrozen(allLinked)).toBe(true);
    expect(allLinked.every((i) => Object.isFrozen(i))).toBe(true);
  });

  it("load country info", () => {
    const info = ds.loadCountryInfo("GB");
    expect(info.code).toBe("GB");
  });

  it("load country info not exist", () => {
    const error = assertRaises(InvalidCountryCode, () => ds.loadCountryInfo("ZZ"));
    expect(error.message).toMatch(/\bZZ\b/);
  });

  it("load country info invalid", () => {
    const error = assertRaises(InvalidCountryCode, () => ds.loadCountryInfo("../Countries/GB"));
    expect(error.message).toMatch(/\W\.\.\/Countries\/GB\b/);
  });

  it("load country info nil", () => {
    const error = assertRaises(InvalidCountryCode, () => ds.loadCountryInfo(null));
    expect(error.message).toMatch(/\bnil\b/);
  });

  it("load country info false", () => {
    const error = assertRaises(InvalidCountryCode, () => ds.loadCountryInfo(false));
    expect(error.message).toMatch(/\bfalse\b/);
  });

  it("load country info case", () => {
    const error = assertRaises(InvalidCountryCode, () => ds.loadCountryInfo("gb"));
    expect(error.message).toMatch(/\bgb\b/);
  });

  it.skip("load country info tainted", () => {});

  it.skip("load country info tainted and frozen", () => {});

  it("load country info returned strings frozen", () => {
    const info = ds.loadCountryInfo("US");
    expect(Object.isFrozen(info.code)).toBe(true);
    expect(Object.isFrozen(info.name)).toBe(true);
    expect(info.zones.map((z) => z.identifier).every((i) => Object.isFrozen(i))).toBe(true);
    expect(info.zones.map((z) => z.description).every((d) => Object.isFrozen(d))).toBe(true);
  });

  it("get country info", () => {
    const info = dataSource.getCountryInfo("GB");
    expect(info.code).toBe("GB");
  });

  it("country codes", () => {
    const codes = dataSource.countryCodes();
    expect(codes).toEqual(
      Object.keys(
        (TZInfo as unknown as { Data: { Indexes: { Countries: { countries: object } } } }).Data
          .Indexes.Countries.countries,
      ).sort(),
    );
    expect(Object.isFrozen(codes)).toBe(true);
    expect(codes.every((c) => Object.isFrozen(c))).toBe(true);
    expect(dataSource.countryCodes()).toBe(codes);
  });

  it("to s", () => {
    expect(dataSource.toString()).toBe("Ruby DataSource: tzdb v2020d, tzinfo-data v2.2020.4.test");
  });

  it("inspect", () => {
    expect(dataSource.inspect()).toBe(
      "#<TZInfo::DataSources::RubyDataSource: tzdb v2020d, tzinfo-data v2.2020.4.test>",
    );
  });

  it("tzinfo data not found in loaded features", () => {
    const ds = new RubyDataSource();
    const c = ds.getCountryInfo("GB");
    expect(c.code).toBe("GB");
    const tz = ds.getTimezoneInfo("Europe/London");
    expect(tz.identifier).toBe("Europe/London");
  });
});
