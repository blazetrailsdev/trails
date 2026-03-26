import { Type, ValueType } from "./value.js";
import { StringType } from "./string.js";
import { IntegerType } from "./integer.js";
import { FloatType } from "./float.js";
import { BooleanType } from "./boolean.js";
import { DateType } from "./date.js";
import { DateTimeType } from "./date-time.js";
import { DecimalType } from "./decimal.js";
import { UuidType } from "./uuid.js";
import { JsonType } from "./json.js";
import { BigIntegerType } from "./big-integer.js";
import { ImmutableStringType } from "./immutable-string.js";
import { BinaryType } from "./binary.js";
import { TimeType } from "./time.js";
import { ArrayType } from "./array.js";

export class TypeRegistry {
  private types = new Map<string, () => Type>();

  constructor() {
    this.register("string", () => new StringType());
    this.register("integer", () => new IntegerType());
    this.register("float", () => new FloatType());
    this.register("boolean", () => new BooleanType());
    this.register("date", () => new DateType());
    this.register("datetime", () => new DateTimeType());
    this.register("decimal", () => new DecimalType());
    this.register("uuid", () => new UuidType());
    this.register("json", () => new JsonType());
    this.register("big_integer", () => new BigIntegerType());
    this.register("immutable_string", () => new ImmutableStringType());
    this.register("value", () => new ValueType());
    this.register("binary", () => new BinaryType());
    this.register("time", () => new TimeType());
    this.register("array", () => new ArrayType());
  }

  register(name: string, factory: () => Type): void {
    this.types.set(name, factory);
  }

  lookup(name: string): Type {
    const factory = this.types.get(name);
    if (!factory) throw new Error(`Unknown type: ${name}`);
    return factory();
  }
}

export const typeRegistry = new TypeRegistry();
