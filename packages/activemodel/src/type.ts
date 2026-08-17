import { typeRegistry, TypeRegistry, type TypeFactory, type TypeOptions } from "./type/registry.js";
import { Type, ValueType } from "./type/value.js";

export { Type } from "./type/value.js";

export function registry(): TypeRegistry {
  return typeRegistry;
}

export function register(typeName: string, factory: TypeFactory): void {
  typeRegistry.register(typeName, factory);
}

/**
 * Mirrors: ActiveModel::Type.lookup (type.rb:34-36) — `registry.lookup(...)`
 * forwards every argument, so the options a caller passes reach the
 * registered block (type_test.rb:16-22 pins that forwarding).
 */
export function lookup(name: string, options?: TypeOptions): Type {
  return typeRegistry.lookup(name, options);
}

let _defaultValue: ValueType | null = null;

export function defaultValue(): ValueType {
  return (_defaultValue ??= new ValueType());
}
