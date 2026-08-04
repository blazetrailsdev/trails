/**
 * Mirrors: i18n/lib/i18n/backend/simple.rb
 *
 * A simple backend that reads translations from an in-memory hash. Relies on
 * the Base backend.
 *
 * The gem's `Simple` has no superclass: it splits the code into a
 * `Simple::Implementation` module that `include Base` (simple.rb:20-22) and
 * `include Implementation`s it back (simple.rb:107), so that a later
 * `Simple.include(Pluralization)` lands *between* the two and its `super`
 * reaches `Implementation`. TypeScript has no module reopening, so this file
 * keeps the bodies in the `Simple` class itself and spells `include Base` as
 * the prototype copy below — the class body still wins over `Base`, and a
 * mixin over `Simple` (`Fallbacks(Simple)`) still sits above these bodies with
 * `super` reaching them, which is the seam `extends Base` collapsed.
 *
 * There is likewise no `MUTEX` — JS has no threads, so the concurrent-hash
 * machinery has nothing to guard.
 */

import {
  EMPTY_HASH,
  availableLocalesInitialized,
  config,
  localeAvailable,
  normalizeKeys,
  type Locale,
  type TranslationKey,
} from "../i18n.js";
import { deepMergeBang, deepSymbolizeKeys, except, type TranslationData } from "../utils.js";
import { Base, type TranslateOptions } from "./base.js";

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

/**
 * Ruby `include Base` (simple.rb:22) as a type: the merged interface gives
 * `Simple` every member `Base` declares, without an `extends` clause the gem
 * does not have. The runtime half of the same `include` is the prototype copy
 * at the bottom of this file; a TS interface has no `protected`, so `Base`'s
 * protected members widen on the merged type, where the copy leaves them
 * exactly where the gem has them.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- the merge is the point: it is `include Base` on the type side.
export interface Simple extends Base {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Simple {
  private initializedFlag = false;
  private translationsStore: TranslationData | undefined;

  /** Mirrors: `initialized?` */
  initialized(): boolean {
    return this.initializedFlag;
  }

  /**
   * Stores translations for the given locale in memory. This uses a deep merge
   * for the translations hash, so existing translations will be overwritten by
   * new ones only at the deepest level of the hash.
   */
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
    const translations = this.translations();
    translations[locale] ??= {};
    const payload = options.skipSymbolizeKeys ? data : deepSymbolizeKeys(data);
    return deepMergeBang(translations[locale] as TranslationData, payload);
  }

  /** Get available locales from the translations hash. */
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

  /** Clean up translations hash and set initialized to false on reload. */
  reloadBang(): void {
    this.initializedFlag = false;
    this.translationsStore = undefined;
    // Ruby's `super` from `Implementation` resolves to `Base`, the next
    // ancestor — a mixin included into `Simple` sits above `Implementation`,
    // never between it and `Base`.
    Base.prototype.reloadBang.call(this);
  }

  eagerLoadBang(): void {
    if (!this.initialized()) this.initTranslations();
    Base.prototype.eagerLoadBang.call(this);
  }

  translations({ doInit = false }: { doInit?: boolean } = {}): TranslationData {
    // To avoid returning empty translations, call `initTranslations`.
    if (doInit && !this.initialized()) this.initTranslations();

    // Ruby's default block writes `h[k] = Concurrent::Hash.new` on a missing-key
    // read, and that is observable through the public reader — Rails asserts
    // `translations[:fr] == {}` for a locale that was never stored
    // (i18n/test/backend/simple_test.rb:154). A `get` trap is the only JS
    // spelling of it; `in`, `Object.entries` and `Object.keys` stay untrapped,
    // matching Ruby, where `has_key?` is false until the read vivifies the key.
    this.translationsStore ??= new Proxy({} as TranslationData, {
      get(h, k) {
        if (typeof k === "string" && !(k in h)) h[k] = {};
        return h[k as string];
      },
    });
    return this.translationsStore;
  }

  protected initTranslations(): void {
    this.loadTranslations();
    this.initializedFlag = true;
  }

  /**
   * Looks up a translation from the translations hash. Returns null if either
   * key is null, or locale, scope or key do not exist as a key in the nested
   * translations hash. Splits keys or scopes containing dots into multiple
   * keys, i.e. `currency.format` is regarded the same as `["currency",
   * "format"]`.
   */
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
      // Ruby retries the lookup with `_key.to_s.to_sym`; JS object keys are
      // already strings, so the string form is the only form.
      const segment = String(rawKey);
      if (!(segment in result)) return null;
      result = result[segment];
      if (isSymbol(result)) {
        result = this.resolveEntry(
          locale,
          segment,
          result,
          except({ ...options, scope: null }, "count"),
        );
      }
    }
    return result;
  }
}

/**
 * Ruby `include Base` (simple.rb:22). `include` copies a module's instance
 * methods into the ancestry *below* the class body, so a key the class body
 * already defines is never replaced — the `hasOwnProperty` guard below. Some of
 * `Base`'s members are TS class fields (`transliterate`, `loadYaml`), which
 * only exist on an instance, so an instance is the second source read.
 */
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
