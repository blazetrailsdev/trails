/**
 * Mirrors: i18n/lib/i18n/backend/simple.rb
 *
 * A simple backend that reads translations from an in-memory hash. Relies on
 * the Base backend.
 *
 * The gem splits the code into a `Simple::Implementation` module so other
 * modules can be `include`d over it; TypeScript has no module reopening, so
 * `Simple` is a single class extending `Base`. There is likewise no `MUTEX` —
 * JS has no threads, so the concurrent-hash machinery has nothing to guard.
 */

import { registerDefaultBackend } from "../config.js";
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

export class Simple extends Base {
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
  override storeTranslations(
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
  override availableLocales(): Locale[] {
    if (!this.initialized()) this.markInitialized();
    const locales: Locale[] = [];
    for (const [locale, data] of Object.entries(this.translations())) {
      const entries = isHash(data) ? Object.keys(data) : [];
      const onlyMetadata = entries.length <= 1 && (entries.length === 0 || entries[0] === "i18n");
      if (!onlyMetadata) locales.push(locale);
    }
    return locales;
  }

  /** Clean up translations hash and set initialized to false on reload. */
  override reloadBang(): void {
    this.initializedFlag = false;
    this.translationsStore = undefined;
    super.reloadBang();
  }

  override eagerLoadBang(): void {
    if (!this.initialized()) this.markInitialized();
    super.eagerLoadBang();
  }

  translations({ doInit = false }: { doInit?: boolean } = {}): TranslationData {
    // To avoid returning empty translations, call `initTranslations`.
    if (doInit && !this.initialized()) this.markInitialized();

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

  /**
   * Loads `I18n.load_path` and marks the backend initialized.
   *
   * Reading files is async here (`packages/i18n` imports nothing from `node:*`
   * and only does async fs), so this cannot run from the gem's synchronous
   * lazy-init call sites in `lookup` / `available_locales` / `translations` /
   * `eager_load!`; those flip the flag alone via `markInitialized`. A host with
   * a populated `I18n.load_path` awaits this once at boot instead.
   */
  protected async initTranslations(): Promise<void> {
    await this.loadTranslations();
    this.markInitialized();
  }

  /** @internal The synchronous half of `init_translations` — see there. */
  private markInitialized(): void {
    this.initializedFlag = true;
  }

  /**
   * Looks up a translation from the translations hash. Returns null if either
   * key is null, or locale, scope or key do not exist as a key in the nested
   * translations hash. Splits keys or scopes containing dots into multiple
   * keys, i.e. `currency.format` is regarded the same as `["currency",
   * "format"]`.
   */
  protected override lookup(
    locale: Locale,
    key: TranslationKey | symbol,
    scope: unknown = [],
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (!this.initialized()) this.markInitialized();
    const name = typeof key === "symbol" ? (Symbol.keyFor(key) ?? key.description) : key;
    const keys = normalizeKeys(locale, name, scope, options.separator as string | undefined);

    let result: unknown = this.translations();
    for (const rawKey of keys) {
      if (!isHash(result)) return null;
      // Ruby retries the lookup with `_key.to_s.to_sym`; JS object keys are
      // already strings, so the string form is the only form.
      const segment = String(rawKey);
      if (!(segment in result)) return null;
      result = result[segment];
      if (typeof result === "symbol") {
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

registerDefaultBackend(() => new Simple());
