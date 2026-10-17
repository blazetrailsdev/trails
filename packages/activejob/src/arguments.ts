// @ts-nocheck
import {
  HashWithIndifferentAccess,
  withIndifferentAccess,
  transformKeys,
} from "@blazetrails/activesupport";
import { Identification, Locator, MissingModelIdError } from "@blazetrails/globalid";
import {
  StandardError,
  rbObjAsString,
  excSetBacktrace,
  excBacktrace,
  registerConstant,
  ArgumentError,
  excSetupMessage,
  stringToSym,
  rbObjIsKindOf,
  rbCInteger,
  rbCFloat,
  isSymbol,
  rbCString,
  rbObjClass,
  Hash,
  eachKey,
  symbolToS,
  rbHashSRuby2KeywordsHashP,
  rbObjRespondTo,
  toH,
  rbInspect,
  size,
  rbEqual,
  hasKey,
  rtest,
  rbHashSRuby2KeywordsHash,
  rbEqq,
  rbObjClassname,
  Module,
  rbModConstSet,
  extend,
} from "@blazetrails/ruby-compat";
import { rbEnum, rbAsyncEnum, mapBang, eachWithObject, rbDelete } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";
import { serialize as Baseserialize, deserialize as Basedeserialize } from "./serializers.js";

export class DeserializationError extends StandardError {
  [key: string]: any;
  static [key: string]: any;

  constructor(errinfo: any = null) {
    super(`Error while trying to deserialize arguments: ${rbObjAsString(errinfo.message)}`);
    excSetBacktrace(this, excBacktrace(errinfo));
  }
}
registerConstant("ActiveJob::DeserializationError", DeserializationError);
export class SerializationError extends ArgumentError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ActiveJob::SerializationError", SerializationError);
export function serialize(arguments_: any): any {
  return arguments_.map((argument?: any) => Arguments.serializeArgument(argument));
}

export async function deserialize(arguments_: any): Promise<any> {
  try {
    return await await rbAsyncEnum(
      arguments_,
      "map",
      async (argument?: any) => await Arguments.deserializeArgument(argument),
    );
  } catch (error: any) {
    if (error instanceof StandardError) {
      throw excSetupMessage(new DeserializationError(error), error);
    } else {
      throw error;
    }
  }
}

export const GLOBALID_KEY: any = "_aj_globalid";

export const SYMBOL_KEYS_KEY: any = "_aj_symbol_keys";

export const RUBY2_KEYWORDS_KEY: any = "_aj_ruby2_keywords";

export const WITH_INDIFFERENT_ACCESS_KEY: any = "_aj_hash_with_indifferent_access";

export const OBJECT_SERIALIZER_KEY: any = "_aj_serialized";

export const RESERVED_KEYS: any = [
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

export function serializeArgument(argument: any): any {
  let symbolKeys: any, ajHashKey: any, result: any;
  if (
    argument == null ||
    argument === true ||
    argument === false ||
    rbObjIsKindOf(argument, rbCInteger) ||
    rbObjIsKindOf(argument, rbCFloat)
  ) {
    return argument;
  } else if (typeof argument === "string" && !isSymbol(argument)) {
    if (rbObjClass(argument) === rbCString) {
      return argument;
    } else {
      try {
        return Baseserialize(argument);
      } catch (error: any) {
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
    return rbEnum(argument).map((arg?: any) => Arguments.serializeArgument(arg));
  } else if (argument instanceof HashWithIndifferentAccess) {
    return Arguments.serializeIndifferentHash(argument);
  } else if (rbObjIsKindOf(argument, Hash)) {
    symbolKeys = mapBang(
      rbEnum(eachKey(argument)).filter((e: any) => isSymbol(e)),
      (x: any) => (isSymbol(x) ? symbolToS(x) : rbObjAsString(x)),
    );
    ajHashKey = rbHashSRuby2KeywordsHashP(argument) ? RUBY2_KEYWORDS_KEY : SYMBOL_KEYS_KEY;
    result = Arguments.serializeHash(argument);
    result[ajHashKey] = symbolKeys;
    return result;
  } else {
    if (rbObjRespondTo(argument, "isPermitted") && rbObjRespondTo(argument, "toH")) {
      return Arguments.serializeIndifferentHash(toH(argument));
    } else {
      return Baseserialize(argument);
    }
  }
}

export async function deserializeArgument(argument: any): Promise<any> {
  if (
    argument == null ||
    argument === true ||
    argument === false ||
    (typeof argument === "string" && !isSymbol(argument)) ||
    rbObjIsKindOf(argument, rbCInteger) ||
    rbObjIsKindOf(argument, rbCFloat)
  ) {
    return argument;
  } else if (Array.isArray(argument)) {
    return await rbAsyncEnum(
      argument,
      "map",
      async (arg?: any) => await Arguments.deserializeArgument(arg),
    );
  } else if (rbObjIsKindOf(argument, Hash)) {
    if (Arguments.isSerializedGlobalId(argument)) {
      return await Arguments.deserializeGlobalId(argument);
    } else if (Arguments.isCustomSerialized(argument)) {
      return Basedeserialize(argument);
    } else {
      return await Arguments.deserializeHash(argument);
    }
  } else {
    throw new ArgumentError(`Can only deserialize primitive arguments: ${rbInspect(argument)}`);
  }
}

export function isSerializedGlobalId(hash: any): any {
  return rbEqual(size(hash), 1) && hasKey(hash, GLOBALID_KEY);
}

export async function deserializeGlobalId(hash: any): Promise<any> {
  return await Locator.locate(hash[GLOBALID_KEY]);
}

export function isCustomSerialized(hash: any): any {
  return hasKey(hash, OBJECT_SERIALIZER_KEY);
}

export function serializeHash(argument: any): any {
  return eachWithObject(
    argument,
    {},
    ([key, value]: any, hash?: any) =>
      (hash[Arguments.serializeHashKey(key)] = Arguments.serializeArgument(value)),
  );
}

export async function deserializeHash(serializedHash: any): Promise<any> {
  let symbolKeys: any;
  let result: any = await rbAsyncEnum(
    serializedHash,
    "transform_values",
    async (v?: any) => await Arguments.deserializeArgument(v),
  );
  if (rtest(rbDelete(result, WITH_INDIFFERENT_ACCESS_KEY))) {
    result = withIndifferentAccess(result);
  } else if (rtest((symbolKeys = rbDelete(result, SYMBOL_KEYS_KEY)))) {
    result = Arguments.transformSymbolKeys(result, symbolKeys);
  } else if (rtest((symbolKeys = rbDelete(result, RUBY2_KEYWORDS_KEY)))) {
    result = Arguments.transformSymbolKeys(result, symbolKeys);
    result = rbHashSRuby2KeywordsHash(result);
  }
  return result;
}

export function serializeHashKey(key: any): any {
  if (RESERVED_KEYS.some((x: any) => rbEqq(x, key))) {
    throw new SerializationError(`Can't serialize a Hash with reserved key ${rbInspect(key)}`);
  } else if ((typeof key === "string" && !isSymbol(key)) || isSymbol(key)) {
    return isSymbol(key) ? symbolToS(key) : rbObjAsString(key);
  } else {
    throw new SerializationError(
      `Only string and symbol hash keys may be serialized as job arguments, but ${rbInspect(key)} is a ${rbObjClassname(key)}`,
    );
  }
}

export function serializeIndifferentHash(indifferentHash: any): any {
  const result: any = Arguments.serializeHash(indifferentHash);
  result[WITH_INDIFFERENT_ACCESS_KEY] = Arguments.serializeArgument(true);
  return result;
}

export function transformSymbolKeys(hash: any, symbolKeys: any): any {
  return transformKeys(toH(hash), (key?: any) => {
    if (symbolKeys.includes(key)) {
      return stringToSym(key);
    } else {
      return key;
    }
  });
}

export function convertToGlobalIdHash(argument: any): any {
  try {
    return {
      [GLOBALID_KEY]: ((v: any) => (isSymbol(v) ? symbolToS(v) : rbObjAsString(v)))(
        argument.toGlobalId(),
      ),
    };
  } catch (error: any) {
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

export const Arguments: any = new Module();
rbModConstSet(Arguments, "GLOBALID_KEY", GLOBALID_KEY);
rbModConstSet(Arguments, "SYMBOL_KEYS_KEY", SYMBOL_KEYS_KEY);
rbModConstSet(Arguments, "RUBY2_KEYWORDS_KEY", RUBY2_KEYWORDS_KEY);
rbModConstSet(Arguments, "WITH_INDIFFERENT_ACCESS_KEY", WITH_INDIFFERENT_ACCESS_KEY);
rbModConstSet(Arguments, "OBJECT_SERIALIZER_KEY", OBJECT_SERIALIZER_KEY);
rbModConstSet(Arguments, "RESERVED_KEYS", RESERVED_KEYS);
Object.assign(Arguments, {
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
});
{
  extend(Arguments, Arguments);
}
rbModConstSet(ActiveJobSeat, "DeserializationError", DeserializationError);
rbModConstSet(ActiveJobSeat, "SerializationError", SerializationError);
rbModConstSet(ActiveJobSeat, "Arguments", Arguments);
