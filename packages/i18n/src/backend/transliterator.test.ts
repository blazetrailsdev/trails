/**
 * Mirrors: i18n/test/backend/transliterator_test.rb
 *
 * `default transliterator raises errors for invalid UTF-8` is excluded in
 * `scripts/api-compare/unported-files.ts` rather than faked: it feeds `"a\x92b"`, a String whose bytes are not
 * valid UTF-8, and relies on Ruby's regexp engine raising
 * `ArgumentError: invalid byte sequence` (transliterator.rb:96). A JS string is
 * a sequence of UTF-16 code units with no invalid-byte state to reach, so there
 * is no input that makes the ported `transliterate` raise, and inventing a
 * lone-surrogate guard would add a check the gem does not have.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "../exceptions.js";
import { config, resetConfig, setBackend, transliterate } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import type { TranslationData } from "../utils.js";
import { Simple } from "./simple.js";
import { HashTransliterator, get } from "./transliterator.js";

describe("I18nBackendTransliterator", () => {
  function storeTranslations(locale: string, data: TranslationData): void {
    config().backend.storeTranslations(locale, data);
  }

  let proc: (n: string) => string;
  let hash: Record<string, string>;
  let transliterator: ReturnType<typeof get>;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    setBackend(new Simple());
    config().enforceAvailableLocales = false;
    proc = (n: string) => n.toUpperCase();
    hash = { ü: "ue", ö: "oe", a: "a" };
    transliterator = get();
  });

  it("transliteration rule can be a proc", () => {
    storeTranslations("xx", { i18n: { transliterate: { rule: proc } } });
    expect(config().backend.transliterate("xx", "hello")).toBe("HELLO");
  });

  it("transliteration rule can be a hash", () => {
    storeTranslations("xx", { i18n: { transliterate: { rule: hash } } });
    expect(config().backend.transliterate("xx", "ü")).toBe("ue");
  });

  it("transliteration rule must be a proc or hash", () => {
    storeTranslations("xx", { i18n: { transliterate: { rule: "" } } });
    expect(() => config().backend.transliterate("xx", "ü")).toThrow(ArgumentError);
  });

  it("transliterator defaults to latin => ascii when no rule is given", () => {
    expect(config().backend.transliterate("xx", "Ærøskøbing")).toBe("AEroskobing");
  });

  it("default transliterator should not modify ascii characters", () => {
    for (let byte = 0; byte <= 127; byte++) {
      const char = String.fromCodePoint(byte);
      expect(transliterator.transliterate(char)).toBe(char);
    }
  });

  it("default transliterator correctly transliterates latin characters", () => {
    // create string with range of Unicode's western characters with
    // diacritics, excluding the division and multiplication signs which for
    // some reason or other are floating in the middle of all the letters.
    const codepoints: number[] = [];
    for (let c = 0xc0; c <= 0x17e; c++) {
      if (c === 0xd7 || c === 0xf7) continue;
      codepoints.push(c);
    }
    codepoints.push(0x1e9e);
    const string = String.fromCodePoint(...codepoints);
    for (const _char of string) {
      expect(transliterator.transliterate(string)).toMatch(/^[a-zA-Z']*$/);
    }
  });

  it("should replace non-ASCII chars not in map with a replacement char", () => {
    expect(transliterator.transliterate("abcſ")).toBe("abc?");
  });

  it("can replace non-ASCII chars not in map with a custom replacement string", () => {
    expect(transliterator.transliterate("abcſ", "#")).toBe("abc#");
  });

  it("I18n.transliterate should transliterate using a default transliterator", () => {
    expect(transliterate("áèö")).toBe("aeo");
  });

  it("I18n.transliterate should transliterate using a locale", () => {
    storeTranslations("xx", { i18n: { transliterate: { rule: hash } } });
    expect(transliterate("ü", { locale: "xx" })).toBe("ue");
  });

  it("default transliterator fails with custom rules with uncomposed input", () => {
    const char = String.fromCodePoint(117, 776); // "ü" as ASCII "u" plus COMBINING DIAERESIS
    const transliterator = get(hash);
    expect(transliterator.transliterate(char)).not.toBe("ue");
  });

  it("DEFAULT_APPROXIMATIONS is frozen to prevent concurrency issues", () => {
    expect(Object.isFrozen(HashTransliterator.DEFAULT_APPROXIMATIONS)).toBe(true);
  });
});
