import {
  Type,
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  DateType,
  DateTimeType,
  DecimalType,
  UuidType,
  JsonType,
  BigIntegerType,
  ImmutableStringType,
  ValueType,
  BinaryType,
  TimeType,
} from "./type.js";

/**
 * Type registry — maps type names to Type instances.
 *
 * Mirrors: ActiveModel::Type.register / ActiveModel::Type.lookup
 */
class TypeRegistry {
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
