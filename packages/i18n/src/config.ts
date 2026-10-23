import { enforceAvailableLocalesBang, type Locale, type TranslationKey } from "./i18n.js";
import { ExceptionHandler, MissingInterpolationArgument, NoMethodError } from "./exceptions.js";
import { rbInspect } from "@blazetrails/ruby-compat";
import { DEFAULT_INTERPOLATION_PATTERNS } from "./interpolate/ruby.js";
import type { Base } from "./backend/base.js";
import { Simple } from "./backend/simple.js";

export type ExceptionHandlerLike =
  | string
  | ((exception: Error, locale: Locale, key: TranslationKey, options: unknown) => unknown)
  | { call(exception: Error, locale: Locale, key: TranslationKey, options: unknown): unknown };

export type MissingInterpolationArgumentHandler = (
  missingKey: string,
  providedHash: Record<string, unknown>,
  string: string,
) => unknown;

let backend: Base | null | undefined;
let defaultLocale: Locale | null | undefined;
let availableLocales: Locale[] | undefined;
let availableLocalesSet: Set<Locale> | undefined;
let defaultSeparator: string | null | undefined;
let exceptionHandler: ExceptionHandlerLike | null | undefined;
let missingInterpolationArgumentHandler: MissingInterpolationArgumentHandler | null | undefined;
let loadPath: (string | string[])[] | null | undefined;
let enforceAvailableLocalesFlag = true;
let interpolationPatterns: RegExp[] | null | undefined;

export class Config {
  private localeValue?: Locale | false | null;

  get locale(): Locale | false {
    return this.localeValue ?? this.defaultLocale;
  }

  set locale(locale: Locale | false | null) {
    enforceAvailableLocalesBang(locale);
    if (locale != null && locale !== false && typeof locale !== "string") {
      throw new NoMethodError(`undefined method 'to_sym' for ${rbInspect(locale)}`);
    }
    this.localeValue = locale;
  }

  get backend(): Base {
    backend ??= new Simple();
    return backend;
  }

  set backend(value: Base | null) {
    backend = value;
  }

  get defaultLocale(): Locale {
    defaultLocale ??= "en";
    return defaultLocale;
  }

  set defaultLocale(locale: Locale | null) {
    enforceAvailableLocalesBang(locale);
    if (locale != null && (locale as unknown) !== false && typeof locale !== "string") {
      throw new NoMethodError(`undefined method 'to_sym' for ${rbInspect(locale)}`);
    }
    defaultLocale = locale;
  }

  get availableLocales(): Locale[] {
    return availableLocales ?? this.backend.availableLocales();
  }

  get availableLocalesSet(): Set<Locale> {
    availableLocalesSet ??= this.availableLocales.reduce(
      (set, locale) => set.add(locale),
      new Set<Locale>(),
    );
    return availableLocalesSet;
  }

  set availableLocales(locales: Locale | Locale[] | null | undefined) {
    const list = locales === null || locales === undefined ? [] : [locales].flat();
    availableLocales = list.length === 0 ? undefined : list;
    availableLocalesSet = undefined;
  }

  get availableLocalesInitialized(): boolean {
    return availableLocales !== undefined;
  }

  clearAvailableLocalesSet(): void {
    availableLocalesSet = undefined;
  }

  get defaultSeparator(): string {
    defaultSeparator ??= ".";
    return defaultSeparator;
  }

  set defaultSeparator(separator: string | null) {
    defaultSeparator = separator;
  }

  get exceptionHandler(): ExceptionHandlerLike {
    exceptionHandler ??= new ExceptionHandler();
    return exceptionHandler;
  }

  set exceptionHandler(handler: ExceptionHandlerLike | null) {
    exceptionHandler = handler;
  }

  get missingInterpolationArgumentHandler(): MissingInterpolationArgumentHandler {
    missingInterpolationArgumentHandler ??= (missingKey, providedHash, string) => {
      throw new MissingInterpolationArgument(missingKey, providedHash, string);
    };
    return missingInterpolationArgumentHandler;
  }

  set missingInterpolationArgumentHandler(handler: MissingInterpolationArgumentHandler | null) {
    missingInterpolationArgumentHandler = handler;
  }

  get loadPath(): (string | string[])[] {
    loadPath ??= [];
    return loadPath;
  }

  async setLoadPath(value: (string | string[])[] | null): Promise<void> {
    loadPath = value;
    availableLocalesSet = undefined;
    await this.backend.reloadBang();
  }

  get enforceAvailableLocales(): boolean {
    return enforceAvailableLocalesFlag;
  }

  set enforceAvailableLocales(value: boolean) {
    enforceAvailableLocalesFlag = value;
  }

  get interpolationPatterns(): RegExp[] {
    interpolationPatterns ??= [...DEFAULT_INTERPOLATION_PATTERNS];
    return interpolationPatterns;
  }

  set interpolationPatterns(patterns: RegExp[] | null) {
    interpolationPatterns = patterns;
  }
}
