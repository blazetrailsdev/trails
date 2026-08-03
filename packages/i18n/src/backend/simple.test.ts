/** Mirrors: i18n/test/backend/simple_test.rb */

import { beforeEach, describe, expect, it } from "vitest";
import { Simple } from "./simple.js";
import { config, resetConfig, type TranslationKey } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { catchException } from "../throw-catch.js";
import type { TranslateOptions } from "./base.js";
import type { TranslationData } from "../utils.js";

describe("I18nBackendSimpleTest", () => {
  let backend: Simple;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
  });

  function storeTranslations(locale: string, data: TranslationData): unknown {
    return backend.storeTranslations(locale, data);
  }

  function translations(): TranslationData {
    return backend.translations();
  }

  /** Stands in for `I18n.t`, which the facade story ports. */
  function t(key: TranslationKey | null, options: TranslateOptions = {}): unknown {
    return catchException(() => backend.translate("en", key, options));
  }

  // useful because this way we can use the backend with no key for interpolation/pluralization
  it("simple backend translate: given nil as a key it still interpolations the default value", () => {
    expect(t(null, { default: "Hi %{name}", name: "David" })).toBe("Hi David");
  });

  it("simple backend translate: given true as a key", () => {
    storeTranslations("en", { available: { true: "Yes", false: "No" } });
    expect((t("available") as TranslationData)["true"]).toBe("Yes");
    expect((t("available") as TranslationData)["false"]).toBe("No");
  });

  it("simple backend translate: given integer as a key", () => {
    storeTranslations("en", {
      available: { "-1": "Possibly", 0: "Maybe", 1: "Yes", 2: "No", 3: "Never" },
    });
    expect((t("available") as TranslationData)["-1"]).toBe("Possibly");
    expect(t("available.-1")).toBe("Possibly");
    expect((t("available") as TranslationData)[0]).toBe("Maybe");
    expect(t("available.0")).toBe("Maybe");
    expect((t("available") as TranslationData)[1]).toBe("Yes");
    expect(t("available.1")).toBe("Yes");
    expect((t("available") as TranslationData)[2]).toBe("No");
    expect(t("available.2")).toBe("No");
    expect((t("available") as TranslationData)[3]).toBe("Never");
    expect(t("available.+3")).toBe("Never");
  });

  it("simple backend translate: given integer with a leading positive/negative sign", () => {
    storeTranslations("en", { available: { "-1": "No", 0: "Maybe", 1: "Yes" } });
    expect((t("available") as TranslationData)["-1"]).toBe("No");
    expect(t("available.-1")).toBe("No");
    expect((t("available") as TranslationData)[0]).toBe("Maybe");
    expect(t("available.-0")).toBe("Maybe");
    expect(t("available.+0")).toBe("Maybe");
    expect((t("available") as TranslationData)[1]).toBe("Yes");
    expect(t("available.+1")).toBe("Yes");
  });

  it("simple backend translate: given integer with a lead zero as a key", () => {
    storeTranslations("en", { available: { "01": "foo" } });
    expect((t("available") as TranslationData)["01"]).toBe("foo");
    expect(t("available.01")).toBe("foo");
  });

  it("simple backend translate: symbolize keys in hash", () => {
    storeTranslations("en", { nested_hashes_in_array: { hello: "world" } });
    expect(t("nested_hashes_in_array.hello")).toBe("world");
    expect((t("nested_hashes_in_array") as TranslationData)["hello"]).toBe("world");
  });

  it("simple backend translate: symbolize keys in array", () => {
    storeTranslations("en", { nested_hashes_in_array: [{ hello: "world" }] });
    for (const val of t("nested_hashes_in_array") as TranslationData[]) {
      expect(val["hello"]).toBe("world");
    }
  });

  // storing translations

  it("simple store_translations: stores translations, ... no, really :-)", () => {
    storeTranslations("en", { foo: "bar" });
    expect(translations()).toEqual({ en: { foo: "bar" } });
  });

  it("simple store_translations: deep_merges with existing translations", () => {
    storeTranslations("en", { foo: { bar: "bar" } });
    storeTranslations("en", { foo: { baz: "baz" } });
    expect(translations()).toEqual({ en: { foo: { bar: "bar", baz: "baz" } } });
  });

  it("simple store_translations: converts keys to Symbols", () => {
    storeTranslations("en", { foo: { bar: "bar", baz: "baz" } });
    expect(translations()).toEqual({ en: { foo: { bar: "bar", baz: "baz" } } });
  });

  it("simple store_translations: do not store translations unavailable locales if enforce_available_locales is true", () => {
    try {
      config().enforceAvailableLocales = true;
      config().availableLocales = ["en", "es"];
      storeTranslations("fr", { foo: { bar: "barfr", baz: "bazfr" } });
      storeTranslations("es", { foo: { bar: "bares", baz: "bazes" } });
      // Ruby's Concurrent::Hash default block hands back `{}` for the missing
      // `:fr` key; a plain JS object has nothing there.
      expect(translations()["fr"]).toBeUndefined();
      expect(translations()["es"]).toEqual({ foo: { bar: "bares", baz: "bazes" } });
    } finally {
      config().enforceAvailableLocales = false;
    }
  });

  it("simple store_translations: store translations for unavailable locales if enforce_available_locales is false", () => {
    config().availableLocales = ["en", "es"];
    storeTranslations("fr", { foo: { bar: "barfr", baz: "bazfr" } });
    expect(translations()["fr"]).toEqual({ foo: { bar: "barfr", baz: "bazfr" } });
  });

  it("simple store_translations: supports numeric keys", () => {
    storeTranslations("en", { 1: "foo" });
    expect(t("1")).toBe("foo");
    expect(t(1)).toBe("foo");
  });

  it("simple store_translations: store translations doesn't deep symbolize keys if skip_symbolize_keys is true", () => {
    const data = { foo: { bar: "barfr", baz: "bazfr" } };

    storeTranslations("fr", data);
    expect(translations()["fr"]).toEqual({ foo: { bar: "barfr", baz: "bazfr" } });

    backend.reloadBang();

    backend.storeTranslations("fr", data, { skipSymbolizeKeys: true });
    // JS object keys are already strings, so the only observable difference is
    // that the stored subtree is the caller's object rather than a deep copy.
    expect(translations()["fr"]).toEqual({ foo: { bar: "barfr", baz: "bazfr" } });
    expect((translations()["fr"] as TranslationData)["foo"]).toBe(data.foo);
  });

  // reloading translations

  it("simple reload_translations: unloads translations", () => {
    storeTranslations("en", { foo: "bar" });
    backend.reloadBang();
    expect(translations()).toEqual({});
  });

  it("simple reload_translations: uninitializes the backend", () => {
    backend.reloadBang();
    expect(backend.initialized()).toBe(false);
  });

  it("simple eager_load!: loads the translations", () => {
    expect(backend.initialized()).toBe(false);
    backend.eagerLoadBang();
    expect(backend.initialized()).toBe(true);
  });

  it("simple reload!: reinitialize the backend if it was previously eager loaded", () => {
    backend.eagerLoadBang();
    backend.reloadBang();
    expect(backend.initialized()).toBe(true);
  });

  it("Nested keys within pluralization context", () => {
    storeTranslations("en", {
      stars: {
        one: "%{count} star",
        other: "%{count} stars",
        special: {
          one: "%{count} special star",
          other: "%{count} special stars",
        },
      },
    });
    expect(t("stars", { count: 1 })).toBe("1 star");
    expect(t("stars", { count: 20 })).toBe("20 stars");
    expect(t("stars.special", { count: 1 })).toBe("1 special star");
    expect(t("stars.special", { count: 20 })).toBe("20 special stars");
  });

  it("returns localized string given missing pluralization data", () => {
    // The gem's setup loads this pair from `test/test_data/locales/en.yml`;
    // file loading lands with its own story.
    storeTranslations("en", { foo: { bar: "baz" } });
    expect(t("foo.bar", { count: 1 })).toBe("baz");
  });
});
