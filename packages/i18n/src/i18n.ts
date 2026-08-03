/**
 * Mirrors: i18n/lib/i18n.rb — partially. Only the members `config.ts` and
 * `exceptions.ts` reach for are ported here; the translate/interpolate surface
 * lands with its own story (RFC 0074).
 */

import { Config } from "./config.js";
import { InvalidLocale } from "./exceptions.js";

/** Ruby models locales as Symbols; the JS analogue is a plain string. */
export type Locale = string;
/** A translation key: a dotted string, or a normalized key segment. */
export type TranslationKey = string | number | boolean;

export const EMPTY_HASH: Readonly<Record<string, never>> = Object.freeze({});

let currentConfig: Config | undefined;

/**
 * Mirrors: I18n::Base#config. Ruby scopes the config to `Thread.current`; JS
 * has no threads, so the singleton below is the whole-process equivalent.
 */
export function config(): Config {
  currentConfig ??= new Config();
  return currentConfig;
}

/** @internal Test seam — drops the process-wide config so a case starts clean. */
export function resetConfig(): void {
  currentConfig = undefined;
}

function normalizeKey(key: unknown, separator: string): TranslationKey[] {
  if (Array.isArray(key)) return key.flatMap((k) => normalizeKey(k, separator));
  if (key === null || key === undefined) return [];
  const keys = String(key)
    .split(separator)
    .filter((k) => k !== "");
  return keys.map((k) => {
    if (/^[-+]?([1-9]\d*|0)$/.test(k)) return Number(k);
    if (k === "true") return true;
    if (k === "false") return false;
    return k;
  });
}

export function normalizeKeys(
  locale: Locale | null | undefined,
  key: unknown,
  scope: unknown,
  separator?: string,
): TranslationKey[] {
  const sep = separator ?? config().defaultSeparator;
  return [...normalizeKey(locale, sep), ...normalizeKey(scope, sep), ...normalizeKey(key, sep)];
}

/**
 * Mirrors: I18n.locale_available?. Returns true when the passed locale is in
 * the list of available locales.
 */
export function localeAvailable(locale: Locale): boolean {
  return config().availableLocalesSet.has(locale);
}

/** Mirrors: I18n.enforce_available_locales! */
export function enforceAvailableLocales(locale: Locale | false | null | undefined): void {
  if (locale !== false && config().enforceAvailableLocales) {
    if (locale === null || locale === undefined || !localeAvailable(locale)) {
      throw new InvalidLocale(locale);
    }
  }
}

/** Mirrors: I18n.available_locales_initialized? */
export function availableLocalesInitialized(): boolean {
  return config().availableLocalesInitialized;
}
