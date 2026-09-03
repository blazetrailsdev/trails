export { DeserializationError } from "./deserialization-error.js";

export interface CacheOptions {
  expiresIn?: number;
  expiresAt?: number;
  expire_in?: number;
  expired_in?: number;
  namespace?: string;
  compress?: boolean;
  compressThreshold?: number;
  unlessExist?: boolean;
  raceConditionTtl?: number;
  [key: string]: unknown;
}

/** @noRailsEquivalent PERMANENT */
export interface CacheStore {
  read(key: string, options?: CacheOptions): unknown;
  write(key: string, value: unknown, options?: CacheOptions): boolean;
  delete(key: string, options?: CacheOptions): boolean;
  exist(key: string, options?: CacheOptions): boolean;
  fetch(key: string, options: CacheOptions, fallback: () => unknown): unknown;
  fetch(key: string, fallback: () => unknown): unknown;
  clear(): void;
  cleanup(): void;
  readMulti(...keys: [...string[], CacheOptions] | string[]): Record<string, unknown>;
  writeMulti(hash: Record<string, unknown>, options?: CacheOptions): void;
  deleteMulti(names: string[], options?: CacheOptions): number;
  deleteMatched(pattern: string | RegExp, options?: CacheOptions): void;
  increment(key: string, amount?: number, options?: CacheOptions): number | null;
  decrement(key: string, amount?: number, options?: CacheOptions): number | null;
}

export { Store } from "./store.js";
export type { CacheLogger } from "./store.js";
export { MemoryStore } from "./memory-store.js";
export { NullStore } from "./null-store.js";
export { FileStore } from "./file-store.js";
export { expandCacheKey, formatVersion, setFormatVersion, lookupStore } from "../cache.js";
export { coder, Coder } from "./coder.js";
export type { CoderSerializer, CoderCompressor } from "./coder.js";
export { Entry } from "./entry.js";
