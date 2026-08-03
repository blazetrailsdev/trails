/**
 * Mirrors: i18n/lib/i18n/backend/base.rb
 *
 * Ruby mixes `Base` into a backend with `include`; the JS equivalent is an
 * abstract class that concrete backends extend, which keeps the file layout of
 * the gem. The `NotImplementedError` members (`store_translations`, `lookup`,
 * `available_locales`) are `abstract` here — TypeScript's form of the same
 * contract.
 *
 * Ruby Symbols appear in two value positions this file cares about: a `default`
 * that names another translation key, and a translation entry that redirects
 * to one. Since a JS string is the analogue of a Ruby String, those use real JS
 * symbols — `Symbol.for("some.key")` is the analogue of `:"some.key"`.
 *
 * Not ported here: `load_translations` / `load_file` / `load_rb` / `load_yml` /
 * `load_json` (file loading needs a YAML reader and async fs — its own story),
 * `localize` / `translate_localization_format`, and the `Transliterator` mixin.
 */

import {
  ArgumentError,
  InvalidLocale,
  InvalidPluralizationData,
  MissingTranslation,
  ReservedInterpolationKey,
} from "../exceptions.js";
import {
  EMPTY_HASH,
  RESERVED_KEYS,
  config,
  reservedKeysPattern,
  type Locale,
  type TranslationKey,
} from "../i18n.js";
import { interpolate as interpolateString } from "../interpolate/ruby.js";
import { throwException, catchException } from "../throw-catch.js";
import { except, type TranslationData } from "../utils.js";

export type TranslateOptions = { [key: string]: unknown };

/** Ruby truthiness: only `nil` and `false` are falsy — `0` and `""` are not. */
function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function symbolName(subject: symbol): string {
  return Symbol.keyFor(subject) ?? subject.description ?? "";
}

export abstract class Base {
  private eagerLoadedFlag = false;

  /**
   * This method receives a locale, a data hash and options for storing
   * translations. Should be implemented.
   */
  abstract storeTranslations(
    locale: Locale,
    data: TranslationData,
    options?: TranslateOptions,
  ): unknown;

  translate(
    locale: Locale | null | undefined,
    key: TranslationKey | symbol | null | undefined,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (key === "" || (typeof key === "symbol" && symbolName(key) === "")) {
      throw new ArgumentError();
    }
    if (!truthy(locale)) throw new InvalidLocale(locale);
    if (key == null && !("default" in options)) return null;

    let entry: unknown =
      key == null ? null : (this.lookup(locale!, key, options.scope, options) ?? null);

    if (entry == null && "default" in options) {
      entry = this.default(locale!, key, options.default, options);
    } else {
      entry = this.resolveEntry(locale!, key, entry, options);
    }

    const count = options.count;

    if (entry == null && (this.subtrees() || !truthy(count))) {
      if (("default" in options && options.default != null) || !("default" in options)) {
        throwException(new MissingTranslation(locale!, key as TranslationKey, options));
      }
    }

    if (truthy(count)) entry = this.pluralize(locale!, entry, count);

    if (entry == null && !this.subtrees()) {
      throwException(new MissingTranslation(locale!, key as TranslationKey, options));
    }

    const deepInterpolation = options.deepInterpolation;
    const skipInterpolation = options.skipInterpolation;
    const values = Object.keys(options).length > 0 ? except(options, ...RESERVED_KEYS) : undefined;
    if (!truthy(skipInterpolation) && values && Object.keys(values).length > 0) {
      entry = truthy(deepInterpolation)
        ? this.deepInterpolate(locale!, entry, values)
        : this.interpolate(locale!, entry, values);
    } else if (typeof entry === "string") {
      const reserved = reservedKeysPattern().exec(entry);
      if (reserved) throw new ReservedInterpolationKey(reserved[1], entry);
    }
    return entry;
  }

  exists(
    locale: Locale,
    key: TranslationKey | symbol,
    options: TranslateOptions = EMPTY_HASH,
  ): boolean {
    return this.lookup(locale, key, options.scope) != null;
  }

  /**
   * Returns an array of locales for which translations are available ignoring
   * the reserved translation meta data key `i18n`.
   */
  abstract availableLocales(): Locale[];

  reloadBang(): void {
    if (this.eagerLoaded()) this.eagerLoadBang();
  }

  eagerLoadBang(): void {
    this.eagerLoadedFlag = true;
  }

  protected eagerLoaded(): boolean {
    return this.eagerLoadedFlag;
  }

  /** The method which actually looks up for the translation in the store. */
  protected abstract lookup(
    locale: Locale,
    key: TranslationKey | symbol,
    scope?: unknown,
    options?: TranslateOptions,
  ): unknown;

  protected subtrees(): boolean {
    return true;
  }

  /**
   * Evaluates defaults. If given subject is an Array, it walks the array and
   * returns the first translation that can be resolved. Otherwise it tries to
   * resolve the translation directly.
   */
  protected default(
    locale: Locale,
    object: TranslationKey | symbol | null | undefined,
    subject: unknown,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    const rest =
      Object.keys(options).length === 1 && "default" in options ? {} : except(options, "default");

    if (Array.isArray(subject)) {
      for (const item of subject) {
        const result = this.resolve(locale, object, item, rest);
        if (result != null) return result;
      }
      return null;
    }
    return this.resolve(locale, object, subject, rest);
  }

  /**
   * Resolves a translation. If the given subject is a Symbol, it will be
   * translated with the given options. If it is a Proc then it will be
   * evaluated. All other subjects will be returned directly.
   */
  protected resolve(
    locale: Locale,
    object: TranslationKey | symbol | null | undefined,
    subject: unknown,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (options.resolve === false) return subject;
    const result = catchException(() => {
      if (typeof subject === "symbol") {
        // The gem goes through `I18n.translate`, which — with `throw: true` —
        // hands a MissingTranslation straight back to this `catch`, exactly as
        // calling the backend does. The `I18n.t` facade is not ported yet.
        return config().backend.translate(locale, symbolName(subject), {
          ...options,
          locale,
          throw: true,
          skipInterpolation: true,
        });
      }
      if (typeof subject === "function") {
        const dateOrTime = options.object ?? object;
        const rest = except(options, "object");
        return this.resolve(
          locale,
          object,
          (subject as (value: unknown, options: TranslateOptions) => unknown)(dateOrTime, rest),
        );
      }
      return subject;
    });
    return result instanceof MissingTranslation ? null : result;
  }

  protected resolveEntry(
    locale: Locale,
    object: TranslationKey | symbol | null | undefined,
    subject: unknown,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    return this.resolve(locale, object, subject, options);
  }

  /**
   * Picks a translation from a pluralized mnemonic subkey according to English
   * pluralization rules:
   * - It will pick the `one` subkey if count is equal to 1.
   * - It will pick the `other` subkey otherwise.
   * - It will pick the `zero` subkey in the special case where count is equal
   *   to 0 and there is a `zero` subkey present. This behaviour is not standard
   *   with regards to the CLDR pluralization rules.
   */
  protected pluralize(_locale: Locale, entry: unknown, count: unknown): unknown {
    const subject = isHash(entry) ? except(entry, "attributes") : entry;
    if (!isHash(subject) || !truthy(count)) return subject;

    const key = this.pluralizationKey(subject, count);
    if (!(key in subject)) throw new InvalidPluralizationData(subject, count, key);
    return subject[key];
  }

  /**
   * Interpolates values into a given subject. Arrays are interpolated
   * element-wise, recursively.
   */
  protected interpolate(
    locale: Locale,
    subject: unknown,
    values: TranslationData = EMPTY_HASH,
  ): unknown {
    if (Object.keys(values).length === 0) return subject;
    if (typeof subject === "string") return interpolateString(subject, values);
    if (Array.isArray(subject)) {
      return subject.map((element) => this.interpolate(locale, element, values));
    }
    return subject;
  }

  /**
   * Deep interpolation.
   *
   *     deepInterpolate({ people: { ann: "Ann is %{ann}" } }, { ann: "good" })
   *     //=> { people: { ann: "Ann is good" } }
   */
  protected deepInterpolate(
    locale: Locale,
    data: unknown,
    values: TranslationData = EMPTY_HASH,
  ): unknown {
    if (Object.keys(values).length === 0) return data;
    if (typeof data === "string") return interpolateString(data, values);
    if (Array.isArray(data)) return data.map((v) => this.deepInterpolate(locale, v, values));
    if (isHash(data)) {
      const result: TranslationData = {};
      for (const [k, v] of Object.entries(data)) {
        result[k] = this.deepInterpolate(locale, v, values);
      }
      return result;
    }
    return data;
  }

  protected pluralizationKey(entry: TranslationData, count: unknown): string {
    if (count === 0 && "zero" in entry) return "zero";
    return count === 1 ? "one" : "other";
  }
}
