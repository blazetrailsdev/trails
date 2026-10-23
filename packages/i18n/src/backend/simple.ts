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
import { Hash, fetch, hashAref, isSymbol } from "@blazetrails/ruby-compat";
import { deepMergeBang, deepSymbolizeKeys, except, type TranslationData } from "../utils.js";
import { Base, type TranslateOptions } from "./base.js";

function isHash(value: unknown): value is TranslationData {
  return value instanceof Map;
}

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
    data: TranslationData | Record<string, unknown>,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (
      config().enforceAvailableLocales &&
      availableLocalesInitialized() &&
      !localeAvailable(locale)
    ) {
      return data;
    }
    locale = toSym(locale);
    const translations = this.translations();
    const existing = hashAref(translations, locale);
    if (existing == null || existing === false) translations.set(locale, new Hash());
    if (!fetch(options, "skipSymbolizeKeys", false)) data = deepSymbolizeKeys(data);
    return deepMergeBang(translations.get(locale) as TranslationData, data as TranslationData);
  }

  availableLocales(): Locale[] {
    if (!this.initialized()) this.initTranslations();
    const locales: Locale[] = [];
    for (const [locale, data] of this.translations()) {
      const hash = data as TranslationData;
      if (!(hash.size <= 1 && (hash.size === 0 || hash.has(":i18n")))) {
        locales.push((locale as string).slice(1));
      }
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

    this.translationsStore ??= new Hash((h, k) => {
      h.set(k, new Hash());
      return h.get(k);
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
      let _key: unknown = typeof rawKey === "string" ? toSym(rawKey) : rawKey;
      if (!result.has(_key)) {
        _key = toSym(String(rawKey));
        if (!result.has(_key)) return null;
      }
      result = hashAref(result, _key);
      if (isSymbol(result)) {
        result = this.resolveEntry(
          locale,
          _key as TranslationKey,
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
    if (Object.hasOwn(Simple.prototype, key)) continue;
    Object.defineProperty(
      Simple.prototype,
      key,
      Object.getOwnPropertyDescriptor(source, key) as PropertyDescriptor,
    );
  }
}
