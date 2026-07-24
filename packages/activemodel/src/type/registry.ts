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

/**
 * Mirrors the block ActiveModel::Type::Registry#register builds —
 * `proc { |_, *args| klass.new(*args) }` (registry.rb:16) — so `lookup`
 * can forward the caller's options the way `lookup(symbol, ...)` does.
 */
export type TypeOptions = { precision?: number; scale?: number; limit?: number } & Record<
  string,
  unknown
>;
export type TypeFactory = (name: string, options?: TypeOptions) => Type;

export class TypeRegistry {
  /**
   * Mirrors: ActiveModel::Type::Registry's `@registrations` ivar
   * (registry.rb:6, exposed via `attr_reader :registrations`).
   * Storage is a Map (trails uses Map; Rails uses a Hash) but the
   * accessor name matches Rails so subclasses can override or read it.
   *
   * @internal Rails-private storage.
   */
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

  register(name: string, factory: TypeFactory): void {
    this.registrations.set(name, factory);
  }

  lookup(name: string, options?: TypeOptions): Type {
    const factory = this.registrations.get(name);
    if (!factory) throw new ArgumentError(`Unknown type: ${name}`);
    return factory(name, options);
  }

  /**
   * Mirrors: ActiveModel::Type::Registry#registrations (registry.rb:30,
   * `attr_reader :registrations`). Private in Rails; protected here so
   * subclasses can read or replace the registry.
   *
   * @internal Rails-private helper.
   */
  protected get registrations(): Map<string, TypeFactory> {
    return this.registrationsMap;
  }
}

export const typeRegistry = new TypeRegistry();
