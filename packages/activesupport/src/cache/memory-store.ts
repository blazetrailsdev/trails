import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { Entry } from "./entry.js";
import { Store } from "./store.js";

// In-memory record backing a single key. We store the coder-serialized value
// (so Date/undefined/bigint/non-finite numbers and deep-clone isolation survive
// the round-trip) alongside the Rails Entry metadata (absolute `expiresAt` in ms,
// `version`). `accessedAt` drives LRU pruning. readEntry/writeEntry rebuild the
// Rails second-unit `Entry` so the instrumented Store base owns read/write/fetch.
interface MemoryRecord {
  encodedValue: string;
  expiresAt: number | null;
  version: string | null;
  accessedAt: number;
}

export class MemoryStore extends Store implements CacheStore {
  private data: Map<string, MemoryRecord> = new Map();
  private sizeLimit: number;

  constructor(options?: { sizeLimit?: number; namespace?: string; expiresIn?: number }) {
    super(options ?? {});
    this.sizeLimit = options?.sizeLimit ?? Infinity;
  }

  // Abstract entry hooks of the instrumented Store base, backed by the Map. The
  // public read/write/delete/exist?/fetch/*_multi methods are inherited.
  protected readEntry(key: string, _options: Record<string, unknown>): Entry | null {
    const rec = this.data.get(key);
    if (!rec) return null;
    rec.accessedAt = Date.now();
    return new Entry(coder.load(rec.encodedValue), {
      expiresAt: rec.expiresAt,
      version: rec.version,
    });
  }

  protected writeEntry(key: string, entry: Entry, options: Record<string, unknown>): boolean {
    if (options.unlessExist) {
      const existing = this.data.get(key);
      if (existing && !this.recordExpired(existing)) return false;
    }
    this.data.set(key, {
      encodedValue: coder.dump(entry.value),
      expiresAt: entry.expiresAt,
      version: entry.version,
      accessedAt: Date.now(),
    });
    if (this.data.size > this.sizeLimit) this.evictLRU();
    return true;
  }

  protected deleteEntry(key: string, _options: Record<string, unknown>): boolean {
    return this.data.delete(key);
  }

  private recordExpired(rec: MemoryRecord): boolean {
    return rec.expiresAt !== null && rec.expiresAt <= Date.now();
  }

  override clear(): void {
    this.data.clear();
  }

  override cleanup(): void {
    for (const [key, rec] of this.data) {
      if (this.recordExpired(rec)) this.data.delete(key);
    }
  }

  override deleteMatched(pattern: string | RegExp): void {
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    for (const key of this.data.keys()) {
      if (re.test(key)) this.data.delete(key);
    }
  }

  // Rails MemoryStore instruments increment/decrement with the raw, unnormalized
  // name (memory_store.rb:149,167) — unlike FileStore, which uses the normalized
  // key (file_store.rb:62-64).
  override increment(name: string, amount = 1, options?: CacheOptions): number | null {
    return this.instrument("increment", name, { amount }, () =>
      this.modifyValue(this.normalizeKey(name, this.mergedOptions(options)), amount),
    );
  }

  override decrement(name: string, amount = 1, options?: CacheOptions): number | null {
    return this.instrument("decrement", name, { amount }, () =>
      this.modifyValue(this.normalizeKey(name, this.mergedOptions(options)), -amount),
    );
  }

  private modifyValue(key: string, amount: number): number | null {
    const rec = this.data.get(key);
    if (!rec || this.recordExpired(rec)) return null;
    const current = Number(coder.load(rec.encodedValue));
    if (isNaN(current)) return null;
    const next = current + amount;
    rec.encodedValue = coder.dump(next);
    rec.accessedAt = Date.now();
    return next;
  }

  prune(targetSize: number, maxTime?: number): void {
    const start = Date.now();
    this.cleanup();
    const sorted = [...this.data.entries()].sort((a, b) => a[1].accessedAt - b[1].accessedAt);
    let freed = 0;
    for (const [key] of sorted) {
      if (freed >= targetSize) break;
      if (maxTime != null && Date.now() - start > maxTime * 1000) break;
      this.data.delete(key);
      freed++;
    }
  }

  private evictLRU(): void {
    let oldest: [string, MemoryRecord] | null = null;
    for (const entry of this.data.entries()) {
      if (!oldest || entry[1].accessedAt < oldest[1].accessedAt) {
        oldest = entry;
      }
    }
    if (oldest) this.data.delete(oldest[0]);
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
