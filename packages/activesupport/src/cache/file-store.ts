import { getFs, getPath } from "../fs-adapter.js";
import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { DeserializationError } from "./deserialization-error.js";
import { Entry } from "./entry.js";
import { Store, type StoreOptions } from "./store.js";
import { type CacheEntry, isExpired } from "./entry-record.js";

const FILENAME_MAX_SIZE = 228;

export class FileStore extends Store implements CacheStore {
  private cacheDir: string;

  constructor(cacheDir: string, options?: CacheOptions) {
    super(options ?? {});
    this.cacheDir = String(cacheDir);
  }

  // Abstract entry hooks of the instrumented Store base, backed by on-disk
  // records. FileStore overrides only these hooks plus the file-layout helpers
  // (clear/cleanup/deleteMatched/increment/decrement) and inherits the
  // instrumented base read/write/delete/exist?/fetch/*Multi public methods,
  // exactly like Rails FileStore (file_store.rb).
  //
  // readEntry round-trips the stored expiry and version so base methods (e.g.
  // the inherited fetch/fetchMulti/readMultiEntries) can apply
  // isExpired()/isMismatched() like Rails read_entry. A malformed payload
  // degrades to a miss, mirroring Rails deserialize_entry's rescue (cache.rb).
  protected readEntry(key: string, _options: StoreOptions): Entry | null {
    const stored = this.readFile(this.keyToPath(key));
    if (!stored || stored.encodedValue === undefined) return null;
    let value: unknown;
    try {
      value = coder.load(stored.encodedValue);
    } catch (e) {
      if (e instanceof DeserializationError) return null;
      throw e;
    }
    return new Entry(value, { expiresAt: stored.expiresAt, version: stored.version ?? null });
  }

  protected writeEntry(key: string, entry: Entry, options: StoreOptions): boolean {
    // Mirrors Rails write_serialized_entry (file_store.rb:124-129): unless_exist
    // refuses the write when the file merely exists, regardless of expiry.
    if (options.unlessExist && getFs().existsSync(this.keyToPath(key))) return false;
    this.writeFile(this.keyToPath(key), {
      encodedValue: coder.dump(entry.value),
      expiresAt: entry.expiresAt,
      version: entry.version,
      accessedAt: Date.now(),
    });
    return true;
  }

  protected deleteEntry(key: string, _options: StoreOptions): boolean {
    const filePath = this.keyToPath(key);
    try {
      if (getFs().existsSync(filePath)) {
        getFs().unlinkSync(filePath);
        return true;
      }
    } catch {}
    return false;
  }

  private keyToPath(key: string): string {
    const parts = key.split("/");
    const safeParts: string[] = [];
    for (const part of parts) {
      if (part.length <= FILENAME_MAX_SIZE) {
        safeParts.push(part);
      } else {
        let remaining = part;
        while (remaining.length > FILENAME_MAX_SIZE) {
          safeParts.push(remaining.slice(0, FILENAME_MAX_SIZE));
          remaining = remaining.slice(FILENAME_MAX_SIZE);
        }
        safeParts.push(remaining);
      }
    }
    return getPath().join(this.cacheDir, ...safeParts);
  }

  private readFile(filePath: string): CacheEntry | null {
    try {
      if (!getFs().existsSync(filePath)) return null;
      const data = getFs().readFileSync(filePath, "utf-8");
      return JSON.parse(data) as CacheEntry;
    } catch {
      return null;
    }
  }

  private writeFile(filePath: string, entry: CacheEntry): void {
    const dir = getPath().dirname(filePath);
    getFs().mkdirSync(dir, { recursive: true });
    getFs().writeFileSync(filePath, JSON.stringify(entry), "utf-8");
  }

  override clear(): void {
    if (!getFs().existsSync(this.cacheDir)) return;
    this.clearDir(this.cacheDir, true);
  }

  private clearDir(dir: string, isRoot: boolean): void {
    try {
      const entries = getFs().readdirSync(dir);
      for (const entry of entries) {
        if (isRoot && (entry === ".gitkeep" || entry === ".keep")) continue;
        const fullPath = getPath().join(dir, entry);
        const stat = getFs().statSync(fullPath);
        if (stat.isDirectory()) {
          this.clearDir(fullPath, false);
          try {
            getFs().rmdirSync(fullPath);
          } catch {}
        } else {
          try {
            getFs().unlinkSync(fullPath);
          } catch {}
        }
      }
    } catch {}
  }

  override cleanup(): void {
    if (!getFs().existsSync(this.cacheDir)) return;
    this.cleanupDir(this.cacheDir);
  }

  private cleanupDir(dir: string): void {
    try {
      const entries = getFs().readdirSync(dir);
      for (const entry of entries) {
        const fullPath = getPath().join(dir, entry);
        try {
          const stat = getFs().statSync(fullPath);
          if (stat.isDirectory()) {
            this.cleanupDir(fullPath);
          } else {
            const data = this.readFile(fullPath);
            if (data && isExpired(data)) {
              getFs().unlinkSync(fullPath);
            }
          }
        } catch {}
      }
    } catch {}
  }

  override deleteMatched(pattern: string | RegExp): void {
    if (!getFs().existsSync(this.cacheDir)) return;
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    this.deleteMatchedInDir(this.cacheDir, re);
  }

  private deleteMatchedInDir(dir: string, re: RegExp): void {
    try {
      const entries = getFs().readdirSync(dir);
      for (const entry of entries) {
        const fullPath = getPath().join(dir, entry);
        try {
          const stat = getFs().statSync(fullPath);
          if (stat.isDirectory()) {
            this.deleteMatchedInDir(fullPath, re);
          } else {
            const relPath = fullPath.slice(this.cacheDir.length + 1);
            if (re.test(relPath)) {
              getFs().unlinkSync(fullPath);
            }
          }
        } catch {}
      }
    } catch {}
  }

  // Rails FileStore instruments increment/decrement with the normalized key
  // (file_store.rb:62-64), unlike MemoryStore which uses the raw name.
  override increment(name: string, amount = 1, options?: StoreOptions): number | null {
    const merged = this.mergedOptions(options);
    const key = this.normalizeKey(name, merged);
    return this.instrument("increment", key, { amount }, () =>
      this.modifyValue(name, amount, merged),
    );
  }

  override decrement(name: string, amount = 1, options?: StoreOptions): number | null {
    const merged = this.mergedOptions(options);
    const key = this.normalizeKey(name, merged);
    return this.instrument("decrement", key, { amount }, () =>
      this.modifyValue(name, -amount, merged),
    );
  }

  // Mirrors Rails FileStore#modify_value (file_store.rb:222-241): on a missing,
  // expired, or version-mismatched entry it *creates* the key set to amount
  // through the instrumented write path and returns amount (so
  // `increment("foo") # => 1`); on a hit it adds to entry.value.to_i, preserving
  // the entry's expiresAt/version.
  private modifyValue(name: string, amount: number, options: StoreOptions): number {
    const key = this.normalizeKey(name, options);
    const version = this.normalizeVersion(name, options) ?? null;
    // Rails coerces `amount = Integer(amount)` once (file_store.rb:226) and uses
    // it uniformly for the seed write, the return, and the hit-path addition.
    const amt = Math.trunc(amount);
    const entry = this.readEntry(key, options);
    if (!entry || entry.isExpired() || entry.isMismatched(version)) {
      this.write(name, amt, options);
      return amt;
    }
    const num = toI(entry.value) + amt;
    this.writeEntry(
      key,
      new Entry(num, { expiresAt: entry.expiresAt, version: entry.version }),
      options,
    );
    return num;
  }
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
