// Trails-specific helpers for the plain stored-entry record used by the cache
// stores. Kept separate from entry.ts (the Rails Entry class) so that importing
// these does not pull in entry.ts's node:zlib compression dependency — keeping
// MemoryStore and the main barrel browser-safe.

export interface CacheEntry {
  value: unknown;
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
