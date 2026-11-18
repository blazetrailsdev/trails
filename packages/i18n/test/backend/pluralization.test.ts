import * as TestCase from "../support/test-case.js";
import { Hash } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fallbacks } from "../../lib/backend/fallbacks.js";
import { Pluralization } from "../../lib/backend/pluralization.js";
import { Simple } from "../../lib/backend/simple.js";
import { config, t, type Locale } from "../../lib/i18n.js";

class Backend extends Fallbacks(Pluralization(Simple)) {}

function pluralizer(backend: Backend, locale: Locale): unknown {
  return (backend as unknown as { pluralizer(locale: Locale): unknown }).pluralizer(locale);
}

afterEach(TestCase.teardown);

describe("I18nBackendPluralizationTest", () => {
  let backend: Backend;
  let rule: (n: number) => string;
  let entry: Hash<string, unknown>;
  let entryWithZero: Hash<string, unknown>;

  function storeTranslations(locale: Locale, data: Record<string, unknown>): unknown {
    return backend.storeTranslations(locale, data);
  }

  beforeEach(async () => {
    await TestCase.setup();
    backend = new Backend();
    config().backend = backend;
    rule = (n) =>
      n % 10 == 1 && n % 100 != 11
        ? ":one"
        : n == 0 || (n % 100 >= 2 && n % 100 <= 10)
          ? ":few"
          : n % 100 >= 11 && n % 100 <= 19
            ? ":many"
            : ":other";
    storeTranslations("xx", { i18n: { plural: { rule } } });
    entry = new Hash<string, unknown>()
      .set(":0", "none")
      .set(":1", "single")
      .set(":one", "one")
      .set(":few", "few")
      .set(":many", "many")
      .set(":other", "other");
    entryWithZero = new Hash<string, unknown>(entry).set(":zero", "zero");
  });

  it("pluralization picks a pluralizer from :'i18n.pluralize'", () => {
    expect(pluralizer(backend, "xx")).toBe(rule);
  });

  it("pluralization picks the explicit 1 rule for count == 1, the explicit rule takes priority over the matching :one rule", () => {
    expect(t(null, { count: 1, default: entry, locale: "xx" })).toBe("single");
    expect(t(null, { count: 1.0, default: entry, locale: "xx" })).toBe("single");
  });

  it("pluralization picks :one for 1, since in this case that is the matching rule for 1 (when there is no explicit 1 rule)", () => {
    entry.delete(":1");
    expect(t(null, { count: 1, default: entry, locale: "xx" })).toBe("one");
  });

  it("pluralization picks :few for 2", () => {
    expect(t(null, { count: 2, default: entry, locale: "xx" })).toBe("few");
  });

  it("pluralization picks :many for 11", () => {
    expect(t(null, { count: 11, default: entry, locale: "xx" })).toBe("many");
  });

  it("pluralization picks zero for 0 if the key is contained in the data", () => {
    expect(t(null, { count: 0, default: entryWithZero, locale: "xx" })).toBe("zero");
  });

  it("pluralization picks explicit 0 rule for count == 0, since the explicit rule takes priority over the matching :few rule", () => {
    expect(t(null, { count: 0, default: entry, locale: "xx" })).toBe("none");
    expect(t(null, { count: 0.0, default: entry, locale: "xx" })).toBe("none");
    expect(t(null, { count: -0, default: entry, locale: "xx" })).toBe("none");
  });

  it("pluralization picks :few for 0 (when there is no explicit 0 rule)", () => {
    entry.delete(":0");
    expect(t(null, { count: 0, default: entry, locale: "xx" })).toBe("few");
  });

  it("pluralization does Lateral Inheritance to :other to cover missing data", () => {
    entry.delete(":many");
    expect(t(null, { count: 11, default: entry, locale: "xx" })).toBe("other");
  });

  it("pluralization picks one for 1 if the entry has attributes hash on unknown locale", () => {
    entry.set(":attributes", new Hash().set(":field", "field").set(":second", "second"));
    expect(t(null, { count: 1, default: entry, locale: "pirate" })).toBe("one");
  });

  it("Nested keys within pluralization context", () => {
    storeTranslations("xx", {
      stars: {
        one: "%{count} star",
        other: "%{count} stars",
        special: {
          one: "%{count} special star",
          other: "%{count} special stars",
        },
      },
    });
    expect(t("stars", { count: 1, locale: "xx" })).toBe("1 star");
    expect(t("stars", { count: 20, locale: "xx" })).toBe("20 stars");
    expect(t("stars.special", { count: 1, locale: "xx" })).toBe("1 special star");
    expect(t("stars.special", { count: 20, locale: "xx" })).toBe("20 special stars");
  });

  it("Fallbacks can pick up rules from fallback locales, too", () => {
    expect(pluralizer(backend, "xx-XX")).toBe(rule);
  });

  it("linked lookup works with pluralization backend", () => {
    backend.storeTranslations("xx", {
      automobiles: ":autos",
      autos: ":cars",
      cars: {
        porsche: { one: "I have %{count} Porsche 🚗", other: "I have %{count} Porsches 🚗" },
      },
    });
    expect(t("automobiles.porsche", { count: 1, locale: "xx" })).toBe("I have 1 Porsche 🚗");
    expect(t("automobiles.porsche", { count: 20, locale: "xx" })).toBe("I have 20 Porsches 🚗");
  });
});
