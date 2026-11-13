import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { CountryInfo } from "../../lib/index.js";
import { assertRaises } from "../test-utils.js";

describe("TCCountryInfo", () => {
  it("initialize nil code", () => {
    const error = assertRaises(
      ArgumentError,
      () => new CountryInfo(null as unknown as string, "Zzz", []),
    );
    expect(error.message).toMatch(/\bcode\b/);
  });

  it("initialize nil name", () => {
    const error = assertRaises(
      ArgumentError,
      () => new CountryInfo("ZZ", null as unknown as string, []),
    );
    expect(error.message).toMatch(/\bname\b/);
  });

  it("initialize nil zones", () => {
    const error = assertRaises(
      ArgumentError,
      () => new CountryInfo("ZZ", "Zzz", null as unknown as unknown[]),
    );
    expect(error.message).toMatch(/\bzones\b/);
  });

  it("code", () => {
    const ci = new CountryInfo("ZZ", "Zzz", []);
    expect(ci.code).toBe("ZZ");
  });

  // PERMANENT-SKIP: CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)"
  it.skip("code frozen", () => {
    const code = "ZZ";
    const ci = new CountryInfo(code, "Zzz", []);
    expect(ci.code).toBe(code);
    expect(Object.isFrozen(ci.code)).toBe(true);
  });

  it("name", () => {
    const ci = new CountryInfo("ZZ", "Zzz", []);
    expect(ci.name).toBe("Zzz");
  });

  // PERMANENT-SKIP: CLAUDE.md § "Ruby Strings are JS string primitives (no mutable String carrier)"
  it.skip("name frozen", () => {
    const name = "Zzz";
    const ci = new CountryInfo("ZZ", name, []);
    expect(ci.name).toBe(name);
    expect(Object.isFrozen(ci.name)).toBe(true);
  });

  it("zones empty", () => {
    const zones: unknown[] = [];
    const ci = new CountryInfo("ZZ", "Zzz", zones);
    const value = ci.zones;
    expect(value).toEqual([]);
    expect(value).toBe(zones);
    expect(Object.isFrozen(value)).toBeTruthy();
  });

  // BLOCKED: tzinfo-country-and-country-timezone
  it.skip("zones", () => {});

  it("inspect", () => {
    const ci = new CountryInfo("ZZ", "Zzz", []);
    expect(ci.inspect()).toBe("#<TZInfo::DataSources::CountryInfo: ZZ>");
  });
});
