import { isSymbol } from "@blazetrails/ruby-compat";

import { MissingTranslation, InvalidLocale } from "../exceptions.js";
import { EMPTY_HASH, translate, type Locale, type TranslationKey } from "../i18n.js";
import { Fallbacks as LocaleFallbacks } from "../locale/fallbacks.js";
import { catchException, throwException } from "../throw-catch.js";
import type { Base, TranslateOptions } from "./base.js";

export interface FallbacksLike {
  get(locale: Locale): Locale[];
}

let fallbacksStore: FallbacksLike | null | undefined;

export function fallbacks(): FallbacksLike {
  fallbacksStore ??= new LocaleFallbacks();
  return fallbacksStore;
}

export function setFallbacks(fallbacks: FallbacksLike | Locale[] | null): void {
  fallbacksStore = Array.isArray(fallbacks) ? new LocaleFallbacks(...fallbacks) : fallbacks;
}

function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

type BackendConstructor = abstract new (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => Base;

export interface FallbacksMethods {
  extractNonSymbolDefaultBang(options: TranslateOptions): unknown;
}

export function Fallbacks<T extends BackendConstructor>(
  Superclass: T,
): T &
  (abstract new (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see BackendConstructor.
    ...args: any[]
  ) => FallbacksMethods) {
  abstract class Fallbacks extends Superclass {
    override translate(
      locale: Locale | null | undefined,
      key: TranslationKey | null | undefined,
      options: TranslateOptions = EMPTY_HASH,
    ): unknown {
      if (!truthy("fallback" in options ? options.fallback : true)) {
        return super.translate(locale, key, options);
      }
      if (truthy(options.fallbackInProgress)) return super.translate(locale, key, options);
      const default_ = truthy(options.default)
        ? this.extractNonSymbolDefaultBang(options)
        : undefined;

      const fallbackOptions = {
        ...options,
        fallbackInProgress: true,
        fallbackOriginalLocale: locale,
      };
      for (const fallback of fallbacks().get(locale as Locale)) {
        try {
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
      object: TranslationKey | null | undefined,
      subject: unknown,
      options: TranslateOptions = EMPTY_HASH,
    ): unknown {
      if (options.resolve === false) return subject;
      const result = catchException(() => {
        if ("fallbackInProgress" in options) delete options.fallbackInProgress;

        if (isSymbol(subject)) {
          return translate(subject, {
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

    extractNonSymbolDefaultBang(options: TranslateOptions): unknown {
      const defaults = [options.default].flat(Infinity as 1);
      const firstNonSymbolDefault = defaults.find((default_) => !isSymbol(default_));
      if (truthy(firstNonSymbolDefault)) {
        options.default = defaults.slice(0, defaults.indexOf(firstNonSymbolDefault));
      }
      return firstNonSymbolDefault;
    }

    override exists(
      locale: Locale,
      key: TranslationKey,
      options: TranslateOptions = EMPTY_HASH,
    ): boolean {
      if (!truthy("fallback" in options ? options.fallback : true)) {
        return super.exists(locale, key, options);
      }
      for (const fallback of fallbacks().get(locale)) {
        try {
          if (super.exists(fallback, key, options)) return true;
        } catch (exception) {
          if (!(exception instanceof InvalidLocale)) throw exception;
        }
      }

      return false;
    }

    protected onFallback(
      _originalLocale: Locale,
      _fallbackLocale: Locale,
      _key: TranslationKey | null | undefined,
      _options: TranslateOptions,
    ): unknown {
      return null;
    }
  }

  return Fallbacks;
}
