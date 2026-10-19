import {
  HashWithIndifferentAccess,
  transformKeys,
  withIndifferentAccess,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  eachKey,
  eachPair,
  Exception,
  excBacktrace,
  excSetBacktrace,
  hashAref,
  hashAset,
  hasKey,
  hashDelete,
  Hash,
  rbCFloat,
  rbCInteger,
  rbCString,
  rbHashSRuby2KeywordsHash,
  rbHashSRuby2KeywordsHashP,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjClass,
  rbObjIsKindOf,
  rbObjRespondTo,
  size,
  rtest,
  StandardError,
  isSymbol,
  stringToSym,
  symbolToS,
  toH,
  transformValues,
} from "@blazetrails/ruby-compat";
import { GlobalID, type GlobalIDModel, Locator, MissingModelIdError } from "@blazetrails/globalid";
import { ActiveJob } from "./namespaces.js";
import { Serializers } from "./serializers.js";

export class DeserializationError extends StandardError {
  static toString(): string {
    return "ActiveJob::DeserializationError";
  }

  constructor(errinfo: unknown) {
    super(`Error while trying to deserialize arguments: ${(errinfo as Error).message}`, {
      cause: errinfo,
    });
    this.name = "ActiveJob::DeserializationError";
    excSetBacktrace(this, excBacktrace(errinfo as Error));
  }
}
rbModConstSet(ActiveJob, "DeserializationError", DeserializationError);

export class SerializationError extends ArgumentError {
  static toString(): string {
    return "ActiveJob::SerializationError";
  }

  constructor(message?: string) {
    super(message);
    this.name = "ActiveJob::SerializationError";
  }
}
rbModConstSet(ActiveJob, "SerializationError", SerializationError);

type Enumerable = Iterable<unknown> | Record<string, unknown>;

/** @inventedArm entries — PERMANENT */
export function serialize(arguments_: Enumerable): unknown[] {
  return Array.from(
    Symbol.iterator in Object(arguments_)
      ? (arguments_ as Iterable<unknown>)
      : Object.entries(arguments_),
    (argument) => serializeArgument(argument),
  );
}

/** @inventedArm entries — PERMANENT */
export async function deserialize(arguments_: Enumerable): Promise<unknown[]> {
  try {
    return await Promise.all(
      Array.from(
        Symbol.iterator in Object(arguments_)
          ? (arguments_ as Iterable<unknown>)
          : Object.entries(arguments_),
        (argument) => deserializeArgument(argument),
      ),
    );
  } catch (error) {
    if (error instanceof Exception && !(error instanceof StandardError)) throw error;
    throw new DeserializationError(error);
  }
}

const GLOBALID_KEY = "_aj_globalid";
const SYMBOL_KEYS_KEY = "_aj_symbol_keys";
const RUBY2_KEYWORDS_KEY = "_aj_ruby2_keywords";
const WITH_INDIFFERENT_ACCESS_KEY = "_aj_hash_with_indifferent_access";
export const OBJECT_SERIALIZER_KEY = "_aj_serialized";

const RESERVED_KEYS = [
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

type AnyHash = Record<string, unknown> | Map<string, unknown>;

/**
 * @internal
 * @inventedArm isSymbol — PERMANENT
 */
function serializeArgument(argument: unknown): unknown {
  if (
    argument == null ||
    argument === true ||
    argument === false ||
    rbObjIsKindOf(argument, rbCInteger) ||
    rbObjIsKindOf(argument, rbCFloat)
  ) {
    return argument;
  } else if (rbObjIsKindOf(argument, rbCString) && !isSymbol(argument)) {
    if (rbObjClass(argument) === rbCString) {
      return argument;
    } else {
      try {
        return Serializers.serialize(argument);
      } catch (error) {
        if (!(error instanceof SerializationError)) throw error;
        return argument;
      }
    }
  } else if (rbObjIsKindOf(argument, GlobalID.Identification)) {
    return convertToGlobalIdHash(argument as GlobalIDModel);
  } else if (Array.isArray(argument)) {
    return argument.map((arg) => serializeArgument(arg));
  } else if (argument instanceof HashWithIndifferentAccess) {
    return serializeIndifferentHash(argument);
  } else if (rbObjIsKindOf(argument, Hash)) {
    const symbolKeys = eachKey(argument as AnyHash)
      .filter((key) => isSymbol(key))
      .map((key) => symbolToS(key));
    const ajHashKey = rbHashSRuby2KeywordsHashP(argument as object)
      ? RUBY2_KEYWORDS_KEY
      : SYMBOL_KEYS_KEY;
    const result = serializeHash(argument as AnyHash);
    result[ajHashKey] = symbolKeys;
    return result;
  } else {
    if (rbObjRespondTo(argument, "isPermitted") && rbObjRespondTo(argument, "toH")) {
      return serializeIndifferentHash((argument as { toH(): AnyHash }).toH());
    } else {
      return Serializers.serialize(argument);
    }
  }
}

/** @internal */
async function deserializeArgument(argument: unknown): Promise<unknown> {
  if (
    argument == null ||
    argument === true ||
    argument === false ||
    rbObjIsKindOf(argument, rbCString) ||
    rbObjIsKindOf(argument, rbCInteger) ||
    rbObjIsKindOf(argument, rbCFloat)
  ) {
    return argument;
  } else if (Array.isArray(argument)) {
    return Promise.all(argument.map((arg) => deserializeArgument(arg)));
  } else if (rbObjIsKindOf(argument, Hash)) {
    if (isSerializedGlobalId(argument as AnyHash)) {
      return deserializeGlobalId(argument as AnyHash);
    } else if (isCustomSerialized(argument as AnyHash)) {
      return Serializers.deserialize(argument as Record<string, unknown>);
    } else {
      return deserializeHash(argument as AnyHash);
    }
  } else {
    throw new ArgumentError(`Can only deserialize primitive arguments: ${rbInspect(argument)}`);
  }
}

/** @internal */
function isSerializedGlobalId(hash: AnyHash): boolean {
  return size(hash) === 1 && hasKey(hash, GLOBALID_KEY);
}

/** @internal */
function deserializeGlobalId(hash: AnyHash): Promise<unknown> {
  return Locator.locate(hashAref(hash, GLOBALID_KEY) as string);
}

/** @internal */
function isCustomSerialized(hash: AnyHash): boolean {
  return hasKey(hash, OBJECT_SERIALIZER_KEY);
}

/** @internal */
function serializeHash(argument: AnyHash): Record<string, unknown> {
  const hash: Record<string, unknown> = {};
  eachPair(argument, (key, value) => {
    hashAset(hash, serializeHashKey(key), serializeArgument(value));
  });
  return hash;
}

/** @internal */
async function deserializeHash(serializedHash: AnyHash): Promise<unknown> {
  let result = transformValues(serializedHash, (v) => deserializeArgument(v)) as AnyHash;
  for (const key of eachKey(result)) hashAset(result, key, await hashAref(result, key));
  let symbolKeys: unknown;
  if (rtest(hashDelete(result, WITH_INDIFFERENT_ACCESS_KEY))) {
    result = withIndifferentAccess(result as Record<string, unknown>);
  } else if (rtest((symbolKeys = hashDelete(result, SYMBOL_KEYS_KEY)))) {
    result = transformSymbolKeys(result, symbolKeys as string[]);
  } else if (rtest((symbolKeys = hashDelete(result, RUBY2_KEYWORDS_KEY)))) {
    result = transformSymbolKeys(result, symbolKeys as string[]);
    result = rbHashSRuby2KeywordsHash(result);
  }
  return result;
}

/** @internal */
function serializeHashKey(key: unknown): string {
  if (RESERVED_KEYS.includes(key as string)) {
    throw new SerializationError(`Can't serialize a Hash with reserved key ${rbInspect(key)}`);
  } else if (typeof key === "string") {
    return isSymbol(key) ? symbolToS(key) : key;
  } else {
    throw new SerializationError(
      `Only string and symbol hash keys may be serialized as job arguments, but ${rbInspect(key)} is a ${rbModName(rbObjClass(key))}`,
    );
  }
}

/** @internal */
function serializeIndifferentHash(indifferentHash: AnyHash): Record<string, unknown> {
  const result = serializeHash(indifferentHash);
  result[WITH_INDIFFERENT_ACCESS_KEY] = serializeArgument(true);
  return result;
}

/** @internal */
function transformSymbolKeys(hash: AnyHash, symbolKeys: string[]): AnyHash {
  return transformKeys(toH(hash), (key: string) => {
    if (symbolKeys.includes(key)) {
      return stringToSym(key);
    } else {
      return key;
    }
  });
}

/** @internal */
function convertToGlobalIdHash(argument: GlobalIDModel): Record<string, unknown> {
  try {
    return {
      [GLOBALID_KEY]: (argument as GlobalIDModel & { toGlobalId(): GlobalID })
        .toGlobalId()
        .toString(),
    };
  } catch (error) {
    if (!(error instanceof MissingModelIdError)) throw error;
    throw new SerializationError(
      `Unable to serialize ${rbModName(rbObjClass(argument))} without an id. (Maybe you forgot to call save?)`,
    );
  }
}

export const Arguments = { serialize, deserialize, OBJECT_SERIALIZER_KEY };
rbModConstSet(ActiveJob, "Arguments", Arguments);
