import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { ArgumentError } from "./hash-utils.js";
import { I18n } from "./i18n.js";
import { transliterate } from "./transliterate.js";

describe("TransliterateTest", () => {
  let enforceAvailableLocales: boolean;
  beforeAll(() => {
    enforceAvailableLocales = I18n.config().enforceAvailableLocales;
    I18n.config().enforceAvailableLocales = false;
  });
  afterAll(() => {
    I18n.config().enforceAvailableLocales = enforceAvailableLocales;
  });

  it("transliterate should not change ascii chars", () => {
    expect(transliterate("Hello World")).toBe("Hello World");
    expect(transliterate("abc123!@#")).toBe("abc123!@#");
  });

  it("transliterate should approximate ascii", () => {
    expect(transliterate("Ângela")).toBe("Angela");
    expect(transliterate("café")).toBe("cafe");
    expect(transliterate("über")).toBe("uber");
    expect(transliterate("naïve")).toBe("naive");
    expect(transliterate("Ö")).toBe("O");
  });

  it("transliterate should work with custom i18n rules and uncomposed utf8", () => {
    const char = "\u0075\u0308";
    I18n.backend().storeTranslations("de", { i18n: { transliterate: { rule: { ü: "ue" } } } });
    const defaultLocale = I18n.locale();
    I18n.setLocale("de");
    try {
      expect(transliterate(char)).toBe("ue");
    } finally {
      I18n.setLocale(defaultLocale);
    }
  });

  it("transliterate respects the locale argument", () => {
    const char = "\u0075\u0308";
    I18n.backend().storeTranslations("de", { i18n: { transliterate: { rule: { ü: "ue" } } } });
    expect(transliterate(char, "?", { locale: "de" })).toBe("ue");
  });

  it("transliterate should allow a custom replacement char", () => {
    expect(transliterate("hello 日本語 world", "*")).toBe("hello *** world");
    expect(transliterate("café", "_")).toBe("cafe");
  });

  it("transliterate handles empty string", () => {
    expect(transliterate("")).toBe("");
  });

  it("transliterate handles nil", () => {
    expect(() => transliterate(null as unknown as string)).toThrow(ArgumentError);
    expect(() => transliterate(null as unknown as string)).toThrow(
      "Can only transliterate strings. Received NilClass",
    );
    expect(() => transliterate(undefined as unknown as string)).toThrow(
      "Can only transliterate strings. Received NilClass",
    );
  });

  it("transliterate handles unknown object", () => {
    expect(() => transliterate({} as unknown as string)).toThrow(ArgumentError);
    expect(() => transliterate({} as unknown as string)).toThrow(
      "Can only transliterate strings. Received Object",
    );
  });

  it("transliterate handles strings with valid utf8 encodings", () => {
    expect(transliterate("El Niño")).toBe("El Nino");
  });

  it("transliterate handles strings with valid us ascii encodings", () => {
    expect(transliterate("hello")).toBe("hello");
  });

  it("transliterate returns a copy of ascii strings", () => {
    const original = "hello";
    const result = transliterate(original);
    expect(result).toBe("hello");
    expect(typeof result).toBe("string");
  });
});
