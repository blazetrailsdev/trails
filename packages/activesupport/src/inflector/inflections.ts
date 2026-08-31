/**
 * Inflections — stores pluralization, singularization, and other rules.
 * Mirrors ActiveSupport::Inflector::Inflections from Rails.
 */

import { regexpEscape } from "@blazetrails/ruby-compat";
import { I18n } from "../i18n.js";
import { isEmpty } from "../ruby-empty.js";

export interface InflectionRule {
  rule: RegExp;
  replacement: string;
}

export interface HumanRule {
  rule: RegExp | string;
  replacement: string;
}

/**
 * Mirrors: ActiveSupport::Inflector::Inflections::Uncountables
 * (inflector/inflections.rb:35-63) — an Array of downcased words plus the
 * parallel `@regex_array` that `uncountable?` matches against. The downcasing
 * lives here, in `add`, exactly as it does in Ruby; call sites pass the word
 * through untouched.
 */
export class Uncountables extends Array<string> {
  private _regexArray: RegExp[] = [];

  delete(entry: string): void {
    // Ruby's Array#delete removes every equal element, not just the first.
    let index: number;
    while ((index = this.indexOf(entry)) !== -1) this.splice(index, 1);
    const regex = this.toRegex(entry);
    while ((index = this._regexArray.findIndex((r) => r.source === regex.source)) !== -1) {
      this._regexArray.splice(index, 1);
    }
  }

  add(words: (string | string[])[]): this {
    words = words.flat().map((word) => word.toLowerCase());
    this.push(...(words as string[]));
    this._regexArray.push(...(words as string[]).map((word) => this.toRegex(word)));
    return this;
  }

  isUncountable(str: string): boolean {
    return this._regexArray.some((regex) => regex.test(str));
  }

  // Ruby's `/\b…\Z/i` boundary is Unicode-aware, so it fires before a
  // non-ASCII word like "猫"; JS `\b` is ASCII-only.
  private toRegex(string: string): RegExp {
    return new RegExp(`(?<![\\p{L}\\p{N}_])${regexpEscape(string)}$`, "iu");
  }
}

export class Inflections {
  plurals!: InflectionRule[];
  singulars!: InflectionRule[];
  uncountables!: Uncountables;
  humans!: HumanRule[];
  acronyms!: Map<string, string>;
  acronymRegex!: RegExp;
  acronymsCamelizeRegex!: RegExp;
  acronymsUnderscoreRegex!: RegExp;

  private static instances: Map<string, Inflections> = new Map();

  static instance(locale: string = "en"): Inflections {
    if (!this.instances.has(locale)) {
      this.instances.set(locale, new Inflections());
    }
    return this.instances.get(locale)!;
  }

  /**
   * Mirrors: inflections.rb:70-75 — walks the locale's fallback chain and
   * returns the first instance already built for one of them, falling back to
   * building the requested locale's own.
   */
  static instanceOrFallback(locale: string): Inflections {
    for (const k of I18n.fallbacks().get(locale)) {
      if (this.instances.has(k)) return this.instances.get(k)!;
    }
    return this.instance(locale);
  }

  constructor() {
    this.plurals = [];
    this.singulars = [];
    this.uncountables = new Uncountables();
    this.humans = [];
    this.acronyms = new Map();
    this.defineAcronymRegexPatterns();
  }

  static clear(locale: string = "en"): void {
    this.instances.delete(locale);
  }

  /**
   * @missingRailsCall prepend — PERMANENT: Ruby Array#prepend is the alias of #unshift:
   *   `@plurals.prepend([rule, replacement])` (inflector/inflections.rb:154)
   *   ports to `this.plurals.unshift({ rule, replacement })`.
   */
  plural(rule: RegExp | string, replacement: string): void {
    if (typeof rule === "string") {
      this.uncountables.delete(rule);
      rule = new RegExp(rule, "i");
    }
    this.uncountables.delete(replacement);
    this.plurals.unshift({ rule, replacement });
  }

  /**
   * @missingRailsCall prepend — PERMANENT: Ruby Array#prepend is the alias of #unshift:
   *   `@singulars.prepend([rule, replacement])` (inflector/inflections.rb:165)
   *   ports to `this.singulars.unshift({ rule, replacement })`.
   */
  singular(rule: RegExp | string, replacement: string): void {
    if (typeof rule === "string") {
      this.uncountables.delete(rule);
      rule = new RegExp(rule, "i");
    }
    this.uncountables.delete(replacement);
    this.singulars.unshift({ rule, replacement });
  }

  irregular(singular: string, plural: string): void {
    this.uncountables.delete(singular);
    this.uncountables.delete(plural);

    const s0 = singular[0];
    const sRest = singular.slice(1);
    const p0 = plural[0];
    const pRest = plural.slice(1);

    if (s0.toUpperCase() === p0.toUpperCase()) {
      this.plural(new RegExp(`(${s0})${sRest}$`, "i"), `$1${pRest}`);
      this.plural(new RegExp(`(${p0})${pRest}$`, "i"), `$1${pRest}`);
      this.singular(new RegExp(`(${p0})${pRest}$`, "i"), `$1${sRest}`);
    } else {
      this.plural(new RegExp(`${s0.toUpperCase()}(?i:${sRest})$`), p0.toUpperCase() + pRest);
      this.plural(new RegExp(`${s0.toLowerCase()}(?i:${sRest})$`), p0.toLowerCase() + pRest);
      this.plural(new RegExp(`${p0.toUpperCase()}(?i:${pRest})$`), p0.toUpperCase() + pRest);
      this.plural(new RegExp(`${p0.toLowerCase()}(?i:${pRest})$`), p0.toLowerCase() + pRest);
      this.singular(new RegExp(`${p0.toUpperCase()}(?i:${pRest})$`), s0.toUpperCase() + sRest);
      this.singular(new RegExp(`${p0.toLowerCase()}(?i:${pRest})$`), s0.toLowerCase() + sRest);
    }
  }

  uncountable(...words: (string | string[])[]): void {
    this.uncountables.add(words);
  }

  acronym(word: string): void {
    this.acronyms.set(word.toLowerCase(), word);
    this.defineAcronymRegexPatterns();
  }

  private defineAcronymRegexPatterns(): void {
    if (isEmpty(this.acronyms)) {
      this.acronymRegex = /(?=a)b/;
      this.acronymsCamelizeRegex = /^\w/;
      this.acronymsUnderscoreRegex = /(?=a)b/;
    } else {
      const escaped = Array.from(this.acronyms.values())
        .sort((a, b) => b.length - a.length)
        .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const acronymValues = escaped.join("|");
      this.acronymRegex = new RegExp(acronymValues);
      this.acronymsCamelizeRegex = new RegExp(`^(?:${acronymValues}(?=\\b|[A-Z_])|\\w)`);
      this.acronymsUnderscoreRegex = new RegExp(
        `(?:(?<=([A-Za-z\\d]))|\\b)(${acronymValues})(?=\\b|[^a-z])`,
        "g",
      );
    }
  }

  /**
   * @missingRailsCall prepend — PERMANENT: Ruby Array#prepend is the alias of #unshift:
   *   `@humans.prepend([rule, replacement])` (inflector/inflections.rb:221)
   *   ports to `this.humans.unshift({ rule, replacement })`.
   */
  human(rule: RegExp | string, replacement: string): void {
    this.humans.unshift({ rule, replacement });
  }

  clear(
    scope: "all" | "plurals" | "singulars" | "uncountables" | "humans" | "acronyms" = "all",
  ): void {
    if (scope === "all") {
      this.plurals = [];
      this.singulars = [];
      this.uncountables = new Uncountables();
      this.humans = [];
      this.acronyms = new Map();
      this.defineAcronymRegexPatterns();
    } else if (scope === "plurals") {
      this.plurals = [];
    } else if (scope === "singulars") {
      this.singulars = [];
    } else if (scope === "uncountables") {
      this.uncountables = new Uncountables();
    } else if (scope === "humans") {
      this.humans = [];
    } else if (scope === "acronyms") {
      this.acronyms = new Map();
      this.defineAcronymRegexPatterns();
    }
  }
}

/**
 * Mirrors: ActiveSupport::Inflector#inflections (inflections.rb:265-271) —
 * yields the locale's singleton so rules can be added, or returns it.
 */
export function inflections(
  locale: string = "en",
  block?: (inflect: Inflections) => void,
): Inflections {
  if (block !== undefined) {
    const inflect = Inflections.instance(locale);
    block(inflect);
    return inflect;
  } else {
    return Inflections.instanceOrFallback(locale);
  }
}

/**
 * Load default English inflection rules (matching Rails exactly).
 */
export function loadDefaults(inflect: Inflections): void {
  inflect.plural(/$/, "s");
  inflect.plural(/s$/i, "s");
  inflect.plural(/^(ax|test)is$/i, "$1es");
  inflect.plural(/(octop|vir)us$/i, "$1i");
  inflect.plural(/(octop|vir)i$/i, "$1i");
  inflect.plural(/(alias|status)$/i, "$1es");
  inflect.plural(/(bu|mis|gas)s$/i, "$1ses");
  inflect.plural(/(buffal|tomat)o$/i, "$1oes");
  inflect.plural(/([ti])um$/i, "$1a");
  inflect.plural(/([ti])a$/i, "$1a");
  inflect.plural(/sis$/i, "ses");
  inflect.plural(/(?:([^f])fe|([lr])f)$/i, "$1$2ves");
  inflect.plural(/(hive)$/i, "$1s");
  inflect.plural(/([^aeiouy]|qu)y$/i, "$1ies");
  inflect.plural(/(x|ch|ss|sh)$/i, "$1es");
  inflect.plural(/(matr|vert|append)ix|ice$/i, "$1ices");
  inflect.plural(/^(m|l)ouse$/i, "$1ice");
  inflect.plural(/^(m|l)ice$/i, "$1ice");
  inflect.plural(/^(ox)$/i, "$1en");
  inflect.plural(/^(oxen)$/i, "$1");
  inflect.plural(/(quiz)$/i, "$1zes");

  inflect.singular(/s$/i, "");
  inflect.singular(/(ss)$/i, "$1");
  inflect.singular(/(n)ews$/i, "$1ews");
  inflect.singular(/([ti])a$/i, "$1um");
  inflect.singular(/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)(sis|ses)$/i, "$1sis");
  inflect.singular(/(^analy)(sis|ses)$/i, "$1sis");
  inflect.singular(/([^f])ves$/i, "$1fe");
  inflect.singular(/(hive)s$/i, "$1");
  inflect.singular(/(tive)s$/i, "$1");
  inflect.singular(/([lr])ves$/i, "$1f");
  inflect.singular(/([^aeiouy]|qu)ies$/i, "$1y");
  inflect.singular(/(s)eries$/i, "$1eries");
  inflect.singular(/(m)ovies$/i, "$1ovie");
  inflect.singular(/(x|ch|ss|sh)es$/i, "$1");
  inflect.singular(/^(m|l)ice$/i, "$1ouse");
  inflect.singular(/(bus)(es)?$/i, "$1");
  inflect.singular(/(o)es$/i, "$1");
  inflect.singular(/(shoe)s$/i, "$1");
  inflect.singular(/(cris|test)(is|es)$/i, "$1is");
  inflect.singular(/^(a)x[ie]s$/i, "$1xis");
  inflect.singular(/(octop|vir)(us|i)$/i, "$1us");
  inflect.singular(/(alias|status)(es)?$/i, "$1");
  inflect.singular(/^(ox)en/i, "$1");
  inflect.singular(/(vert|ind)ices$/i, "$1ex");
  inflect.singular(/(matr)ices$/i, "$1ix");
  inflect.singular(/(quiz)zes$/i, "$1");
  inflect.singular(/(database)s$/i, "$1");

  inflect.irregular("person", "people");
  inflect.irregular("man", "men");
  inflect.irregular("child", "children");
  inflect.irregular("sex", "sexes");
  inflect.irregular("move", "moves");
  inflect.irregular("zombie", "zombies");

  inflect.uncountable(
    "equipment",
    "information",
    "rice",
    "money",
    "species",
    "series",
    "fish",
    "sheep",
    "jeans",
    "police",
  );
}

// Initialize default English inflections
const defaultInflections = Inflections.instance("en");
loadDefaults(defaultInflections);

export { Inflections as Inflector };
