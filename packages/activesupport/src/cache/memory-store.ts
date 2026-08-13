import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { Entry } from "./entry.js";
import { Store, inspectOptions, type StoreOptions } from "./store.js";
import { integer } from "./integer.js";
import { registerStoreClass } from "./store-registry.js";

const PER_ENTRY_OVERHEAD = 240;

// Ruby `String#bytesize`; JS strings are UTF-16, so the UTF-8 length is encoded.
const UTF8 = new TextEncoder();

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

  // Rails stores the `serialize_entry` payload itself (`@data[key] = payload`,
  // memory_store.rb:213-227), which is a DupCoder-dumped `Entry` by default and
  // a serializer's dumped string when the caller names one, and keeps the LRU
  // order in the Hash — re-inserted on read (:204-208).
  private data: Map<string, Entry | string> = new Map();
  private maxSize: number;
  private maxPruneTime: number;
  private cacheSize: number;
  private _pruning = false;

  constructor(options?: {
    size?: number;
    maxPruneTime?: number;
    namespace?: string | (() => string);
    expiresIn?: number;
    compress?: boolean;
    compressThreshold?: number;
    coder?: unknown;
    serializer?: unknown;
  }) {
    // Rails installs DupCoder and disables compression by default
    // (memory_store.rb:73-77); the coder is skipped when the caller named a
    // `:coder` or a `:serializer` of their own.
    const opts: StoreOptions = { ...(options ?? {}) };
    if (!("coder" in opts) && !("serializer" in opts)) opts.coder = DupCoder;
    if (!opts.compress) opts.compress = false;
    super(opts);
    this.maxSize = options?.size ?? 32 * 1024 * 1024;
    this.maxPruneTime = options?.maxPruneTime ?? 2;
    this.cacheSize = 0;
  }

  // Mirrors Rails MemoryStore#cached_size (memory_store.rb:198-200). Ruby's
  // `payload.bytesize` reads the same on a Marshal/serializer String as on a
  // DupCoder `Entry`; TS has to branch because JS strings have no such method.
  private cachedSize(key: string, payload: Entry | string): number {
    return (
      UTF8.encode(String(key)).length +
      (typeof payload === "string" ? UTF8.encode(payload).length : payload.bytesize()) +
      PER_ENTRY_OVERHEAD
    );
  }

  // Abstract entry hooks of the instrumented Store base, backed by the Map. The
  // public read/write/delete/exist?/fetch/*_multi methods are inherited.
  // Mirrors Rails MemoryStore#read_entry (memory_store.rb:202-212): re-inserting
  // the payload makes the Map's iteration order the LRU order Rails gets from
  // Ruby's insertion-ordered Hash.
  protected readEntry(key: string, _options: Record<string, unknown>): Entry | null {
    const payload = this.data.get(key);
    if (payload === undefined) return null;
    this.data.delete(key);
    this.data.set(key, payload);
    return this.deserializeEntry(payload);
  }

  protected writeEntry(key: string, entry: Entry, options: Record<string, unknown>): boolean {
    const payload = this.serializeEntry(entry, options) as Entry | string;
    if (options.unlessExist && this.exist(key, { namespace: null })) return false;

    const oldPayload = this.data.get(key);
    if (oldPayload !== undefined) {
      // Ruby `old_payload.bytesize - payload.bytesize` (memory_store.rb:216)
      // duck-types over String and Entry; JS strings have no `bytesize`.
      this.cacheSize -=
        (typeof oldPayload === "string" ? UTF8.encode(oldPayload).length : oldPayload.bytesize()) -
        (typeof payload === "string" ? UTF8.encode(payload).length : payload.bytesize());
    } else {
      this.cacheSize += this.cachedSize(key, payload);
    }
    this.data.set(key, payload);
    if (this.cacheSize > this.maxSize) this.prune(this.maxSize * 0.75, this.maxPruneTime);
    return true;
  }

  protected deleteEntry(key: string, _options: Record<string, unknown>): boolean {
    const payload = this.data.get(key);
    this.data.delete(key);
    if (payload !== undefined) this.cacheSize -= this.cachedSize(key, payload);
    return payload !== undefined;
  }

  override clear(): void {
    this.data.clear();
    this.cacheSize = 0;
  }

  // Mirrors Rails MemoryStore#cleanup (memory_store.rb): instrumented, deletes
  // every expired entry.
  override cleanup(options?: CacheOptions): void {
    options = this.mergedOptions(options);
    this.instrument("cleanup", null, { size: this.data.size }, () => {
      for (const key of [...this.data.keys()]) {
        const entry = this.deserializeEntry(this.data.get(key));
        if (entry && entry.isExpired()) this.deleteEntry(key, options);
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

  // Mirrors Rails MemoryStore#inspect (memory_store.rb:186-188). Ruby's
  // `self.class.name` is the fully-qualified constant; TS has only the class
  // name, which is the same last segment.
  inspect(): string {
    return `#<${this.constructor.name} entries=${this.data.size}, size=${this.cacheSize}, options=${inspectOptions(
      this.options as Record<string, unknown>,
    )}>`;
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
      this.instrument("prune", targetSize, { from: this.cacheSize }, () => {
        for (const key of [...this.data.keys()]) {
          this.deleteEntry(key, {});
          if (
            this.cacheSize <= targetSize ||
            (maxTime != null && (Date.now() - startTime) / 1000 > maxTime)
          ) {
            return;
          }
        }
      });
    } finally {
      this._pruning = false;
    }
  }

  /** Returns true if the cache is currently being pruned (memory_store.rb:129-131). */
  isPruning(): boolean {
    return this._pruning;
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
  export function dumpValue(value: unknown): string {
    if (typeof value === "string" && !value.startsWith(MARSHAL_SIGNATURE)) {
      return value;
    } else {
      return MARSHAL_SIGNATURE + coder.dump(value);
    }
  }

  /** Mirrors Rails MemoryStore::DupCoder#load_value (memory_store.rb:64-70). */
  export function loadValue(string: string): unknown {
    if (string.startsWith(MARSHAL_SIGNATURE)) {
      return coder.load(string.slice(MARSHAL_SIGNATURE.length));
    } else {
      return string;
    }
  }
}

registerStoreClass(":memory_store", MemoryStore);
