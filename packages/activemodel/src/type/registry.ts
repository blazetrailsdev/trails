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
  /**
   * Mirrors: ActiveModel::Type::Registry's `@registrations` ivar
   * (registry.rb:6, exposed via `attr_reader :registrations`).
   * Storage is a Map (trails uses Map; Rails uses a Hash) but the
   * accessor name matches Rails so subclasses can override or read it.
   *
   * @internal Rails-private storage.
   */
  protected registrationsMap = new Map<string, () => Type>();

  /**
   * Mirrors: ActiveModel::Type::Registry#registrations (registry.rb:30,
   * `attr_reader :registrations`). Private in Rails; protected here so
   * subclasses can read or replace the registry.
   *
   * @internal Rails-private helper.
   */
  protected get registrations(): Map<string, () => Type> {
    return this.registrationsMap;
  }

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
    this.registrations.set(name, factory);
  }

  lookup(name: string): Type {
    const factory = this.registrations.get(name);
    if (!factory) throw new Error(`Unknown type: ${name}`);
    return factory();
  }
}

export const typeRegistry = new TypeRegistry();
