import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { Entry } from "./entry.js";
import { Store } from "./store.js";
import { integer } from "./integer.js";
import { registerStoreClass } from "./store-registry.js";

// In-memory record backing a single key. Rails stores the `serialize_entry`
// payload itself (`@data[key] = payload`, memory_store.rb:213-227), which for
// this store is a DupCoder-dumped `Entry`; `expiresAt` mirrors it for the
// `unless_exist` check and `accessedAt` drives LRU pruning.
interface MemoryRecord {
  payload: Entry;
  expiresAt: number | null;
  accessedAt: number;
}

// Mirrors Ruby `#to_i`: Integer/Float truncate toward zero, a String yields its
// leading integer (0 when none), and anything else is 0.
function toI(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const m = value.match(/^\s*[-+]?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  return 0;
}

export class MemoryStore extends Store implements CacheStore {
  /** Advertise cache versioning support (memory_store.rb:87-90). */
  static supportsCacheVersioning(): boolean {
    return true;
  }

  private data: Map<string, MemoryRecord> = new Map();
  private sizeLimit: number;
  private _pruning = false;

  constructor(options?: {
    sizeLimit?: number;
    namespace?: string | (() => string);
    expiresIn?: number;
    compress?: boolean;
    compressThreshold?: number;
  }) {
    super(options ?? {});
    this.sizeLimit = options?.sizeLimit ?? Infinity;
  }

  // Abstract entry hooks of the instrumented Store base, backed by the Map. The
  // public read/write/delete/exist?/fetch/*_multi methods are inherited.
  protected readEntry(key: string, _options: Record<string, unknown>): Entry | null {
    const rec = this.data.get(key);
    if (!rec) return null;
    rec.accessedAt = Date.now();
    return this.deserializeEntry(rec.payload);
  }

  protected writeEntry(key: string, entry: Entry, options: Record<string, unknown>): boolean {
    const payload = this.serializeEntry(entry, options);
    if (options.unlessExist) {
      const existing = this.data.get(key);
      if (existing && !this.recordExpired(existing)) return false;
    }
    this.data.set(key, {
      payload,
      expiresAt: entry.expiresAt,
      accessedAt: Date.now(),
    });
    if (this.data.size > this.sizeLimit) this.evictLRU();
    return true;
  }

  /**
   * Mirrors Rails `Store#serialize_entry` (cache.rb:806-813): dispatch to the
   * coder's `dump_compressed` under `compress`, else `dump`. Rails installs the
   * coder in `MemoryStore#initialize` (`options[:coder] = DupCoder`,
   * memory_store.rb:73-75) and holds it in `@coder` on the base; trails' `Store`
   * has no `@coder` seam yet (RFC 0101 story
   * `converge-store-serialized-entry-hooks-and-file-store-paths` ports it), so
   * this store names the coder Rails installs for it directly until that lands.
   */
  private serializeEntry(entry: Entry, options: Record<string, unknown>): Entry {
    options = this.mergedOptions(options as CacheOptions) as Record<string, unknown>;
    if (options.compress) {
      return DupCoder.dumpCompressed(entry, (options.compressThreshold as number) ?? 1024);
    } else {
      return DupCoder.dump(entry);
    }
  }

  /** Mirrors Rails `Store#deserialize_entry` (cache.rb:815-819). */
  private deserializeEntry(payload: Entry | null): Entry | null {
    return payload === null ? null : DupCoder.load(payload);
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

  // Mirrors Rails MemoryStore#cleanup (memory_store.rb): instrumented, deletes
  // every expired entry.
  override cleanup(options?: CacheOptions): void {
    options = this.mergedOptions(options);
    this.instrument("cleanup", null, { size: this.data.size }, () => {
      for (const [key, rec] of this.data) {
        if (this.recordExpired(rec)) this.deleteEntry(key, options);
      }
    });
  }

  // Mirrors Rails MemoryStore#delete_matched (memory_store.rb): instrumented with
  // the matcher, which is run through keyMatcher so a namespaced store scopes the
  // deletion to its own (namespace-prefixed) keys.
  override deleteMatched(matcher: string | RegExp, options?: CacheOptions): void {
    options = this.mergedOptions(options);
    if (typeof matcher === "string") matcher = new RegExp(matcher);
    matcher = this.keyMatcher(matcher, options);
    this.instrument("delete_matched", String(matcher), undefined, () => {
      for (const key of this.data.keys()) {
        if (key.match(matcher) !== null) this.deleteEntry(key, options);
      }
    });
  }

  // Rails MemoryStore instruments increment/decrement with the raw, unnormalized
  // name (memory_store.rb:149,167) — unlike FileStore, which uses the normalized
  // key (file_store.rb:62-64).
  override increment(name: string, amount = 1, options?: CacheOptions): number {
    return this.instrument("increment", name, { amount }, () =>
      this.modifyValue(name, amount, options),
    );
  }

  override decrement(name: string, amount = 1, options?: CacheOptions): number {
    return this.instrument("decrement", name, { amount }, () =>
      this.modifyValue(name, -amount, options),
    );
  }

  // Mirrors Rails MemoryStore#modify_value (memory_store.rb): on a missing,
  // expired, or version-mismatched entry it *creates* the key set to
  // Integer(amount) through the instrumented write path and returns amount (so
  // `increment("foo") # => 1`); on a hit it adds to entry.value.to_i, preserving
  // the entry's expiresAt/version.
  private modifyValue(name: string, amount: number, options?: CacheOptions): number {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = this.normalizeVersion(name, options) ?? null;
    const entry = this.readEntry(key, options);
    if (!entry || entry.isExpired() || entry.isMismatched(version)) {
      // Rails seeds with `Integer(amount)` (raises on NaN/Infinity) but returns
      // the raw `amount` (memory_store.rb:248-249), so `increment("foo", 1.5)`
      // writes 1 yet returns 1.5.
      this.write(name, integer(amount), options);
      return amount;
    }
    // Hit path adds the raw `amount` — Rails never calls `Integer()` here
    // (memory_store.rb:251), so no truncation and no NaN/Infinity raise.
    const num = toI(entry.value) + amount;
    // Rails calls `write_entry(key, entry)` with no options (memory_store.rb:255),
    // so `unless_exist` never suppresses the hit-path rewrite; pass `{}` to match.
    this.writeEntry(
      key,
      new Entry(num, { expiresAt: entry.expiresAt, version: entry.version }),
      {},
    );
    return num;
  }

  /**
   * Rails guards `prune` against re-entry with the `@pruning` flag
   * (memory_store.rb:110-127): `cleanup` and the per-key deletion below can both
   * re-enter through a write, and the inner call must not prune again.
   */
  prune(targetSize: number, maxTime?: number): void {
    if (this.isPruning()) return;
    this._pruning = true;
    try {
      const startTime = Date.now();
      this.cleanup();
      const sorted = [...this.data.entries()].sort((a, b) => a[1].accessedAt - b[1].accessedAt);
      let freed = 0;
      for (const [key] of sorted) {
        if (freed >= targetSize) break;
        if (maxTime != null && Date.now() - startTime > maxTime * 1000) break;
        this.data.delete(key);
        freed++;
      }
    } finally {
      this._pruning = false;
    }
  }

  /** Returns true if the cache is currently being pruned (memory_store.rb:129-131). */
  isPruning(): boolean {
    return this._pruning;
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
  /**
   * Mirrors Rails MemoryStore::DupCoder#dump (memory_store.rb:32-38): rebuild
   * the Entry around a dumped value so the stored value can't alias the
   * caller's, preserving expires_at/version. Ruby's `entry.value && … != true
   * && !Numeric` leaves nil/false/true/Numeric entries untouched.
   */
  export function dump(entry: Entry): Entry {
    const value = entry.value;
    if (
      value != null &&
      value !== false &&
      value !== true &&
      typeof value !== "number" &&
      typeof value !== "bigint"
    ) {
      return new Entry(dumpValue(value), { expiresAt: entry.expiresAt, version: entry.version });
    } else {
      return entry;
    }
  }

  /** Mirrors Rails MemoryStore::DupCoder#dump_compressed (memory_store.rb:40-43). */
  export function dumpCompressed(entry: Entry, threshold: number): Entry {
    const compressedEntry = entry.compressed(threshold);
    return compressedEntry.isCompressed() ? compressedEntry : dump(entry);
  }

  /** Mirrors Rails MemoryStore::DupCoder#load (memory_store.rb:45-51). */
  export function load(entry: Entry): Entry {
    if (!entry.isCompressed() && typeof entry.value === "string") {
      return new Entry(loadValue(entry.value), {
        expiresAt: entry.expiresAt,
        version: entry.version,
      });
    } else {
      return entry;
    }
  }

  /**
   * Rails' `MARSHAL_SIGNATURE` (memory_store.rb:54) is the two leading bytes
   * every `Marshal.dump` payload carries, which is how `load_value` tells a
   * serialized value from a String stored verbatim. The trails Marshal
   * equivalent is the fidelity Coder (coder.ts), whose JSON output carries no
   * such self-identifying prefix, so `dump_value` prepends the same signature
   * and `load_value` strips it — same discriminator, same two arms.
   */
  const MARSHAL_SIGNATURE = "\x04\x08";

  /**
   * Mirrors Rails MemoryStore::DupCoder#dump_value (memory_store.rb:56-62).
   * Ruby's `value.dup` guards against the caller mutating the stored String;
   * JS strings are immutable, so the String arm returns it as-is.
   */
  function dumpValue(value: unknown): string {
    if (typeof value === "string" && !value.startsWith(MARSHAL_SIGNATURE)) {
      return value;
    } else {
      return MARSHAL_SIGNATURE + coder.dump(value);
    }
  }

  /** Mirrors Rails MemoryStore::DupCoder#load_value (memory_store.rb:64-70). */
  function loadValue(string: string): unknown {
    if (string.startsWith(MARSHAL_SIGNATURE)) {
      return coder.load(string.slice(MARSHAL_SIGNATURE.length));
    } else {
      return string;
    }
  }
}

registerStoreClass(":memory_store", MemoryStore);
