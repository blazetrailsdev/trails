/** Mirrors: i18n/lib/i18n.rb */

/**
 * Ruby's `send(handler, ...)` in `handle_exception` dispatches on the `I18n`
 * module itself; this self-import is that receiver. A Symbol handler therefore
 * names an export of this module, which is what `I18n.custom_exception_handler`
 * is in the gem (i18n.rb:415-416).
 *
 * A Ruby module is open and a module namespace object is not: ECMA-262 makes it
 * a non-extensible exotic object, so a handler method installed after load —
 * Ruby's `module I18n; def self.custom_exception_handler` reopening, or mocha's
 * `I18n.expects` — has no representable form outside a test transform. Every
 * handler that names a real export dispatches exactly as the gem's does.
 */
import * as I18n from "./i18n.js";
import type { ExceptionHandlerLike } from "./config.js";
import type { Base } from "./backend/base.js";
import { Config } from "./config.js";
import { ArgumentError, Disabled, InvalidLocale, MissingTranslation } from "./exceptions.js";
import type { TranslateOptions } from "./backend/base.js";
import { reloadTranslationFiles } from "./backend/base.js";
import { throwException, catchException } from "./throw-catch.js";

/** Ruby models locales as Symbols; the JS analogue is a plain string. */
export type Locale = string;
/** A translation key: a dotted string, or a normalized key segment. */
export type TranslationKey = string | number | boolean;

export const EMPTY_HASH: Readonly<Record<string, never>> = Object.freeze({});

/**
 * The gem spells these as snake_case Symbols because they double as option
 * keys; trails option keys are camelCase, so these follow suit.
 * `reservedKeysPattern` still recognizes the snake_case spellings, since those
 * are what appears inside translation data written for Ruby.
 */
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

/**
 * Mirrors: I18n.new_double_nested_cache (i18n.rb:38-40). Ruby uses
 * `Concurrent::Map`; the JS analogue is a plain `Map` of `Map`s, since the
 * process-wide config singleton already stands in for `Thread.current`. Ruby's
 * default block (`{ |h, k| h[k] = Concurrent::Map.new }`) has no `Map`
 * equivalent, so the outer read installs the inner map at the call site.
 */
export function newDoubleNestedCache<K = unknown, V = TranslationKey[]>(): Map<string, Map<K, V>> {
  return new Map();
}

function underscore(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

let reservedKeysPatternCache: RegExp | undefined;

/**
 * Mirrors: I18n.reserve_key. Reserved keys are used internally and can't also
 * be used for interpolation.
 */
export function reserveKey(key: string): void {
  RESERVED_KEYS.push(key);
  reservedKeysPatternCache = undefined;
}

/** Mirrors: I18n.reserved_keys_pattern */
export function reservedKeysPattern(): RegExp {
  if (!reservedKeysPatternCache) {
    const spellings = new Set(RESERVED_KEYS.flatMap((key) => [key, underscore(key)]));
    reservedKeysPatternCache = new RegExp(`(?<!%)%\\{(${[...spellings].join("|")})\\}`);
  }
  return reservedKeysPatternCache;
}

let currentConfig: Config | undefined;

/**
 * Mirrors: I18n::Base#config. Ruby scopes the config to `Thread.current`; JS
 * has no threads, so the singleton below is the whole-process equivalent.
 */
export function config(): Config {
  currentConfig ??= new Config();
  return currentConfig;
}

/** Sets I18n configuration object. */
export function setConfig(value: Config): void {
  currentConfig = value;
}

/** @internal Test seam — drops the process-wide config so a case starts clean. */
export function resetConfig(): void {
  currentConfig = undefined;
  normalizedKeyCache.clear();
}

/**
 * Write methods which delegate to the configuration object. Ruby generates a
 * reader and a `name=` writer for each; a module-level binding can't carry a
 * setter, so the writers take the sanctioned `set*` spelling.
 */
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

export function loadPath(): string[] {
  return config().loadPath;
}

export function setLoadPath(value: string[]): void {
  config().loadPath = value;
}

export function enforceAvailableLocales(): boolean {
  return config().enforceAvailableLocales;
}

export function setEnforceAvailableLocales(value: boolean): void {
  config().enforceAvailableLocales = value;
}

/**
 * Tells the backend to reload translations. Used in situations like the
 * Rails development environment. Backends can implement whatever strategy
 * is useful.
 *
 * The gem's `reload!` is synchronous because `Simple#reload!` only clears
 * `@initialized` / `@translations` (simple.rb:57-62) and the re-read of
 * `I18n.load_path` happens later, inside the next lazy `init_translations`
 * (simple.rb:83-86). Here that read is a Promise, so it is pulled forward to
 * this one seam and awaited: `reload!` is the only method that becomes async,
 * and every ported body below it — including the four lazy call sites — stays
 * verbatim and synchronous.
 *
 * It precedes `backend.reload!` because that is not always lazy: `Base#reload!`
 * re-runs `eager_load!` on an eager-loaded backend (base.rb:101), which reaches
 * `init_translations` / `load_translations` during the reload itself
 * (simple.rb:83, base.rb:14).
 */
export async function reloadBang(): Promise<void> {
  config().clearAvailableLocalesSet();
  await reloadTranslationFiles();
  config().backend.reloadBang();
}

/**
 * Tells the backend to load translations now. Used in situations like the
 * Rails production environment. Backends can implement whatever strategy
 * is useful.
 */
export function eagerLoadBang(): void {
  config().backend.eagerLoadBang();
}

/**
 * A key accepted by `translate`. Ruby accepts a Symbol or a String and treats
 * them the same — `normalize_keys` sends both through `to_sym` — so the JS
 * spelling of both is the plain string.
 */
export type TranslateKey = TranslationKey | null;

/**
 * Translates, pluralizes and interpolates a given key using a given locale,
 * scope, and default, as well as interpolation values.
 *
 * Ruby takes `throw:`, `raise:` and `locale:` as keyword arguments alongside
 * `**options`; the destructured rest below is that split. `throw` can't be a
 * binding name in JS, so the local reads `throwOption`.
 */
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

/**
 * Wrapper for `translate` that adds `raise: true`. With this option, if no
 * translation is found, it will raise `I18n::MissingTranslationData`.
 */
export function translateBang(
  key: TranslateKey | TranslateKey[],
  options: TranslateOptions = EMPTY_HASH,
): unknown {
  return translate(key, { ...options, raise: true });
}

export const tBang = translateBang;

/** Returns an array of interpolation keys for the given translation key. */
export function interpolationKeys(key: unknown, options: TranslateOptions = EMPTY_HASH): string[] {
  if (typeof key !== "string" || key.length === 0) throw new ArgumentError();

  if (!exists(key, null, slice(options, "locale", "scope"))) return [];

  const translation = translate(key, slice(options, "locale", "scope"));
  return interpolationKeysFromTranslation(translation)
    .flat(Infinity as 1)
    .filter((value): value is string => value != null);
}

/** Returns true if a translation exists for a given key, otherwise returns false. */
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

/**
 * Transliterates UTF-8 characters to ASCII.
 *
 * Ruby takes `throw:`, `raise:`, `locale:` and `replacement:` as keyword
 * arguments alongside `**options`; the destructured rest below is that split.
 * `throw` can't be a binding name in JS, so the local reads `throwOption`.
 */
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

/**
 * Localizes certain objects, such as dates and numbers to local formatting.
 */
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

/** Executes block with given I18n.locale set. */
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

function normalizeKey(key: unknown, separator: string): TranslationKey[] {
  let bySeparator = normalizedKeyCache.get(separator);
  if (bySeparator === undefined) {
    bySeparator = new Map();
    normalizedKeyCache.set(separator, bySeparator);
  }
  const cacheKey = key;
  let normalized = bySeparator.get(cacheKey);
  if (normalized === undefined) {
    if (Array.isArray(key)) {
      normalized = key.flatMap((k) => normalizeKey(k, separator));
    } else if (key === null || key === undefined) {
      normalized = [];
    } else {
      const keys = String(key)
        .split(separator)
        .filter((k) => k !== "");
      normalized = keys.map((k) => {
        if (/^[-+]?([1-9]\d*|0)$/.test(k)) return Number(k);
        if (k === "true") return true;
        if (k === "false") return false;
        return k;
      });
    }
    bySeparator.set(cacheKey, normalized);
  }
  return normalized;
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

/**
 * Mirrors: I18n.locale_available?. Returns true when the passed locale is in
 * the list of available locales.
 */
export function localeAvailable(locale: Locale | null | undefined): boolean {
  return config().availableLocalesSet.has(locale as Locale);
}

/** Mirrors: I18n.enforce_available_locales! */
export function enforceAvailableLocalesBang(locale: Locale | false | null | undefined): void {
  if (locale !== false && config().enforceAvailableLocales) {
    if (!localeAvailable(locale)) throw new InvalidLocale(locale);
  }
}

/** Mirrors: I18n.available_locales_initialized? */
export function availableLocalesInitialized(): boolean {
  return config().availableLocalesInitialized;
}

/** Ruby truthiness: everything but `nil` and `false`. */
function truthy(value: unknown): boolean {
  return value != null && value !== false;
}

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

/**
 * Any exceptions thrown in translate will be sent to the exception_handler
 * which can be a Symbol, a Proc or any other Object unless they're forced to
 * be raised or thrown (MissingTranslation).
 *
 * If exception_handler is a Symbol then it will simply be sent to I18n as
 * a method call. A Proc will simply be called. In any other case the
 * method #call will be called on the exception_handler object.
 *
 * Examples:
 *
 *   I18n.setExceptionHandler(":customExceptionHandler")
 *   I18n.customExceptionHandler(exception, locale, key, options)  // will be called like this
 *
 *   I18n.setExceptionHandler((...args) => { ... })                // a lambda
 *   I18n.exceptionHandler()(exception, locale, key, options)      // will be called like this
 *
 *   I18n.setExceptionHandler(new I18nExceptionHandler())          // an object
 *   I18n.exceptionHandler().call(exception, locale, key, options) // will be called like this
 */
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

/** Ruby's `Hash#slice`. */
function slice(hash: TranslateOptions, ...keys: string[]): TranslateOptions {
  const result: TranslateOptions = {};
  for (const key of keys) {
    if (key in hash) result[key] = hash[key];
  }
  return result;
}

/**
 * The `RegExp` below is Ruby's `Regexp.union(I18n.config.interpolation_patterns)`,
 * and `matchAll` its `String#scan`, which on a pattern carrying groups yields
 * one array of captures per match.
 */
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
