import { beforeEach, describe, expect, it } from "vitest";
import { Fallbacks } from "./fallbacks.js";
import { config, resetConfig, setDefaultLocale } from "../i18n.js";
import { resetClassConfig } from "../config.js";

function assertPredicate<T>(actual: T, predicate: (value: T) => unknown): void {
  expect(predicate(actual)).toBe(true);
}

function refutePredicate<T>(actual: T, predicate: (value: T) => unknown): void {
  expect(predicate(actual)).toBe(false);
}
import { Disabled } from "../exceptions.js";

function setup(): void {
  resetConfig();
  resetClassConfig();
  config().enforceAvailableLocales = false;
}

describe("I18nFallbacksDefaultsTest", () => {
  beforeEach(setup);

  it("defaults to an empty array if no default has been set manually", () => {
    setDefaultLocale("en-US");
    const fallbacks = new Fallbacks();
    expect(fallbacks.defaults).toEqual([]);
  });

  it("documentation example #1 - does not use default locale in fallbacks - See Issues #413 & #415", () => {
    setDefaultLocale("en-US");
    const fallbacks = new Fallbacks({ "de-AT": "de-DE" });
    expect(fallbacks.get("de-AT")).toEqual(["de-AT", "de", "de-DE"]);
  });

  it("documentation example #2 - does not use default locale in fallbacks - Uses custom locale - See Issues #413 & #415", () => {
    setDefaultLocale("en-US");
    const fallbacks = new Fallbacks("en-GB", { "de-AT": "de", "de-CH": "de" });
    expect(fallbacks.get("de-AT")).toEqual(["de-AT", "de", "en-GB", "en"]);
    expect(fallbacks.get("de-CH")).toEqual(["de-CH", "de", "en-GB", "en"]);
  });

  it("explicit fallback to default locale", () => {
    setDefaultLocale("en-US");
    const fallbacks = new Fallbacks(["en-US"]);
    expect(fallbacks.get("de-AT")).toEqual(["de-AT", "de", "en-US", "en"]);
    expect(fallbacks.get("de-CH")).toEqual(["de-CH", "de", "en-US", "en"]);
  });

  it("defaults reflect a manually passed default locale if any", () => {
    const fallbacks = new Fallbacks("fi-FI");
    expect(fallbacks.defaults).toEqual(["fi-FI", "fi"]);
    setDefaultLocale("de-DE");
    expect(fallbacks.defaults).toEqual(["fi-FI", "fi"]);
  });

  it("defaults allows to set multiple defaults", () => {
    const fallbacks = new Fallbacks("fi-FI", "se-FI");
    expect(fallbacks.defaults).toEqual(["fi-FI", "fi", "se-FI", "se"]);
  });
});

describe("I18nFallbacksComputationTest", () => {
  let fallbacks: Fallbacks;

  beforeEach(() => {
    setup();
    fallbacks = new Fallbacks("en-US");
  });

  it("with no mappings defined it returns [:es, :en-US] for :es", () => {
    expect(fallbacks.get("es")).toEqual(["es", "en-US", "en"]);
  });

  it("with no mappings defined it returns [:es-ES, :es, :en-US] for :es-ES", () => {
    expect(fallbacks.get("es-ES")).toEqual(["es-ES", "es", "en-US", "en"]);
  });

  it("with no mappings defined it returns [:es-MX, :es, :en-US] for :es-MX", () => {
    expect(fallbacks.get("es-MX")).toEqual(["es-MX", "es", "en-US", "en"]);
  });

  it("with no mappings defined it returns [:es-Latn-ES, :es-Latn, :es, :en-US] for :es-Latn-ES", () => {
    expect(fallbacks.get("es-Latn-ES")).toEqual(["es-Latn-ES", "es-Latn", "es", "en-US", "en"]);
  });

  it("with no mappings defined it returns [:en, :en-US] for :en", () => {
    expect(fallbacks.get("en")).toEqual(["en", "en-US"]);
  });

  it("with no mappings defined it returns [:en-US, :en] for :en-US (special case: locale == default)", () => {
    expect(fallbacks.get("en-US")).toEqual(["en-US", "en"]);
  });

  it("with a Catalan mapping defined it returns [:ca, :es-ES, :es, :en-US] for :ca", () => {
    fallbacks.map({ ca: "es-ES" });
    expect(fallbacks.get("ca")).toEqual(["ca", "es-ES", "es", "en-US", "en"]);
  });

  it("with a Catalan mapping defined it returns [:ca-ES, :ca, :es-ES, :es, :en-US] for :ca-ES", () => {
    fallbacks.map({ ca: "es-ES" });
    expect(fallbacks.get("ca-ES")).toEqual(["ca-ES", "ca", "es-ES", "es", "en-US", "en"]);
  });

  it("with a Hebrew mapping defined it returns [:ar, :en-US] for :ar", () => {
    fallbacks.map({ "ar-PS": "he-IL" });
    expect(fallbacks.get("ar")).toEqual(["ar", "en-US", "en"]);
  });

  it("with a Hebrew mapping defined it returns [:ar-EG, :ar, :en-US] for :ar-EG", () => {
    fallbacks.map({ "ar-PS": "he-IL" });
    expect(fallbacks.get("ar-EG")).toEqual(["ar-EG", "ar", "en-US", "en"]);
  });

  it("with a Hebrew mapping defined it returns [:ar-PS, :ar, :he-IL, :he, :en-US] for :ar-PS", () => {
    fallbacks.map({ "ar-PS": "he-IL" });
    expect(fallbacks.get("ar-PS")).toEqual(["ar-PS", "ar", "he-IL", "he", "en-US", "en"]);
  });

  it("with a Sami mapping defined it returns [:sms-FI, :sms, :se-FI, :se, :fi-FI, :fi, :en-US] for :sms-FI", () => {
    fallbacks.map({ sms: ["se-FI", "fi-FI"] });
    expect(fallbacks.get("sms-FI")).toEqual([
      "sms-FI",
      "sms",
      "se-FI",
      "se",
      "fi-FI",
      "fi",
      "en-US",
      "en",
    ]);
  });

  it("with a German mapping defined it returns [:de, :en-US] for de", () => {
    fallbacks.map({ "de-AT": "de-DE" });
    expect(fallbacks.get("de")).toEqual(["de", "en-US", "en"]);
  });

  it("with a German mapping defined it returns [:de-DE, :de, :en-US] for de-DE", () => {
    fallbacks.map({ "de-AT": "de-DE" });
    expect(fallbacks.get("de-DE")).toEqual(["de-DE", "de", "en-US", "en"]);
  });

  it("with a German mapping defined it returns [:de-AT, :de, :de-DE, :en-US] for de-AT", () => {
    fallbacks.map({ "de-AT": "de-DE" });
    expect(fallbacks.get("de-AT")).toEqual(["de-AT", "de", "de-DE", "en-US", "en"]);
  });

  it("with a mapping :de => :en, :he => :en defined it returns [:de, :en] for :de", () => {
    expect(fallbacks.get("de")).toEqual(["de", "en-US", "en"]);
  });

  it("with a mapping :de => :en, :he => :en defined it [:he, :en] for :de", () => {
    expect(fallbacks.get("he")).toEqual(["he", "en-US", "en"]);
  });

  it("with :no => :nb, :nb => :no defined :no returns [:no, :nb, :en-US, :en]", () => {
    fallbacks.map({ no: "nb", nb: "no" });
    expect(fallbacks.get("no")).toEqual(["no", "nb", "en-US", "en"]);
  });

  it("with :no => :nb, :nb => :no defined :nb returns [:nb, :no, :en-US, :en]", () => {
    fallbacks.map({ no: "nb", nb: "no" });
    expect(fallbacks.get("nb")).toEqual(["nb", "no", "en-US", "en"]);
  });

  it("with locale equals false", () => {
    expect(() => fallbacks.get(false)).toThrow(Disabled);
  });
});

describe("I18nFallbacksHashCompatibilityTest", () => {
  let fallbacks: Fallbacks;

  beforeEach(() => {
    setup();
    fallbacks = new Fallbacks("en-US", { "de-AT": "de-DE" });
  });

  it("map is compatible with Hash#map", () => {
    const result = fallbacks.map((key, value) => [key, value]);
    expect(result).toEqual([["de-AT", ["de-DE"]]]);
  });

  it("empty? is compatible with Hash#empty?", () => {
    refutePredicate(fallbacks, (f) => f.empty());
    refutePredicate(new Fallbacks("en-US"), (f) => f.empty());
    refutePredicate(new Fallbacks({ "de-AT": "de-DE" }), (f) => f.empty());
    assertPredicate(new Fallbacks(), (f) => f.empty());
  });

  it("#inspect", () => {
    const map = `{:"de-AT"=>[:"de-DE"]}`;
    expect(fallbacks.inspect()).toBe(
      `#<I18n::Locale::Fallbacks @map=${map} @defaults=[:"en-US", :en]>`,
    );
  });
});
