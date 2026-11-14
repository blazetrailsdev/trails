import { describe, expect, it } from "vitest";
import { rational, rbHash } from "@blazetrails/ruby-compat";
import { CountryTimezone } from "../lib/index.js";

describe("TCCountryTimezone", () => {
  it("identifier", () => {
    const ct = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    expect(ct.identifier).toBe("Europe/London");
    expect(Object.isFrozen(ct.identifier)).toBeTruthy();
  });

  it("latitude", () => {
    const ct = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    expect(ct.latitude.equals(rational(2059, 40))).toBe(true);
  });

  it("longitude", () => {
    const ct = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    expect(ct.longitude.equals(rational(-5, 16))).toBe(true);
  });

  it("default description", () => {
    const ct = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    expect(ct.description).toBeNull();
  });

  it("nil description", () => {
    const nilFrozen = Object.isFrozen(null);
    const ct = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16), null);
    expect(ct.description).toBeNull();

    expect(Object.isFrozen(null)).toEqual(nilFrozen);
  });

  it("description", () => {
    const ct = new CountryTimezone(
      "America/New_York",
      rational(48857, 1200),
      rational(-266423, 3600),
      "Eastern Time",
    );
    expect(ct.description).toBe("Eastern Time");
    expect(Object.isFrozen(ct.description)).toBeTruthy();
  });

  it("equality 1", () => {
    const ct1 = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    const ct2 = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    const ct3 = new CountryTimezone(
      "Europe/London",
      rational(2059, 40),
      rational(-5, 16),
      "Description",
    );
    const ct4 = new CountryTimezone("Europe/LondonB", rational(2059, 40), rational(-5, 16));
    const ct5 = new CountryTimezone("Europe/London", rational(2060, 40), rational(-5, 16));
    const ct6 = new CountryTimezone("Europe/London", rational(2059, 40), rational(-6, 16));

    expect(ct1.equals(ct1)).toBe(true);
    expect(ct1.equals(ct2)).toBe(true);
    expect(ct1.equals(ct3)).toBe(false);
    expect(ct1.equals(ct4)).toBe(false);
    expect(ct1.equals(ct5)).toBe(false);
    expect(ct1.equals(ct6)).toBe(false);
  });

  it("equality 2", () => {
    const ct1 = new CountryTimezone(
      "America/New_York",
      rational(48857, 1200),
      rational(-266423, 3600),
      "Eastern Time",
    );
    const ct2 = new CountryTimezone(
      "America/New_York",
      rational(48857, 1200),
      rational(-266423, 3600),
      "Eastern Time2",
    );

    expect(ct1.equals(ct1)).toBe(true);
    expect(ct1.equals(ct2)).toBe(false);
  });

  it("equality non country timezone", () => {
    const ct = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));

    expect(ct.equals({})).toBe(false);
  });

  it("eql 1", () => {
    const ct1 = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    const ct2 = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    const ct3 = new CountryTimezone(
      "Europe/London",
      rational(2059, 40),
      rational(-5, 16),
      "Description",
    );
    const ct4 = new CountryTimezone("Europe/LondonB", rational(2059, 40), rational(-5, 16));
    const ct5 = new CountryTimezone("Europe/London", rational(2060, 40), rational(-5, 16));
    const ct6 = new CountryTimezone("Europe/London", rational(2059, 40), rational(-6, 16));

    expect(ct1.eql(ct1)).toBe(true);
    expect(ct1.eql(ct2)).toBe(true);
    expect(ct1.eql(ct3)).toBe(false);
    expect(ct1.eql(ct4)).toBe(false);
    expect(ct1.eql(ct5)).toBe(false);
    expect(ct1.eql(ct6)).toBe(false);
  });

  it("eql 2", () => {
    const ct1 = new CountryTimezone(
      "America/New_York",
      rational(48857, 1200),
      rational(-266423, 3600),
      "Eastern Time",
    );
    const ct2 = new CountryTimezone(
      "America/New_York",
      rational(48857, 1200),
      rational(-266423, 3600),
      "Eastern Time2",
    );

    expect(ct1.eql(ct1)).toBe(true);
    expect(ct1.eql(ct2)).toBe(false);
  });

  it("eql non country timezone", () => {
    const ct = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));

    expect(ct.eql({})).toBe(false);
  });

  it("hash new", () => {
    const ct1 = new CountryTimezone("Europe/London", rational(2059, 40), rational(-5, 16));
    const ct2 = new CountryTimezone(
      "America/New_York",
      rational(48857, 1200),
      rational(-266423, 3600),
      "Eastern Time",
    );

    expect(ct1.hash()).toBe(rbHash(["Europe/London", rational(2059, 40), rational(-5, 16), null]));
    expect(ct2.hash()).toBe(
      rbHash(["America/New_York", rational(48857, 1200), rational(-266423, 3600), "Eastern Time"]),
    );
  });
});
