import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { ArgumentError } from "./hash-utils.js";
import { I18n } from "./i18n.js";
import { assert, assertNot, assertRaises } from "./testing/assertions.js";
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
    for (let byte = 0; byte <= 127; byte++) {
      const char = String.fromCodePoint(byte);
      expect(transliterate(char)).toEqual(char);
    }
  });

  it("transliterate should approximate ascii", () => {
    const string = String.fromCodePoint(
      ...Array.from({ length: 0x17e - 0xc0 + 1 }, (_, i) => 0xc0 + i).filter(
        (c) => ![0xd7, 0xf7].includes(c),
      ),
    );
    for (const char of string) {
      expect(transliterate(char)).toMatch(/^[a-zA-Z']*$/);
    }
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
    expect(transliterate("a索b", "*")).toEqual("a*b");
  });

  it("transliterate handles empty string", () => {
    expect(transliterate("")).toBe("");
  });

  it("transliterate handles nil", async () => {
    const exception = await assertRaises([ArgumentError], {}, () =>
      transliterate(null as unknown as string),
    );
    expect(exception.message).toEqual("Can only transliterate strings. Received NilClass");
  });

  it("transliterate handles unknown object", async () => {
    const exception = await assertRaises([ArgumentError], {}, () =>
      transliterate(new (class Object {})() as unknown as string),
    );
    expect(exception.message).toEqual("Can only transliterate strings. Received Object");
  });

  it("transliterate handles strings with valid utf8 encodings", () => {
    const string = "A";
    expect(transliterate(string)).toEqual("A");
  });

  it("transliterate handles strings with valid us ascii encodings", () => {
    const string = "A";
    const transcoded = transliterate(string);
    expect(transcoded).toEqual("A");
    expect(typeof transcoded).toEqual("string");
  });

  it("transliterate returns a copy of ascii strings", () => {
    const string = new String("Test String");
    assertNot(Object.isFrozen(string));
    assert(/^[\p{ASCII}]*$/u.test(string.valueOf()));
    expect(transliterate(string.valueOf())).not.toBe(string);
  });
});
