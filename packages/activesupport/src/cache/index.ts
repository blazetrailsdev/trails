import type { Duration } from "../duration.js";
export { DeserializationError } from "./deserialization-error.js";

export interface CacheOptions {
  expiresIn?: number | Duration;
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
  read(key: string, options?: CacheOptions): Promise<unknown>;
  write(key: string, value: unknown, options?: CacheOptions): Promise<boolean>;
  delete(key: string, options?: CacheOptions): Promise<boolean>;
  exist(key: string, options?: CacheOptions): Promise<boolean>;
  fetch(key: string, options: CacheOptions, fallback: () => unknown): Promise<unknown>;
  fetch(key: string, fallback: () => unknown): Promise<unknown>;
  clear(): Promise<void>;
  cleanup(): Promise<void>;
  readMulti(...keys: unknown[]): Promise<Map<unknown, unknown>>;
  writeMulti(
    hash: Map<unknown, unknown> | Record<string, unknown>,
    options?: CacheOptions,
  ): Promise<unknown>;
  deleteMulti(names: string[], options?: CacheOptions): Promise<number>;
  deleteMatched(pattern: string | RegExp, options?: CacheOptions): Promise<void>;
  increment(key: string, amount?: number, options?: CacheOptions): Promise<number | null>;
  decrement(key: string, amount?: number, options?: CacheOptions): Promise<number | null>;
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
