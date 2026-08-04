/**
 * Mirrors: i18n/lib/i18n/backend/flatten.rb
 *
 * Ruby mixes `Flatten` into a backend with `include`; the trails idiom for that
 * is `this`-typed functions assigned to the class (see CLAUDE.md), so the
 * instance methods live here as top-level functions and `KeyValue` assigns
 * them. The two `def self.` methods of the module stay on the `Flatten` class
 * itself, which is where Ruby reaches them (`I18n::Backend::Flatten.
 * normalize_flat_keys`, flatten.rb:44).
 *
 * A flattened key is a Ruby Symbol; a Ruby Symbol is a JS string, and these are
 * hash keys rather than values, so they carry no leading colon — exactly as the
 * rest of the package spells `translations` keys.
 */

import { defaultSeparator, newDoubleNestedCache } from "../i18n.js";
import type { TranslationData } from "../utils.js";

export const SEPARATOR_ESCAPE_CHAR = "\u0001";
export const FLATTEN_SEPARATOR = ".";

/** @internal The shape `Flatten`'s instance methods need of their host. */
export interface FlattenHost {
  links(): Map<string, Map<string, string>>;
  flattenKeys(
    hash: TranslationData,
    escape: boolean,
    prevKey?: string | null,
    block?: (currKey: string, value: unknown) => void,
  ): void;
  storeLink(locale: string, key: string, link: unknown): void;
  resolveLink(locale: string, key: string): string;
  findLink(locale: string, key: string): [string, string] | null;
  escapeDefaultSeparator(key: unknown): string;
}

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ruby's `String#tr`, character for character. A shorter `toStr` pads with its
 * last character, as Ruby does; the character classes (ranges, `^` negation)
 * that no call site in the package uses are not spelled out here.
 *
 * @noRailsEquivalent PERMANENT — `String#tr` is Ruby core, which JS has no
 * counterpart of; it lives here because `Flatten` is the first caller.
 */
export function tr(subject: string, fromStr: string, toStr: string): string {
  const from = [...fromStr];
  const to = [...toStr];
  return [...subject]
    .map((char) => {
      const index = from.indexOf(char);
      if (index === -1) return char;
      return to[index] ?? to[to.length - 1] ?? "";
    })
    .join("");
}

/** Ruby `Symbol#to_s` / `Object#to_s` for the values a link can hold. */
function toS(value: unknown): string {
  if (value == null) return "";
  const string = String(value);
  return string.startsWith(":") ? string.slice(1) : string;
}

export class Flatten {
  /**
   * normalize_keys the flatten way. This method is significantly faster
   * and creates way less objects than the one at I18n.normalize_keys.
   * It also handles escaping the translation keys.
   *
   * Ruby's `separator ||= I18n.default_separator` defaults on `false` as well
   * as `nil`, which is why the guard below is not a `??=`.
   */
  static normalizeFlatKeys(
    _locale: string,
    key: unknown,
    scope: unknown,
    separator: string | false | null | undefined,
  ): string {
    let keys: unknown[] = [scope, key];
    keys = keys.flat(Infinity);
    keys = keys.filter((k) => k != null);

    if (separator == null || separator === false) separator = defaultSeparator();

    if (separator !== FLATTEN_SEPARATOR) {
      const fromStr = `${FLATTEN_SEPARATOR}${separator}`;
      const toStr = `${SEPARATOR_ESCAPE_CHAR}${FLATTEN_SEPARATOR}`;

      keys = keys.map((k) => tr(String(k), fromStr, toStr));
    }

    return keys.join(".");
  }

  /** Receives a string and escape the default separator. */
  static escapeDefaultSeparator(key: unknown): string {
    return tr(String(key), FLATTEN_SEPARATOR, SEPARATOR_ESCAPE_CHAR);
  }
}

/**
 * Shortcut to I18n::Backend::Flatten.normalizeFlatKeys
 * and then resolveLink.
 */
export function normalizeFlatKeys(
  this: FlattenHost,
  locale: string,
  key: unknown,
  scope: unknown,
  separator: string | false | null | undefined,
): string {
  const flatKey = Flatten.normalizeFlatKeys(locale, key, scope, separator);
  return this.resolveLink(locale, flatKey);
}

/**
 * Store flattened links. Ruby memoizes into an `@links` ivar; TypeScript has
 * no ivars, so the slot is a field on the host rather than a member of the
 * `Flatten` contract above.
 */
export function links(this: FlattenHost): Map<string, Map<string, string>> {
  const host = this as FlattenHost & { linksCache?: Map<string, Map<string, string>> };
  return (host.linksCache ??= newDoubleNestedCache<string, string>());
}

/**
 * Flatten keys for nested Hashes by chaining up keys:
 *
 *     flattenKeys({ a: { b: { c: "d", e: "f" }, g: "h" }, i: "j" })
 *     //=> "a.b.c" => "d", "a.b.e" => "f", "a.g" => "h", "i" => "j"
 */
export function flattenKeys(
  this: FlattenHost,
  hash: TranslationData,
  escape: boolean,
  prevKey: string | null = null,
  block?: (currKey: string, value: unknown) => void,
): void {
  for (const [initialKey, value] of Object.entries(hash)) {
    let key = initialKey;
    if (escape) key = this.escapeDefaultSeparator(key);
    const currKey = [prevKey, key].filter((k) => k != null).join(FLATTEN_SEPARATOR);
    block!(currKey, value);
    if (isHash(value)) this.flattenKeys(value, escape, currKey, block);
  }
}

/**
 * Receives a hash of translations (where the key is a locale and
 * the value is another hash) and return a hash with all
 * translations flattened.
 *
 * Nested hashes are included in the flattened hash just if subtree
 * is true and Symbols are automatically stored as links.
 */
export function flattenTranslations(
  this: FlattenHost,
  locale: string,
  data: TranslationData,
  escape: boolean,
  subtree: boolean,
): TranslationData {
  const hash: TranslationData = {};
  this.flattenKeys(data, escape, null, (key, value) => {
    if (isHash(value)) {
      if (subtree) hash[key] = value;
    } else {
      if (typeof value === "string" && value.startsWith(":")) this.storeLink(locale, key, value);
      hash[key] = value;
    }
  });
  return hash;
}

export function storeLink(this: FlattenHost, locale: string, key: string, link: unknown): void {
  const byLocale = this.links().get(locale) ?? new Map<string, string>();
  this.links().set(locale, byLocale);
  byLocale.set(String(key), toS(link));
}

export function resolveLink(this: FlattenHost, locale: string, key: string): string {
  const localeLinks = this.links().get(locale) ?? new Map<string, string>();
  this.links().set(locale, localeLinks);

  const stored = localeLinks.get(key);
  if (stored !== undefined) return stored;

  const link = this.findLink(locale, key);
  if (link) {
    const resolved = key.replaceAll(link[0], link[1]);
    this.storeLink(locale, key, resolved);
    return resolved;
  }
  return key;
}

export function findLink(this: FlattenHost, locale: string, key: string): [string, string] | null {
  const localeLinks = this.links().get(locale) ?? new Map<string, string>();
  this.links().set(locale, localeLinks);
  for (const [from, to] of localeLinks) {
    if (key.slice(0, from.length) === from) return [from, to];
  }
  return null;
}

export function escapeDefaultSeparator(this: FlattenHost, key: unknown): string {
  return Flatten.escapeDefaultSeparator(key);
}
