import { typeRegistry, TypeRegistry, type TypeClass, type TypeFactory } from "./type/registry.js";
import { Type, ValueType } from "./type/value.js";
import { BigIntegerType } from "./type/big-integer.js";
import { BinaryType } from "./type/binary.js";
import { BooleanType } from "./type/boolean.js";
import { DateType } from "./type/date.js";
import { DateTimeType } from "./type/date-time.js";
import { DecimalType } from "./type/decimal.js";
import { FloatType } from "./type/float.js";
import { ImmutableStringType } from "./type/immutable-string.js";
import { IntegerType } from "./type/integer.js";
import { StringType } from "./type/string.js";
import { TimeType } from "./type/time.js";

export { Type } from "./type/value.js";

export function registry(): TypeRegistry {
  return typeRegistry;
}

export function register(
  typeName: string,
  klass: TypeClass | null = null,
  block?: TypeFactory,
): void {
  typeRegistry.register(typeName, klass, block);
}

export function lookup(name: string, ...args: unknown[]): Type {
  return typeRegistry.lookup(name, ...args);
}

let _defaultValue: ValueType | null = null;

export function defaultValue(): ValueType {
  return (_defaultValue ??= new ValueType());
}

register("big_integer", BigIntegerType);
register("binary", BinaryType);
register("boolean", BooleanType);
register("date", DateType);
register("datetime", DateTimeType);
register("decimal", DecimalType);
register("float", FloatType);
register("immutable_string", ImmutableStringType);
register("integer", IntegerType);
register("string", StringType);
register("time", TimeType);
