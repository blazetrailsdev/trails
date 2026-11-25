import { Concern } from "@blazetrails/activesupport";
import { Hash, extend, hashAref, hashAset } from "@blazetrails/ruby-compat";

type DeduplicableClass = { registry(): Hash<object, object> };

export function deduplicate<T extends object & { deduplicated(): T }>(this: T): T {
  const registry = (this.constructor as unknown as DeduplicableClass).registry();
  return (hashAref(registry, this) ?? hashAset(registry, this, this.deduplicated())) as T;
}
export const negate = deduplicate;

/** @internal */
export function deduplicated<T extends object>(this: T): T {
  return Object.freeze(this);
}

export function registry(this: object): Hash<object, object> {
  const klass = this as { _registry?: Hash<object, object> };
  if (!Object.hasOwn(klass, "_registry")) klass._registry = new Hash();
  return klass._registry!;
}

export const ClassMethods = {
  registry,
};

export const Deduplicable: {
  ClassMethods: typeof ClassMethods;
  deduplicate<T>(this: T): T;
  negate<T>(this: T): T;
  deduplicated(): object;
} = {
  ClassMethods,
  deduplicate: deduplicate as <T>(this: T) => T,
  negate: negate as <T>(this: T) => T,
  deduplicated,
};
extend(Deduplicable, Concern);
