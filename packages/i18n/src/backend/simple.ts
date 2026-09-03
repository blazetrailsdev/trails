import {
  EMPTY_HASH,
  availableLocalesInitialized,
  config,
  localeAvailable,
  normalizeKeys,
  toSym,
  type Locale,
  type TranslationKey,
} from "../i18n.js";
import { isSymbol } from "@blazetrails/ruby-compat";
import { deepMergeBang, deepSymbolizeKeys, except, type TranslationData } from "../utils.js";
import { Base, type TranslateOptions } from "./base.js";

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const NON_LOCALE_READS = new Set(["toJSON", "then", "inspect", "constructor"]);

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- the merge is the point: it is `include Base` on the type side.
export interface Simple extends Base {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Simple {
  private initializedFlag = false;
  private translationsStore: TranslationData | undefined;

  initialized(): boolean {
    return this.initializedFlag;
  }

  storeTranslations(
    locale: Locale,
    data: TranslationData,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (
      config().enforceAvailableLocales &&
      availableLocalesInitialized() &&
      !localeAvailable(locale)
    ) {
      return data;
    }
    locale = toSym(locale).slice(1);
    const translations = this.translations();
    translations[locale] ??= {};
    const payload = options.skipSymbolizeKeys ? data : deepSymbolizeKeys(data);
    return deepMergeBang(translations[locale] as TranslationData, payload);
  }

  availableLocales(): Locale[] {
    if (!this.initialized()) this.initTranslations();
    const locales: Locale[] = [];
    for (const [locale, data] of Object.entries(this.translations())) {
      const entries = isHash(data) ? Object.keys(data) : [];
      const onlyMetadata = entries.length <= 1 && (entries.length === 0 || entries[0] === "i18n");
      if (!onlyMetadata) locales.push(locale);
    }
    return locales;
  }

  async reloadBang(): Promise<void> {
    this.initializedFlag = false;
    this.translationsStore = undefined;
    await Base.prototype.reloadBang.call(this);
  }

  async eagerLoadBang(): Promise<void> {
    if (!this.initialized()) this.initTranslations();
    await Base.prototype.eagerLoadBang.call(this);
  }

  translations({ doInit = false }: { doInit?: boolean } = {}): TranslationData {
    if (doInit && !this.initialized()) this.initTranslations();

    this.translationsStore ??= new Proxy({} as TranslationData, {
      get(h, k) {
        if (typeof k === "string" && !NON_LOCALE_READS.has(k) && !(k in h)) h[k] = {};
        return h[k as string];
      },
    });
    return this.translationsStore;
  }

  protected initTranslations(): void {
    this.loadTranslations();
    this.initializedFlag = true;
  }

  protected lookup(
    locale: Locale,
    key: TranslationKey,
    scope: unknown = [],
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (!this.initialized()) this.initTranslations();
    const keys = normalizeKeys(locale, key, scope, options.separator as string | false | undefined);

    let result: unknown = this.translations();
    for (const rawKey of keys) {
      if (!isHash(result)) return null;
      let _key = String(rawKey);
      if (!(_key in result)) {
        _key = toSym(_key).slice(1);
        if (!(_key in result)) return null;
      }
      result = result[_key];
      if (isSymbol(result)) {
        result = this.resolveEntry(
          locale,
          _key,
          result,
          except({ ...options, scope: null }, "count"),
        );
      }
    }
    return result;
  }
}

for (const source of [Base.prototype, new (Base as unknown as new () => Base)()]) {
  for (const key of Object.getOwnPropertyNames(source)) {
    if (key === "constructor") continue;
    if (Object.prototype.hasOwnProperty.call(Simple.prototype, key)) continue;
    Object.defineProperty(
      Simple.prototype,
      key,
      Object.getOwnPropertyDescriptor(source, key) as PropertyDescriptor,
    );
  }
}
