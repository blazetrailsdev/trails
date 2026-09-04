import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { Entry } from "./entry.js";
import { Store, inspectOptions, type StoreOptions } from "./store.js";
import { kernelInteger, Process } from "@blazetrails/ruby-compat";
import { registerStoreClass } from "./store-registry.js";

const PER_ENTRY_OVERHEAD = 240;

const UTF8 = new TextEncoder();

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
  static supportsCacheVersioning(): boolean {
    return true;
  }

  private data: Map<string, Entry | string> = new Map();
  private maxSize: number;
  private maxPruneTime: number;
  private cacheSize: number;
  private _pruning = false;

  /** @missingRailsCall new — PERMANENT */
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
    const opts: StoreOptions = { ...(options ?? {}) };
    if (!("coder" in opts) && !("serializer" in opts)) opts.coder = DupCoder;
    if (!opts.compress) opts.compress = false;
    super(opts);
    this.maxSize = options?.size ?? 32 * 1024 * 1024;
    this.maxPruneTime = options?.maxPruneTime ?? 2;
    this.cacheSize = 0;
  }

  private cachedSize(key: string, payload: Entry | string): number {
    return (
      UTF8.encode(String(key)).length +
      (typeof payload === "string" ? UTF8.encode(payload).length : payload.bytesize()) +
      PER_ENTRY_OVERHEAD
    );
  }

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

  override cleanup(options?: CacheOptions): void {
    options = this.mergedOptions(options);
    this.instrument("cleanup", null, { size: this.data.size }, () => {
      for (const key of [...this.data.keys()]) {
        const entry = this.deserializeEntry(this.data.get(key));
        if (entry && entry.isExpired()) this.deleteEntry(key, options);
      }
    });
  }

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

  inspect(): string {
    return `#<${this.constructor.name} entries=${this.data.size}, size=${this.cacheSize}, options=${inspectOptions(
      this.options as Record<string, unknown>,
    )}>`;
  }

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

  private modifyValue(name: string, amount: number, options?: CacheOptions): number {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = this.normalizeVersion(name, options) ?? null;
    const entry = this.readEntry(key, options);
    if (!entry || entry.isExpired() || entry.isMismatched(version)) {
      this.write(name, kernelInteger(amount), options);
      return amount;
    }
    const num = toI(entry.value) + amount;
    this.writeEntry(
      key,
      new Entry(num, { expiresAt: entry.expiresAt, version: entry.version }),
      {},
    );
    return num;
  }

  prune(targetSize: number, maxTime?: number): void {
    if (this.isPruning()) return;
    this._pruning = true;
    try {
      const startTime = Process.clockGettime(Process.CLOCK_MONOTONIC);
      this.cleanup();
      this.instrument("prune", targetSize, { from: this.cacheSize }, () => {
        for (const key of [...this.data.keys()]) {
          this.deleteEntry(key, {});
          if (
            this.cacheSize <= targetSize ||
            (maxTime != null && Process.clockGettime(Process.CLOCK_MONOTONIC) - startTime > maxTime)
          ) {
            return;
          }
        }
      });
    } finally {
      this._pruning = false;
    }
  }

  isPruning(): boolean {
    return this._pruning;
  }
}

export namespace DupCoder {
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

  export function dumpCompressed(entry: Entry, threshold: number): Entry {
    const compressedEntry = entry.compressed(threshold);
    return compressedEntry.isCompressed() ? compressedEntry : dump(entry);
  }

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

  const MARSHAL_SIGNATURE = "\x04\x08";

  export function dumpValue(value: unknown): string {
    if (typeof value === "string" && !value.startsWith(MARSHAL_SIGNATURE)) {
      return value;
    } else {
      return MARSHAL_SIGNATURE + coder.dump(value);
    }
  }

  export function loadValue(string: string): unknown {
    if (string.startsWith(MARSHAL_SIGNATURE)) {
      return coder.load(string.slice(MARSHAL_SIGNATURE.length));
    } else {
      return string;
    }
  }
}

registerStoreClass(":memory_store", MemoryStore);
