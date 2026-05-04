/**
 * Deduplicable — mixin for deduplicating frozen value objects.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Deduplicable
 *
 * In Rails, this uses a WeakMap-based registry to ensure identical
 * value objects share a single instance. In TS we use a Map with
 * string keys for deduplication.
 */

export interface Deduplicable {
  deduplicateKey(): string;
  /** @internal */
  deduplicated(): this;
}

const registries = new Map<string, WeakRef<object>>();
const _finalizer =
  typeof FinalizationRegistry !== "undefined"
    ? new FinalizationRegistry<string>((key) => {
        if (registries.get(key)?.deref() === undefined) {
          registries.delete(key);
        }
      })
    : null;

export function registry(): Map<string, WeakRef<object>> {
  return registries;
}

export function deduplicate<T extends Deduplicable>(obj: T): T {
  const key = `${obj.constructor.name}:${obj.deduplicateKey()}`;
  const cached = registries.get(key);
  if (cached) {
    const existing = cached.deref();
    if (existing) return existing as T;
  }
  const deduped = obj.deduplicated();
  const weakRef = new WeakRef(deduped);
  registries.set(key, weakRef);
  _finalizer?.register(deduped, key);
  return deduped;
}

/** @internal */
function deduplicated<T extends object>(obj: T): T {
  return obj;
}
