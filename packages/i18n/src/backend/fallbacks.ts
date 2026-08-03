/**
 * Mirrors: i18n/lib/i18n/backend/fallbacks.rb
 *
 * I18n locale fallbacks are useful when you want your application to use
 * translations from other locales when translations for the current locale are
 * missing. E.g. you might want to use "en" translations when translations in
 * your applications main locale "de" are missing.
 *
 * To enable locale fallbacks you mix the Fallbacks module into the Simple
 * backend — or whatever other backend you are using:
 *
 *     class Backend extends Fallbacks(Simple) {}
 *
 * Ruby `include`s the module into an existing class and calls `super` from
 * every method it overwrites. `include()` from `@blazetrails/activesupport`
 * copies members onto a prototype and so has no `super` to call; the class
 * factory below is the shape that keeps `super` — every body under it is the
 * gem's, line for line.
 */

import { MissingTranslation, InvalidLocale } from "../exceptions.js";
import { EMPTY_HASH, t, type Locale, type TranslationKey } from "../i18n.js";
import { Fallbacks as LocaleFallbacks } from "../locale/fallbacks.js";
import { catchException, throwException } from "../throw-catch.js";
import type { Base, TranslateOptions } from "./base.js";

/**
 * Anything that answers the gem's `I18n.fallbacks[locale]` — the gem's own
 * `I18n::Locale::Fallbacks`, or the duck type Issue #536 allows.
 */
export interface FallbacksLike {
  get(locale: Locale): Locale[];
}

/**
 * Ruby stores the fallbacks in a class variable and reads a thread-local over
 * the top of it (`Thread.current[:i18n_fallbacks] || @@fallbacks`). JS has no
 * threads, so the module-level binding below is both, exactly as `I18n.config`
 * is in `i18n.ts`.
 */
let fallbacksStore: FallbacksLike | undefined;

/** Returns the current fallbacks implementation. Defaults to `Locale::Fallbacks`. */
export function fallbacks(): FallbacksLike {
  fallbacksStore ??= new LocaleFallbacks();
  return fallbacksStore;
}

/**
 * Sets the current fallbacks implementation. Use this to set a different
 * fallbacks implementation.
 */
export function setFallbacks(fallbacks: FallbacksLike | Locale[]): void {
  fallbacksStore = Array.isArray(fallbacks) ? new LocaleFallbacks(...fallbacks) : fallbacks;
}

/** @internal Test seam — drops the process-wide fallbacks so a case starts clean. */
export function resetFallbacks(): void {
  fallbacksStore = undefined;
}

/** Ruby truthiness: only `nil` and `false` are falsy — `0` and `""` are not. */
function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

/**
 * Ruby's `options.fetch(:fallback, true)`, which hands back a stored `nil` or
 * `false` where `??` would substitute the default.
 */
function fetchFallback(options: TranslateOptions): unknown {
  return "fallback" in options ? options.fallback : true;
}

// TS requires exactly `any[]` here: a mixin base must be `new (...args: any[])`.
type BackendConstructor = abstract new (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => Base;

/**
 * The public member `Fallbacks` adds on top of the backend it is mixed into.
 * TypeScript cannot name the anonymous class below in a declaration file, so
 * the factory states its return type; the intersection with `T` is Ruby's
 * `include`, which leaves every member of the including class in place.
 */
export interface FallbacksMethods {
  extractNonSymbolDefault(options: TranslateOptions): unknown;
}

export function Fallbacks<T extends BackendConstructor>(
  Superclass: T,
): T &
  (abstract new (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see BackendConstructor.
    ...args: any[]
  ) => FallbacksMethods) {
  abstract class Fallbacks extends Superclass {
    /**
     * Overwrites the Base backend translate method so that it will try each
     * locale given by I18n.fallbacks for the given locale. E.g. for the
     * locale "de-DE" it might try the locales "de-DE", "de" and "en"
     * (depends on the fallbacks implementation) until it finds a result with
     * the given options. If it does not find any result for any of the
     * locales it will then throw MissingTranslation as usual.
     *
     * The default option takes precedence over fallback locales only when
     * it's a Symbol. When the default contains a String, Proc or Hash
     * it is evaluated last after all the fallback locales have been tried.
     */
    override translate(
      locale: Locale | null | undefined,
      key: TranslationKey | symbol | null | undefined,
      options: TranslateOptions = EMPTY_HASH,
    ): unknown {
      if (!truthy(fetchFallback(options))) return super.translate(locale, key, options);
      if (truthy(options.fallbackInProgress)) return super.translate(locale, key, options);
      const default_ = truthy(options.default) ? this.extractNonSymbolDefault(options) : undefined;

      const fallbackOptions = {
        ...options,
        fallbackInProgress: true,
        fallbackOriginalLocale: locale,
      };
      for (const fallback of fallbacks().get(locale as Locale)) {
        try {
          // Ruby's `return result` returns from `translate`, not from the
          // `catch(:exception)` block, so the value has to come back out of
          // `catchException` and be told apart from the thrown exception and
          // from a nil result.
          const result = catchException(() => {
            const result = super.translate(fallback, key, fallbackOptions);
            if (result != null) {
              if (String(locale) !== String(fallback)) {
                this.onFallback(locale as Locale, fallback, key, options);
              }
              return result;
            }
            return null;
          });
          if (result != null && !(result instanceof MissingTranslation)) return result;
        } catch (exception) {
          // we do nothing when the locale is invalid, as this is a fallback anyways.
          if (!(exception instanceof InvalidLocale)) throw exception;
        }
      }

      if ("default" in options && options.default == null) return null;

      if (truthy(default_)) {
        return super.translate(locale, null, { ...options, default: default_ });
      }
      throwException(new MissingTranslation(locale as Locale, key as TranslationKey, options));
    }

    protected override resolveEntry(
      locale: Locale,
      object: TranslationKey | symbol | null | undefined,
      subject: unknown,
      options: TranslateOptions = EMPTY_HASH,
    ): unknown {
      if (options.resolve === false) return subject;
      const result = catchException(() => {
        if ("fallbackInProgress" in options) delete options.fallbackInProgress;

        if (typeof subject === "symbol") {
          return t(subject, {
            ...options,
            locale: options.fallbackOriginalLocale as Locale,
            throw: true,
            skipInterpolation: true,
          });
        } else if (typeof subject === "function") {
          const dateOrTime = truthy(options.object) ? options.object : object;
          delete options.object;
          return this.resolveEntry(
            options.fallbackOriginalLocale as Locale,
            object,
            (subject as (value: unknown, options: TranslateOptions) => unknown)(
              dateOrTime,
              options,
            ),
          );
        } else {
          return subject;
        }
      });
      return result instanceof MissingTranslation ? null : result;
    }

    extractNonSymbolDefault(options: TranslateOptions): unknown {
      const defaults = [options.default].flat(Infinity as 1);
      // A Ruby Symbol default is a real JS symbol here, which is what
      // `Base#resolve` already dispatches on (base.rb:203); converging both
      // onto the `":name"` spelling is story
      // `i18n-symbol-values-are-colon-strings`.
      const firstNonSymbolDefault = defaults.find((default_) => typeof default_ !== "symbol");
      if (truthy(firstNonSymbolDefault)) {
        options.default = defaults.slice(0, defaults.indexOf(firstNonSymbolDefault));
      }
      return firstNonSymbolDefault;
    }

    override exists(
      locale: Locale,
      key: TranslationKey | symbol,
      options: TranslateOptions = EMPTY_HASH,
    ): boolean {
      if (!truthy(fetchFallback(options))) return super.exists(locale, key, options);
      for (const fallback of fallbacks().get(locale)) {
        try {
          if (super.exists(fallback, key, options)) return true;
        } catch (exception) {
          // we do nothing when the locale is invalid, as this is a fallback anyways.
          if (!(exception instanceof InvalidLocale)) throw exception;
        }
      }

      return false;
    }

    /** Overwrite onFallback to add specified logic when the fallback succeeds. */
    protected onFallback(
      _originalLocale: Locale,
      _fallbackLocale: Locale,
      _key: TranslationKey | symbol | null | undefined,
      _options: TranslateOptions,
    ): unknown {
      return null;
    }
  }

  return Fallbacks;
}
