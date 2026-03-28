import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  rmdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { CacheOptions, CacheStore } from "./index.js";
import { type CacheEntry, namespaceKey, isExpired } from "./entry.js";

const FILENAME_MAX_SIZE = 228;

export class FileStore implements CacheStore {
  private cacheDir: string;
  private namespace?: string;
  private defaultExpiresIn?: number;

  constructor(cacheDir: string, options?: CacheOptions) {
    this.cacheDir = String(cacheDir);
    this.namespace = options?.namespace;
    this.defaultExpiresIn = options?.expiresIn;
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
    return join(this.cacheDir, ...safeParts);
  }

  private readFile(filePath: string): CacheEntry | null {
    try {
      if (!existsSync(filePath)) return null;
      const data = readFileSync(filePath, "utf-8");
      return JSON.parse(data) as CacheEntry;
    } catch {
      return null;
    }
  }

  private writeFile(filePath: string, entry: CacheEntry): void {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(entry), "utf-8");
  }

  read(key: string, options?: CacheOptions): unknown {
    const rk = this.resolveKey(key, options);
    const filePath = this.keyToPath(rk);
    const entry = this.readFile(filePath);
    if (!entry) return null;
    if (isExpired(entry)) {
      try {
        unlinkSync(filePath);
      } catch {}
      return null;
    }
    return entry.value;
  }

  write(key: string, value: unknown, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    const filePath = this.keyToPath(rk);

    if (options?.unlessExist) {
      const existing = this.read(key, options);
      if (existing !== null) return false;
    }

    const expiresIn = options?.expiresIn ?? this.defaultExpiresIn;
    const expiresAt = expiresIn != null ? Date.now() + expiresIn : null;
    const entry: CacheEntry = { value, expiresAt, accessedAt: Date.now() };
    this.writeFile(filePath, entry);
    return true;
  }

  delete(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    const filePath = this.keyToPath(rk);
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        return true;
      }
    } catch {}
    return false;
  }

  exist(key: string, options?: CacheOptions): boolean {
    return this.read(key, options) !== null;
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
    if (!existsSync(this.cacheDir)) return;
    this.clearDir(this.cacheDir, true);
  }

  private clearDir(dir: string, isRoot: boolean): void {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (isRoot && (entry === ".gitkeep" || entry === ".keep")) continue;
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          this.clearDir(fullPath, false);
          try {
            rmdirSync(fullPath);
          } catch {}
        } else {
          try {
            unlinkSync(fullPath);
          } catch {}
        }
      }
    } catch {}
  }

  cleanup(): void {
    if (!existsSync(this.cacheDir)) return;
    this.cleanupDir(this.cacheDir);
  }

  private cleanupDir(dir: string): void {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            this.cleanupDir(fullPath);
          } else {
            const data = this.readFile(fullPath);
            if (data && isExpired(data)) {
              unlinkSync(fullPath);
            }
          }
        } catch {}
      }
    } catch {}
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
    if (!existsSync(this.cacheDir)) return;
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    this.deleteMatchedInDir(this.cacheDir, re);
  }

  private deleteMatchedInDir(dir: string, re: RegExp): void {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            this.deleteMatchedInDir(fullPath, re);
          } else {
            const relPath = fullPath.slice(this.cacheDir.length + 1);
            if (re.test(relPath)) {
              unlinkSync(fullPath);
            }
          }
        } catch {}
      }
    } catch {}
  }

  increment(key: string, amount = 1, options?: CacheOptions): number | null {
    const current = this.read(key, options);
    if (current === null) return null;
    const num = Number(current);
    if (isNaN(num)) return null;
    const next = num + amount;
    this.write(key, next, options);
    return next;
  }

  decrement(key: string, amount = 1, options?: CacheOptions): number | null {
    return this.increment(key, -amount, options);
  }
}
