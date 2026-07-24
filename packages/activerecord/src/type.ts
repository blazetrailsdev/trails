/**
 * Mirrors: ActiveRecord::Type
 *
 * Re-exports ActiveModel types under ActiveRecord::Type and adds
 * AR-specific types (Date, DateTime, Time with timezone, Text, Json, etc.).
 */
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
  // trails-only: a model may carry a directly-assigned adapter instead of an
  // established connection (`Base._adapter`). Rails has no analogue — every
  // model resolves through a pool — so `adapter_name_from` has nothing to read
  // it from.
  _adapter?: { adapterName?: string } | null;
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

/** Mirrors Rails' `ActiveRecord::Type.registry` (attr_accessor getter). */
export function registry(): AdapterSpecificRegistry {
  return _registry;
}

/**
 * Mirrors Rails' `ActiveRecord::Type.registry=` (attr_accessor setter).
 *
 * Replaces the active registry wholesale. Callers are responsible for
 * re-registering any types they need — this is intentional: Rails' own
 * TypeTest swaps in a blank AdapterSpecificRegistry per test and restores
 * the original in teardown, so a pre-populated registry is not the default.
 */
export function setRegistry(r: AdapterSpecificRegistry): void {
  _registry = r;
  _defaultValue = undefined;
}

export function setCurrentAdapterResolver(resolver: () => AdapterNameSource): void {
  _currentAdapterResolver = resolver;
}

export function register(
  typeName: string,
  klass?: (new (...args: any[]) => Type) | null,
  options?: { adapter?: string; override?: boolean },
  block?: (...args: unknown[]) => Type,
): void {
  _registry.register(typeName, klass, options, block);
}

/** Mirrors: ActiveRecord::Type.add_modifier */
export function addModifier(
  options: Record<string, unknown>,
  klass: new (subtype: Type) => Type,
  registrationOptions?: { adapter?: string },
): void {
  _registry.addModifier(options, klass, registrationOptions);
}

export function lookup(
  symbol: string,
  options?: { adapter?: string; [key: string]: unknown },
): Type {
  const adapter = options?.adapter ?? currentAdapterName();
  return _registry.lookup(symbol, { ...options, adapter });
}

export function defaultValue(): Type {
  return (_defaultValue ??= new ValueType());
}

/**
 * Return the normalized adapter name for a given model's connection,
 * matching the keys used for adapter-specific type registrations.
 *
 * Mirrors: ActiveRecord::Type.adapter_name_from
 */
export function adapterNameFrom(model: AdapterNameSource): AdapterName {
  // A directly-assigned adapter (see AdapterNameSource) IS the model's
  // connection and has no pool, so it both outranks the pool the class would
  // otherwise inherit from Base and is the only place its name can be read.
  const directAdapterName = model._adapter?.adapterName;
  if (directAdapterName) return adapterNameFromConfig(directAdapterName);

  let configAdapter: string | undefined;
  try {
    configAdapter = model.connectionDbConfig()?.adapter;
  } catch (error) {
    // Deviation: Rails lets `connection_db_config`'s ConnectionNotEstablished
    // propagate. trails resolves adapter names during module load and during
    // `attribute()` declarations that run before `establishConnection`, so an
    // unconfigured model degrades to the default adapter instead of raising.
    // Narrowed on purpose: any other error is a real bug and must not be masked.
    if (!(error instanceof ConnectionNotEstablished)) throw error;
    return "sqlite";
  }
  return adapterNameFromConfig(configAdapter);
}

// currentAdapterName is private in Rails — exposed here for api:compare parity only.
/** @internal */
export function currentAdapterName(): AdapterName {
  const base = _currentAdapterResolver?.();
  return base ? adapterNameFrom(base) : "sqlite";
}

// Override ActiveModel's type registry with AR-specific types so that
// Model.attribute() calls resolve to timezone-aware Date/DateTime/Time,
// AR's Text, Json, etc.
typeRegistry.register("date", () => new Date()); // boundary: AR Type::Date class, not JS Date
typeRegistry.register("datetime", () => new DateTime());
typeRegistry.register("time", () => new Time());
typeRegistry.register("text", () => new Text());
typeRegistry.register("json", () => new Json());
