import { defaultSeparator, newDoubleNestedCache, toSym } from "../i18n.js";
import type { TranslationData } from "../utils.js";

export const SEPARATOR_ESCAPE_CHAR = "\u0001";
export const FLATTEN_SEPARATOR = ".";

/** @internal */
export interface FlattenHost {
  links(): Map<string, Map<string, string>>;
  flattenKeys(
    hash: TranslationData,
    escape: boolean,
    prevKey?: string | null,
    block?: (currKey: string, value: unknown) => void,
  ): void;
  /** @internal */
  storeLink(locale: string, key: string, link: unknown): string;
  /** @internal */
  resolveLink(locale: string, key: string): string;
  /** @internal */
  findLink(locale: string, key: string): [string, string] | null;
  escapeDefaultSeparator(key: unknown): string;
}

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @noRailsEquivalent PERMANENT */
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

function toS(value: unknown): string {
  if (value == null) return "";
  const string = String(value);
  return string.startsWith(":") ? string.slice(1) : string;
}

export class Flatten {
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

  static escapeDefaultSeparator(key: unknown): string {
    return tr(String(key), FLATTEN_SEPARATOR, SEPARATOR_ESCAPE_CHAR);
  }
}

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

export function links(this: FlattenHost): Map<string, Map<string, string>> {
  const host = this as FlattenHost & { linksCache?: Map<string, Map<string, string>> };
  return (host.linksCache ??= newDoubleNestedCache<string, string>());
}

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
    const currKey = toSym([prevKey, key].filter((k) => k != null).join(FLATTEN_SEPARATOR)).slice(1);
    block!(currKey, value);
    if (isHash(value)) this.flattenKeys(value, escape, currKey, block);
  }
}

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

/** @internal */
export function storeLink(this: FlattenHost, locale: string, key: string, link: unknown): string {
  locale = toSym(locale).slice(1);
  const byLocale = this.links().get(locale) ?? new Map<string, string>();
  this.links().set(locale, byLocale);
  const value = toS(link);
  byLocale.set(String(key), value);
  return value;
}

/** @internal */
export function resolveLink(this: FlattenHost, locale: string, key: string): string {
  [key, locale] = [String(key), toSym(locale).slice(1)];
  const localeLinks = this.links().get(locale) ?? new Map<string, string>();
  this.links().set(locale, localeLinks);

  const stored = localeLinks.get(key);
  if (stored !== undefined) return stored;

  const link = this.findLink(locale, key);
  if (link) {
    return this.storeLink(locale, key, key.replaceAll(link[0], link[1]));
  }
  return key;
}

/** @internal */
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
