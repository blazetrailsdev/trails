/** Mirrors: i18n/test/locale/tag/simple_test.rb */

import { describe, expect, it } from "vitest";

import { Simple } from "./simple.js";

describe("I18nLocaleTagSimpleTest", () => {
  it("returns 'de' as the language subtag in lowercase", () => {
    expect(new Simple("de-Latn-DE").subtags()).toEqual(["de", "Latn", "DE"]);
  });

  it("returns a formatted tag string from #to_s", () => {
    expect(new Simple("de-Latn-DE").toString()).toBe("de-Latn-DE");
  });

  it("returns an array containing the formatted subtags from #to_a", () => {
    expect(new Simple("de-Latn-DE").toA()).toEqual(["de", "Latn", "DE"]);
  });

  it("#parent returns 'de-Latn' as the parent of 'de-Latn-DE'", () => {
    expect(new Simple("de-Latn-DE").parent()?.toString()).toBe("de-Latn");
  });

  it("#parent returns 'de' as the parent of 'de-Latn'", () => {
    expect(new Simple("de-Latn").parent()?.toString()).toBe("de");
  });

  it("#self_and_parents returns an array of 3 tags for 'de-Latn-DE'", () => {
    expect(new Simple("de-Latn-DE").selfAndParents().map((tag) => tag.toString())).toEqual([
      "de-Latn-DE",
      "de-Latn",
      "de",
    ]);
  });
});
