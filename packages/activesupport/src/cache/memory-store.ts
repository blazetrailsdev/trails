import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { Entry } from "./entry.js";
import { Store, type WriteOptions } from "./store.js";
import { type CacheEntry, namespaceKey, isExpired, extractCacheOptions } from "./entry-record.js";

export class MemoryStore extends Store implements CacheStore {
  private store: Map<string, CacheEntry> = new Map();
  private namespace?: string;
  private sizeLimit: number;

  constructor(options?: { sizeLimit?: number; namespace?: string; expiresIn?: number }) {
    super(options ?? {});
    this.namespace = options?.namespace;
    this.sizeLimit = options?.sizeLimit ?? Infinity;
  }

  // Abstract entry hooks of the instrumented Store base, backed by the same Map.
  protected readEntry(key: string, _options: Record<string, unknown>): Entry | null {
    const entry = this.getEntry(key);
    return entry ? new Entry(coder.load(entry.encodedValue)) : null;
  }
  protected writeEntry(key: string, entry: Entry, _options: Record<string, unknown>): boolean {
    this.store.set(key, {
      encodedValue: coder.dump(entry.value),
      expiresAt: entry.expiresAt,
      accessedAt: Date.now(),
    });
    return true;
  }
  protected deleteEntry(key: string, _options: Record<string, unknown>): boolean {
    return this.store.delete(key);
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

  // Mirrors Rails cache.rb handle_expired_entry: bump expiresAt within the race window so
  // concurrent readers get stale; delete beyond it.
  private bumpOrDeleteExpired(
    resolvedKey: string,
    entry: CacheEntry,
    raceConditionTtl: number,
  ): void {
    if (raceConditionTtl > 0 && Date.now() - entry.expiresAt! <= raceConditionTtl) {
      this.store.set(resolvedKey, { ...entry, expiresAt: Date.now() + raceConditionTtl });
    } else {
      this.store.delete(resolvedKey);
    }
  }

  override read(key: string, options?: CacheOptions): unknown {
    const rk = this.resolveKey(key, options);
    return this.instrument("read", rk, options, (payload) => {
      const entry = this.getEntry(rk);
      if (!entry) {
        payload.hit = false;
        return null;
      }
      entry.accessedAt = Date.now();
      payload.hit = true;
      return coder.load(entry.encodedValue);
    });
  }

  override write(key: string, value: unknown, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("write", rk, options, () => this.storeEntry(rk, value, options));
  }

  private storeEntry(rk: string, value: unknown, options?: CacheOptions): boolean {
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

  override delete(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("delete", rk, options, () => this.store.delete(rk));
  }

  override exist(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("exist?", rk, undefined, () => this.getEntry(rk) !== undefined);
  }

  override fetch(
    key: string,
    optionsOrFallback?: CacheOptions | ((key: string, opts: WriteOptions) => unknown),
    maybeFallback?: (key: string, opts: WriteOptions) => unknown,
  ): unknown {
    let options: CacheOptions | undefined;
    let fallback: ((key: string, opts: WriteOptions) => unknown) | undefined;

    if (typeof optionsOrFallback === "function") {
      fallback = optionsOrFallback;
    } else {
      options = optionsOrFallback;
      fallback = maybeFallback;
    }

    const rk = this.resolveKey(key, options);

    // Mirrors cache.rb:445-478: block path calls handle_expired_entry; no-block path falls to read().
    if (fallback) {
      const raw = this.store.get(rk);
      if (raw && !isExpired(raw)) {
        raw.accessedAt = Date.now();
        return coder.load(raw.encodedValue);
      }
      // Always call handleExpiredEntry on the block path (cache.rb:453); it decides bump-vs-delete.
      if (raw) this.bumpOrDeleteExpired(rk, raw, options?.raceConditionTtl ?? 0);
      const value = (fallback as () => unknown)();
      this.write(key, value, options);
      return value;
    }

    // No block: mirrors cache.rb:478 — delegate to read(), which deletes expired entries.
    return this.read(key, options);
  }

  override clear(): void {
    this.store.clear();
  }

  override cleanup(): void {
    for (const [key, entry] of this.store.entries()) {
      if (isExpired(entry)) {
        this.store.delete(key);
      }
    }
  }

  override readMulti(...keys: [...string[], CacheOptions] | string[]): Record<string, unknown> {
    const options = extractCacheOptions<CacheOptions>(keys as unknown[]);
    const names = keys as string[];
    const rkeys = names.map((n) => this.resolveKey(n, options));
    return this.instrumentMulti("read_multi", rkeys, options, (payload) => {
      const result: Record<string, unknown> = {};
      for (const name of names) {
        const rk = this.resolveKey(name, options);
        const entry = this.getEntry(rk);
        if (entry) {
          entry.accessedAt = Date.now();
          result[name] = coder.load(entry.encodedValue);
        }
      }
      payload.hits = Object.keys(result).map((n) => this.resolveKey(n, options));
      return result;
    });
  }

  override writeMulti(
    hash: Record<string, unknown>,
    options?: CacheOptions,
  ): Record<string, unknown> {
    if (Object.keys(hash).length === 0) return hash;
    const normalizedHash: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(hash)) {
      normalizedHash[this.resolveKey(name, options)] = value;
    }
    return this.instrumentMulti("write_multi", normalizedHash, options, () => {
      for (const [name, value] of Object.entries(hash)) {
        this.storeEntry(this.resolveKey(name, options), value, options);
      }
      return normalizedHash;
    });
  }

  override deleteMulti(names: string[], options?: CacheOptions): number {
    const rkeys = names.map((k) => this.resolveKey(k, options));
    return this.instrumentMulti("delete_multi", rkeys, options, () => {
      let count = 0;
      for (const rk of rkeys) {
        if (this.store.delete(rk)) count++;
      }
      return count;
    });
  }

  override deleteMatched(pattern: string | RegExp): void {
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    for (const key of this.store.keys()) {
      if (re.test(key)) this.store.delete(key);
    }
  }

  // Rails MemoryStore instruments increment/decrement with the raw, unnormalized
  // name (memory_store.rb:149,167) — unlike FileStore, which uses the normalized
  // key (file_store.rb:62-64).
  override increment(key: string, amount = 1, options?: CacheOptions): number | null {
    return this.instrument("increment", key, { amount }, () =>
      this.modifyValue(this.resolveKey(key, options), amount),
    );
  }

  override decrement(key: string, amount = 1, options?: CacheOptions): number | null {
    return this.instrument("decrement", key, { amount }, () =>
      this.modifyValue(this.resolveKey(key, options), -amount),
    );
  }

  private modifyValue(rk: string, amount: number): number | null {
    const entry = this.getEntry(rk);
    if (!entry) return null;
    const current = Number(coder.load(entry.encodedValue));
    if (isNaN(current)) return null;
    const next = current + amount;
    entry.encodedValue = coder.dump(next);
    entry.accessedAt = Date.now();
    return next;
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
