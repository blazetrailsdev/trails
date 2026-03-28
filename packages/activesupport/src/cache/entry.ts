export interface CacheEntry {
  value: unknown;
  expiresAt: number | null; // timestamp ms, null = no expiry
  accessedAt: number;
}

export function namespaceKey(key: string, namespace?: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

export function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}
