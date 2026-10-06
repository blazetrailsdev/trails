import { Concern } from "@blazetrails/activesupport";
import { Hash, Module, extend, hashAref, hashAset } from "@blazetrails/ruby-compat";

type DeduplicableClass = { registry(): Hash<object, object> };

export const Deduplicable = new Module() as Module<{
  deduplicate<T>(this: T): T;
  negate<T>(this: T): T;
  deduplicated(): object;
}> & { ClassMethods: typeof ClassMethods };
extend(Deduplicable, Concern);

const registries = new WeakMap<object, Hash<object, object>>();

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
  const registry = registries.get(this) ?? new Hash<object, object>();
  registries.set(this, registry);
  return registry;
}

export const ClassMethods = {
  registry,

  new<C extends new (...args: never[]) => { deduplicate(): unknown }>(
    this: C,
    ...args: ConstructorParameters<C>
  ): InstanceType<C> {
    return new this(...(args as never[])).deduplicate() as InstanceType<C>;
  },
};
Deduplicable.ClassMethods = ClassMethods;

Deduplicable.defineMethod("deduplicate", deduplicate);
Deduplicable.defineMethod("negate", negate);
Deduplicable.defineMethod("deduplicated", deduplicated);
