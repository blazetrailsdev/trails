// Trails-specific helpers for the plain stored-entry record used by the cache
// stores. Kept separate from entry.ts (the Rails Entry class) so that importing
// these does not pull in entry.ts's node:zlib compression dependency — keeping
// MemoryStore and the main barrel browser-safe.

// `encodedValue` is the coder-serialized form of the cached value (see
// coder.ts). Storing the encoded string rather than the raw value keeps
// FileStore and MemoryStore consistent: both paths go through the same
// type-preserving codec so Date/undefined/bigint/non-finite numbers survive the
// round-trip.
export interface CacheEntry {
  encodedValue: string;
  expiresAt: number | null; // timestamp ms, null = no expiry
  accessedAt: number;
}

/** @internal */
export function namespaceKey(key: string, namespace?: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

export function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

/**
 * Mirrors Ruby `Array#extract_options!`: mutably pops a trailing plain-object
 * options hash off a `readMulti(...keys)` arg array, returning it (or
 * undefined). Lets per-call options (namespace, etc.) ride the last arg like
 * Rails `Cache::Store#read_multi`. @internal
 */
export function extractCacheOptions<T>(keys: unknown[]): T | undefined {
  const last = keys[keys.length - 1];
  if (last != null && typeof last === "object" && !Array.isArray(last)) {
    return keys.pop() as T;
  }
  return undefined;
}
