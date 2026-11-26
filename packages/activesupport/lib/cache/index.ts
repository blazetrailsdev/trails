import type { Time } from "@blazetrails/date";
import type { Duration } from "../duration.js";
import type { TimeWithZone } from "../time-with-zone.js";
export { DeserializationError } from "./deserialization-error.js";

export interface CacheOptions {
  expiresIn?: number | Duration | Time | TimeWithZone;
  expiresAt?: Time | TimeWithZone;
  expireIn?: number;
  expiredIn?: number;
  namespace?: string;
  compress?: boolean;
  compressThreshold?: number;
  unlessExist?: boolean;
  raceConditionTtl?: number;
  [key: string]: unknown;
}

/** @noRailsEquivalent PERMANENT */
export interface CacheStore {
  read(key: unknown, options?: CacheOptions): Promise<unknown>;
  write(key: unknown, value: unknown, options?: CacheOptions): Promise<boolean>;
  delete(key: unknown, options?: CacheOptions): Promise<boolean>;
  isExist(key: unknown, options?: CacheOptions): Promise<boolean>;
  fetch(key: string, options: CacheOptions, fallback: () => unknown): Promise<unknown>;
  fetch(key: string, fallback: () => unknown): Promise<unknown>;
  clear(): Promise<unknown>;
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
export { expandCacheKey, lookupStore } from "../cache.js";
export { Coder } from "./coder.js";
export { coder } from "./marshal-coder.js";
export type { CoderSerializer, CoderCompressor } from "./coder.js";
export { Entry } from "./entry.js";
