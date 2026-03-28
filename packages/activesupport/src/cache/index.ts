export interface CacheOptions {
  expiresIn?: number; // milliseconds
  namespace?: string;
  compress?: boolean;
  compressThreshold?: number;
  unlessExist?: boolean;
}

export interface CacheStore {
  read(key: string, options?: CacheOptions): unknown;
  write(key: string, value: unknown, options?: CacheOptions): boolean;
  delete(key: string): boolean;
  exist(key: string): boolean;
  fetch(key: string, options: CacheOptions, fallback: () => unknown): unknown;
  fetch(key: string, fallback: () => unknown): unknown;
  clear(): void;
  cleanup(): void;
  readMulti(...keys: string[]): Record<string, unknown>;
  writeMulti(hash: Record<string, unknown>, options?: CacheOptions): void;
  deleteMulti(...keys: string[]): number;
  deleteMatched(pattern: string | RegExp): void;
  increment(key: string, amount?: number, options?: CacheOptions): number | null;
  decrement(key: string, amount?: number, options?: CacheOptions): number | null;
}

export { MemoryStore } from "./memory-store.js";
export { NullStore } from "./null-store.js";
export { FileStore } from "./file-store.js";
