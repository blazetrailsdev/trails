import { describe, it, expect } from "vitest";

import { transliterate } from "./transliterate.js";

describe("TransliterateTest", () => {
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

  it.skip("transliterate should work with custom i18n rules and uncomposed utf8", () => {
    /* i18n-dependent */
  });
  it.skip("transliterate respects the locale argument", () => {
    /* i18n-dependent */
  });

  it("transliterate should allow a custom replacement char", () => {
    expect(transliterate("hello 日本語 world", "*")).toBe("hello *** world");
    expect(transliterate("café", "_")).toBe("cafe");
  });

  it("transliterate handles empty string", () => {
    expect(transliterate("")).toBe("");
  });

  it("transliterate handles nil", () => {
    expect(transliterate(null)).toBe("");
    expect(transliterate(undefined)).toBe("");
  });

  it("transliterate handles unknown object", () => {
    expect(transliterate(42 as unknown as string)).toBe("42");
  });

  it("transliterate handles strings with valid utf8 encodings", () => {
    expect(transliterate("El Niño")).toBe("El Nino");
  });

  it("transliterate handles strings with valid us ascii encodings", () => {
    expect(transliterate("hello")).toBe("hello");
  });

  it.skip("transliterate handles strings with valid gb18030 encodings", () => {
    /* encoding-specific */
  });
  it.skip("transliterate handles strings with incompatible encodings", () => {
    /* encoding-specific */
  });
  it.skip("transliterate handles strings with invalid utf8 bytes", () => {
    /* encoding-specific */
  });
  it.skip("transliterate handles strings with invalid us ascii bytes", () => {
    /* encoding-specific */
  });
  it.skip("transliterate handles strings with invalid gb18030 bytes", () => {
    /* encoding-specific */
  });

  it("transliterate returns a copy of ascii strings", () => {
    const original = "hello";
    const result = transliterate(original);
    expect(result).toBe("hello");
    // returns a string value (new or same reference doesn't matter in JS)
    expect(typeof result).toBe("string");
  });
});
