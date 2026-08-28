import { ArgumentError } from "../attribute-assignment.js";
import { Type, ValueType } from "./value.js";
import { StringType } from "./string.js";
import { IntegerType } from "./integer.js";
import { FloatType } from "./float.js";
import { BooleanType } from "./boolean.js";
import { DateType } from "./date.js";
import { DateTimeType } from "./date-time.js";
import { DecimalType } from "./decimal.js";
import { BigIntegerType } from "./big-integer.js";
import { ImmutableStringType } from "./immutable-string.js";
import { BinaryType } from "./binary.js";
import { TimeType } from "./time.js";

export type TypeOptions = { precision?: number; scale?: number; limit?: number } & Record<
  string,
  unknown
>;
export type TypeFactory = (name: string, options?: TypeOptions) => Type;

export class TypeRegistry {
  /** @internal */
  protected registrationsMap = new Map<string, TypeFactory>();

  constructor() {
    this.register("string", (_name, options) => new StringType(options));
    this.register("integer", (_name, options) => new IntegerType(options));
    this.register("float", (_name, options) => new FloatType(options));
    this.register("boolean", (_name, options) => new BooleanType(options));
    this.register("date", (_name, options) => new DateType(options));
    this.register("datetime", (_name, options) => new DateTimeType(options));
    this.register("decimal", (_name, options) => new DecimalType(options));
    this.register("big_integer", (_name, options) => new BigIntegerType(options));
    this.register("immutable_string", (_name, options) => new ImmutableStringType(options));
    this.register("value", (_name, options) => new ValueType(options));
    this.register("binary", (_name, options) => new BinaryType(options));
    this.register("time", (_name, options) => new TimeType(options));
  }

  register(typeName: string, klass: TypeFactory): void {
    this.registrations.set(typeName, klass);
  }

  lookup(symbol: string, options?: TypeOptions): Type {
    const registration = this.registrations.get(symbol);
    if (!registration) throw new ArgumentError(`Unknown type :${symbol}`);
    return registration(symbol, options);
  }

  /** @internal */
  protected get registrations(): Map<string, TypeFactory> {
    return this.registrationsMap;
  }
}

export const typeRegistry = new TypeRegistry();
