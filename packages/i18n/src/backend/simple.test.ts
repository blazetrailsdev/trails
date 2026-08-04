/** Mirrors: i18n/test/backend/simple_test.rb */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { Simple } from "./simple.js";
import { config, resetConfig, type TranslationKey } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { UnknownFileType } from "../exceptions.js";
import { catchException } from "../throw-catch.js";
import {
  preloadTranslationFiles,
  registerFileReader,
  registerLocaleModule,
  type TranslateOptions,
} from "./base.js";
import { en } from "../test-data/locales/en.js";
import type { TranslationData } from "../utils.js";

/** Mirrors: `locales_dir` in i18n/test/test_helper.rb:44. */
function localesDir(): string {
  return new URL("../test-data/locales", import.meta.url).pathname;
}

describe("I18nBackendSimpleTest", () => {
  let backend: Simple;

  beforeEach(async () => {
    resetConfig();
    resetClassConfig();
    registerFileReader((filename) => readFile(filename, "utf8"));
    // The gem reads files synchronously inside `load_translations`; here the
    // I/O is awaited up front so every ported body below stays synchronous.
    await preloadTranslationFiles(
      ["en.yml", "en.yaml", "en.json", "fr.yml", "invalid/empty.yml", "invalid/syntax.yml"].map(
        (name) => `${localesDir()}/${name}`,
      ),
    );
    registerLocaleModule(`${localesDir()}/en.js`, { en });
    backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
  });

  /** Stands in for Ruby's `send`, which the gem's tests use for these. */
  function send(
    target: Simple,
    name: "loadJs" | "loadYml" | "loadJson",
    filename: string,
  ): [unknown, boolean] {
    return (target as unknown as Record<typeof name, (f: string) => [unknown, boolean]>)[name](
      filename,
    );
  }

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

  // loading translations

  it("simple load_translations: given an unknown file type it raises I18n::UnknownFileType", () => {
    expect(() => backend.loadTranslations(`${localesDir()}/en.xml`)).toThrow(UnknownFileType);
  });

  it("simple load_translations: given a YAML file name with yaml extension does not raise anything", () => {
    expect(() => backend.loadTranslations(`${localesDir()}/en.yaml`)).not.toThrow();
  });

  it("simple load_translations: given a JSON file name with yaml extension does not raise anything", () => {
    expect(() => backend.loadTranslations(`${localesDir()}/en.json`)).not.toThrow();
  });

  it("simple load_translations: given a Ruby file name it does not raise anything", () => {
    expect(() => backend.loadTranslations(`${localesDir()}/en.js`)).not.toThrow();
  });

  it("simple load_translations: given no argument, it uses I18n.load_path", () => {
    config().loadPath = [`${localesDir()}/en.yml`];
    backend.loadTranslations();
    expect(translations()).toEqual({ en: { foo: { bar: "baz" } } });
  });

  it("simple load_rb: loads data from a Ruby file", () => {
    const [data] = send(backend, "loadJs", `${localesDir()}/en.js`);
    expect(data).toEqual({ en: { fuh: { bah: "bas" } } });
  });

  it("simple load_yml: loads data from a YAML file", () => {
    const [data] = send(backend, "loadYml", `${localesDir()}/en.yml`);
    expect(data).toEqual({ en: { foo: { bar: "baz" } } });
  });

  it("simple load_json: loads data from a JSON file", () => {
    const [data] = send(backend, "loadJson", `${localesDir()}/en.json`);
    expect(data).toEqual({ en: { foo: { bar: "baz" } } });
  });

  it("simple load_translations: loads data from known file formats", () => {
    backend = new Simple();
    config().backend = backend;
    backend.loadTranslations(`${localesDir()}/en.js`, `${localesDir()}/en.yml`);
    const expected = { en: { fuh: { bah: "bas" }, foo: { bar: "baz" } } };
    expect(translations()).toEqual(expected);
  });

  it("simple load_translations: given file names as array it does not raise anything", () => {
    expect(() =>
      backend.loadTranslations([`${localesDir()}/en.js`, `${localesDir()}/en.yml`]),
    ).not.toThrow();
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
      expect(translations()["fr"]).toEqual({});
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
    config().loadPath = [`${localesDir()}/en.yml`];
    backend.loadTranslations();
    expect(t("foo.bar", { count: 1 })).toBe("baz");
  });
});
