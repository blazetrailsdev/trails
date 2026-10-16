import {
  Hash,
  block as rbBlock,
  except as hashExcept,
  rbObjDup,
  update,
} from "@blazetrails/ruby-compat";

export type TranslationData = Hash<unknown, unknown>;

function isHash(value: unknown): value is TranslationData | Record<string, unknown> {
  if (value instanceof Map) return true;
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function except<T extends object>(hash: T, ...keys: unknown[]): T {
  return hashExcept(hash as Record<string, unknown>, ...(keys as string[])) as unknown as T;
}

export function deepMerge(
  hash: TranslationData,
  otherHash: TranslationData,
  block?: (key: unknown, thisVal: unknown, otherVal: unknown) => unknown,
): TranslationData {
  return deepMergeBang(rbObjDup(hash), otherHash, block);
}

export function deepMergeBang(
  hash: TranslationData,
  otherHash: TranslationData,
  block?: (key: unknown, thisVal: unknown, otherVal: unknown) => unknown,
): TranslationData {
  return update(
    hash as unknown as Map<string, unknown>,
    otherHash as unknown as Map<string, unknown>,
    rbBlock((key: string, thisVal: unknown, otherVal: unknown) => {
      if (isHash(thisVal) && isHash(otherVal)) {
        return deepMerge(thisVal as TranslationData, otherVal as TranslationData, block);
      } else if (block) {
        return block(key, thisVal, otherVal);
      } else {
        return otherVal;
      }
    }),
  ) as unknown as TranslationData;
}

export function deepSymbolizeKeys(hash: object): TranslationData {
  const result: TranslationData = new Hash();
  for (const [key, value] of hash instanceof Map ? hash : Object.entries(hash)) {
    result.set(
      typeof key === "string" && !key.startsWith(":") ? `:${key}` : key,
      deepSymbolizeKeysInObject(value),
    );
  }
  return result;
}

/** @internal */
function deepSymbolizeKeysInObject(value: unknown): unknown {
  if (isHash(value)) return deepSymbolizeKeys(value);
  if (Array.isArray(value)) return value.map(deepSymbolizeKeysInObject);
  return value;
}
