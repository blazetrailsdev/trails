/** Mirrors: i18n/test/locale/tag/rfc4646_test.rb */

import { describe, expect, it, beforeEach } from "vitest";

import { Rfc4646, Parser } from "./rfc4646.js";

describe("I18nLocaleTagRfc4646ParserTest", () => {
  it("Rfc4646::Parser given a valid tag 'de' returns an array of subtags", () => {
    expect(Parser.match("de")).toEqual(["de", null, null, null, null, null, null]);
  });

  it("Rfc4646::Parser given a valid tag 'de-DE' returns an array of subtags", () => {
    expect(Parser.match("de-DE")).toEqual(["de", null, "DE", null, null, null, null]);
  });

  it("Rfc4646::Parser given a valid lowercase tag 'de-latn-de-variant-x-phonebk' returns an array of subtags", () => {
    expect(Parser.match("de-latn-de-variant-x-phonebk")).toEqual([
      "de",
      "latn",
      "de",
      "variant",
      null,
      "x-phonebk",
      null,
    ]);
  });

  it("Rfc4646::Parser given a valid uppercase tag 'DE-LATN-DE-VARIANT-X-PHONEBK' returns an array of subtags", () => {
    expect(Parser.match("DE-LATN-DE-VARIANT-X-PHONEBK")).toEqual([
      "DE",
      "LATN",
      "DE",
      "VARIANT",
      null,
      "X-PHONEBK",
      null,
    ]);
  });

  it("Rfc4646::Parser given an invalid tag 'a-DE' it returns false", () => {
    expect(Parser.match("a-DE")).toBe(false);
  });

  it("Rfc4646::Parser given an invalid tag 'de-419-DE' it returns false", () => {
    expect(Parser.match("de-419-DE")).toBe(false);
  });
});

// Tag for the locale 'de-Latn-DE-Variant-a-ext-x-phonebk-i-klingon'

describe("I18nLocaleTagSubtagsTest", () => {
  let tag: Rfc4646;

  beforeEach(() => {
    const subtags = ["de", "Latn", "DE", "variant", "a-ext", "x-phonebk", "i-klingon"];
    tag = new Rfc4646(...subtags);
  });

  it("returns 'de' as the language subtag in lowercase", () => {
    expect(tag.language).toBe("de");
  });

  it("returns 'Latn' as the script subtag in titlecase", () => {
    expect(tag.script).toBe("Latn");
  });

  it("returns 'DE' as the region subtag in uppercase", () => {
    expect(tag.region).toBe("DE");
  });

  it("returns 'variant' as the variant subtag in lowercase", () => {
    expect(tag.variant).toBe("variant");
  });

  it("returns 'a-ext' as the extension subtag", () => {
    expect(tag.extension).toBe("a-ext");
  });

  it("returns 'x-phonebk' as the privateuse subtag", () => {
    expect(tag.privateuse).toBe("x-phonebk");
  });

  it("returns 'i-klingon' as the grandfathered subtag", () => {
    expect(tag.grandfathered).toBe("i-klingon");
  });

  it("returns a formatted tag string from #to_s", () => {
    expect(tag.toString()).toBe("de-Latn-DE-variant-a-ext-x-phonebk-i-klingon");
  });

  it("returns an array containing the formatted subtags from #to_a", () => {
    expect(tag.toA()).toEqual(["de", "Latn", "DE", "variant", "a-ext", "x-phonebk", "i-klingon"]);
  });

  // Tag inheritance

  it("#parent returns 'de-Latn-DE-variant-a-ext-x-phonebk' as the parent of 'de-Latn-DE-variant-a-ext-x-phonebk-i-klingon'", () => {
    const tag = new Rfc4646("de", "Latn", "DE", "variant", "a-ext", "x-phonebk", "i-klingon");
    expect(tag.parent()!.toString()).toBe("de-Latn-DE-variant-a-ext-x-phonebk");
  });

  it("#parent returns 'de-Latn-DE-variant-a-ext' as the parent of 'de-Latn-DE-variant-a-ext-x-phonebk'", () => {
    const tag = new Rfc4646("de", "Latn", "DE", "variant", "a-ext", "x-phonebk");
    expect(tag.parent()!.toString()).toBe("de-Latn-DE-variant-a-ext");
  });

  it("#parent returns 'de-Latn-DE-variant' as the parent of 'de-Latn-DE-variant-a-ext'", () => {
    const tag = new Rfc4646("de", "Latn", "DE", "variant", "a-ext");
    expect(tag.parent()!.toString()).toBe("de-Latn-DE-variant");
  });

  it("#parent returns 'de-Latn-DE' as the parent of 'de-Latn-DE-variant'", () => {
    const tag = new Rfc4646("de", "Latn", "DE", "variant");
    expect(tag.parent()!.toString()).toBe("de-Latn-DE");
  });

  it("#parent returns 'de-Latn' as the parent of 'de-Latn-DE'", () => {
    const tag = new Rfc4646("de", "Latn", "DE");
    expect(tag.parent()!.toString()).toBe("de-Latn");
  });

  it("#parent returns 'de' as the parent of 'de-Latn'", () => {
    const tag = new Rfc4646("de", "Latn");
    expect(tag.parent()!.toString()).toBe("de");
  });

  // TODO RFC4647 says: "If no language tag matches the request, the "default" value is returned."
  // where should we set the default language?

  it("#parent returns an array of 5 parents for 'de-Latn-DE-variant-a-ext-x-phonebk-i-klingon'", () => {
    const parents = [
      "de-Latn-DE-variant-a-ext-x-phonebk-i-klingon",
      "de-Latn-DE-variant-a-ext-x-phonebk",
      "de-Latn-DE-variant-a-ext",
      "de-Latn-DE-variant",
      "de-Latn-DE",
      "de-Latn",
      "de",
    ];
    const tag = new Rfc4646("de", "Latn", "DE", "variant", "a-ext", "x-phonebk", "i-klingon");
    expect(tag.selfAndParents().map((t) => t.toString())).toEqual(parents);
  });

  it("returns an array of 5 parents for 'de-Latn-DE-variant-a-ext-x-phonebk-i-klingon'", () => {
    const parents = [
      "de-Latn-DE-variant-a-ext-x-phonebk-i-klingon",
      "de-Latn-DE-variant-a-ext-x-phonebk",
      "de-Latn-DE-variant-a-ext",
      "de-Latn-DE-variant",
      "de-Latn-DE",
      "de-Latn",
      "de",
    ];
    const tag = new Rfc4646("de", "Latn", "DE", "variant", "a-ext", "x-phonebk", "i-klingon");
    expect(tag.selfAndParents().map((t) => t.toString())).toEqual(parents);
  });
});
