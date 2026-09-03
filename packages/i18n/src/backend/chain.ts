import { MissingTranslation } from "../exceptions.js";
import { EMPTY_HASH, type Locale, type TranslationKey } from "../i18n.js";
import { throwException, catchException } from "../throw-catch.js";
import { deepMergeBang, except, type TranslationData } from "../utils.js";
import { Base, type TranslateOptions } from "./base.js";

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

interface ChainedBackend extends Base {
  initialized(): boolean;
  /** @internal */
  initTranslations(): void;
  /** @internal */
  translations(): TranslationData;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- the merge is the point: it is `include Base` on the type side.
export interface Chain extends Base {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Chain {
  backends: Base[];

  constructor(...backends: Base[]) {
    this.backends = backends;
  }

  initialized(): boolean {
    for (const backend of this.backends) {
      if (!(backend as ChainedBackend).initialized()) return false;
    }
    return true;
  }

  async reloadBang(): Promise<void> {
    for (const backend of this.backends) await backend.reloadBang();
  }

  async eagerLoadBang(): Promise<void> {
    for (const backend of this.backends) await backend.eagerLoadBang();
  }

  storeTranslations(
    locale: Locale,
    data: TranslationData,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    return this.backends[0].storeTranslations(locale, data, options);
  }

  availableLocales(): Locale[] {
    return [...new Set(this.backends.map((backend) => backend.availableLocales()).flat())];
  }

  translate(
    locale: Locale | null | undefined,
    key: TranslationKey | null | undefined,
    defaultOptions: TranslateOptions = EMPTY_HASH,
  ): unknown {
    let namespace: TranslationData | null = null;
    let options = except(defaultOptions, "default");

    for (const backend of this.backends) {
      let returned: { value: unknown } | undefined;
      catchException(() => {
        if (backend === this.backends[this.backends.length - 1]) options = defaultOptions;
        const translation = backend.translate(locale, key, options);
        if (this.namespaceLookup(translation, options)) {
          namespace = this._deepMerge(translation as TranslationData, namespace ?? {});
        } else if (translation != null || ("default" in options && options.default == null)) {
          returned = { value: translation };
        }
      });
      if (returned) return returned.value;
    }

    if (truthy(namespace)) return namespace;
    throwException(new MissingTranslation(locale as Locale, key as TranslationKey, options));
  }

  exists(locale: Locale, key: TranslationKey, options: TranslateOptions = EMPTY_HASH): boolean {
    return this.backends.some((backend) => backend.exists(locale, key, options));
  }

  localize(
    locale: Locale,
    object: unknown,
    format: unknown = ":default",
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    for (const backend of this.backends) {
      let returned: { value: unknown } | undefined;
      catchException(() => {
        const result = backend.localize(locale, object, format, options);
        if (truthy(result)) returned = { value: result };
      });
      if (returned) return returned.value;
    }
    throwException(new MissingTranslation(locale, format as TranslationKey, options));
  }

  protected initTranslations(): void {
    for (const backend of this.backends) {
      (backend as ChainedBackend).initTranslations();
    }
  }

  protected translations(): TranslationData {
    const memo: TranslationData = {};
    for (const backend of [...this.backends].reverse()) {
      const chained = backend as ChainedBackend;
      if (!chained.initialized()) chained.initTranslations();
      const partialTranslations = chained.translations();
      deepMergeBang(memo, partialTranslations, (_, a, b) => (truthy(b) ? b : a));
    }
    return memo;
  }

  protected namespaceLookup(result: unknown, options: TranslateOptions): boolean {
    return isHash(result) && !("count" in options);
  }

  private _deepMerge(hash: TranslationData, otherHash: TranslationData): TranslationData {
    const copy = { ...hash };
    for (const [k, v] of Object.entries(otherHash)) {
      const valueFromOther = hash[k];
      copy[k] = isHash(valueFromOther) && isHash(v) ? this._deepMerge(valueFromOther, v) : v;
    }
    return copy;
  }
}

for (const source of [Base.prototype, new (Base as unknown as new () => Base)()]) {
  for (const key of Object.getOwnPropertyNames(source)) {
    if (key === "constructor") continue;
    if (Object.prototype.hasOwnProperty.call(Chain.prototype, key)) continue;
    Object.defineProperty(
      Chain.prototype,
      key,
      Object.getOwnPropertyDescriptor(source, key) as PropertyDescriptor,
    );
  }
}
