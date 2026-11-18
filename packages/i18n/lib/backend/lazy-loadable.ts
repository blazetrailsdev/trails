import { Hash, StandardError, isSymbol, toSym } from "@blazetrails/ruby-compat";
import {
  EMPTY_HASH,
  loadPath,
  locale as currentLocale,
  withLocale,
  type Locale,
  type TranslationKey,
} from "../i18n.js";
import { InvalidFilenames, UnsupportedMethod } from "../exceptions.js";
import type { TranslationData } from "../utils.js";
import type { TranslateOptions } from "./base.js";
import { Simple } from "./simple.js";

export class LocaleExtractor {
  static localeFromPath(path: string): Locale | null {
    const base = path.slice(path.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    const name = dot <= 0 ? base : base.slice(0, dot);
    const locale = name === "" ? undefined : name.split("_")[0];
    return locale != null ? locale : null;
  }
}

class FilenameIncorrect extends StandardError {
  constructor(file: string, expectedLocale: Locale | null, unexpectedLocales: string[]) {
    super(
      `${file} can only load translations for "${expectedLocale}". Found translations for: [${unexpectedLocales.join(", ")}].`,
    );
  }
}

export class LazyLoadable extends Simple {
  static readonly FilenameIncorrect = FilenameIncorrect;

  private _lazyLoad: boolean;
  declare private _initializedLocales: Hash<Locale, boolean> | null | undefined;

  constructor({ lazyLoad = false }: { lazyLoad?: boolean } = {}) {
    super();
    this._lazyLoad = lazyLoad;
  }

  override initialized(): boolean {
    if (this.isLazyLoad()) {
      return this.initializedLocales().get(currentLocale() as Locale) as boolean;
    } else {
      return super.initialized();
    }
  }

  override async reloadBang(): Promise<void> {
    if (this.isLazyLoad()) {
      this._initializedLocales = null;
      this.translationsStore = undefined;
    } else {
      await super.reloadBang();
    }
  }

  override async eagerLoadBang(): Promise<void> {
    if (this.isLazyLoad()) {
      throw new UnsupportedMethod(
        "eager_load!",
        this.constructor as typeof LazyLoadable,
        "Cannot eager load translations because backend was configured with lazy_load: true.",
      );
    } else {
      await super.eagerLoadBang();
    }
  }

  override availableLocales(): Locale[] {
    if (this.isLazyLoad()) {
      return [
        ...new Set(loadPath().map((path) => LocaleExtractor.localeFromPath(path as string))),
      ] as Locale[];
    } else {
      return super.availableLocales();
    }
  }

  override lookup(
    locale: Locale,
    key: TranslationKey,
    scope: unknown = [],
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (this.isLazyLoad()) {
      return withLocale(locale, () => super.lookup(locale, key, scope, options));
    } else {
      return super.lookup(locale, key, scope, options);
    }
  }

  protected override initTranslations(): void {
    let fileErrors: Error[];
    if (this.isLazyLoad()) {
      this.initializedLocales().set(currentLocale() as Locale, true);
      fileErrors = this.loadTranslationsAndCollectFileErrors(this.filenamesForCurrentLocale());
    } else {
      this.initializedFlag = true;
      fileErrors = this.loadTranslationsAndCollectFileErrors(loadPath());
    }

    if (fileErrors.length !== 0) throw new InvalidFilenames(fileErrors);
  }

  protected initializedLocales(): Hash<Locale, boolean> {
    return (this._initializedLocales ??= new Hash<Locale, boolean>(false));
  }

  private isLazyLoad(): boolean {
    return this._lazyLoad;
  }

  private loadTranslationsAndCollectFileErrors(files: unknown[]): Error[] {
    const errors: Error[] = [];

    this.loadTranslations(
      files,
      (file: string, loadedTranslations: TranslationData | Record<string, unknown>) => {
        try {
          this.assertFileNamedCorrectlyBang(file, loadedTranslations);
        } catch (e) {
          if (e instanceof FilenameIncorrect) {
            errors.push(e);
          } else {
            throw e;
          }
        }
      },
    );

    return errors;
  }

  private filenamesForCurrentLocale(): string[] {
    return loadPath()
      .flat()
      .filter((path) => LocaleExtractor.localeFromPath(path) === currentLocale());
  }

  private assertFileNamedCorrectlyBang(
    file: string,
    translations: TranslationData | Record<string, unknown>,
  ): void {
    const loadedLocales = [
      ...(translations instanceof Map ? translations.keys() : Object.keys(translations)),
    ].map((locale) => (isSymbol(locale) ? locale : toSym(locale)));
    const expectedLocale = LocaleExtractor.localeFromPath(file);
    const unexpectedLocales = loadedLocales.filter(
      (locale) => expectedLocale == null || locale !== toSym(expectedLocale),
    );

    if (unexpectedLocales.length !== 0)
      throw new FilenameIncorrect(file, expectedLocale, unexpectedLocales);
  }
}
