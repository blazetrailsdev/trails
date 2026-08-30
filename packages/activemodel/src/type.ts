import { typeRegistry, TypeRegistry, type TypeClass, type TypeFactory } from "./type/registry.js";
import { Type, ValueType } from "./type/value.js";

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
