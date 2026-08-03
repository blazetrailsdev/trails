/**
 * Mirrors: i18n/test/backend/chain_test.rb
 *
 * Not ported: `I18nBackendChainWithKeyValueTest`, which the gem itself guards
 * with `if I18n::TestCase.key_value?` — it needs the `I18n::Backend::KeyValue`
 * backend, which trails has not ported.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chain } from "./chain.js";
import { Simple } from "./simple.js";
import { config, resetConfig, t } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import type { TranslationData } from "../utils.js";

describe("I18nBackendChainTest", () => {
  let first: Simple;
  let second: Simple;
  let chain: Chain;

  /** Mirrors: the `backend` helper in chain_test.rb:170-174. */
  function backend(translations: TranslationData): Simple {
    const backend = new Simple();
    for (const [locale, data] of Object.entries(translations)) {
      backend.storeTranslations(locale, data as TranslationData);
    }
    return backend;
  }

  /** Stands in for Ruby's `send`, which the gem's tests use for these. */
  function send(
    target: Simple | Chain,
    name: "translations" | "initTranslations",
  ): TranslationData {
    return (target as unknown as Record<typeof name, () => TranslationData>)[name]();
  }

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().enforceAvailableLocales = false;
    first = backend({
      en: {
        foo: "Foo",
        formats: {
          short: "short",
          subformats: { short: "short" },
        },
        plural_1: { one: "%{count}" },
        dates: { a: "A" },
        fallback_bar: null,
      },
    });
    second = backend({
      en: {
        bar: "Bar",
        formats: {
          long: "long",
          subformats: { long: "long" },
        },
        plural_2: { one: "one" },
        dates: { a: "B", b: "B" },
        fallback_bar: "Bar",
      },
    });
    chain = new Chain(first, second);
    config().backend = chain;
  });

  it("looks up translations from the first chained backend", () => {
    expect((send(first, "translations")["en"] as TranslationData)["foo"]).toBe("Foo");
    expect(t("foo")).toBe("Foo");
  });

  it("looks up translations from the second chained backend", () => {
    expect((send(second, "translations")["en"] as TranslationData)["bar"]).toBe("Bar");
    expect(t("bar")).toBe("Bar");
  });

  it("defaults only apply to lookups on the last backend in the chain", () => {
    expect(t("foo", { default: "Bah" })).toBe("Foo");
    expect(t("bar", { default: "Bah" })).toBe("Bar");
    expect(t("bah", { default: "Bah" })).toBe("Bah"); // default kicks in only here
  });

  it("default", () => {
    expect(t(null, { default: "Fuh" })).toBe("Fuh");
    expect(t(null, { default: { zero: "Zero" }, count: 0 })).toBe("Zero");
    expect(t(null, { default: { zero: "Zero" } })).toEqual({ zero: "Zero" });
    // `default` still spells a Ruby Symbol as a JS symbol in base.ts; converging
    // that is story `i18n-symbol-values-are-colon-strings`.
    expect(t(null, { default: Symbol.for("foo") })).toBe("Foo");
  });

  it("default is returned if translation is missing", () => {
    expect(t("i18n.transliterate.rule", { locale: "en", default: {} })).toEqual({});
  });

  it("namespace lookup collects results from all backends and merges deep hashes", () => {
    expect(t("formats")).toEqual({
      long: "long",
      subformats: { long: "long", short: "short" },
      short: "short",
    });
  });

  it("namespace lookup collects results from all backends and lets leftmost backend take priority", () => {
    expect(t("dates")).toEqual({ a: "A", b: "B" });
  });

  it("namespace lookup with only the first backend returning a result", () => {
    expect(t("plural_1")).toEqual({ one: "%{count}" });
  });

  it("pluralization still works", () => {
    expect(t("plural_1", { count: 1 })).toBe("1");
    expect(t("plural_2", { count: 1 })).toBe("one");
  });

  it("bulk lookup collects results from all backends", () => {
    expect(t(["foo", "bar"])).toEqual(["Foo", "Bar"]);
    expect(t(["foo", "bar", "bah"], { default: "Bah" })).toEqual(["Foo", "Bar", "Bah"]);
    expect(t(["formats", "plural_2", "bah"], { default: "Bah" })).toEqual([
      { long: "long", subformats: { long: "long", short: "short" }, short: "short" },
      { one: "one" },
      "Bah",
    ]);
  });

  it("store_translations options are not dropped while transferring to backend", () => {
    const storeTranslations = vi.spyOn(first, "storeTranslations");
    config().backend.storeTranslations("foo", { bar: Symbol.for("baz") }, { option: "persists" });
    expect(storeTranslations).toHaveBeenCalledWith(
      "foo",
      { bar: Symbol.for("baz") },
      { option: "persists" },
    );
  });

  it("store should call initialize on all backends and return true if all initialized", () => {
    send(first, "initTranslations");
    send(second, "initTranslations");
    expect((config().backend as Chain).initialized()).toBe(true);
  });

  it("store should call initialize on all backends and return false if one not initialized", () => {
    first.reloadBang();
    send(second, "initTranslations");
    expect((config().backend as Chain).initialized()).toBe(false);
  });

  it("should reload all backends", () => {
    send(first, "initTranslations");
    send(second, "initTranslations");
    config().backend.reloadBang();
    expect(first.initialized()).toBe(false);
    expect(second.initialized()).toBe(false);
  });

  it("should eager load all backends", () => {
    config().backend.eagerLoadBang();
    expect(first.initialized()).toBe(true);
    expect(second.initialized()).toBe(true);
  });

  it("falls back to other backends for nil values", () => {
    expect((send(first, "translations")["en"] as TranslationData)["fallback_bar"]).toBeNull();
    expect((send(second, "translations")["en"] as TranslationData)["fallback_bar"]).toBe("Bar");
    expect(t("fallback_bar")).toBe("Bar");
  });

  it("should be able to get all translations of all backends merged together", () => {
    const expected = {
      en: {
        foo: "Foo",
        bar: "Bar",
        formats: {
          short: "short",
          long: "long",
          subformats: { short: "short", long: "long" },
        },
        plural_1: { one: "%{count}" },
        plural_2: { one: "one" },
        dates: { a: "A", b: "B" },
        fallback_bar: "Bar",
      },
    };
    expect(send(chain, "translations")).toEqual(expected);
  });
});
