import {
  HashWithIndifferentAccess,
  withIndifferentAccess,
  transformKeys,
} from "@blazetrails/activesupport";
import { Identification, Locator, GlobalIDModel, MissingModelIdError } from "@blazetrails/globalid";
import {
  StandardError,
  excSetBacktrace,
  excBacktrace,
  ArgumentError,
  Enumerator,
  excSetupMessage,
  stringToSym,
  isSymbol,
  rbCString,
  rbObjIsKindOf,
  eachKey,
  symbolToS,
  rbObjAsString,
  Hash,
  rbHashSRuby2KeywordsHashP,
  rbInspect,
  size,
  hasKey,
  hashAref,
  aryDelete,
  hashDelete,
  rbHashSRuby2KeywordsHash,
  rbObjClassname,
  extend,
} from "@blazetrails/ruby-compat";
import { rbAsyncEnum } from "./codegen-runtime.js";
import { Serializers } from "./serializers.js";
import type { DurationParts } from "@blazetrails/activesupport";
import type { GlobalID } from "@blazetrails/globalid";

export class DeserializationError extends StandardError {
  static toString(): string {
    return "ActiveJob::DeserializationError";
  }

  constructor(errinfo: StandardError | null = null) {
    super(`Error while trying to deserialize arguments: ${errinfo!.message ?? ""}`);
    excSetBacktrace(this, excBacktrace(errinfo!));
  }
}
export class SerializationError extends ArgumentError {
  static toString(): string {
    return "ActiveJob::SerializationError";
  }
}
export function serialize(arguments_: unknown[]): unknown[] {
  return (
    arguments_ instanceof globalThis.Set ||
    arguments_ instanceof globalThis.Map ||
    arguments_ instanceof Enumerator
      ? [...arguments_]
      : Object.getPrototypeOf(arguments_) === Object.prototype
        ? Object.entries(arguments_ as object)
        : (arguments_ as unknown[])
  ).map((argument) => Arguments.serializeArgument(argument));
}

export async function deserialize(arguments_: unknown): Promise<unknown[]> {
  try {
    return await (async (self, g) => {
      const xs: unknown[] =
        self instanceof globalThis.Map || self instanceof globalThis.Set
          ? [...self]
          : Array.isArray(self)
            ? self
            : Object.entries((self ?? {}) as object);
      const out: unknown[] = [];
      for (const x of xs) out.push(await g(x));
      return out;
    })(arguments_, async (argument: unknown) => await Arguments.deserializeArgument(argument));
  } catch (error) {
    if (error instanceof StandardError) {
      throw excSetupMessage(new DeserializationError(error), error);
    } else {
      throw error;
    }
  }
}

export const GLOBALID_KEY = "_aj_globalid";

export const SYMBOL_KEYS_KEY = "_aj_symbol_keys";

export const RUBY2_KEYWORDS_KEY = "_aj_ruby2_keywords";

export const WITH_INDIFFERENT_ACCESS_KEY = "_aj_hash_with_indifferent_access";

export const OBJECT_SERIALIZER_KEY = "_aj_serialized";

export const RESERVED_KEYS = [
  GLOBALID_KEY,
  stringToSym(GLOBALID_KEY),
  SYMBOL_KEYS_KEY,
  stringToSym(SYMBOL_KEYS_KEY),
  RUBY2_KEYWORDS_KEY,
  stringToSym(RUBY2_KEYWORDS_KEY),
  OBJECT_SERIALIZER_KEY,
  stringToSym(OBJECT_SERIALIZER_KEY),
  WITH_INDIFFERENT_ACCESS_KEY,
  stringToSym(WITH_INDIFFERENT_ACCESS_KEY),
];

export function serializeArgument(argument: unknown): unknown {
  let symbolKeys, ajHashKey, result;
  if (
    argument == null ||
    argument === true ||
    argument === false ||
    typeof argument === "bigint" ||
    Number.isInteger(argument) ||
    typeof argument === "number"
  ) {
    return argument;
  } else if (typeof argument === "string" && !isSymbol(argument)) {
    if (typeof argument === "string" && !isSymbol(argument)) {
      return argument;
    } else {
      try {
        return Serializers.serialize(argument);
      } catch (error) {
        if (error instanceof SerializationError) {
          return argument;
        } else {
          throw error;
        }
      }
    }
  } else if (rbObjIsKindOf(argument, Identification)) {
    return Arguments.convertToGlobalIdHash(argument);
  } else if (Array.isArray(argument)) {
    return (
      argument instanceof globalThis.Set ||
      argument instanceof globalThis.Map ||
      argument instanceof Enumerator
        ? [...argument]
        : Object.getPrototypeOf(argument) === Object.prototype
          ? Object.entries(argument as object)
          : (argument as unknown[])
    ).map((arg): unknown => Arguments.serializeArgument(arg));
  } else if (argument instanceof HashWithIndifferentAccess) {
    return Arguments.serializeIndifferentHash(argument);
  } else if (
    typeof argument === "object" &&
    argument !== null &&
    ([Object.prototype, null].includes(Object.getPrototypeOf(argument)) ||
      (argument instanceof Map && argument.constructor !== Map))
  ) {
    symbolKeys = ((x) => (
      x.splice(0, x.length, ...x.map((x) => (isSymbol(x) ? symbolToS(x) : rbObjAsString(x)))),
      x
    ))([...(eachKey(argument) as Iterable<unknown>)].filter((e) => isSymbol(e)));
    ajHashKey = rbHashSRuby2KeywordsHashP(argument) ? RUBY2_KEYWORDS_KEY : SYMBOL_KEYS_KEY;
    result = Arguments.serializeHash(argument);
    result[ajHashKey] = symbolKeys;
    return result;
  } else {
    if ("isPermitted" in Object(argument) && "toH" in Object(argument)) {
      return Arguments.serializeIndifferentHash(argument.toH());
    } else {
      return Serializers.serialize(argument);
    }
  }
}

export async function deserializeArgument(argument: unknown) {
  if (
    argument == null ||
    argument === true ||
    argument === false ||
    (typeof argument === "string" && !isSymbol(argument)) ||
    typeof argument === "bigint" ||
    Number.isInteger(argument) ||
    typeof argument === "number"
  ) {
    return argument;
  } else if (Array.isArray(argument)) {
    return await (async (self, g) => {
      const xs: unknown[] =
        self instanceof globalThis.Map || self instanceof globalThis.Set
          ? [...self]
          : Array.isArray(self)
            ? self
            : Object.entries((self ?? {}) as object);
      const out: unknown[] = [];
      for (const x of xs) out.push(await g(x));
      return out;
    })(argument, async (arg: unknown) => await Arguments.deserializeArgument(arg));
  } else if (
    typeof argument === "object" &&
    argument !== null &&
    ([Object.prototype, null].includes(Object.getPrototypeOf(argument)) ||
      (argument instanceof Map && argument.constructor !== Map))
  ) {
    if (Arguments.isSerializedGlobalId(argument)) {
      return await Arguments.deserializeGlobalId(argument);
    } else if (Arguments.isCustomSerialized(argument)) {
      return Serializers.deserialize(argument);
    } else {
      return await Arguments.deserializeHash(argument);
    }
  } else {
    throw new ArgumentError(`Can only deserialize primitive arguments: ${rbInspect(argument)}`);
  }
}

export function isSerializedGlobalId(hash: Map<unknown, unknown>): boolean {
  return size(hash) === 1 && hasKey(hash, GLOBALID_KEY);
}

export async function deserializeGlobalId(hash: Map<unknown, unknown>) {
  return await Locator.locate(hashAref(hash, GLOBALID_KEY) as string | GlobalID);
}

export function isCustomSerialized(hash: Map<unknown, unknown>): boolean {
  return hasKey(hash, OBJECT_SERIALIZER_KEY);
}

export function serializeHash(argument: Map<unknown, unknown>): Record<string, unknown> {
  return (
    argument instanceof globalThis.Map
      ? [...argument]
      : Array.isArray(argument)
        ? argument
        : Object.entries(argument ?? {})
  ).reduce(
    (memo, x) => (
      (([key, value]: [unknown, unknown], hash?: Record<string, unknown> | null) =>
        (hash[Arguments.serializeHashKey(key)] = Arguments.serializeArgument(value)))(x, memo),
      memo
    ),
    {},
  );
}

export async function deserializeHash(serializedHash: Map<unknown, unknown>) {
  let symbolKeys;
  let result = await rbAsyncEnum(
    serializedHash,
    "transform_values",
    async (v: unknown) => await Arguments.deserializeArgument(v),
  );
  if (
    ((Array.isArray(result)
      ? aryDelete(result, WITH_INDIFFERENT_ACCESS_KEY)
      : hashDelete(result, WITH_INDIFFERENT_ACCESS_KEY)) ?? false) !== false
  ) {
    result = withIndifferentAccess(result);
  } else if (
    ((symbolKeys = Array.isArray(result)
      ? aryDelete(result, SYMBOL_KEYS_KEY)
      : hashDelete(result, SYMBOL_KEYS_KEY)) ?? false) !== false
  ) {
    result = Arguments.transformSymbolKeys(result, symbolKeys);
  } else if (((symbolKeys = hashDelete(result, RUBY2_KEYWORDS_KEY)) ?? false) !== false) {
    result = Arguments.transformSymbolKeys(result, symbolKeys as string[]);
    result = rbHashSRuby2KeywordsHash(result);
  }
  return result;
}

export function serializeHashKey(key: unknown): string {
  if (RESERVED_KEYS.some((x: unknown) => x === key)) {
    throw new SerializationError(`Can't serialize a Hash with reserved key ${rbInspect(key)}`);
  } else if ((typeof key === "string" && !isSymbol(key)) || isSymbol(key)) {
    return isSymbol(key) ? symbolToS(key) : rbObjAsString(key);
  } else {
    throw new SerializationError(
      `Only string and symbol hash keys may be serialized as job arguments, but ${rbInspect(key)} is a ${rbObjClassname(key)}`,
    );
  }
}

export function serializeIndifferentHash(
  indifferentHash: Map<unknown, unknown>,
): Record<string, unknown> {
  const result = Arguments.serializeHash(indifferentHash);
  result[WITH_INDIFFERENT_ACCESS_KEY] = Arguments.serializeArgument(true);
  return result;
}

export function transformSymbolKeys(
  hash: Map<unknown, unknown>,
  symbolKeys: string[],
): Map<unknown, unknown> {
  return transformKeys(
    Array.isArray(hash)
      ? Object.fromEntries(hash)
      : typeof hash?.toH === "function"
        ? hash.toH()
        : hash,
    (key) => {
      if (symbolKeys.includes(key)) {
        return stringToSym(key);
      } else {
        return key;
      }
    },
  );
}

export function convertToGlobalIdHash(argument: GlobalIDModel) {
  try {
    return {
      [GLOBALID_KEY]: ((v) => (isSymbol(v) ? symbolToS(v) : rbObjAsString(v)))(
        argument.toGlobalId(),
      ),
    };
  } catch (error) {
    if (error instanceof MissingModelIdError) {
      throw excSetupMessage(
        new SerializationError(
          `${`Unable to serialize ${rbObjClassname(argument)} `}without an id. (Maybe you forgot to call save?)`,
        ),
        error,
      );
    } else {
      throw error;
    }
  }
}

export const Arguments = {
  name: "ActiveJob::Arguments",
  GLOBALID_KEY,
  SYMBOL_KEYS_KEY,
  RUBY2_KEYWORDS_KEY,
  WITH_INDIFFERENT_ACCESS_KEY,
  OBJECT_SERIALIZER_KEY,
  RESERVED_KEYS,
  serialize,
  deserialize,
  serializeArgument,
  deserializeArgument,
  isSerializedGlobalId,
  deserializeGlobalId,
  isCustomSerialized,
  serializeHash,
  deserializeHash,
  serializeHashKey,
  serializeIndifferentHash,
  transformSymbolKeys,
  convertToGlobalIdHash,
};
{
  extend(Arguments, Arguments);
}
