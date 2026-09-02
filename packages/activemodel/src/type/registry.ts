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
export type TypeFactory = (name: string, ...args: unknown[]) => Type;
export type TypeClass = new (...args: never[]) => Type;

export class TypeRegistry {
  /** @internal */
  protected registrationsMap = new Map<string, TypeFactory>();

  constructor() {
    this.register("string", StringType);
    this.register("integer", IntegerType);
    this.register("float", FloatType);
    this.register("boolean", BooleanType);
    this.register("date", DateType);
    this.register("datetime", DateTimeType);
    this.register("decimal", DecimalType);
    this.register("big_integer", BigIntegerType);
    this.register("immutable_string", ImmutableStringType);
    this.register("value", ValueType);
    this.register("binary", BinaryType);
    this.register("time", TimeType);
  }

  register(typeName: string, klass: TypeClass | null = null, block?: TypeFactory): void {
    if (block === undefined) {
      block = (_: string, ...args: unknown[]) => new klass!(...(args as never[]));
    }
    this.registrations.set(typeName, block);
  }

  lookup(symbol: string, ...args: unknown[]): Type {
    const registration = this.registrations.get(symbol);

    if (registration) {
      return registration(symbol, ...args);
    } else {
      throw new ArgumentError(`Unknown type :${symbol}`);
    }
  }

  /** @internal */
  protected get registrations(): Map<string, TypeFactory> {
    return this.registrationsMap;
  }
}

/** @noRailsEquivalent PERMANENT */
export const typeRegistry = new TypeRegistry();
