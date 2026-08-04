/**
 * Mirrors: i18n/test/backend/key_value_test.rb
 *
 * The gem guards the whole file with `if I18n::TestCase.key_value?`, which asks
 * whether ActiveSupport is loaded — the gem needs it for `ActiveSupport::JSON`
 * (key_value.rb:20). JS has `JSON` in the language, so there is nothing to
 * probe and the cases always run.
 *
 * The store the gem passes is a Ruby Hash (`{}`); a `Map` is the JS Hash, and
 * its `get` / `set` / `keys` are the `[]` / `[]=` / `keys` the backend asks for.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { KeyValue, type Store } from "./key-value.js";
import { Fallbacks } from "./fallbacks.js";
import { InvalidPluralizationData, MissingTranslationData } from "../exceptions.js";
import { config, resetConfig, t, type TranslateKey } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import type { TranslateOptions } from "./base.js";
import type { TranslationData } from "../utils.js";

class FallbacksBackend extends Fallbacks(KeyValue) {}

describe("I18nBackendKeyValueTest", () => {
  let backend: KeyValue;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().enforceAvailableLocales = false;
  });

  /**
   * Mirrors: `setup_backend!` (key_value_test.rb:4-7). Ruby's
   * `I18n.backend.extend I18n::Backend::Fallbacks` reopens a single instance,
   * which TypeScript has no form of, so the two cases that need it hand the
   * `Fallbacks(KeyValue)` subclass in here instead.
   */
  function setupBackend(subtree = true, Backend: typeof KeyValue = KeyValue): void {
    backend = new Backend(new Map<string, string>() as Store, subtree);
    config().backend = backend;
    storeTranslations("en", { foo: { bar: "bar", baz: "baz" } });
  }

  /** Mirrors: `store_translations` in i18n/test/test_helper.rb:40. */
  function storeTranslations(locale: string, data: TranslationData): unknown {
    return config().backend.storeTranslations(locale, data);
  }

  /** Mirrors: `translations` in i18n/test/test_helper.rb:36 — the `@translations` ivar. */
  function translations(): TranslationData | undefined {
    return backend.translationsStore;
  }

  /** Stands in for Ruby's `send`, which the gem's tests use for this. */
  function send(target: KeyValue, name: "translations"): TranslationData {
    return (target as unknown as Record<typeof name, () => TranslationData>)[name]();
  }

  function assertFlattens(
    expected: TranslationData,
    nested: TranslationData,
    escape = true,
    subtree = true,
  ): void {
    expect(backend.flattenTranslations("en", nested, escape, subtree)).toEqual(expected);
  }

  it("hash flattening works", () => {
    setupBackend();
    assertFlattens(
      {
        a: "a",
        b: { c: "c", d: "d", f: { x: "x" } },
        "b.f": { x: "x" },
        "b.c": "c",
        "b.f.x": "x",
        "b.d": "d",
      },
      { a: "a", b: { c: "c", d: "d", f: { x: "x" } } },
    );
    assertFlattens({ a: { b: ["a", "b"] }, "a.b": ["a", "b"] }, { a: { b: ["a", "b"] } });
    assertFlattens({ ["a\u0001b"]: "c" }, { "a.b": "c" });
    assertFlattens({ "a.b": ["a", "b"] }, { a: { b: ["a", "b"] } }, true, false);
    assertFlattens({ "a.b": "c" }, { "a.b": "c" }, false);
  });

  it("store_translations supports numeric keys", () => {
    setupBackend();
    storeTranslations("en", { 1: "foo" });
    expect(t("1")).toBe("foo");
    expect(t(1 as unknown as TranslateKey)).toBe("foo");
    // The gem's third assertion is `I18n.t(:'1')`; a Ruby Symbol key is a JS
    // string, so it is the same call as the first one.
  });

  it("store_translations handle subtrees by default", () => {
    setupBackend();
    expect(t("foo")).toEqual({ bar: "bar", baz: "baz" });
  });

  it("store_translations merge subtrees accordingly", () => {
    setupBackend();
    storeTranslations("en", { foo: { baz: "BAZ" } });
    expect(t("foo.baz")).toBe("BAZ");
    expect(t("foo")).toEqual({ bar: "bar", baz: "BAZ" });
  });

  it("store_translations does not handle subtrees if desired", () => {
    setupBackend(false);
    expect(() => t("foo", { raise: true } as TranslateOptions)).toThrow(MissingTranslationData);
  });

  it("initialized? checks that a store is available", () => {
    setupBackend();
    backend.reloadBang();
    expect(backend.initialized()).toBe(true);
  });

  it("translations gets the translations from the store", () => {
    setupBackend();
    send(backend, "translations");
    const expected = { en: { foo: { bar: "bar", baz: "baz" } } };
    expect(translations()).toEqual(expected);
  });

  it("subtrees enabled: given incomplete pluralization data it raises I18n::InvalidPluralizationData", () => {
    setupBackend();
    storeTranslations("en", { bar: { one: "One" } });
    expect(() => t("bar", { count: 2 })).toThrow(InvalidPluralizationData);
  });

  it("subtrees disabled: given incomplete pluralization data it returns an error message", () => {
    setupBackend(false);
    storeTranslations("en", { bar: { one: "One" } });
    expect(t("bar", { count: 2 })).toBe("Translation missing: en.bar");
  });

  it("translate handles subtrees for pluralization", () => {
    setupBackend(false);
    storeTranslations("en", { bar: { one: "One" } });
    expect(t("bar", { count: 1 })).toBe("One");
  });

  it("subtrees enabled: returns localized string given missing pluralization data", () => {
    setupBackend(true);
    expect(t("foo.bar", { count: 1 })).toBe("bar");
  });

  it("subtrees disabled: returns localized string given missing pluralization data", () => {
    setupBackend(false);
    expect(t("foo.bar", { count: 1 })).toBe("bar");
  });

  it("subtrees enabled: Returns fallback default given missing pluralization data", () => {
    setupBackend(true, FallbacksBackend);
    expect(t("missing_bar", { count: 1, default: "default" })).toBe("default");
    expect(t("missing_bar", { count: 0, default: "default" })).toBe("default");
  });

  it("subtrees disabled: Returns fallback default given missing pluralization data", () => {
    setupBackend(false, FallbacksBackend);
    expect(t("missing_bar", { count: 1, default: "default" })).toBe("default");
    expect(t("missing_bar", { count: 0, default: "default" })).toBe("default");
  });
});
