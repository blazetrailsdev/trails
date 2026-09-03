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
  return deepMergeBang({ ...hash }, otherHash, block);
}

export function deepMergeBang(
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

export function deepSymbolizeKeys(hash: TranslationData): TranslationData {
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
