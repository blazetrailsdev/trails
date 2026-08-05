/**
 * Mirrors: i18n/test/backend/fallbacks_test.rb
 *
 * Not ported: `I18nBackendFallbacksWithChainTest` (there is no
 * `I18n::Backend::Chain` yet — story `i18n-backend-chain`), and the two
 * `Thread.new` cases, which are the gem asserting that its thread-local
 * fallbacks store is visible from another thread. JS has no threads, so
 * `fallbacks()` is a single module-level binding (see `fallbacks.ts`) and both
 * cases assert the single-threaded behaviour the rest of the file already
 * covers.
 *
 * `RegressionTestFor617` assigns a plain Ruby Hash as the fallbacks object,
 * which quacks like one because it answers `[]`; a `Map` is the JS Hash, and
 * its `get` is that `[]`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Fallbacks, fallbacks, setFallbacks } from "./fallbacks.js";
import { Simple } from "./simple.js";
import { config, exists, l, resetConfig, setLocale, t, type Locale } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { MissingTranslationData } from "../exceptions.js";
import { Fallbacks as LocaleFallbacks } from "../locale/fallbacks.js";
import { Date } from "@blazetrails/date";
import { Time } from "@blazetrails/date";
import type { TranslationData } from "../utils.js";

class Backend extends Fallbacks(Simple) {}

/** Mirrors: `I18n::TestCase#setup` (i18n/test/test_helper.rb:20-26). */
function setup(): Backend {
  resetConfig();
  resetClassConfig();
  setFallbacks(null);
  config().enforceAvailableLocales = false;
  const backend = new Backend();
  config().backend = backend;
  return backend;
}

describe("I18nBackendFallbacksTranslateTest", () => {
  let backend: Backend;

  function storeTranslations(locale: Locale, data: TranslationData): unknown {
    return backend.storeTranslations(locale, data);
  }

  beforeEach(() => {
    backend = setup();
    storeTranslations("en", {
      foo: "Foo in :en",
      bar: "Bar in :en",
      buz: "Buz in :en",
      interpolate: "Interpolate %{value}",
      interpolate_count: "Interpolate %{value} %{count}",
    });
    storeTranslations("de", { bar: "Bar in :de", baz: "Baz in :de" });
    storeTranslations("de-DE", { baz: "Baz in :de-DE" });
    storeTranslations("pt-BR", { baz: "Baz in :pt-BR" });
  });

  it("still returns an existing translation as usual", () => {
    expect(t("foo", { locale: "en" })).toBe("Foo in :en");
    expect(t("bar", { locale: "de" })).toBe("Bar in :de");
    expect(t("baz", { locale: "de-DE" })).toBe("Baz in :de-DE");
  });

  it("returns interpolated value if no key provided", () => {
    expect(t("interpolate")).toBe("Interpolate %{value}");
  });

  it("returns the :de translation for a missing :'de-DE' translation", () => {
    expect(t("bar", { locale: "de-DE" })).toBe("Bar in :de");
  });

  it("keeps the count option when defaulting to a different key", () => {
    expect(t("non_existent", { default: ":interpolate_count", count: 10, value: 5 })).toBe(
      "Interpolate 5 10",
    );
  });

  it("returns the :de translation for a missing :'de-DE' when :default is a String", () => {
    expect(t("bar", { locale: "de-DE", default: "Default Bar" })).toBe("Bar in :de");
    expect(t("missing_bar", { locale: "de-DE", default: "Default Bar" })).toBe("Default Bar");
  });

  it("returns the :de translation for a missing :'de-DE' when defaults is a Symbol (which exists in :en)", () => {
    expect(t("bar", { locale: "de-DE", default: [":buz"] })).toBe("Bar in :de");
  });

  it("returns the :'de-DE' default :baz translation for a missing :'de-DE' (which exists in :de)", () => {
    expect(t("bar", { locale: "de-DE", default: [":baz"] })).toBe("Baz in :de-DE");
  });

  it("returns the :de translation for a missing :'de-DE' when :default is a Proc", () => {
    expect(t("bar", { locale: "de-DE", default: () => "Default Bar" })).toBe("Bar in :de");
    expect(t("missing_bar", { locale: "de-DE", default: () => "Default Bar" })).toBe("Default Bar");
  });

  it("returns the :de translation for a missing :'de-DE' when :default is a Hash", () => {
    expect(t("bar", { locale: "de-DE", default: {} })).toBe("Bar in :de");
    expect(t("missing_bar", { locale: "de-DE", default: {} })).toEqual({});
  });

  it("returns the :de translation for a missing :'de-DE' when :default is nil", () => {
    expect(t("bar", { locale: "de-DE", default: null })).toBe("Bar in :de");
    expect(t("missing_bar", { locale: "de-DE", default: null })).toBeNull();
  });

  it("returns the Translation missing: message if the default is also missing", () => {
    const translationMissingMessage = [
      "Translation missing. Options considered were:",
      "- de-DE.missing_bar",
      "- de-DE.missing_baz",
    ].join("\n");

    expect(t("missing_bar", { locale: "de-DE", default: [":missing_baz"] })).toBe(
      translationMissingMessage,
    );
  });

  it("returns the simple Translation missing: message when default is an empty Array", () => {
    expect(t("missing_bar", { locale: "de-DE", default: [] })).toBe(
      "Translation missing: de-DE.missing_bar",
    );
  });

  it("returns the :'de-DE' default :baz translation for a missing :'de-DE' when defaults contains Symbol", () => {
    expect(t("missing_foo", { locale: "de-DE", default: [":baz", "Default Bar"] })).toBe(
      "Baz in :de-DE",
    );
  });

  it("returns the defaults translation for a missing :'de-DE' when defaults contains a String or Proc before Symbol", () => {
    expect(
      t("missing_foo", {
        locale: "de-DE",
        default: [":missing_bar", "Default Bar", ":baz"],
      }),
    ).toBe("Default Bar");
    expect(
      t("missing_foo", {
        locale: "de-DE",
        default: [":missing_bar", () => "Default Bar", ":baz"],
      }),
    ).toBe("Default Bar");
  });

  it("returns the default translation for a missing :'de-DE' and existing :de when default is a Hash", () => {
    expect(
      t("missing_foo", {
        locale: "de-DE",
        default: [":missing_bar", { other: "Default %{count} Bars" }, "Default Bar"],
        count: 6,
      }),
    ).toBe("Default 6 Bars");
  });

  it("returns the default translation for a missing :de translation even when default is a String when fallback is disabled", () => {
    expect(t("foo", { locale: "de", default: "Default String", fallback: false })).toBe(
      "Default String",
    );
  });

  it("raises I18n::MissingTranslationData exception when fallback is disabled even when fallback translation exists", () => {
    expect(() => t("foo", { locale: "de", fallback: false, raise: true })).toThrow(
      MissingTranslationData,
    );
  });

  it("raises I18n::MissingTranslationData exception when no translation was found", () => {
    expect(() => t("faa", { locale: "en", raise: true })).toThrow(MissingTranslationData);
    expect(() => t("faa", { locale: "de", raise: true })).toThrow(MissingTranslationData);
  });

  it("should ensure that default is not splitted on new line char", () => {
    expect(t("missing_bar", { default: "Default \n Bar" })).toBe("Default \n Bar");
  });

  it("should not raise error when enforce_available_locales is true, :'pt' is missing and default is a Symbol", () => {
    config().enforceAvailableLocales = true;
    try {
      expect(
        t("model.attrs.foo", {
          locale: "pt-BR",
          default: [":attrs.foo", "Foo"],
        }),
      ).toBe("Foo");
    } finally {
      config().enforceAvailableLocales = false;
    }
  });

  it("returns fallback default given missing pluralization data", () => {
    expect(t("missing_bar", { count: 1, default: "default" })).toBe("default");
    expect(t("missing_bar", { count: 0, default: "default" })).toBe("default");
  });
});

// See Issue #534
describe("I18nBackendFallbacksLocalizeTestWithDefaultLocale", () => {
  let backend: Backend;

  beforeEach(() => {
    backend = setup();
    config().enforceAvailableLocales = false;
    setFallbacks([config().defaultLocale]);
    backend.storeTranslations("en", { time: { formats: { fallback: "en fallback" } } });
  });

  it("falls back to default locale - Issue #534", () => {
    expect(l(Time.utc(2010, 1, 3), { format: ":fallback", locale: "un-supported" })).toBe(
      "en fallback",
    );
  });
});

// See Issue #536
describe("I18nBackendFallbacksWithCustomClass", () => {
  let backend: Backend;

  /** Quacks like a fallback class. */
  class MyDefaultFallback {
    get(_key: Locale): Locale[] {
      return ["my_language"];
    }
  }

  beforeEach(() => {
    backend = setup();
    config().enforceAvailableLocales = false;
    setFallbacks(new MyDefaultFallback());
    backend.storeTranslations("my_language", { foo: "customer foo" });
    backend.storeTranslations("en", { foo: "english foo" });
  });

  it("can use a default fallback object that doesn't inherit from I18n::Locale::Fallbacks", () => {
    expect(t("foo", { locale: "en" })).toBe("customer foo");
    expect(t("foo", { locale: "nothing" })).toBe("customer foo");
  });
});

// See Issue #590
describe("I18nBackendFallbacksSymbolResolveRestartsLookupAtOriginalLocale", () => {
  let backend: Backend;

  beforeEach(() => {
    backend = setup();
    config().enforceAvailableLocales = false;
    setFallbacks(["root"]);
    backend.storeTranslations("ak", {
      calendars: {
        gregorian: {
          months: {
            format: {
              abbreviated: {
                1: "S-Ɔ",
                // Other months omitted for brevity
              },
            },
          },
        },
      },
    });
    backend.storeTranslations("root", {
      calendars: {
        gregorian: {
          months: {
            format: {
              abbreviated: ":calendars.gregorian.months.format.wide",
              wide: {
                1: "M01",
                // Other months omitted for brevity
              },
            },
            "stand-alone": {
              abbreviated: ":calendars.gregorian.months.format.abbreviated",
            },
          },
        },
      },
    });
  });

  it("falls back to original locale when symbol resolved at fallback locale", () => {
    expect(t("calendars.gregorian.months.stand-alone.abbreviated", { locale: "ak-GH" })).toEqual({
      1: "S-Ɔ",
    });
  });
});

// See Issue #617
describe("RegressionTestFor617", () => {
  let backend: Backend;

  beforeEach(() => {
    backend = setup();
    config().enforceAvailableLocales = false;
    setFallbacks(
      new Map([
        ["en", ["en"]],
        ["en-US", ["en-US", "en"]],
      ]) as unknown as { get(locale: Locale): Locale[] },
    );
    setLocale("en-US");
    backend.storeTranslations("en-US", {});
    backend.storeTranslations("en", {
      activerecord: {
        models: {
          product: { one: "Product", other: "Products" },
          "product/ticket": { one: "Ticket", other: "Tickets" },
        },
      },
    });
  });

  it("model scope resolution", () => {
    const defaults = [":product", "Ticket"];
    const options = { scope: ["activerecord", "models"], count: 1, default: defaults };
    expect(t("product/ticket", options)).toBe("Ticket");
  });
});

describe("I18nBackendFallbacksLocalizeTest", () => {
  let backend: Backend;

  beforeEach(() => {
    backend = setup();
    backend.storeTranslations("en", { date: { formats: { en: "en" }, day_names: ["Sunday"] } });
    backend.storeTranslations("de", { date: { formats: { de: "de" }, day_names: ["Sunday"] } });
  });

  it("still uses an existing format as usual", () => {
    expect(l(new Date(2010, 1, 3), { format: ":en", locale: "en" })).toBe("en");
  });

  it("looks up and uses a fallback locale's format for a key missing in the given locale", () => {
    expect(l(new Date(2010, 1, 3), { format: ":de", locale: "de-DE" })).toBe("de");
  });

  it("still uses an existing day name translation as usual", () => {
    expect(l(new Date(2010, 1, 3), { format: "%A", locale: "en" })).toBe("Sunday");
  });

  it("uses a fallback locale's translation for a key missing in the given locale", () => {
    expect(l(new Date(2010, 1, 3), { format: "%A", locale: "de-DE" })).toBe("Sunday");
  });
});

describe("I18nBackendFallbacksExistsTest", () => {
  let backend: Backend;

  beforeEach(() => {
    backend = setup();
    backend.storeTranslations("en", { foo: "Foo in :en", bar: "Bar in :en" });
    backend.storeTranslations("de", { bar: "Bar in :de" });
    backend.storeTranslations("de-DE", { baz: "Baz in :de-DE" });
  });

  it("exists? given an existing key will return true", () => {
    expect(exists("foo")).toBe(true);
  });

  it("exists? given a non-existing key will return false", () => {
    expect(exists("bogus")).toBe(false);
  });

  it("exists? given an existing key and an existing locale will return true", () => {
    expect(exists("foo", "en")).toBe(true);
    expect(exists("bar", "de")).toBe(true);
  });

  it("exists? given a non-existing key and an existing locale will return false", () => {
    expect(exists("bogus", "en")).toBe(false);
    expect(exists("bogus", "de")).toBe(false);
  });

  it("exists? should return true given a key which is missing from the given locale and exists in a fallback locale", () => {
    expect(exists("bar", "de")).toBe(true);
    expect(exists("bar", "de-DE")).toBe(true);
  });

  it("exists? should return false given a key which is missing from the given locale and all its fallback locales", () => {
    expect(exists("baz", "de")).toBe(false);
    expect(exists("bogus", "de-DE")).toBe(false);
  });

  it("exists? should return false when fallback is disabled given a key which is missing from the given locale", () => {
    expect(exists("bar", "de-DE")).toBe(true);
    expect(exists("bar", "de-DE", { fallback: false })).toBe(false);
    expect(exists("bar", "de-DE-XX", { fallback: false })).toBe(false);
  });
});

describe("I18nBackendOnFallbackHookTest", () => {
  class Backend extends Fallbacks(Simple) {
    fallbackCollector?: unknown[][];

    protected onFallback(...args: unknown[]): unknown {
      this.fallbackCollector ??= [];
      this.fallbackCollector.push(args);
      return null;
    }
  }

  let backend: Backend;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    setFallbacks(null);
    config().enforceAvailableLocales = false;
    backend = new Backend();
    config().backend = backend;
    setFallbacks(new LocaleFallbacks({ de: "en" }));
    backend.storeTranslations("en", { foo: "Foo in :en", bar: "Bar in :en" });
    backend.storeTranslations("de", { bar: "Bar in :de" });
    backend.storeTranslations("de-DE", { baz: 'Baz in :"de-DE"' });
  });

  it("on_fallback should be called when fallback happens", () => {
    expect(fallbacks().get("de-DE")).toEqual(["de-DE", "de", "en"]);
    expect(t("baz", { locale: "de-DE" })).toBe('Baz in :"de-DE"');
    expect(t("bar", { locale: "de-DE" })).toBe("Bar in :de");
    expect(t("foo", { locale: "de-DE" })).toBe("Foo in :en");
    expect(backend.fallbackCollector![0]).toEqual(["de-DE", "de", "bar", {}]);
    expect(backend.fallbackCollector![1]).toEqual(["de-DE", "en", "foo", {}]);
  });

  it("on_fallback should not be called when use a String locale", () => {
    expect(t("bar", { locale: "de" })).toBe("Bar in :de");
    expect(backend.fallbackCollector).toBeUndefined();
  });
});
