/**
 * Mirrors: i18n/lib/i18n/config.rb
 */

import { enforceAvailableLocalesBang, type Locale, type TranslationKey } from "./i18n.js";
import { ExceptionHandler, MissingInterpolationArgument } from "./exceptions.js";
import { DEFAULT_INTERPOLATION_PATTERNS } from "./interpolate/ruby.js";

/** The slice of a backend `Config` hands out. */
export interface Backend {
  storeTranslations(locale: Locale, data: Record<string, unknown>, options?: unknown): unknown;
  availableLocales(): Locale[];
  reloadBang(): void;
  eagerLoadBang(): void;
  translate(locale: Locale, key: unknown, options?: Record<string, unknown>): unknown;
  exists(locale: Locale, key: TranslationKey, options?: Record<string, unknown>): boolean;
  localize(
    locale: Locale,
    object: unknown,
    format: unknown,
    options?: Record<string, unknown>,
  ): unknown;
}

/**
 * Ruby's handler is a Symbol naming a method on `I18n`, a Proc, or any object
 * responding to `#call`; a JS function carries `Function#call`, whose first
 * argument is a receiver, so the latter two arms stay distinct here and
 * `handle_exception` dispatches on all three. The Symbol arm is a string that
 * keeps its leading colon (`":customExceptionHandler"`), naming the member of
 * the `I18n` module `send` reaches.
 */
export type ExceptionHandlerLike =
  | string
  | ((exception: Error, locale: Locale, key: TranslationKey, options: unknown) => unknown)
  | { call(exception: Error, locale: Locale, key: TranslationKey, options: unknown): unknown };

export type MissingInterpolationArgumentHandler = (
  missingKey: string,
  providedHash: Record<string, unknown>,
  string: string,
) => unknown;

/**
 * Ruby's `@@`-scoped config lives on the class and is shared by every `Config`
 * instance (and subclass); these module-level bindings are the JS equivalent.
 * Only `locale` is per-instance, exactly as in the gem.
 */
let backend: Backend | undefined;
let defaultLocale: Locale | undefined;
let availableLocales: Locale[] | undefined;
let availableLocalesSet: Set<Locale> | undefined;
let defaultSeparator: string | undefined;
let exceptionHandler: ExceptionHandlerLike | undefined;
let missingInterpolationArgumentHandler: MissingInterpolationArgumentHandler | undefined;
let loadPath: string[] | undefined;
let enforceAvailableLocalesFlag = true;
let interpolationPatterns: RegExp[] | undefined;

let defaultBackendFactory: (() => Backend) | undefined;

/**
 * Ruby's `Config#backend` defaults to `Backend::Simple.new`, resolved through
 * `autoload`. `backend/simple.ts` is not ported yet, so it registers itself
 * here when it lands; until then `config.backend` raises rather than handing
 * back a half-built default.
 */
export function registerDefaultBackend(factory: () => Backend): void {
  defaultBackendFactory = factory;
}

export class Config {
  private localeValue?: Locale | false;

  /** Not global/thread-scoped like the rest; defaults to `defaultLocale`. */
  get locale(): Locale | false {
    return this.localeValue ?? this.defaultLocale;
  }

  set locale(locale: Locale | false) {
    enforceAvailableLocalesBang(locale);
    this.localeValue = locale;
  }

  /** Returns the current backend. Defaults to `Backend::Simple`. */
  get backend(): Backend {
    if (!backend) {
      if (!defaultBackendFactory) {
        throw new Error(
          "I18n has no backend: set `I18n.config.backend`, or port I18n::Backend::Simple and register it with registerDefaultBackend().",
        );
      }
      backend = defaultBackendFactory();
    }
    return backend;
  }

  set backend(value: Backend) {
    backend = value;
  }

  /** Returns the current default locale. Defaults to `en`. */
  get defaultLocale(): Locale {
    defaultLocale ??= "en";
    return defaultLocale;
  }

  set defaultLocale(locale: Locale) {
    enforceAvailableLocalesBang(locale);
    defaultLocale = locale;
  }

  /** Locales with translations; delegated to the backend unless set. */
  get availableLocales(): Locale[] {
    return availableLocales ?? this.backend.availableLocales();
  }

  /** Cached as a Set for faster available-locales enforce checks. */
  get availableLocalesSet(): Set<Locale> {
    availableLocalesSet ??= new Set(this.availableLocales);
    return availableLocalesSet;
  }

  set availableLocales(locales: Locale | Locale[] | null | undefined) {
    const list = locales === null || locales === undefined ? [] : [locales].flat();
    availableLocales = list.length === 0 ? undefined : list;
    availableLocalesSet = undefined;
  }

  /** Returns true if the available locales have been initialized. */
  get availableLocalesInitialized(): boolean {
    return availableLocales !== undefined;
  }

  /** Clears the set so it is recomputed after I18n gets reloaded. */
  clearAvailableLocalesSet(): void {
    availableLocalesSet = undefined;
  }

  /** Returns the current default scope separator. Defaults to `.` */
  get defaultSeparator(): string {
    defaultSeparator ??= ".";
    return defaultSeparator;
  }

  set defaultSeparator(separator: string) {
    defaultSeparator = separator;
  }

  /** Returns the current exception handler. Defaults to an `ExceptionHandler`. */
  get exceptionHandler(): ExceptionHandlerLike {
    exceptionHandler ??= new ExceptionHandler();
    return exceptionHandler;
  }

  set exceptionHandler(handler: ExceptionHandlerLike) {
    exceptionHandler = handler;
  }

  /** Handler for a missing interpolation argument; raises by default. */
  get missingInterpolationArgumentHandler(): MissingInterpolationArgumentHandler {
    missingInterpolationArgumentHandler ??= (missingKey, providedHash, string) => {
      throw new MissingInterpolationArgument(missingKey, providedHash, string);
    };
    return missingInterpolationArgumentHandler;
  }

  set missingInterpolationArgumentHandler(handler: MissingInterpolationArgumentHandler) {
    missingInterpolationArgumentHandler = handler;
  }

  /** Paths providing translation data sources; the backend defines what it accepts. */
  get loadPath(): string[] {
    loadPath ??= [];
    return loadPath;
  }

  set loadPath(value: string[]) {
    loadPath = value;
    availableLocalesSet = undefined;
    this.backend.reloadBang();
  }

  /** Whether to verify locales are in the available list. Defaults to true. */
  get enforceAvailableLocales(): boolean {
    return enforceAvailableLocalesFlag;
  }

  set enforceAvailableLocales(value: boolean) {
    enforceAvailableLocalesFlag = value;
  }

  /** Defaults to a copy of `DEFAULT_INTERPOLATION_PATTERNS`. */
  get interpolationPatterns(): RegExp[] {
    interpolationPatterns ??= [...DEFAULT_INTERPOLATION_PATTERNS];
    return interpolationPatterns;
  }

  set interpolationPatterns(patterns: RegExp[]) {
    interpolationPatterns = patterns;
  }
}

/** @internal Test seam — restores every class-level slot to its gem default. */
export function resetClassConfig(): void {
  backend = undefined;
  defaultLocale = undefined;
  availableLocales = undefined;
  availableLocalesSet = undefined;
  defaultSeparator = undefined;
  exceptionHandler = undefined;
  missingInterpolationArgumentHandler = undefined;
  loadPath = undefined;
  enforceAvailableLocalesFlag = true;
  interpolationPatterns = undefined;
  defaultBackendFactory = undefined;
}
