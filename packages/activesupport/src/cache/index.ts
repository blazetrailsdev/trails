/**
 * Raised when a serialized cache entry cannot be deserialized.
 * Mirrors Rails `ActiveSupport::Cache::DeserializationError` (cache.rb:49).
 * @internal
 */
export class DeserializationError extends Error {}

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

/** Mirrors Rails Cache::Store class-level logger interface. @internal */
export interface CacheLogger {
  warn(message: string): void;
}

/**
 * Mirrors Rails `ActiveSupport::Cache::Store` class-level logger holder.
 * Trails has no Store base class yet; this module-level object carries the
 * logger and the `with` helper used by tests. @internal
 */
export const Store = {
  logger: null as CacheLogger | null,
  with<T>(options: { logger: CacheLogger }, fn: () => T): T {
    const prev = Store.logger;
    Store.logger = options.logger;
    try {
      return fn();
    } finally {
      Store.logger = prev;
    }
  },
};

export { MemoryStore } from "./memory-store.js";
export { NullStore } from "./null-store.js";
export { FileStore } from "./file-store.js";
export { expandCacheKey } from "./expand-cache-key.js";
export { coder, Coder } from "./coder.js";
export type { CoderSerializer, CoderCompressor } from "./coder.js";
export { Entry } from "./entry.js";
