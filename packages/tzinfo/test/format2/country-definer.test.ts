import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError, rational } from "@blazetrails/ruby-compat";
import { CountryTimezone } from "../../lib/index.js";
import { CountryDefiner } from "../../lib/format2/country-definer.js";
import { StringDeduper } from "../../lib/string-deduper.js";
import { assertRaises } from "../test-utils.js";

describe("TCCountryDefiner", () => {
  let identifierDeduper: StringDeduper;
  let descriptionDeduper: StringDeduper;

  beforeEach(() => {
    identifierDeduper = new StringDeduper();
    descriptionDeduper = new StringDeduper();
  });

  function createCountryDefiner(sharedTimezones: Record<string, CountryTimezone>) {
    return new CountryDefiner(sharedTimezones, identifierDeduper, descriptionDeduper);
  }

  it("no timezones", () => {
    const cd = createCountryDefiner({});
    expect(cd.timezones).toEqual([]);
  });

  it("defined timezones", () => {
    const cd = createCountryDefiner({});
    cd.timezone("Test/One", 1, 2, 3, 4);
    cd.timezone("Test/Two", -1, 2, -3, 4, null);
    cd.timezone("Test/Three", 5, 6, -7, 8, "Test Three");
    expect(cd.timezones).toEqual([
      new CountryTimezone("Test/One", rational(1, 2), rational(3, 4), null),
      new CountryTimezone("Test/Two", rational(-1, 2), rational(-3, 4), null),
      new CountryTimezone("Test/Three", rational(5, 6), rational(-7, 8), "Test Three"),
    ]);
  });

  it("shared timezones", () => {
    const sharedTimezones = {
      t1: new CountryTimezone("Test/One", rational(1, 2), rational(3, 4), null),
      t2: new CountryTimezone("Test/Two", rational(-1, 2), rational(-3, 4), null),
      t3: new CountryTimezone("Test/Three", rational(5, 6), rational(-7, 8), "Test Three"),
    };
    const cd = createCountryDefiner(sharedTimezones);
    cd.timezone("t1");
    cd.timezone("t2");
    cd.timezone("t3");
    expect(cd.timezones.length).toBe(3);
    expect(cd.timezones[0]).toBe(sharedTimezones.t1);
    expect(cd.timezones[1]).toBe(sharedTimezones.t2);
    expect(cd.timezones[2]).toBe(sharedTimezones.t3);
  });

  it("shared timezone not found", () => {
    const cd = createCountryDefiner({});
    const error = assertRaises(ArgumentError, () => cd.timezone("t1"));
    expect(error.message).toBe("Unknown shared timezone: t1");
  });

  it("missing arguments", () => {
    const cd = createCountryDefiner({
      t1: new CountryTimezone("Test/One", rational(1, 2), rational(3, 4), null),
    });

    for (let count = 1; count <= 3; count++) {
      const args = Array.from({ length: count }, (_, i) => i + 1);
      const error = assertRaises(ArgumentError, () =>
        (cd.timezone as (...a: unknown[]) => void)("t1", ...args),
      );
      expect(error.message).toBe(
        "Either just a reference should be supplied, or the identifier, latitude and longitude must all be specified",
      );
    }
  });

  it("strings frozen", () => {
    const cd = createCountryDefiner({});
    cd.timezone("Test/One", 1, 2, 3, 4, "Test 1");
    const timezone = cd.timezones[0];
    expect(Object.isFrozen(timezone.identifier)).toBeTruthy();
    expect(Object.isFrozen(timezone.description)).toBeTruthy();
  });

  it("strings deduped", () => {
    const tz = [0, 1].map(() => {
      const cd = createCountryDefiner({});
      cd.timezone("Test/One", 1, 2, 3, 4, "Test 1");
      return cd.timezones[0];
    });

    expect(tz[1].identifier).toBe(tz[0].identifier);
    expect(tz[1].description).toBe(tz[0].description);

    expect(tz[0].identifier).toBe(identifierDeduper.dedupe("Test/One"));
    expect(tz[0].description).toBe(descriptionDeduper.dedupe("Test 1"));
  });
});
