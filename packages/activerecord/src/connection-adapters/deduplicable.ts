import { Concern } from "@blazetrails/activesupport";
import { Hash, extend, hashAref, hashAset } from "@blazetrails/ruby-compat";

type DeduplicableClass = { registry(): Hash<object, object> };

export function deduplicate<T>(this: T): T {
  const self = this as T & { constructor: unknown; deduplicated(): T };
  const registry = (self.constructor as DeduplicableClass).registry();
  return (hashAref(registry, self) ?? hashAset(registry, self, self.deduplicated())) as T;
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
  deduplicate,
  negate,
  deduplicated,
};
extend(Deduplicable, Concern);
