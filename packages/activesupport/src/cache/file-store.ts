import { getFs, getPath } from "../fs-adapter.js";
import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { DeserializationError } from "./deserialization-error.js";
import { Entry } from "./entry.js";
import { Store, type StoreOptions } from "./store.js";
import { integer } from "./integer.js";
import { type CacheEntry, isExpired } from "./entry-record.js";
import { registerStoreClass } from "./store-registry.js";

const FILENAME_MAX_SIZE = 228;

export class FileStore extends Store implements CacheStore {
  /** Advertise cache versioning support (file_store.rb:25-28). */
  static supportsCacheVersioning(): boolean {
    return true;
  }

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
    const payload = this.readFile(this.keyToPath(key));
    if (payload) {
      const entry = this.deserializeEntry(payload);
      return entry instanceof Entry ? entry : null;
    }
    return null;
  }

  // The `unless_exist` refusal is Rails' `write_serialized_entry`
  // (file_store.rb:123-129), whose own port belongs with the FileStore path
  // helpers; `write_entry` itself is Rails' `serialize_entry` call.
  protected writeEntry(key: string, entry: Entry, options: StoreOptions): boolean {
    if (options.unlessExist && getFs().existsSync(this.keyToPath(key))) return false;
    this.writeFile(this.keyToPath(key), this.serializeEntry(entry, options));
    return true;
  }

  /**
   * Mirrors Rails `Store#serialize_entry` (cache.rb:806-813). Rails' default
   * coder returns a String payload; the trails FileStore's on-disk payload is
   * the {@link CacheEntry} record, so the Coder round-trip that stands in for
   * Marshal happens on its `encodedValue`.
   */
  private serializeEntry(entry: Entry, _options: StoreOptions): CacheEntry {
    return {
      encodedValue: coder.dump(entry.value),
      expiresAt: entry.expiresAt,
      version: entry.version,
      accessedAt: Date.now(),
    };
  }

  /**
   * Mirrors Rails `Store#deserialize_entry` (cache.rb:815-819), including the
   * `rescue DeserializationError` that degrades a malformed payload to a miss.
   */
  private deserializeEntry(payload: CacheEntry | null): Entry | null {
    if (payload === null || payload.encodedValue === undefined) return null;
    let value: unknown;
    try {
      value = coder.load(payload.encodedValue);
    } catch (e) {
      if (e instanceof DeserializationError) return null;
      throw e;
    }
    return new Entry(value, { expiresAt: payload.expiresAt, version: payload.version ?? null });
  }

  protected deleteEntry(key: string, _options: StoreOptions): boolean {
    const filePath = this.keyToPath(key);
    try {
      if (getFs().existsSync(filePath)) {
        getFs().unlinkSync(filePath);
        this.deleteEmptyDirectories(getPath().dirname(filePath));
        return true;
      }
    } catch {}
    return false;
  }

  // Mirrors Rails delete_empty_directories (file_store.rb:194-201): after
  // unlinking the entry, recursively remove now-empty intermediate directories
  // up to — but never including — cacheDir.
  private deleteEmptyDirectories(dir: string): void {
    // Rails compares File.realpath(dir) == File.realpath(cache_path)
    // (file_store.rb:195), which resolves symlinks; a lexical path.resolve
    // would mis-compare when cacheDir or an intermediate dir is symlinked.
    if (this.realPath(dir) === this.realPath(this.cacheDir)) return;
    let children: string[];
    try {
      children = getFs().readdirSync(dir);
    } catch {
      return;
    }
    if (children.length > 0) return;
    // Rails: `Dir.delete(dir) rescue nil` — a failed delete is swallowed and we
    // still recurse toward the parent (file_store.rb:197-199).
    try {
      getFs().rmdirSync(dir);
    } catch {}
    this.deleteEmptyDirectories(getPath().dirname(dir));
  }

  // Resolve symlinks like Ruby File.realpath. Adapters without symlink support
  // (or paths that no longer exist) fall back to a lexical resolve, which keeps
  // the guard sound for the common no-symlink case.
  private realPath(dir: string): string {
    const fs = getFs();
    if (fs.realpathSync) {
      try {
        return fs.realpathSync(dir);
      } catch {}
    }
    return getPath().resolve(dir);
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
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return this.instrument("increment", key, { amount }, () =>
      this.modifyValue(name, amount, options),
    );
  }

  override decrement(name: string, amount = 1, options?: StoreOptions): number | null {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return this.instrument("decrement", key, { amount }, () =>
      this.modifyValue(name, -amount, options),
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
    // it uniformly for the seed write, the return, and the hit-path addition;
    // `Integer()` raises on NaN/Infinity rather than silently truncating.
    amount = integer(amount);
    const entry = this.readEntry(key, options);
    if (!entry || entry.isExpired() || entry.isMismatched(version)) {
      this.write(name, amount, options);
      return amount;
    }
    const num = toI(entry.value) + amount;
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

registerStoreClass(":file_store", FileStore);
