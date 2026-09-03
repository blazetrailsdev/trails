import * as I18n from "./i18n.js";
import type { ExceptionHandlerLike } from "./config.js";
import type { Base } from "./backend/base.js";
import { Config } from "./config.js";
import { ArgumentError, Disabled, InvalidLocale, MissingTranslation } from "./exceptions.js";
import type { TranslateOptions } from "./backend/base.js";
import { throwException, catchException } from "./throw-catch.js";

export type Locale = string;
export type TranslationKey = string | number | boolean;

export const EMPTY_HASH: Readonly<Record<string, never>> = Object.freeze({});

export const RESERVED_KEYS: string[] = [
  "cascade",
  "deepInterpolation",
  "skipInterpolation",
  "default",
  "exceptionHandler",
  "fallback",
  "fallbackInProgress",
  "fallbackOriginalLocale",
  "format",
  "object",
  "raise",
  "resolve",
  "scope",
  "separator",
  "throw",
];

export function newDoubleNestedCache<K = unknown, V = TranslationKey[]>(): Map<string, Map<K, V>> {
  return new Map();
}

function underscore(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

let reservedKeysPatternCache: RegExp | undefined;

export function reserveKey(key: string): void {
  RESERVED_KEYS.push(key);
  reservedKeysPatternCache = undefined;
}

export function reservedKeysPattern(): RegExp {
  if (!reservedKeysPatternCache) {
    const spellings = new Set(RESERVED_KEYS.flatMap((key) => [key, underscore(key)]));
    reservedKeysPatternCache = new RegExp(`(?<!%)%\\{(${[...spellings].join("|")})\\}`);
  }
  return reservedKeysPatternCache;
}

let currentConfig: Config | undefined;

export function config(): Config {
  currentConfig ??= new Config();
  return currentConfig;
}

export function setConfig(value: Config): void {
  currentConfig = value;
}

/**
 * Test seam — drops the process-wide config so a case starts clean.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE — Ruby's suite resets by assigning a fresh
 * `I18n.config`; this also clears the trails-only normalized-key cache, so it
 * folds into `setConfig` once that cache hangs off the Config instance.
 */
export function resetConfig(): void {
  currentConfig = undefined;
  normalizedKeyCache.clear();
}

export function locale(): Locale | false {
  return config().locale;
}

export function setLocale(value: Locale | false): void {
  config().locale = value;
}

export function backend(): Base {
  return config().backend;
}

export function setBackend(value: Base): void {
  config().backend = value;
}

export function defaultLocale(): Locale {
  return config().defaultLocale;
}

export function setDefaultLocale(value: Locale): void {
  config().defaultLocale = value;
}

export function availableLocales(): Locale[] {
  return config().availableLocales;
}

export function setAvailableLocales(value: Locale | Locale[] | null | undefined): void {
  config().availableLocales = value;
}

export function defaultSeparator(): string {
  return config().defaultSeparator;
}

export function setDefaultSeparator(value: string): void {
  config().defaultSeparator = value;
}

export function exceptionHandler(): ExceptionHandlerLike {
  return config().exceptionHandler;
}

export function setExceptionHandler(value: ExceptionHandlerLike): void {
  config().exceptionHandler = value;
}

export function loadPath(): (string | string[])[] {
  return config().loadPath;
}

export async function setLoadPath(value: (string | string[])[]): Promise<void> {
  await config().setLoadPath(value);
}

export function enforceAvailableLocales(): boolean {
  return config().enforceAvailableLocales;
}

export function setEnforceAvailableLocales(value: boolean): void {
  config().enforceAvailableLocales = value;
}

export async function reloadBang(): Promise<void> {
  config().clearAvailableLocalesSet();
  await config().backend.reloadBang();
}

export async function eagerLoadBang(): Promise<void> {
  await config().backend.eagerLoadBang();
}

export type TranslateKey = TranslationKey | null;

export function translate(
  key: TranslateKey | TranslateKey[] = null,
  {
    throw: throwOption = false,
    raise = false,
    locale = null,
    ...options
  }: TranslateOptions = EMPTY_HASH,
): unknown {
  if (locale == null || locale === false) locale = config().locale;
  if (locale === false) throw new Disabled("t");
  enforceAvailableLocalesBang(locale as Locale);

  const backend = config().backend;

  if (Array.isArray(key)) {
    return key.map((k) => translateKey(k, throwOption, raise, locale as Locale, backend, options));
  } else {
    return translateKey(key, throwOption, raise, locale as Locale, backend, options);
  }
}

export const t = translate;

export function translateBang(
  key: TranslateKey | TranslateKey[],
  options: TranslateOptions = EMPTY_HASH,
): unknown {
  return translate(key, { ...options, raise: true });
}

export const tBang = translateBang;

export function interpolationKeys(key: unknown, options: TranslateOptions = EMPTY_HASH): string[] {
  if (typeof key !== "string" || key.length === 0) throw new ArgumentError();

  if (!exists(key, null, slice(options, "locale", "scope"))) return [];

  const translation = translate(key, slice(options, "locale", "scope"));
  return interpolationKeysFromTranslation(translation)
    .flat(Infinity as 1)
    .filter((value): value is string => value != null);
}

export function exists(
  key: unknown,
  _locale: Locale | false | null = null,
  { locale = _locale, ...options }: TranslateOptions = EMPTY_HASH,
): boolean {
  if (locale == null || locale === false) locale = config().locale;
  if (locale === false) throw new Disabled("exists?");
  if ((typeof key === "string" && key.length === 0) || key == null) throw new ArgumentError();

  return config().backend.exists(locale as Locale, key as TranslationKey, options);
}

export function transliterate(
  key: string,
  {
    throw: throwOption = false,
    raise = false,
    locale = null,
    replacement = null,
    ...options
  }: TranslateOptions = EMPTY_HASH,
): unknown {
  try {
    if (locale == null || locale === false) locale = config().locale;
    if (locale === false) throw new Disabled("transliterate");
    enforceAvailableLocalesBang(locale as Locale);

    return config().backend.transliterate(locale as Locale, key, replacement as string | null);
  } catch (exception) {
    if (!(exception instanceof ArgumentError)) throw exception;
    return handleException(
      truthy(throwOption) ? "throw" : truthy(raise) ? "raise" : false,
      exception,
      locale as Locale,
      key,
      options,
    );
  }
}

export function localize(
  object: unknown,
  { locale = null, format = null, ...options }: TranslateOptions = EMPTY_HASH,
): unknown {
  if (locale == null || locale === false) locale = config().locale;
  if (locale === false) throw new Disabled("l");
  enforceAvailableLocalesBang(locale as Locale);

  if (!truthy(format)) format = ":default";
  return config().backend.localize(locale as Locale, object, format, options);
}

export const l = localize;

export function withLocale<T>(tmpLocale: Locale | false | null | undefined, block: () => T): T {
  if (tmpLocale == null) {
    return block();
  } else {
    const currentLocale = locale();
    setLocale(tmpLocale);
    try {
      return block();
    } finally {
      setLocale(currentLocale);
    }
  }
}

const normalizedKeyCache = newDoubleNestedCache();

/** @internal */
function normalizeKey(key: unknown, separator: string): TranslationKey[] {
  let bySeparator = normalizedKeyCache.get(separator);
  if (bySeparator === undefined) {
    bySeparator = new Map();
    normalizedKeyCache.set(separator, bySeparator);
  }
  let normalized = bySeparator.get(key);
  if (normalized === undefined) {
    if (Array.isArray(key)) {
      normalized = key.flatMap((k) => normalizeKey(k, separator));
    } else if (key === null || key === undefined) {
      normalized = [];
    } else {
      const keys = (typeof key === "string" && key.startsWith(":") ? key.slice(1) : String(key))
        .split(separator)
        .filter((k) => k !== "");
      normalized = keys.map((k) => {
        if (/^[-+]?([1-9]\d*|0)$/.test(k)) return Number(k);
        if (k === "true") return true;
        if (k === "false") return false;
        return k;
      });
    }
    bySeparator.set(key, normalized);
  }
  return normalized;
}

/** @noRailsEquivalent PERMANENT */
export function toSym(value: unknown): string {
  return typeof value === "string" && value.startsWith(":") ? value : `:${String(value)}`;
}

export function normalizeKeys(
  locale: Locale | null | undefined,
  key: unknown,
  scope: unknown,
  separator?: string | false | null,
): TranslationKey[] {
  if (separator == null || separator === false) separator = defaultSeparator();
  return [
    ...normalizeKey(locale, separator),
    ...normalizeKey(scope, separator),
    ...normalizeKey(key, separator),
  ];
}

export function localeAvailable(locale: Locale | null | undefined): boolean {
  return config().availableLocalesSet.has(locale as Locale);
}

export function enforceAvailableLocalesBang(locale: Locale | false | null | undefined): void {
  if (locale !== false && config().enforceAvailableLocales) {
    if (!localeAvailable(locale)) throw new InvalidLocale(locale);
  }
}

export function availableLocalesInitialized(): boolean {
  return config().availableLocalesInitialized;
}

function truthy(value: unknown): boolean {
  return value != null && value !== false;
}

/** @internal */
function translateKey(
  key: TranslateKey,
  throwOption: unknown,
  raise: unknown,
  locale: Locale,
  backend: Base,
  options: TranslateOptions,
): unknown {
  const result = catchException(() => backend.translate(locale, key, options));

  if (result instanceof MissingTranslation) {
    return handleException(
      truthy(throwOption) ? "throw" : truthy(raise) ? "raise" : false,
      result,
      locale,
      key,
      options,
    );
  } else {
    return result;
  }
}

/** @internal */
function handleException(
  handling: "raise" | "throw" | false,
  exception: MissingTranslation | ArgumentError,
  locale: Locale,
  key: TranslateKey,
  options: TranslateOptions,
): unknown {
  switch (handling) {
    case "raise":
      throw exception instanceof MissingTranslation ? exception.toException() : exception;
    case "throw":
      return throwException(exception);
    default: {
      const handler = truthy(options.exceptionHandler)
        ? (options.exceptionHandler as ExceptionHandlerLike)
        : config().exceptionHandler;
      if (typeof handler === "string" && handler.startsWith(":")) {
        return (I18n as unknown as Record<string, (...args: unknown[]) => unknown>)[
          handler.slice(1)
        ](exception, locale, key as TranslationKey, options);
      }
      const callable = handler as Exclude<ExceptionHandlerLike, string>;
      return typeof callable === "function"
        ? callable(exception, locale, key as TranslationKey, options)
        : callable.call(exception, locale, key as TranslationKey, options);
    }
  }
}

function slice(hash: TranslateOptions, ...keys: string[]): TranslateOptions {
  const result: TranslateOptions = {};
  for (const key of keys) {
    if (key in hash) result[key] = hash[key];
  }
  return result;
}

/** @internal */
function interpolationKeysFromTranslation(translation: unknown): unknown[] {
  if (typeof translation === "string") {
    const pattern = new RegExp(
      config()
        .interpolationPatterns.map((interpolationPattern) => `(?:${interpolationPattern.source})`)
        .join("|"),
      "g",
    );
    return [...translation.matchAll(pattern)].map((match) => match.slice(1));
  } else if (Array.isArray(translation)) {
    return translation.map((element) => interpolationKeysFromTranslation(element));
  } else {
    return [];
  }
}
