import { typeRegistry, TypeRegistry } from "./type/registry.js";
import { Type, ValueType } from "./type/value.js";

export { Type } from "./type/value.js";

export function registry(): TypeRegistry {
  return typeRegistry;
}

export function register(name: string, factory: () => Type): void {
  typeRegistry.register(name, factory);
}

export function lookup(name: string): Type {
  return typeRegistry.lookup(name);
}

let _defaultValue: ValueType | null = null;

export function defaultValue(): ValueType {
  return (_defaultValue ??= new ValueType());
}
