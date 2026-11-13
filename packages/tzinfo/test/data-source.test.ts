import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError, TopLevel, constSet } from "@blazetrails/ruby-compat";
import {
  CountryInfo,
  DataSource,
  InvalidCountryCode,
  InvalidDataSource,
  InvalidTimezoneIdentifier,
  TimezoneInfo,
} from "../lib/index.js";
import { assertRaises } from "./test-utils.js";

class InitDataSource extends DataSource {}

class DummyDataSource extends DataSource {}

class TestDataSource extends DataSource {
  called = 0;
}
const TCDataSource = {};
constSet(TopLevel, "TCDataSource", TCDataSource);
constSet(TCDataSource, "TestDataSource", TestDataSource);

class GetTimezoneInfoTestDataSource extends TestDataSource {
  protected override loadTimezoneInfo(identifier: string): TimezoneInfo {
    this.called += 1;
    if (identifier === "Test/Invalid") throw new InvalidTimezoneIdentifier(identifier);
    return new TimezoneInfo(identifier);
  }
}

class GetCountryInfoTestDataSource extends TestDataSource {
  protected override loadCountryInfo(code: string): CountryInfo {
    this.called += 1;
    if (code === "XX") throw new InvalidCountryCode(code);
    return new CountryInfo(code, `Country ${code}`, []);
  }
}

class GetTimezoneIdentifiersTestDataSource extends DataSource {
  dataTimezoneIdentifiersCalled = 0;
  linkedTimezoneIdentifiersCalled = 0;

  constructor(
    private readonly _dataTimezoneIdentifiers: readonly string[],
    private readonly _linkedTimezoneIdentifiers: readonly string[],
  ) {
    super();
    Object.freeze(_dataTimezoneIdentifiers);
    Object.freeze(_linkedTimezoneIdentifiers);
  }

  override dataTimezoneIdentifiers(): readonly string[] {
    this.dataTimezoneIdentifiersCalled += 1;
    return this._dataTimezoneIdentifiers;
  }

  override linkedTimezoneIdentifiers(): readonly string[] {
    this.linkedTimezoneIdentifiersCalled += 1;
    return this._linkedTimezoneIdentifiers;
  }
}

class ValidateTimezoneIdentifierTestDataSource extends DataSource {
  readonly #data: readonly string[];
  readonly #linked: readonly string[];

  constructor(dataTimezoneIdentifiers: string[], linkedTimezoneIdentifiers: string[]) {
    super();
    this.#data = Object.freeze([...dataTimezoneIdentifiers].sort());
    this.#linked = Object.freeze([...linkedTimezoneIdentifiers].sort());
  }

  override dataTimezoneIdentifiers(): readonly string[] {
    return this.#data;
  }

  override linkedTimezoneIdentifiers(): readonly string[] {
    return this.#linked;
  }

  callValidateTimezoneIdentifier(identifier: unknown): string {
    return this.validateTimezoneIdentifier(identifier);
  }
}

class LookupCountryInfoTestDataSource extends DataSource {
  callLookupCountryInfo<T>(hash: Record<string, T>, code: unknown): T {
    return this.lookupCountryInfo(hash, code);
  }
}

class EagerLoadTestDataSource extends GetTimezoneIdentifiersTestDataSource {
  countryCodesCalled = 0;
  loadedTimezones: string[] = [];
  loadedCountries: string[] = [];

  constructor(
    dataTimezoneIdentifiers: string[],
    linkedTimezoneIdentifiers: string[],
    private readonly _countryCodes: string[],
  ) {
    super(dataTimezoneIdentifiers, linkedTimezoneIdentifiers);
  }

  override countryCodes(): readonly string[] {
    this.countryCodesCalled += 1;
    return this._countryCodes;
  }

  protected override loadTimezoneInfo(identifier: string): TimezoneInfo {
    this.loadedTimezones.push(identifier);
    return new TimezoneInfo(identifier);
  }

  protected override loadCountryInfo(code: string): CountryInfo {
    this.loadedCountries.push(code);
    return new CountryInfo(code, `Country ${code}`, []);
  }
}

describe("TCDataSource", () => {
  beforeEach(() => {
    DataSource.set(new InitDataSource());
  });

  it("get", () => {
    const dataSource = DataSource.get();
    expect(dataSource).toBeInstanceOf(InitDataSource);
  });

  it("set instance", () => {
    DataSource.set(new DummyDataSource());
    const dataSource = DataSource.get();
    expect(dataSource).toBeInstanceOf(DummyDataSource);
  });

  it("set invalid datasource type", () => {
    const error = assertRaises(ArgumentError, () => DataSource.set("other" as "ruby"));
    expect(error.message).toBe(
      "data_source_or_type must be a DataSource instance or a data source type (:ruby or :zoneinfo)",
    );
  });

  it("set not a datasource", () => {
    const error = assertRaises(ArgumentError, () => DataSource.set({} as DataSource));
    expect(error.message).toBe(
      "data_source_or_type must be a DataSource instance or a data source type (:ruby or :zoneinfo)",
    );
  });

  it("get timezone info", () => {
    const ds = new GetTimezoneInfoTestDataSource();
    const info = ds.getTimezoneInfo("Test/Simple");
    expect(info.identifier).toBe("Test/Simple");
    expect(ds.called).toBe(1);
  });

  it("get timezone info caches result", () => {
    const ds = new GetTimezoneInfoTestDataSource();
    const info = ds.getTimezoneInfo("Test/Cache");
    expect(info.identifier).toBe("Test/Cache");
    expect(ds.getTimezoneInfo("Test/Cache")).toBe(info);
    expect(ds.called).toBe(1);
  });

  it("get timezone info invalid identifier", () => {
    const ds = new GetTimezoneInfoTestDataSource();
    const error = assertRaises(InvalidTimezoneIdentifier, () => ds.getTimezoneInfo("Test/Invalid"));
    expect(error.message).toBe("Test/Invalid");
    expect(ds.called).toBeTruthy();
  });

  it("timezone identifiers", () => {
    const dataIdentifiers = ["Test/Aaa", "Test/Ccc"];
    const linkedIdentifiers = ["Test/Bbb"];
    const ds = new GetTimezoneIdentifiersTestDataSource(dataIdentifiers, linkedIdentifiers);
    const result = ds.timezoneIdentifiers();
    expect(result).toBeInstanceOf(Array);
    expect(result).toEqual(["Test/Aaa", "Test/Bbb", "Test/Ccc"]);
    expect(result[0]).toBe(dataIdentifiers[0]);
    expect(result[1]).toBe(linkedIdentifiers[0]);
    expect(result[2]).toBe(dataIdentifiers[1]);
    expect(Object.isFrozen(result)).toBeTruthy();
    expect(result.every((i) => Object.isFrozen(i))).toBeTruthy();
    expect(ds.dataTimezoneIdentifiersCalled).toBe(1);
    expect(ds.linkedTimezoneIdentifiersCalled).toBe(1);
  });

  it("timezone identifiers caches result", () => {
    const ds = new GetTimezoneIdentifiersTestDataSource(["Test/Aaa", "Test/Ccc"], ["Test/Bbb"]);
    const result = ds.timezoneIdentifiers();
    expect(ds.timezoneIdentifiers()).toBe(result);
    expect(ds.dataTimezoneIdentifiersCalled).toBe(1);
    expect(ds.linkedTimezoneIdentifiersCalled).toBe(1);
  });

  it("timezone identifiers returns data array if linked is empty", () => {
    const dataIdentifiers = ["Test/Aaa", "Test/Ccc"];
    const ds = new GetTimezoneIdentifiersTestDataSource(dataIdentifiers, []);
    const result = ds.timezoneIdentifiers();
    expect(result).toBe(dataIdentifiers);
    expect(ds.dataTimezoneIdentifiersCalled).toBe(1);
    expect(ds.linkedTimezoneIdentifiersCalled).toBe(1);
  });

  it("timezone identifiers caches result if linked is empty", () => {
    const dataIdentifiers = ["Test/Aaa", "Test/Ccc"];
    const ds = new GetTimezoneIdentifiersTestDataSource(dataIdentifiers, []);
    const result = ds.timezoneIdentifiers();
    expect(result).toBe(dataIdentifiers);
    expect(ds.timezoneIdentifiers()).toBe(dataIdentifiers);
    expect(ds.dataTimezoneIdentifiersCalled).toBe(1);
    expect(ds.linkedTimezoneIdentifiersCalled).toBe(1);
  });

  function abstractTest(method: string, ...args: unknown[]): void {
    const ds = new DataSource() as unknown as Record<string, (...a: unknown[]) => unknown>;
    const error = assertRaises(InvalidDataSource, () => ds[method](...args));
    expect(error.message).toBe(
      `${method.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)} not defined`,
    );
  }

  it("data timezone identifiers", () => {
    abstractTest("dataTimezoneIdentifiers");
  });

  it("linked timezone identifiers", () => {
    abstractTest("linkedTimezoneIdentifiers");
  });

  it("get country info", () => {
    const ds = new GetCountryInfoTestDataSource();
    const info = ds.getCountryInfo("CC");
    expect(info.code).toBe("CC");
    expect(ds.called).toBe(1);
  });

  it("get country info invalid identifier", () => {
    const ds = new GetCountryInfoTestDataSource();
    const error = assertRaises(InvalidCountryCode, () => ds.getCountryInfo("XX"));
    expect(error.message).toBe("XX");
    expect(ds.called).toBe(1);
  });

  it("country codes", () => {
    abstractTest("countryCodes");
  });

  it("to s", () => {
    expect(new DataSource().toString()).toBe("Default DataSource");
  });

  it("inspect", () => {
    expect(new TestDataSource().inspect()).toBe("#<TCDataSource::TestDataSource>");
  });

  it("load timezone info", () => {
    abstractTest("loadTimezoneInfo", "Test/Identifier");
  });

  it("load country info", () => {
    abstractTest("loadCountryInfo", "CC");
  });

  it("validate timezone identifier", () => {
    const dataIdentifiers = ["Test/One", "Test/Two", "Test/Three"];
    const linkedIdentifiers = ["Test/Four", "Test/Five"];
    const ds = new ValidateTimezoneIdentifierTestDataSource(dataIdentifiers, linkedIdentifiers);

    for (const identifiers of [dataIdentifiers, linkedIdentifiers]) {
      for (const identifier of identifiers) {
        expect(ds.callValidateTimezoneIdentifier(identifier)).toBe(identifier);
      }
    }

    for (const identifier of ["Test/Invalid", "Invalid/Test", "TST"]) {
      const error = assertRaises(InvalidTimezoneIdentifier, () =>
        ds.callValidateTimezoneIdentifier(identifier),
      );
      expect(error.message).toMatch(new RegExp(`\\b${identifier.replace("/", "\\/")}\\b`));
    }

    let error = assertRaises(InvalidTimezoneIdentifier, () =>
      ds.callValidateTimezoneIdentifier(null),
    );
    expect(error.message).toMatch(/\bnil\b/);

    error = assertRaises(InvalidTimezoneIdentifier, () => ds.callValidateTimezoneIdentifier(false));
    expect(error.message).toMatch(/\bfalse\b/);
  });

  it("lookup country info", () => {
    const ds = new LookupCountryInfoTestDataSource();
    const hash = { GB: {} };
    const info = ds.callLookupCountryInfo(hash, "GB");
    expect(info).toBe(hash.GB);
  });

  it("lookup country info not exist", () => {
    const ds = new LookupCountryInfoTestDataSource();
    const hash = { GB: {} };

    const error = assertRaises(InvalidCountryCode, () => ds.callLookupCountryInfo(hash, "ZZ"));

    expect(error.message).toMatch(/\bZZ\b/);
  });

  it("lookup country info nil", () => {
    const ds = new LookupCountryInfoTestDataSource();
    const hash = { GB: {} };

    const error = assertRaises(InvalidCountryCode, () => ds.callLookupCountryInfo(hash, null));

    expect(error.message).toMatch(/\bnil\b/);
  });

  it("lookup country info false", () => {
    const ds = new LookupCountryInfoTestDataSource();
    const hash = { GB: {} };

    const error = assertRaises(InvalidCountryCode, () => ds.callLookupCountryInfo(hash, false));

    expect(error.message).toMatch(/\bfalse\b/);
  });

  it("lookup country info case", () => {
    const ds = new LookupCountryInfoTestDataSource();
    const hash = { GB: {} };

    const error = assertRaises(InvalidCountryCode, () => ds.callLookupCountryInfo(hash, "gb"));

    expect(error.message).toMatch(/\bgb\b/);
  });

  it("eager load", () => {
    const dataTimezoneIdentifiers = ["Data/Zone1", "Data/Zone2"];
    const linkedTimezoneIdentifiers = ["Linked/Zone1", "Linked/Zone2"];
    const allTimezoneIdentifiers = [...dataTimezoneIdentifiers, ...linkedTimezoneIdentifiers];
    const countryCodes = ["AA", "BB", "CC"];
    const ds = new EagerLoadTestDataSource(
      dataTimezoneIdentifiers,
      linkedTimezoneIdentifiers,
      countryCodes,
    );
    expect(ds.eagerLoadBang()).toBeNull();
    expect(ds.dataTimezoneIdentifiersCalled).toBe(1);
    expect(ds.linkedTimezoneIdentifiersCalled).toBe(1);
    expect(ds.loadedTimezones).toEqual(allTimezoneIdentifiers);
    expect(ds.timezoneIdentifiers()).toEqual(allTimezoneIdentifiers);
    expect(ds.countryCodesCalled).toBe(1);
    expect(ds.loadedCountries).toEqual(countryCodes);
  });
});
