import { defineModule, rbCallSuper, toSym } from "@blazetrails/ruby-compat";

import { EMPTY_HASH, newDoubleNestedCache, type TranslationKey } from "../i18n.js";
import type { Locale } from "../locale.js";
import type { TranslationData } from "../utils.js";
import type { TranslateOptions } from "./base.js";
import { Flatten } from "./flatten.js";

interface MemoizeHost {
  memoizedLocales?: Locale[] | null;
  memoizedLookupStore?: Map<string, Map<string, unknown>>;
  memoizedLookup(): Map<string, Map<string, unknown>>;
  resetMemoizationsBang(locale?: Locale | null): void;
}

function availableLocales(this: MemoizeHost): Locale[] {
  return (this.memoizedLocales ||= rbCallSuper(this, availableLocales) as Locale[]);
}

function storeTranslations(
  this: MemoizeHost,
  locale: Locale,
  data: TranslationData | Record<string, unknown>,
  options: TranslateOptions = EMPTY_HASH,
): unknown {
  this.resetMemoizationsBang(locale);
  return rbCallSuper(this, storeTranslations, locale, data, options);
}

async function reloadBang(this: MemoizeHost): Promise<void> {
  this.resetMemoizationsBang();
  await rbCallSuper(this, reloadBang);
}

async function eagerLoadBang(this: MemoizeHost): Promise<void> {
  this.memoizedLookup();
  (this as unknown as { availableLocales(): Locale[] }).availableLocales();
  await rbCallSuper(this, eagerLoadBang);
}

function lookup(
  this: MemoizeHost,
  locale: Locale,
  key: TranslationKey,
  scope: unknown = null,
  options: TranslateOptions = EMPTY_HASH,
): unknown {
  const flatKey = toSym(
    Flatten.normalizeFlatKeys(locale, key, scope, options.separator as string | undefined),
  );
  const memoizedLookup = this.memoizedLookup();
  let flatHash = memoizedLookup.get(toSym(locale));
  if (flatHash === undefined) {
    flatHash = new Map();
    memoizedLookup.set(toSym(locale), flatHash);
  }
  if (flatHash.has(flatKey)) return flatHash.get(flatKey);
  const result = rbCallSuper(this, lookup, locale, key, scope, options);
  flatHash.set(flatKey, result);
  return result;
}

function memoizedLookup(this: MemoizeHost): Map<string, Map<string, unknown>> {
  return (this.memoizedLookupStore ||= newDoubleNestedCache<string, unknown>());
}

function resetMemoizationsBang(this: MemoizeHost, locale: Locale | null = null): void {
  this.memoizedLocales = null;
  if (locale != null) this.memoizedLookup().get(toSym(locale))?.clear();
  else this.memoizedLookup().clear();
}

export const Memoize = defineModule(
  { availableLocales, storeTranslations, reloadBang, eagerLoadBang },
  { lookup, memoizedLookup, resetMemoizationsBang },
);
