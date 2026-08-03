/** Mirrors: i18n/test/i18n_test.rb */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArgumentError, Disabled, InvalidLocale } from "./exceptions.js";
import {
  RESERVED_KEYS,
  availableLocales,
  config,
  defaultLocale,
  defaultSeparator,
  enforceAvailableLocalesBang,
  exists,
  interpolationKeys,
  locale,
  localeAvailable,
  localize,
  normalizeKeys,
  reloadBang,
  reserveKey,
  resetConfig,
  setConfig,
  setAvailableLocales,
  setBackend,
  setDefaultLocale,
  setDefaultSeparator,
  setExceptionHandler,
  setLocale,
  t,
  translate,
  withLocale,
} from "./i18n.js";
import { Config, resetClassConfig } from "./config.js";
import { Simple } from "./backend/simple.js";
import type { TranslationData } from "./utils.js";
import type { TranslationKey } from "./i18n.js";

describe("I18nTest", () => {
  function storeTranslations(locale: string, data: TranslationData): void {
    config().backend.storeTranslations(locale, data);
  }

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().backend = new Simple();
    config().enforceAvailableLocales = false;

    storeTranslations("en", { currency: { format: { separator: ".", delimiter: "," } } });
    storeTranslations("nl", { currency: { format: { separator: ",", delimiter: "." } } });
    storeTranslations("en", { true: "Yes", false: "No" });
  });

  it("uses a custom exception handler passed as an option", () => {
    const customExceptionHandler = vi.fn();
    translate("bogus", { exceptionHandler: customExceptionHandler });
    expect(customExceptionHandler).toHaveBeenCalled();
  });

  it("delegates translate calls to the backend", () => {
    const spy = vi.spyOn(config().backend, "translate");
    translate("foo", { locale: "de" });
    expect(spy).toHaveBeenCalledWith("de", "foo", {});
  });

  it("delegates localize calls to the backend", () => {
    const spy = vi.fn();
    config().backend.localize = spy;
    localize("whatever", { locale: "de" });
    expect(spy).toHaveBeenCalledWith("de", "whatever", ":default", {});
  });

  it("translate given no locale uses the current locale", () => {
    const spy = vi.spyOn(config().backend, "translate");
    translate("foo");
    expect(spy).toHaveBeenCalledWith("en", "foo", {});
  });

  it("translate works with nested symbol keys", () => {
    expect(t("currency.format.separator")).toBe(".");
  });

  it("translate works with nested string keys", () => {
    expect(t("currency.format.separator")).toBe(".");
  });

  it("translate with an array as a scope works", () => {
    expect(t("separator", { scope: ["currency", "format"] })).toBe(".");
  });

  it("translate with an array containing dot separated strings as a scope works", () => {
    expect(t("separator", { scope: ["currency.format"] })).toBe(".");
  });

  it("translate with an array of keys and a dot separated string as a scope works", () => {
    expect(t(["separator", "delimiter"], { scope: "currency.format" })).toEqual([".", ","]);
  });

  it("translate with an array of dot separated keys and a scope works", () => {
    expect(t(["format.separator", "format.delimiter"], { scope: "currency" })).toEqual([".", ","]);
  });

  it("translate given a bogus key returns an error message", () => {
    expect(t("bogus")).toBe("Translation missing: en.bogus");
  });

  it("translate given multiple bogus keys returns an array of error messages", () => {
    expect(t(["bogus", "also_bogus"])).toEqual([
      "Translation missing: en.bogus",
      "Translation missing: en.also_bogus",
    ]);
  });

  it("translate given an empty string as a key raises an I18n::ArgumentError", () => {
    expect(() => t("")).toThrow(ArgumentError);
  });

  it("translate given an empty symbol as a key raises an I18n::ArgumentError", () => {
    expect(() => t(Symbol.for(""))).toThrow(ArgumentError);
  });

  it("translate given an array with empty string as a key raises an I18n::ArgumentError", () => {
    expect(() => t(["", "foo"])).toThrow(ArgumentError);
  });

  it("translate given an empty array as a key returns empty array", () => {
    expect(t([])).toEqual([]);
  });

  it("translate given nil returns nil", () => {
    expect(t(null)).toBeNull();
  });

  it("translate given an unavailable locale rases an I18n::InvalidLocale", () => {
    try {
      config().enforceAvailableLocales = true;
      expect(() => t("foo", { locale: "klingon" })).toThrow(InvalidLocale);
    } finally {
      config().enforceAvailableLocales = false;
    }
  });

  it("translate given true as a key works", () => {
    expect(t(true)).toBe("Yes");
  });

  it("translate given false as a key works", () => {
    expect(t(false)).toBe("No");
  });

  it("translate raises Disabled if locale is false", () => {
    withLocale(false, () => {
      expect(() => t("foo")).toThrow(Disabled);

      expect(t("foo", { locale: "en" })).toBe("Translation missing: en.foo");
    });
  });

  it("interpolation_keys returns an array of keys", () => {
    storeTranslations("en", { example_two: "Two interpolations %{foo} %{bar}" });
    expect(interpolationKeys("example_two")).toEqual(["foo", "bar"]);
  });

  it("interpolation_keys returns an empty array when no interpolations ", () => {
    storeTranslations("en", { example_zero: "Zero interpolations" });
    expect(interpolationKeys("example_zero")).toEqual([]);
  });

  it("interpolation_keys returns an empty array when missing translation ", () => {
    expect(interpolationKeys("does-not-exist")).toEqual([]);
  });

  it("interpolation_keys returns an empty array when nested translation", () => {
    storeTranslations("en", { example_nested: { one: "One %{foo}", two: "Two %{bar}" } });
    expect(interpolationKeys("example_nested")).toEqual([]);
  });

  it("interpolation_keys returns an array of keys when translation is an Array", () => {
    storeTranslations("en", {
      example_array: ["One %{foo}", ["Two %{bar}", ["Three %{baz}"]]],
    });
    expect(interpolationKeys("example_array")).toEqual(["foo", "bar", "baz"]);
  });

  it("interpolation_keys raises I18n::ArgumentError when non-string argument", () => {
    expect(() => interpolationKeys(["bad-argument"])).toThrow(ArgumentError);
  });

  it("exists? given nil raises I18n::ArgumentError", () => {
    expect(() => exists(null)).toThrow(ArgumentError);
  });

  it("exists? given an existing key will return true", () => {
    expect(exists("currency")).toBe(true);
  });

  it("exists? given a non-existing key will return false", () => {
    expect(exists("bogus")).toBe(false);
  });

  it("exists? given an existing dot-separated key will return true", () => {
    expect(exists("currency.format.delimiter")).toBe(true);
  });

  it("exists? given a non-existing dot-separated key will return false", () => {
    expect(exists("currency.format.bogus")).toBe(false);
  });

  it("exists? given an existing key and an existing locale will return true", () => {
    expect(exists("currency", "nl")).toBe(true);
  });

  it("exists? given an existing key and a scope will return true", () => {
    expect(exists("delimiter", null, { scope: ["currency", "format"] })).toBe(true);
  });

  it("exists? given a non-existing key and an existing locale will return false", () => {
    expect(exists("bogus", "nl")).toBe(false);
  });

  it("exists? raises Disabled if locale is false", () => {
    withLocale(false, () => {
      expect(() => exists("bogus")).toThrow(Disabled);

      expect(exists("bogus", "nl")).toBe(false);
    });
  });

  it("localize raises Disabled if locale is false", () => {
    withLocale(false, () => {
      expect(() => localize(null)).toThrow(Disabled);
    });
  });

  it("can use a lambda as an exception handler", () => {
    setExceptionHandler((_exception, _locale, key) => key);
    expect(translate("test_proc_handler")).toBe("test_proc_handler");
  });

  it("can use an object responding to #call as an exception handler", () => {
    setExceptionHandler({
      call: (_exception: Error, _locale: string, key: TranslationKey) => key,
    });
    expect(translate("test_proc_handler")).toBe("test_proc_handler");
  });

  it("I18n.with_locale temporarily sets the given locale", () => {
    storeTranslations("en", { foo: "Foo in :en" });
    storeTranslations("de", { foo: "Foo in :de" });
    storeTranslations("pl", { foo: "Foo in :pl" });

    withLocale(null, () => expect([locale(), t("foo")]).toEqual(["en", "Foo in :en"]));
    withLocale("de", () => expect([locale(), t("foo")]).toEqual(["de", "Foo in :de"]));
    withLocale("pl", () => expect([locale(), t("foo")]).toEqual(["pl", "Foo in :pl"]));
    withLocale("en", () => expect([locale(), t("foo")]).toEqual(["en", "Foo in :en"]));

    expect(locale()).toBe(defaultLocale());
  });

  it("I18n.with_locale resets the locale in case of errors", () => {
    expect(() =>
      withLocale("pl", () => {
        throw new ArgumentError();
      }),
    ).toThrow(ArgumentError);
    expect(locale()).toBe(defaultLocale());
  });

  it("uses the simple backend by default", () => {
    expect(config().backend).toBeInstanceOf(Simple);
  });

  it("can set the backend", () => {
    const other = new Simple();
    expect(() => setBackend(other)).not.toThrow();
    expect(config().backend).toBe(other);
  });

  it("uses :en as a default_locale by default", () => {
    expect(defaultLocale()).toBe("en");
  });

  it("can set the default locale", () => {
    expect(() => setDefaultLocale("de")).not.toThrow();
    expect(defaultLocale()).toBe("de");
  });

  it("raises an I18n::InvalidLocale exception when setting an unavailable default locale", () => {
    config().enforceAvailableLocales = true;
    expect(() => setDefaultLocale("klingon")).toThrow(InvalidLocale);
  });

  it("uses the default locale as a locale by default", () => {
    expect(locale()).toBe(defaultLocale());
  });

  it("raises an I18n::InvalidLocale exception when setting an unavailable locale", () => {
    config().enforceAvailableLocales = true;
    expect(() => setLocale("klingon")).toThrow(InvalidLocale);
  });

  it("can set the configuration object", () => {
    // Rails' second assertion reads the object back off
    // `Thread.current.thread_variable_get(:i18n_config)`; trails keeps one
    // process-wide config (see `config` in i18n.ts), so there is no
    // thread-local copy to check.
    const other = new Config();
    setConfig(other);
    expect(config()).toBe(other);
  });

  it("locale is not shared between configurations", () => {
    const a = new Config();
    const b = new Config();
    a.locale = "fr";
    b.locale = "es";
    expect(a.locale).toBe("fr");
    expect(b.locale).toBe("es");
    expect(locale()).toBe("en");
  });

  it("other options are shared between configurations", () => {
    const a = new Config();
    const b = new Config();
    a.defaultLocale = "fr";
    b.defaultLocale = "es";
    expect(a.defaultLocale).toBe("es");
    expect(b.defaultLocale).toBe("es");
    expect(defaultLocale()).toBe("es");
  });

  it("uses a dot as a default_separator by default", () => {
    expect(defaultSeparator()).toBe(".");
  });

  it("can set the default_separator", () => {
    expect(() => setDefaultSeparator("\u0001")).not.toThrow();
  });

  it("normalize_keys normalizes given locale, keys and scope to an array of single-key symbols", () => {
    expect(normalizeKeys("en", "bar", "foo")).toEqual(["en", "foo", "bar"]);
    expect(normalizeKeys("en", "baz.buz", "foo.bar")).toEqual(["en", "foo", "bar", "baz", "buz"]);
    expect(normalizeKeys("en", ["baz", "buz"], ["foo", "bar"])).toEqual([
      "en",
      "foo",
      "bar",
      "baz",
      "buz",
    ]);
  });

  it("normalize_keys discards empty keys", () => {
    expect(normalizeKeys("en", "baz..buz", "foo..bar")).toEqual(["en", "foo", "bar", "baz", "buz"]);
    expect(normalizeKeys("en", "baz......buz", "foo......bar")).toEqual([
      "en",
      "foo",
      "bar",
      "baz",
      "buz",
    ]);
    expect(normalizeKeys("en", ["baz", null, "", "buz"], ["foo", null, "", "bar"])).toEqual([
      "en",
      "foo",
      "bar",
      "baz",
      "buz",
    ]);
  });

  it("normalize_keys uses a given separator", () => {
    expect(normalizeKeys("en", "baz|buz", "foo|bar", "|")).toEqual([
      "en",
      "foo",
      "bar",
      "baz",
      "buz",
    ]);
  });

  it("normalize_keys normalizes given locale with separator", () => {
    expect(normalizeKeys("en.foo", "baz", "bar")).toEqual(["en", "foo", "bar", "baz"]);
  });

  it("available_locales_set should return a set", () => {
    expect(config().availableLocalesSet).toBeInstanceOf(Set);
    expect(config().availableLocalesSet.size).toBe(config().availableLocales.length);
  });

  it("I18n.locale_available? returns true when the passed locale is available", () => {
    setAvailableLocales(["en", "de"]);
    expect(localeAvailable("de")).toBe(true);
  });

  it("I18n.locale_available? returns true when the passed locale is a string and is available", () => {
    setAvailableLocales(["en", "de"]);
    expect(localeAvailable("de")).toBe(true);
  });

  it("I18n.locale_available? returns false when the passed locale is unavailable", () => {
    expect(localeAvailable("klingon")).toBe(false);
  });

  it("I18n.enforce_available_locales! raises an I18n::InvalidLocale when the passed locale is unavailable", () => {
    config().enforceAvailableLocales = true;
    expect(() => enforceAvailableLocalesBang("klingon")).toThrow(InvalidLocale);
  });

  it("I18n.enforce_available_locales! does nothing when the passed locale is available", () => {
    setAvailableLocales(["en", "de"]);
    config().enforceAvailableLocales = true;
    expect(() => enforceAvailableLocalesBang("en")).not.toThrow();
  });

  it("I18n.enforce_available_locales config can be set to false", () => {
    config().enforceAvailableLocales = false;
    expect(config().enforceAvailableLocales).toBe(false);
  });

  it("can set the exception_handler", () => {
    const customExceptionHandler = vi.fn();
    expect(() => setExceptionHandler(customExceptionHandler)).not.toThrow();
  });

  it("uses a custom exception handler set to I18n.exception_handler", () => {
    const customExceptionHandler = vi.fn();
    setExceptionHandler(customExceptionHandler);
    translate("bogus");
    expect(customExceptionHandler).toHaveBeenCalled();
  });

  it("available_locales can be replaced at runtime", () => {
    config().enforceAvailableLocales = true;
    expect(() => t("foo", { locale: "klingon" })).toThrow(InvalidLocale);
    setAvailableLocales(["klingon"]);
    t("foo", { locale: "klingon" });
  });

  it("I18n.reload! reloads the set of locales that are enforced", () => {
    setBackend(new Simple());

    expect(availableLocales()).not.toContain("de");

    config().enforceAvailableLocales = true;

    expect(() => setDefaultLocale("de")).toThrow(InvalidLocale);
    expect(() => setLocale("de")).toThrow(InvalidLocale);

    storeTranslations("de", { foo: "Foo in :de" });

    expect(() => setDefaultLocale("de")).toThrow(InvalidLocale);
    expect(() => setLocale("de")).toThrow(InvalidLocale);

    reloadBang();

    storeTranslations("en", { foo: "Foo in :en" });
    storeTranslations("de", { foo: "Foo in :de" });
    storeTranslations("pl", { foo: "Foo in :pl" });

    expect(availableLocales()).toContain("de");
    expect(availableLocales()).toContain("en");
    expect(availableLocales()).toContain("pl");

    expect(() => {
      setDefaultLocale("en");
      setLocale("en");
    }).not.toThrow();
  });

  it("can reserve a key", () => {
    const originalKeys = [...RESERVED_KEYS];
    try {
      reserveKey("foo");
      reserveKey("bar");

      expect(RESERVED_KEYS).toContain("foo");
      expect(RESERVED_KEYS).toContain("bar");
    } finally {
      RESERVED_KEYS.splice(0, RESERVED_KEYS.length, ...originalKeys);
    }
  });
});
