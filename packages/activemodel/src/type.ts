import { typeRegistry, TypeRegistry, type TypeFactory, type TypeOptions } from "./type/registry.js";
import { Type, ValueType } from "./type/value.js";

export { Type } from "./type/value.js";

export function registry(): TypeRegistry {
  return typeRegistry;
}

export function register(typeName: string, factory: TypeFactory): void {
  typeRegistry.register(typeName, factory);
}

export function lookup(name: string, options?: TypeOptions): Type {
  return typeRegistry.lookup(name, options);
}

let _defaultValue: ValueType | null = null;

export function defaultValue(): ValueType {
  return (_defaultValue ??= new ValueType());
}
