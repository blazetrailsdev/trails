/**
 * Mirrors: i18n/lib/i18n/backend/transliterator.rb
 *
 * Ruby mixes `Transliterator` into `Backend::Base` with `include`; the JS
 * equivalent is the `this`-typed `transliterate` below, assigned to `Base` so
 * the code stays in the file that matches the gem's layout.
 */

import { ArgumentError } from "../exceptions.js";
import { t, type Locale } from "../i18n.js";
import type { Base } from "./base.js";

export const DEFAULT_REPLACEMENT_CHAR = "?";

/**
 * Given a locale and a UTF-8 string, return the locale's ASCII
 * approximation for the string.
 */
export function transliterate(
  this: Base,
  locale: Locale,
  string: string,
  replacement: string | null = null,
): string {
  this.transliterators ??= {};
  this.transliterators[locale] ??= get(
    t("i18n.transliterate.rule", { locale, resolve: false, default: {} }),
  );
  return this.transliterators[locale].transliterate(string, replacement);
}

/** Get a transliterator instance. */
export function get(rule: unknown = null): HashTransliterator | ProcTransliterator {
  if (rule == null || rule === false || isHash(rule)) {
    return new HashTransliterator(rule as Record<string, unknown> | null);
  } else if (typeof rule === "function") {
    return new ProcTransliterator(rule as (string: string) => string);
  } else {
    throw new ArgumentError("Transliteration rule must be a proc or a hash.");
  }
}

function isHash(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A transliterator which accepts a Proc as its transliteration rule. */
export class ProcTransliterator {
  private rule: (string: string) => string;

  constructor(rule: (string: string) => string) {
    this.rule = rule;
  }

  /**
   * @missingRailsCall call — PERMANENT: Ruby invokes a Proc with `Proc#call`; the JS
   * analogue of a Proc is a function, which is invoked by application. There is
   * no `call` to make (JS `Function#call` takes a receiver and means something
   * else).
   */
  transliterate(string: string, _replacement: string | null = null): string {
    return this.rule(string);
  }
}

/**
 * A transliterator which accepts a Hash of characters as its translation
 * rule.
 */
export class HashTransliterator {
  static DEFAULT_APPROXIMATIONS: Readonly<Record<string, string>> = Object.freeze({
    À: "A",
    Á: "A",
    Â: "A",
    Ã: "A",
    Ä: "A",
    Å: "A",
    Æ: "AE",
    Ç: "C",
    È: "E",
    É: "E",
    Ê: "E",
    Ë: "E",
    Ì: "I",
    Í: "I",
    Î: "I",
    Ï: "I",
    Ð: "D",
    Ñ: "N",
    Ò: "O",
    Ó: "O",
    Ô: "O",
    Õ: "O",
    Ö: "O",
    "×": "x",
    Ø: "O",
    Ù: "U",
    Ú: "U",
    Û: "U",
    Ü: "U",
    Ý: "Y",
    Þ: "Th",
    ß: "ss",
    ẞ: "SS",
    à: "a",
    á: "a",
    â: "a",
    ã: "a",
    ä: "a",
    å: "a",
    æ: "ae",
    ç: "c",
    è: "e",
    é: "e",
    ê: "e",
    ë: "e",
    ì: "i",
    í: "i",
    î: "i",
    ï: "i",
    ð: "d",
    ñ: "n",
    ò: "o",
    ó: "o",
    ô: "o",
    õ: "o",
    ö: "o",
    ø: "o",
    ù: "u",
    ú: "u",
    û: "u",
    ü: "u",
    ý: "y",
    þ: "th",
    ÿ: "y",
    Ā: "A",
    ā: "a",
    Ă: "A",
    ă: "a",
    Ą: "A",
    ą: "a",
    Ć: "C",
    ć: "c",
    Ĉ: "C",
    ĉ: "c",
    Ċ: "C",
    ċ: "c",
    Č: "C",
    č: "c",
    Ď: "D",
    ď: "d",
    Đ: "D",
    đ: "d",
    Ē: "E",
    ē: "e",
    Ĕ: "E",
    ĕ: "e",
    Ė: "E",
    ė: "e",
    Ę: "E",
    ę: "e",
    Ě: "E",
    ě: "e",
    Ĝ: "G",
    ĝ: "g",
    Ğ: "G",
    ğ: "g",
    Ġ: "G",
    ġ: "g",
    Ģ: "G",
    ģ: "g",
    Ĥ: "H",
    ĥ: "h",
    Ħ: "H",
    ħ: "h",
    Ĩ: "I",
    ĩ: "i",
    Ī: "I",
    ī: "i",
    Ĭ: "I",
    ĭ: "i",
    Į: "I",
    į: "i",
    İ: "I",
    ı: "i",
    Ĳ: "IJ",
    ĳ: "ij",
    Ĵ: "J",
    ĵ: "j",
    Ķ: "K",
    ķ: "k",
    ĸ: "k",
    Ĺ: "L",
    ĺ: "l",
    Ļ: "L",
    ļ: "l",
    Ľ: "L",
    ľ: "l",
    Ŀ: "L",
    ŀ: "l",
    Ł: "L",
    ł: "l",
    Ń: "N",
    ń: "n",
    Ņ: "N",
    ņ: "n",
    Ň: "N",
    ň: "n",
    ŉ: "'n",
    Ŋ: "NG",
    ŋ: "ng",
    Ō: "O",
    ō: "o",
    Ŏ: "O",
    ŏ: "o",
    Ő: "O",
    ő: "o",
    Œ: "OE",
    œ: "oe",
    Ŕ: "R",
    ŕ: "r",
    Ŗ: "R",
    ŗ: "r",
    Ř: "R",
    ř: "r",
    Ś: "S",
    ś: "s",
    Ŝ: "S",
    ŝ: "s",
    Ş: "S",
    ş: "s",
    Š: "S",
    š: "s",
    Ţ: "T",
    ţ: "t",
    Ť: "T",
    ť: "t",
    Ŧ: "T",
    ŧ: "t",
    Ũ: "U",
    ũ: "u",
    Ū: "U",
    ū: "u",
    Ŭ: "U",
    ŭ: "u",
    Ů: "U",
    ů: "u",
    Ű: "U",
    ű: "u",
    Ų: "U",
    ų: "u",
    Ŵ: "W",
    ŵ: "w",
    Ŷ: "Y",
    ŷ: "y",
    Ÿ: "Y",
    Ź: "Z",
    ź: "z",
    Ż: "Z",
    ż: "z",
    Ž: "Z",
    ž: "z",
  });

  private rule: Record<string, unknown> | null;
  private approximationsMemo?: Record<string, string>;

  constructor(rule: Record<string, unknown> | null = null) {
    this.rule = rule;
    this.addDefaultApproximations();
    if (this.rule != null) this.add(this.rule);
  }

  transliterate(string: string, replacement: string | null = null): string {
    if (replacement == null) replacement = DEFAULT_REPLACEMENT_CHAR;
    return string.replace(
      // eslint-disable-next-line no-control-regex -- mirrors the gem's `/[^\x00-\x7f]/u`
      /[^\x00-\x7f]/gu,
      (char) => this.approximations()[char] ?? replacement,
    );
  }

  private approximations(): Record<string, string> {
    return (this.approximationsMemo ??= {});
  }

  private addDefaultApproximations(): void {
    for (const [key, value] of Object.entries(HashTransliterator.DEFAULT_APPROXIMATIONS)) {
      this.approximations()[key] = value;
    }
  }

  /** Add transliteration rules to the approximations hash. */
  private add(hash: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(hash)) {
      this.approximations()[String(key)] = String(value);
    }
  }
}
