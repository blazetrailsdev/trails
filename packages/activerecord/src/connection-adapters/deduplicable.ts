import { Concern } from "@blazetrails/activesupport";
import { Module, extend, rbEqual } from "@blazetrails/ruby-compat";

type DeduplicableClass = { registry(): Map<number, WeakRef<object>[]> };

export const Deduplicable = new Module() as Module & { ClassMethods: typeof ClassMethods };
extend(Deduplicable, Concern);

const registries = new WeakMap<object, Map<number, WeakRef<object>[]>>();
const _finalizer =
  typeof FinalizationRegistry !== "undefined"
    ? new FinalizationRegistry<{ bucket: WeakRef<object>[] }>(({ bucket }) => {
        for (let i = bucket.length - 1; i >= 0; i--) {
          if (bucket[i].deref() === undefined) bucket.splice(i, 1);
        }
      })
    : null;

export function deduplicate<T extends { hash(): number; deduplicated(): T }>(this: T): T {
  const own = (this.constructor as unknown as DeduplicableClass).registry();
  const hash = this.hash();
  let bucket = own.get(hash);
  if (!bucket) {
    bucket = [];
    own.set(hash, bucket);
  }
  for (const ref of bucket) {
    const existing = ref.deref();
    if (existing !== undefined && rbEqual(existing, this)) return existing as T;
  }
  const deduped = this.deduplicated();
  bucket.push(new WeakRef(deduped));
  _finalizer?.register(deduped, { bucket });
  return deduped;
}
export const negate = deduplicate;

/** @internal */
export function deduplicated<T extends object>(this: T): T {
  return Object.freeze(this);
}

export function registry(this: object): Map<number, WeakRef<object>[]> {
  let own = registries.get(this);
  if (!own) {
    own = new Map<number, WeakRef<object>[]>();
    registries.set(this, own);
  }
  return own;
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
