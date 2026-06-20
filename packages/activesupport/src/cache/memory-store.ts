import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { type CacheEntry, namespaceKey, isExpired } from "./entry-record.js";

export class MemoryStore implements CacheStore {
  private store: Map<string, CacheEntry> = new Map();
  private namespace?: string;
  private sizeLimit: number;

  constructor(options?: { sizeLimit?: number; namespace?: string; expiresIn?: number }) {
    this.namespace = options?.namespace;
    this.sizeLimit = options?.sizeLimit ?? Infinity;
  }

  private resolveKey(key: string, options?: CacheOptions): string {
    const ns = options?.namespace ?? this.namespace;
    return namespaceKey(String(key), ns);
  }

  private getEntry(resolvedKey: string): CacheEntry | undefined {
    const entry = this.store.get(resolvedKey);
    if (!entry) return undefined;
    if (isExpired(entry)) {
      this.store.delete(resolvedKey);
      return undefined;
    }
    return entry;
  }

  // Mirrors Rails cache.rb handle_expired_entry: when an entry has expired but
  // is within raceConditionTtl ms of its expiry, bump its expiresAt and write
  // it back so concurrent readers get the stale value while one writer
  // regenerates. Returns the entry to serve (stale), or undefined to delete.
  private handleExpiredEntry(
    resolvedKey: string,
    entry: CacheEntry,
    raceConditionTtl: number,
  ): CacheEntry | undefined {
    const now = Date.now();
    const expiredAt = entry.expiresAt!;
    if (now - expiredAt <= raceConditionTtl) {
      const bumped: CacheEntry = { ...entry, expiresAt: now + raceConditionTtl };
      this.store.set(resolvedKey, bumped);
      return bumped;
    }
    this.store.delete(resolvedKey);
    return undefined;
  }

  read(key: string, options?: CacheOptions): unknown {
    const rk = this.resolveKey(key, options);
    const entry = this.getEntry(rk);
    if (!entry) return null;
    entry.accessedAt = Date.now();
    return coder.load(entry.encodedValue);
  }

  write(key: string, value: unknown, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);

    if (options?.unlessExist) {
      const existing = this.getEntry(rk);
      if (existing !== undefined) return false;
    }

    const expiresAt = options?.expiresIn != null ? Date.now() + options.expiresIn : null;
    const entry: CacheEntry = {
      encodedValue: coder.dump(value),
      expiresAt,
      accessedAt: Date.now(),
    };
    this.store.set(rk, entry);

    if (this.store.size > this.sizeLimit) {
      this.evictLRU();
    }

    return true;
  }

  delete(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.store.delete(rk);
  }

  exist(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.getEntry(rk) !== undefined;
  }

  fetch(
    key: string,
    optionsOrFallback?: CacheOptions | (() => unknown),
    maybeFallback?: () => unknown,
  ): unknown {
    let options: CacheOptions | undefined;
    let fallback: (() => unknown) | undefined;

    if (typeof optionsOrFallback === "function") {
      fallback = optionsOrFallback;
    } else {
      options = optionsOrFallback;
      fallback = maybeFallback;
    }

    const raceConditionTtl = options?.raceConditionTtl ?? 0;
    const rk = this.resolveKey(key, options);

    if (raceConditionTtl > 0) {
      const raw = this.store.get(rk);
      if (raw && !isExpired(raw)) {
        raw.accessedAt = Date.now();
        return coder.load(raw.encodedValue);
      }
      if (raw && isExpired(raw)) {
        // Bump and write back so concurrent readers get the stale value.
        // Always regenerate for the current caller (mirrors Rails handle_expired_entry → nil).
        this.handleExpiredEntry(rk, raw, raceConditionTtl);
        if (fallback) {
          const value = fallback();
          this.write(key, value, options);
          return value;
        }
        return null;
      }
    }

    const cached = this.read(key, options);
    if (cached !== null) return cached;

    if (fallback) {
      const value = fallback();
      this.write(key, value, options);
      return value;
    }
    return null;
  }

  clear(): void {
    this.store.clear();
  }

  cleanup(): void {
    for (const [key, entry] of this.store.entries()) {
      if (isExpired(entry)) {
        this.store.delete(key);
      }
    }
  }

  readMulti(...keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const val = this.read(key);
      if (val !== null) result[key] = val;
    }
    return result;
  }

  writeMulti(hash: Record<string, unknown>, options?: CacheOptions): void {
    for (const [key, value] of Object.entries(hash)) {
      this.write(key, value, options);
    }
  }

  deleteMulti(...keys: string[]): number {
    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) count++;
    }
    return count;
  }

  deleteMatched(pattern: string | RegExp): void {
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    for (const key of this.store.keys()) {
      if (re.test(key)) this.store.delete(key);
    }
  }

  increment(key: string, amount = 1, options?: CacheOptions): number | null {
    const rk = this.resolveKey(key, options);
    const entry = this.getEntry(rk);
    if (!entry) return null;
    const current = Number(coder.load(entry.encodedValue));
    if (isNaN(current)) return null;
    const next = current + amount;
    entry.encodedValue = coder.dump(next);
    entry.accessedAt = Date.now();
    return next;
  }

  decrement(key: string, amount = 1, options?: CacheOptions): number | null {
    return this.increment(key, -amount, options);
  }

  prune(targetSize: number, maxTime?: number): void {
    const start = Date.now();
    this.cleanup();
    const sorted = [...this.store.entries()].sort((a, b) => a[1].accessedAt - b[1].accessedAt);
    let freed = 0;
    for (const [key] of sorted) {
      if (freed >= targetSize) break;
      if (maxTime != null && Date.now() - start > maxTime * 1000) break;
      this.store.delete(key);
      freed++;
    }
  }

  private evictLRU(): void {
    let oldest: [string, CacheEntry] | null = null;
    for (const entry of this.store.entries()) {
      if (!oldest || entry[1].accessedAt < oldest[1].accessedAt) {
        oldest = entry;
      }
    }
    if (oldest) this.store.delete(oldest[0]);
  }
}

export namespace DupCoder {
  export function dump(entry: unknown): unknown {
    if (entry === null || entry === undefined) return entry;
    if (typeof entry !== "object") return entry;
    try {
      return structuredClone(entry);
    } catch {
      return entry;
    }
  }

  export function load(entry: unknown): unknown {
    return dump(entry);
  }
}
