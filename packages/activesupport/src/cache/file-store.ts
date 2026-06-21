import { getFs, getPath } from "../fs-adapter.js";
import type { CacheOptions, CacheStore } from "./index.js";
import { coder } from "./coder.js";
import { Entry } from "./entry.js";
import { Store, type WriteOptions } from "./store.js";
import { type CacheEntry, namespaceKey, isExpired, extractCacheOptions } from "./entry-record.js";

const FILENAME_MAX_SIZE = 228;
const MISS = Symbol("miss");

export class FileStore extends Store implements CacheStore {
  private cacheDir: string;
  private namespace?: string;
  private defaultExpiresIn?: number;

  constructor(cacheDir: string, options?: CacheOptions) {
    super(options ?? {});
    this.cacheDir = String(cacheDir);
    this.namespace = options?.namespace;
    this.defaultExpiresIn = options?.expiresIn;
  }

  // Abstract entry hooks of the instrumented Store base, backed by on-disk records.
  protected readEntry(key: string, _options: Record<string, unknown>): Entry | null {
    const value = this.readValue(key);
    return value === MISS ? null : new Entry(value);
  }
  protected writeEntry(key: string, entry: Entry, _options: Record<string, unknown>): boolean {
    this.writeFile(this.keyToPath(key), {
      encodedValue: coder.dump(entry.value),
      expiresAt: entry.expiresAt,
      accessedAt: Date.now(),
    });
    return true;
  }
  protected deleteEntry(key: string, _options: Record<string, unknown>): boolean {
    const filePath = this.keyToPath(key);
    try {
      if (getFs().existsSync(filePath)) {
        getFs().unlinkSync(filePath);
        return true;
      }
    } catch {}
    return false;
  }

  private resolveKey(key: string, options?: CacheOptions): string {
    const ns = options?.namespace ?? this.namespace;
    return namespaceKey(String(key), ns);
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

  override read(key: string, options?: CacheOptions): unknown {
    const rk = this.resolveKey(key, options);
    return this.instrument("read", rk, options, (payload) => {
      const value = this.readValue(rk);
      payload.hit = value !== MISS;
      return value === MISS ? null : value;
    });
  }

  // Decoded value, or MISS (so a cached null/undefined is not read as a miss).
  private readValue(rk: string): unknown {
    const filePath = this.keyToPath(rk);
    const entry = this.readFile(filePath);
    if (!entry) return MISS;
    if (isExpired(entry)) {
      try {
        getFs().unlinkSync(filePath);
      } catch {}
      return MISS;
    }
    if (entry.encodedValue === undefined) return MISS; // old format, treat as miss
    return coder.load(entry.encodedValue);
  }

  override write(key: string, value: unknown, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("write", rk, options, () => this.storeFile(rk, value, options));
  }

  private storeFile(rk: string, value: unknown, options?: CacheOptions): boolean {
    if (options?.unlessExist && this.readValue(rk) !== MISS) return false;

    const expiresIn = options?.expiresIn ?? this.defaultExpiresIn;
    const expiresAt = expiresIn != null ? Date.now() + expiresIn : null;
    const entry: CacheEntry = {
      encodedValue: coder.dump(value),
      expiresAt,
      accessedAt: Date.now(),
    };
    this.writeFile(this.keyToPath(rk), entry);
    return true;
  }

  override delete(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("delete", rk, options, () => this.deleteEntry(rk, {}));
  }

  override exist(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("exist?", rk, undefined, () => this.readValue(rk) !== MISS);
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

    const cached = this.read(key, options);
    if (cached !== null) return cached;

    if (fallback) {
      const value = (fallback as () => unknown)();
      this.write(key, value, options);
      return value;
    }
    return null;
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

  override readMulti(...keys: [...string[], CacheOptions] | string[]): Record<string, unknown> {
    const options = extractCacheOptions<CacheOptions>(keys as unknown[]);
    const names = keys as string[];
    const rkeys = names.map((n) => this.resolveKey(n, options));
    return this.instrumentMulti("read_multi", rkeys, options, (payload) => {
      const result: Record<string, unknown> = {};
      for (const name of names) {
        const value = this.readValue(this.resolveKey(name, options));
        if (value !== MISS) result[name] = value;
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
        this.storeFile(this.resolveKey(name, options), value, options);
      }
      return normalizedHash;
    });
  }

  override deleteMulti(names: string[], options?: CacheOptions): number {
    const rkeys = names.map((k) => this.resolveKey(k, options));
    return this.instrumentMulti("delete_multi", rkeys, options, () => {
      let count = 0;
      for (const rk of rkeys) {
        if (this.deleteEntry(rk, {})) count++;
      }
      return count;
    });
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

  override increment(key: string, amount = 1, options?: CacheOptions): number | null {
    const rk = this.resolveKey(key, options);
    return this.instrument("increment", rk, { amount }, () =>
      this.modifyValue(rk, amount, options),
    );
  }

  override decrement(key: string, amount = 1, options?: CacheOptions): number | null {
    const rk = this.resolveKey(key, options);
    return this.instrument("decrement", rk, { amount }, () =>
      this.modifyValue(rk, -amount, options),
    );
  }

  private modifyValue(rk: string, amount: number, options?: CacheOptions): number | null {
    const current = this.readValue(rk);
    if (current === MISS) return null;
    const num = Number(current);
    if (isNaN(num)) return null;
    const next = num + amount;
    this.storeFile(rk, next, options);
    return next;
  }
}
