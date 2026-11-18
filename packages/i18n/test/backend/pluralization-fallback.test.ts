import * as TestCase from "../support/test-case.js";
import { include } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fallbacks } from "../../lib/backend/fallbacks.js";
import { Pluralization } from "../../lib/backend/pluralization.js";
import { Simple } from "../../lib/backend/simple.js";
import { config, setDefaultLocale, t, type Locale } from "../../lib/i18n.js";

class PluralizationSimple extends Simple {}
include(PluralizationSimple, Pluralization);
class Backend extends Fallbacks(PluralizationSimple) {}

afterEach(TestCase.teardown);

describe("I18nBackendPluralizationFallbackTest", () => {
  let backend: Backend;

  function storeTranslations(locale: Locale, data: Record<string, unknown>): unknown {
    return backend.storeTranslations(locale, data);
  }

  function russianRule(): (n: number | null) => string {
    return (n) => {
      n ??= 0;
      const mod10 = n % 10;
      const mod100 = n % 100;

      if (mod10 == 1 && mod100 != 11) {
        return ":one";
      } else if ([2, 3, 4].includes(mod10) && !(mod100 >= 12 && mod100 <= 14)) {
        return ":few";
      } else if (mod10 == 0 || [5, 6, 7, 8, 9].includes(mod10) || (mod100 >= 11 && mod100 <= 14)) {
        return ":many";
      } else {
        return ":other";
      }
    };
  }

  beforeEach(async () => {
    await TestCase.setup();
    setDefaultLocale("en");
    backend = new Backend();
    config().backend = backend;

    storeTranslations("en", { cat: { zero: "cat", one: "cat", other: "cats" } });
    storeTranslations("en-US", { cat: { zero: "no cat", one: null, other: "lots of cats" } });

    storeTranslations("ru", { cat: { one: "кот", few: "кошек", many: "кошка", other: "кошек" } });
    storeTranslations("ru-US", { cat: { one: null, few: null, many: null, other: null } });
    storeTranslations("ru", { i18n: { plural: { rule: russianRule() } } });
  });

  it("fallbacks: nils are ignored and fallback is applied", () => {
    expect(t("cat", { count: 0, locale: "en-US" })).toBe("no cat");
    expect(t("cat", { count: 0, locale: "en" })).toBe("cat");

    expect(t("cat", { count: 1, locale: "en-US" })).toBe("cat");
    expect(t("cat", { count: 1, locale: "en" })).toBe("cat");

    expect(t("cat", { count: 2, locale: "en-US" })).toBe("lots of cats");
    expect(t("cat", { count: 2, locale: "en" })).toBe("cats");
  });

  it("fallbacks: nils are ignored and fallback is applied, with custom rule", () => {
    expect(t("cat", { count: 0, locale: "ru" })).toBe("кошка");
    expect(t("cat", { count: 0, locale: "ru-US" })).toBe("кошка");

    expect(t("cat", { count: 1, locale: "ru" })).toBe("кот");
    expect(t("cat", { count: 1, locale: "ru-US" })).toBe("кот");

    expect(t("cat", { count: 2, locale: "ru" })).toBe("кошек");
    expect(t("cat", { count: 2, locale: "ru-US" })).toBe("кошек");

    expect(t("cat", { count: 1.5, locale: "ru" })).toBe("кошек");
    expect(t("cat", { count: 1.5, locale: "ru-US" })).toBe("кошек");
  });
});
