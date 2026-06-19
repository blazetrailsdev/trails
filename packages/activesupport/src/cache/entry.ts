export interface CacheEntry {
  value: unknown;
  expiresAt: number | null; // timestamp ms, null = no expiry
  accessedAt: number;
}

export class Entry {
  readonly value: unknown;
  readonly expiresIn: number | null;
  readonly createdAt: number | null;

  constructor(
    value: unknown,
    options: { expiresIn?: number | null; createdAt?: number | null } = {},
  ) {
    this.value = value;
    this.expiresIn = options.expiresIn ?? null;
    this.createdAt = options.createdAt ?? null;
  }
}

/** @internal */
export function namespaceKey(key: string, namespace?: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

export function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}
