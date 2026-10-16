import { Hash, hashAref, hashAset, hasKey, rbObjDup } from "@blazetrails/ruby-compat";

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
  return deepMergeBang(rbObjDup(hash), otherHash, block);
}

export function deepMergeBang(
  hash: TranslationData,
  otherHash: TranslationData,
  block?: (key: string, thisVal: unknown, otherVal: unknown) => unknown,
): TranslationData {
  for (let [key, otherVal] of otherHash instanceof Map
    ? (otherHash as Map<unknown, unknown>)
    : Object.entries(otherHash)) {
    if (hash instanceof Map && !(otherHash instanceof Map)) key = `:${key as string}`;
    else if (!(hash instanceof Map) && otherHash instanceof Map && typeof key === "string") {
      key = key.startsWith(":") ? key.slice(1) : key;
      if (
        otherVal instanceof Map &&
        [...otherVal.keys()].every((k) => typeof k === "string" && k.startsWith(":"))
      ) {
        const frozen = Object.isFrozen(otherVal);
        otherVal = deepMergeBang({}, otherVal as unknown as TranslationData);
        if (frozen) Object.freeze(otherVal);
      }
    }
    if (!hasKey(hash, key as string)) {
      hashAset(hash, key, otherVal);
      continue;
    }
    const thisVal = hashAref(hash, key);
    if (isHash(thisVal) && isHash(otherVal)) {
      hashAset(hash, key, deepMerge(thisVal, otherVal, block));
    } else if (block) {
      hashAset(hash, key, block(key as string, thisVal, otherVal));
    } else {
      hashAset(hash, key, otherVal);
    }
  }
  return hash;
}

export function deepSymbolizeKeys(hash: TranslationData | Map<unknown, unknown>): TranslationData {
  if (hash instanceof Map) {
    const result = new Hash<unknown, unknown>();
    for (const [key, value] of hash) {
      result.set(
        typeof key === "string" && !key.startsWith(":") ? `:${key}` : key,
        deepSymbolizeKeysInObject(value),
      );
    }
    return result as unknown as TranslationData;
  }
  const result: TranslationData = {};
  for (const [key, value] of Object.entries(hash)) {
    result[key] = deepSymbolizeKeysInObject(value);
  }
  return result;
}

/** @internal */
function deepSymbolizeKeysInObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSymbolizeKeysInObject);
  if (isHash(value)) return deepSymbolizeKeys(value);
  return value;
}
