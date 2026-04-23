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
}

const registries = new Map<string, WeakRef<object>>();

export function registry(): Map<string, WeakRef<object>> {
  return registries;
}

export function deduplicate<T extends Deduplicable>(obj: T): T {
  const key = `${obj.constructor.name}:${obj.deduplicateKey()}`;
  const ref = registries.get(key);
  if (ref) {
    const existing = ref.deref();
    if (existing) return existing as T;
  }
  registries.set(key, new WeakRef(obj));
  return obj;
}
