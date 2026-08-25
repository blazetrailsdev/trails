/**
 * Mirrors: i18n/lib/i18n/backend/chain.rb
 *
 * The gem's `Chain` has no superclass: it splits the code into a
 * `Chain::Implementation` module that `include Base` (chain.rb:21-23) and
 * `include Implementation`s it back (chain.rb:127), so a module included over
 * `Chain` lands *between* the two. TypeScript has no module reopening, so this
 * file keeps the bodies in the `Chain` class itself and spells `include Base`
 * as the prototype copy at the bottom, exactly as `simple.ts` does. The class
 * body still wins over `Base`, as Ruby's `include` does.
 *
 * `translate` and `localize` each `return` from inside a `catch(:exception)`
 * block (chain.rb:65, chain.rb:85), which in Ruby leaves the enclosing method;
 * the one-shot carrier in those two bodies is that non-local exit, checked
 * immediately after each backend so the control flow stays the gem's.
 */

import { MissingTranslation } from "../exceptions.js";
import { EMPTY_HASH, type Locale, type TranslationKey } from "../i18n.js";
import { throwException, catchException } from "../throw-catch.js";
import { deepMergeBang, except, type TranslationData } from "../utils.js";
import { Base, type TranslateOptions } from "./base.js";

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ruby truthiness: only `nil` and `false` are falsy. */
function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

/**
 * The gem reaches `initialized?`, `init_translations` and `translations` on a
 * chained backend through `instance_eval` / `send`, which ignore Ruby's method
 * visibility. TypeScript has no such escape, so the members the chain reaches
 * for are named here and the backend is cast to this shape at the call site.
 */
interface ChainedBackend extends Base {
  initialized(): boolean;
  /** @internal */
  initTranslations(): void;
  /** @internal */
  translations(): TranslationData;
}

/**
 * Ruby `include Base` (chain.rb:22) as a type: the merged interface gives
 * `Chain` every member `Base` declares, without an `extends` clause the gem
 * does not have. The runtime half of the same `include` is the prototype copy
 * at the bottom of this file.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- the merge is the point: it is `include Base` on the type side.
export interface Chain extends Base {}

/**
 * Backend that chains multiple other backends and checks each of them when
 * a translation needs to be looked up. This is useful when you want to use
 * standard translations with a Simple backend but store custom application
 * translations in a database or other backends.
 *
 * To use the Chain backend instantiate it and set it to the I18n module.
 * You can add chained backends through the initializer or backends
 * accessor:
 *
 *     // preserves the existing Simple backend set to I18n.backend
 *     I18n.setBackend(new I18n.Backend.Chain(new ActiveRecordBackend(), I18n.backend()));
 *
 * The implementation assumes that all backends added to the Chain implement
 * a lookup method with the same API as Simple backend does.
 *
 * Fallback translations using the `default` option are only used by the last
 * backend of a chain.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Chain {
  backends: Base[];

  constructor(...backends: Base[]) {
    this.backends = backends;
  }

  /** Mirrors: `initialized?` */
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

  /** Mirrors: `namespace_lookup?` */
  protected namespaceLookup(result: unknown, options: TranslateOptions): boolean {
    return isHash(result) && !("count" in options);
  }

  /**
   * This is approximately what gets used in ActiveSupport.
   * However since we are not guaranteed to run in an ActiveSupport context
   * it is wise to have our own copy. We underscore it
   * to not pollute the namespace of the including class.
   */
  private _deepMerge(hash: TranslationData, otherHash: TranslationData): TranslationData {
    const copy = { ...hash };
    for (const [k, v] of Object.entries(otherHash)) {
      const valueFromOther = hash[k];
      copy[k] = isHash(valueFromOther) && isHash(v) ? this._deepMerge(valueFromOther, v) : v;
    }
    return copy;
  }
}

/**
 * Ruby `include Base` (chain.rb:22). `include` copies a module's instance
 * methods into the ancestry *below* the class body, so a key the class body
 * already defines is never replaced — the `hasOwnProperty` guard below. Some of
 * `Base`'s members are TS class fields (`transliterate`, `loadYaml`), which
 * only exist on an instance, so an instance is the second source read.
 */
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
