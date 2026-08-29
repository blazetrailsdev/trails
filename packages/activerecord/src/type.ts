import {
  Type,
  BigIntegerType,
  BinaryType,
  BooleanType,
  DecimalType,
  FloatType,
  IntegerType,
  ImmutableStringType,
  StringType,
  ValueType,
  typeRegistry,
} from "@blazetrails/activemodel";
export { Type } from "@blazetrails/activemodel";
import { AdapterSpecificRegistry } from "./type/adapter-specific-registry.js";
import { ConnectionNotEstablished } from "./errors.js";
import type { AdapterName } from "./connection-adapters/abstract-adapter.js";
import { adapterNameFromConfig } from "./connection-adapters/abstract-adapter.js";

import { Date } from "./type/date.js";
import { DateTime } from "./type/date-time.js";
import { Time } from "./type/time.js";
import { Text } from "./type/text.js";
import { Json } from "./type/json.js";

export { Date } from "./type/date.js";
export { DateTime } from "./type/date-time.js";
export { Time } from "./type/time.js";
export { Text } from "./type/text.js";
export { Json } from "./type/json.js";
export { DecimalWithoutScale } from "./type/decimal-without-scale.js";
export { TypeMap } from "./type/type-map.js";
export { HashLookupTypeMap } from "./type/hash-lookup-type-map.js";
export { Serialized } from "./type/serialized.js";
export { UnsignedInteger } from "./type/unsigned-integer.js";
export {
  AdapterSpecificRegistry,
  Registration,
  DecorationRegistration,
  TypeConflictError,
} from "./type/adapter-specific-registry.js";

export const BigInteger = BigIntegerType;
export const Binary = BinaryType;
export const Boolean = BooleanType;
export const Decimal = DecimalType;
export const Float = FloatType;
export const Integer = IntegerType;
export const ImmutableString = ImmutableStringType;
export const String = StringType;
export const Value = ValueType;

let _registry = new AdapterSpecificRegistry();
let _defaultValue: Type | undefined;
let _currentAdapterResolver: (() => AdapterNameSource) | undefined;

export interface AdapterNameSource {
  connectionDbConfig: () => { adapter?: string } | undefined;
  _adapter?: { typeRegistryKey?: AdapterName } | null;
}

_registry.register("big_integer", BigIntegerType, { override: false });
_registry.register("binary", BinaryType, { override: false });
_registry.register("boolean", BooleanType, { override: false });
_registry.register("date", Date, { override: false });
_registry.register("datetime", DateTime, { override: false });
_registry.register("decimal", DecimalType, { override: false });
_registry.register("float", FloatType, { override: false });
_registry.register("integer", IntegerType, { override: false });
_registry.register("immutable_string", ImmutableStringType, { override: false });
_registry.register("json", Json, { override: false });
_registry.register("string", StringType, { override: false });
_registry.register("text", Text, { override: false });
_registry.register("time", Time, { override: false });
_registry.register("value", ValueType, { override: false });

export function registry(r?: AdapterSpecificRegistry): AdapterSpecificRegistry {
  if (r !== undefined) {
    _registry = r;
    _defaultValue = undefined;
  }
  return _registry;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function setCurrentAdapterResolver(resolver: () => AdapterNameSource): void {
  _currentAdapterResolver = resolver;
}

export function register(
  typeName: string,
  klass?: (new (...args: any[]) => Type) | null,
  options?: { adapter?: string; override?: boolean },
  block?: (...args: unknown[]) => Type,
): void {
  registry().register(typeName, klass, options, block);
}

export function addModifier(
  options: Record<string, unknown>,
  klass: new (subtype: Type) => Type,
  registrationOptions?: { adapter?: string },
): void {
  registry().addModifier(options, klass, registrationOptions);
}

export function lookup(
  symbol: string,
  options?: { adapter?: string; [key: string]: unknown },
): Type {
  const adapter = options?.adapter ?? currentAdapterName();
  return registry().lookup(symbol, { ...options, adapter });
}

export function defaultValue(): Type {
  return (_defaultValue ??= new ValueType());
}

export function adapterNameFrom(model: AdapterNameSource): AdapterName {
  const directTypeRegistryKey = model._adapter?.typeRegistryKey;
  if (directTypeRegistryKey) return directTypeRegistryKey;

  let configAdapter: string | undefined;
  try {
    configAdapter = model.connectionDbConfig()?.adapter;
  } catch (error) {
    if (!(error instanceof ConnectionNotEstablished)) throw error;
    return "sqlite";
  }
  return adapterNameFromConfig(configAdapter);
}

/** @internal */
export function currentAdapterName(): AdapterName {
  const base = _currentAdapterResolver?.();
  return base ? adapterNameFrom(base) : "sqlite";
}

typeRegistry.register("date", () => new Date()); // boundary: AR Type::Date class, not JS Date
typeRegistry.register("datetime", () => new DateTime());
typeRegistry.register("time", () => new Time());
typeRegistry.register("text", () => new Text());
typeRegistry.register("json", () => new Json());
