/**
 * Mirrors: i18n/lib/i18n/backend/base.rb
 *
 * Ruby mixes `Base` into a backend with `include`; the JS equivalent is an
 * abstract class that concrete backends extend, which keeps the file layout of
 * the gem. The `NotImplementedError` members (`store_translations`, `lookup`,
 * `available_locales`) are `abstract` here — TypeScript's form of the same
 * contract.
 *
 * A Ruby Symbol value is a JS string that keeps its leading colon — `":short"`
 * is `:short` — which is the discriminator Ruby gets from the type. `default`
 * and `resolve` still spell theirs as real JS symbols; converging those two is
 * story `i18n-symbol-values-are-colon-strings`.
 *
 * Not ported here: `load_translations` / `load_file` / `load_rb` / `load_yml` /
 * `load_json` (file loading needs a YAML reader and async fs — its own story),
 * and the `Transliterator` mixin.
 */

import {
  ArgumentError,
  InvalidLocale,
  InvalidPluralizationData,
  MissingTranslation,
  MissingTranslationData,
  ReservedInterpolationKey,
  inspect,
} from "../exceptions.js";
import {
  EMPTY_HASH,
  RESERVED_KEYS,
  config,
  reservedKeysPattern,
  t,
  tBang,
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

/**
 * Ruby `Symbol === x`. A Ruby Symbol is a JS string that keeps its leading
 * colon (`":short"`), which is the discriminator Ruby gets from the type.
 */
function isSymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

/** Ruby `#to_s`, for the values a format argument can hold. */
function toS(subject: unknown): string {
  if (subject == null) return "";
  return isSymbol(subject) ? subject.slice(1) : String(subject);
}

/**
 * Ruby `respond_to?`. A Ruby reader that returns a value is a property or a
 * getter in JS, not a function, so membership — not callability — is the test.
 */
function respondTo(object: unknown, name: string): boolean {
  return (
    object != null && (typeof object === "object" || typeof object === "function") && name in object
  );
}

/**
 * The duck type `localize` accepts: the gem asks the object for `strftime`,
 * `wday`, `mon`, `hour` and `sec` and nothing else.
 */
interface Localizable {
  strftime(format: string): string;
  wday: number;
  mon: number;
  hour?: number;
  sec?: number;
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
   * Acts the same as `strftime`, but uses a localized version of the format
   * string. Takes a key from the date/time formats translations as a format
   * argument (*e.g.*, `short` in `date.formats`).
   */
  localize(
    locale: Locale,
    object: unknown,
    format: unknown = ":default",
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (object == null && "default" in options) {
      return options.default;
    }
    if (!respondTo(object, "strftime")) {
      throw new ArgumentError(
        `Object must be a Date, DateTime or Time object. ${inspect(object)} given.`,
      );
    }

    if (isSymbol(format)) {
      const key = format;
      const type = respondTo(object, "sec") ? "time" : "date";
      options = { ...options, raise: true, object, locale };
      format = t(`${type}.formats.${key.slice(1)}`, options);
    }

    format = this.translateLocalizationFormat(locale, object as Localizable, format, options);
    return (object as Localizable).strftime(format as string);
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
        const dateOrTime =
          options.object != null && options.object !== false ? options.object : object;
        delete options.object;
        return this.resolve(
          locale,
          object,
          (subject as (value: unknown, options: TranslateOptions) => unknown)(dateOrTime, options),
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

  protected translateLocalizationFormat(
    locale: Locale,
    object: Localizable,
    format: unknown,
    _options: TranslateOptions,
  ): string {
    try {
      return toS(format).replace(/%(|\^)[aAbBpP]/g, (match) => {
        switch (match) {
          case "%a":
            return (tBang("date.abbr_day_names", { locale, format }) as string[])[object.wday];
          case "%^a":
            return (tBang("date.abbr_day_names", { locale, format }) as string[])[
              object.wday
            ].toUpperCase();
          case "%A":
            return (tBang("date.day_names", { locale, format }) as string[])[object.wday];
          case "%^A":
            return (tBang("date.day_names", { locale, format }) as string[])[
              object.wday
            ].toUpperCase();
          case "%b":
            return (tBang("date.abbr_month_names", { locale, format }) as string[])[object.mon];
          case "%^b":
            return (tBang("date.abbr_month_names", { locale, format }) as string[])[
              object.mon
            ].toUpperCase();
          case "%B":
            return (tBang("date.month_names", { locale, format }) as string[])[object.mon];
          case "%^B":
            return (tBang("date.month_names", { locale, format }) as string[])[
              object.mon
            ].toUpperCase();
          case "%p":
            return (
              tBang(`time.${(respondTo(object, "hour") ? object.hour! : 0) < 12 ? "am" : "pm"}`, {
                locale,
                format,
              }) as string
            ).toUpperCase();
          case "%P":
            return (
              tBang(`time.${(respondTo(object, "hour") ? object.hour! : 0) < 12 ? "am" : "pm"}`, {
                locale,
                format,
              }) as string
            ).toLowerCase();
          default:
            return "";
        }
      });
    } catch (e) {
      if (e instanceof MissingTranslationData) return e.message;
      throw e;
    }
  }

  protected pluralizationKey(entry: TranslationData, count: unknown): string {
    if (count === 0 && "zero" in entry) return "zero";
    return count === 1 ? "one" : "other";
  }
}
