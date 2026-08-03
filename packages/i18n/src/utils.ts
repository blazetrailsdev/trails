/**
 * Mirrors: i18n/lib/i18n/utils.rb
 */

/** A translation subtree: Ruby's Symbol-keyed Hash. */
export type TranslationData = { [key: string]: unknown };

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function except(hash: TranslationData, ...keys: string[]): TranslationData {
  const result = { ...hash };
  for (const key of keys) delete result[key];
  return result;
}

export function deepMerge(
  hash: TranslationData,
  otherHash: TranslationData,
  block?: (key: string, thisVal: unknown, otherVal: unknown) => unknown,
): TranslationData {
  return deepMergeInPlace({ ...hash }, otherHash, block);
}

/** Mirrors: I18n::Utils.deep_merge! — mutates and returns `hash`. */
export function deepMergeInPlace(
  hash: TranslationData,
  otherHash: TranslationData,
  block?: (key: string, thisVal: unknown, otherVal: unknown) => unknown,
): TranslationData {
  for (const [key, otherVal] of Object.entries(otherHash)) {
    if (!(key in hash)) {
      hash[key] = otherVal;
      continue;
    }
    const thisVal = hash[key];
    if (isHash(thisVal) && isHash(otherVal)) {
      hash[key] = deepMerge(thisVal, otherVal, block);
    } else if (block) {
      hash[key] = block(key, thisVal, otherVal);
    } else {
      hash[key] = otherVal;
    }
  }
  return hash;
}

/**
 * Mirrors: I18n::Utils.deep_symbolize_keys. JS object keys are already
 * strings, so the Symbol conversion is inherent to the language; what remains
 * observable is the deep copy (and the coercion of numeric/boolean keys to
 * their string form), which this reproduces.
 */
export function deepSymbolizeKeys(hash: TranslationData): TranslationData {
  const result: TranslationData = {};
  for (const [key, value] of Object.entries(hash)) {
    result[key] = deepSymbolizeKeysInObject(value);
  }
  return result;
}

function deepSymbolizeKeysInObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSymbolizeKeysInObject);
  if (isHash(value)) return deepSymbolizeKeys(value);
  return value;
}
