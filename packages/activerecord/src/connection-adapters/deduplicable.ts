import { rbEqual } from "@blazetrails/ruby-compat";

export interface Deduplicable {
  /** @internal */
  deduplicated(): this;
}

const registries = new WeakMap<object, Map<number, WeakRef<object>[]>>();
const _finalizer =
  typeof FinalizationRegistry !== "undefined"
    ? new FinalizationRegistry<{ bucket: WeakRef<object>[] }>(({ bucket }) => {
        for (let i = bucket.length - 1; i >= 0; i--) {
          if (bucket[i].deref() === undefined) bucket.splice(i, 1);
        }
      })
    : null;

export function registry(this: object): Map<number, WeakRef<object>[]> {
  let own = registries.get(this);
  if (!own) {
    own = new Map<number, WeakRef<object>[]>();
    registries.set(this, own);
  }
  return own;
}

export function deduplicate<T extends Deduplicable & { hash(): number }>(obj: T): T {
  const own = registry.call(obj.constructor);
  const hash = obj.hash();
  let bucket = own.get(hash);
  if (!bucket) {
    bucket = [];
    own.set(hash, bucket);
  }
  for (const ref of bucket) {
    const existing = ref.deref();
    if (existing !== undefined && rbEqual(existing, obj)) return existing as T;
  }
  const deduped = obj.deduplicated();
  bucket.push(new WeakRef(deduped));
  _finalizer?.register(deduped, { bucket });
  return deduped;
}
