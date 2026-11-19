import { isSymbol, kernelCatch, kernelThrow, rbCallSuper, Thread } from "@blazetrails/ruby-compat";

import { MissingTranslation, InvalidLocale } from "../exceptions.js";
import * as I18n from "../i18n.js";
import { EMPTY_HASH, type Locale, type TranslationKey } from "../i18n.js";
import { Fallbacks as LocaleFallbacks } from "../locale/fallbacks.js";
import type { TranslateOptions } from "./base.js";

export interface FallbacksLike {
  get(locale: Locale): Locale[];
}

let fallbacksStore: FallbacksLike | null | undefined;

export function fallbacks(): FallbacksLike {
  fallbacksStore ??= new LocaleFallbacks();
  return (Thread.current().get(":i18n_fallbacks") as FallbacksLike | null) ?? fallbacksStore;
}

export function setFallbacks(fallbacks: FallbacksLike | Locale[] | null): void {
  fallbacksStore = Array.isArray(fallbacks) ? new LocaleFallbacks(...fallbacks) : fallbacks;
  Thread.current().set(":i18n_fallbacks", fallbacksStore);
}

function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

/** @internal */
export interface FallbacksHost {
  translate(
    locale: Locale | null | undefined,
    key: TranslationKey | null | undefined,
    options?: TranslateOptions,
  ): unknown;
  exists(locale: Locale, key: TranslationKey, options?: TranslateOptions): boolean;
  resolveEntry(
    locale: Locale,
    object: TranslationKey | null | undefined,
    subject: unknown,
    options?: TranslateOptions,
  ): unknown;
  extractNonSymbolDefaultBang(options: TranslateOptions): unknown;
  onFallback(
    originalLocale: Locale,
    fallbackLocale: Locale,
    key: TranslationKey | null | undefined,
    options: TranslateOptions,
  ): unknown;
}
function translate(
  this: FallbacksHost,
  locale: Locale | null | undefined,
  key: TranslationKey | null | undefined,
  options: TranslateOptions = EMPTY_HASH,
): unknown {
  if (!truthy("fallback" in options ? options.fallback : true)) {
    return rbCallSuper(this, translate, locale, key, options);
  }
  if (truthy(options.fallbackInProgress)) return rbCallSuper(this, translate, locale, key, options);
  const default_ = truthy(options.default) ? this.extractNonSymbolDefaultBang(options) : undefined;

  const fallbackOptions = {
    ...options,
    fallbackInProgress: true,
    fallbackOriginalLocale: locale,
  };
  for (const fallback of fallbacks().get(locale as Locale)) {
    try {
      const result = kernelCatch(":exception", () => {
        const result = rbCallSuper(this, translate, fallback, key, fallbackOptions);
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
    return rbCallSuper(this, translate, locale, null, { ...options, default: default_ });
  }
  kernelThrow(
    ":exception",
    new MissingTranslation(locale as Locale, key as TranslationKey, options),
  );
}

function resolveEntry(
  this: FallbacksHost,
  locale: Locale,
  object: TranslationKey | null | undefined,
  subject: unknown,
  options: TranslateOptions = EMPTY_HASH,
): unknown {
  if (options.resolve === false) return subject;
  const result = kernelCatch(":exception", () => {
    if ("fallbackInProgress" in options) delete options.fallbackInProgress;

    if (isSymbol(subject)) {
      return I18n.translate(subject, {
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
        (subject as (value: unknown, options: TranslateOptions) => unknown)(dateOrTime, options),
      );
    } else {
      return subject;
    }
  });
  return result instanceof MissingTranslation ? null : result;
}

function extractNonSymbolDefaultBang(this: FallbacksHost, options: TranslateOptions): unknown {
  const defaults = [options.default].flat(Infinity as 1);
  const firstNonSymbolDefault = defaults.find((default_) => !isSymbol(default_));
  if (truthy(firstNonSymbolDefault)) {
    options.default = defaults.slice(0, defaults.indexOf(firstNonSymbolDefault));
  }
  return firstNonSymbolDefault;
}

function exists(
  this: FallbacksHost,
  locale: Locale,
  key: TranslationKey,
  options: TranslateOptions = EMPTY_HASH,
): boolean {
  if (!truthy("fallback" in options ? options.fallback : true)) {
    return rbCallSuper(this, exists, locale, key, options) as boolean;
  }
  for (const fallback of fallbacks().get(locale)) {
    try {
      if (rbCallSuper(this, exists, fallback, key, options)) return true;
    } catch (exception) {
      if (!(exception instanceof InvalidLocale)) throw exception;
    }
  }

  return false;
}

/** @internal */
function onFallback(
  this: FallbacksHost,
  _originalLocale: Locale,
  _fallbackLocale: Locale,
  _key: TranslationKey | null | undefined,
  _options: TranslateOptions,
): unknown {
  return null;
}

export const Fallbacks = {
  translate,
  resolveEntry,
  extractNonSymbolDefaultBang,
  exists,
  onFallback,
};
