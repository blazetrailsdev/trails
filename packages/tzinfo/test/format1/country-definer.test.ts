import { beforeEach, describe, expect, it } from "vitest";
import { rational } from "@blazetrails/ruby-compat";
import { CountryTimezone } from "../../lib/index.js";
import { CountryDefiner } from "../../lib/format1/country-definer.js";
import { StringDeduper } from "../../lib/string-deduper.js";

describe("TCCountryDefiner", () => {
  let identifierDeduper: StringDeduper;
  let descriptionDeduper: StringDeduper;

  beforeEach(() => {
    identifierDeduper = new StringDeduper();
    descriptionDeduper = new StringDeduper();
  });

  function createCountryDefiner(): CountryDefiner {
    return new CountryDefiner(identifierDeduper, descriptionDeduper);
  }

  it("no timezones", () => {
    const cd = createCountryDefiner();
    expect(cd.timezones).toEqual([]);
  });

  it("timezones", () => {
    const cd = createCountryDefiner();
    cd.timezone("Test/One", 1, 2, 3, 4);
    cd.timezone("Test/Two", -1, 2, -3, 4, null);
    cd.timezone("Test/Three", 5, 6, -7, 8, "Test Three");
    expect(cd.timezones).toEqual([
      new CountryTimezone("Test/One", rational(1, 2), rational(3, 4), null),
      new CountryTimezone("Test/Two", rational(-1, 2), rational(-3, 4), null),
      new CountryTimezone("Test/Three", rational(5, 6), rational(-7, 8), "Test Three"),
    ]);
  });

  it("strings frozen", () => {
    const cd = createCountryDefiner();
    cd.timezone("Test/One", 1, 2, 3, 4, "Test 1");
    const timezone = cd.timezones[0];
    expect(Object.isFrozen(timezone.identifier)).toBeTruthy();
    expect(Object.isFrozen(timezone.description)).toBeTruthy();
  });

  it("strings deduped", () => {
    const tz = [0, 1].map(() => {
      const cd = createCountryDefiner();
      cd.timezone("Test/One", 1, 2, 3, 4, "Test 1");
      return cd.timezones[0];
    });

    expect(tz[1].identifier).toBe(tz[0].identifier);
    expect(tz[1].description).toBe(tz[0].description);

    expect(tz[0].identifier).toBe(identifierDeduper.dedupe("Test/One"));
    expect(tz[0].description).toBe(descriptionDeduper.dedupe("Test 1"));
  });
});
